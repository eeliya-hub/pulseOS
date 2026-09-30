import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { ApiError } from '../../utils/ApiError.js';

const run = promisify(execFile);

// Where macOS keeps applications.
const APP_DIRS = [
  '/Applications',
  '/Applications/Utilities',
  '/System/Applications',
  // Terminal, Disk Utility, Activity Monitor and the rest of the built-in
  // utilities live a directory deeper than the others, and were missing.
  '/System/Applications/Utilities',
  '/System/Library/CoreServices/Applications',
  path.join(os.homedir(), 'Applications'),
];

const iconCache = new Map(); // app name → PNG Buffer
const inflight = new Map(); // app name → Promise<Buffer> (dedupe concurrent extracts)
const exists = (p) => fs.access(p).then(() => true).catch(() => false);

// Fallback icon renderer for apps whose icon lives in an asset catalog (many
// system apps) rather than a loose .icns — asks macOS for the app's own icon.
const SWIFT_ICON_SRC = `import AppKit
let a = CommandLine.arguments
let img = NSWorkspace.shared.icon(forFile: a[1])
let sz = NSSize(width: 128, height: 128)
let out = NSImage(size: sz)
out.lockFocus()
img.draw(in: NSRect(origin: .zero, size: sz))
out.unlockFocus()
guard let tiff = out.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try! png.write(to: URL(fileURLWithPath: a[2]))
`;
let swiftScriptPath;
async function renderWithSwift(appPath, outPath) {
  if (!swiftScriptPath) {
    swiftScriptPath = path.join(os.tmpdir(), 'pulse-appicon.swift');
    await fs.writeFile(swiftScriptPath, SWIFT_ICON_SRC);
  }
  await run('swift', [swiftScriptPath, appPath, outPath], { timeout: 20_000 });
}

/**
 * The bundle identifier of each app, in the order given.
 *
 * One `mdls` for the lot rather than a `defaults read` each: eighty-nine apps
 * come back in under a tenth of a second, where spawning a process per app
 * takes seconds.
 */
async function bundleIds(paths) {
  if (!paths.length) return [];
  try {
    const { stdout } = await run('mdls', ['-name', 'kMDItemCFBundleIdentifier', '-raw', ...paths], {
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    // -raw separates values with NUL and prints "(null)" for anything unindexed.
    return stdout.split('\0').map((v) => (v === '(null)' ? '' : v.trim()));
  } catch {
    return paths.map(() => '');
  }
}

// name → full .app path for every installed application.
async function findApps() {
  const found = new Map();
  for (const dir of APP_DIRS) {
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.app')) continue;
      const name = entry.slice(0, -4);
      if (!found.has(name)) found.set(name, path.join(dir, entry));
    }
  }
  return found;
}

// Locate an app's .icns and render it to a PNG buffer (handles the two common
// CFBundleIconFile spellings; falls back to any .icns in Resources).
async function extractIcon(appPath) {
  const resources = path.join(appPath, 'Contents', 'Resources');
  let icns;
  try {
    const { stdout } = await run('defaults', ['read', path.join(appPath, 'Contents', 'Info'), 'CFBundleIconFile']);
    let iconName = stdout.trim();
    if (iconName) {
      if (!iconName.endsWith('.icns')) iconName += '.icns';
      const candidate = path.join(resources, iconName);
      if (await exists(candidate)) icns = candidate;
    }
  } catch {
    /* no CFBundleIconFile — fall back below */
  }
  if (!icns) {
    try {
      const first = (await fs.readdir(resources)).find((f) => f.endsWith('.icns'));
      if (first) icns = path.join(resources, first);
    } catch {
      /* no Resources dir */
    }
  }

  const tmp = path.join(os.tmpdir(), `pulse-icon-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  if (icns) {
    await run('sips', ['-s', 'format', 'png', '-Z', '128', icns, '--out', tmp]);
  } else {
    // Asset-catalog app (no loose .icns) — render its icon via macOS.
    await renderWithSwift(appPath, tmp);
  }
  const buffer = await fs.readFile(tmp);
  fs.unlink(tmp).catch(() => {});
  return buffer;
}

/**
 * The browsers a link can be told to open in, by bundle identifier.
 *
 * Identified by bundle rather than by the name of the .app, because those are
 * not the same thing: this machine's Brave lives at /Applications/TV.app, so
 * matching on the filename offered every browser except the one that was
 * actually installed. A bundle id survives being renamed, and `open -b` will
 * launch it wherever it has been put.
 */
const BROWSERS = [
  ['com.apple.Safari', 'Safari'],
  ['com.google.Chrome', 'Google Chrome'],
  ['com.google.Chrome.canary', 'Chrome Canary'],
  ['org.mozilla.firefox', 'Firefox'],
  ['org.mozilla.firefoxdeveloperedition', 'Firefox Developer Edition'],
  ['com.microsoft.edgemac', 'Microsoft Edge'],
  ['com.brave.Browser', 'Brave Browser'],
  ['com.brave.Browser.nightly', 'Brave Nightly'],
  ['company.thebrowser.Browser', 'Arc'],
  ['company.thebrowser.dia', 'Dia'],
  ['com.operasoftware.Opera', 'Opera'],
  ['com.vivaldi.Vivaldi', 'Vivaldi'],
  ['app.zen-browser.zen', 'Zen Browser'],
  ['com.kagi.kagimacOS', 'Orion'],
  ['org.chromium.Chromium', 'Chromium'],
  ['com.duckduckgo.macos.browser', 'DuckDuckGo'],
  ['com.sigmaos.sigmaos.macos', 'SigmaOS'],
];

// Reading bundle ids costs one `mdls` for every application, which is fast but
// not free, and a browser is not installed twice in an afternoon.
let browserCache = { at: 0, browsers: [] };
const BROWSER_TTL_MS = 60 * 60 * 1000;

export const launchService = {
  /**
   * @param {object} opts
   * @param {string} [opts.app]     a macOS application name
   * @param {string} [opts.url]     a web address
   * @param {string} [opts.browser] which browser to open `url` in; the system
   *   default when absent or not installed
   */
  async open({ app, url, browser }) {
    if (process.platform !== 'darwin') {
      throw ApiError.badRequest('App launching is only supported on macOS.');
    }
    if (app) {
      try {
        await run('open', ['-a', String(app)]);
        return { launched: 'app', app };
      } catch {
        /* not installed — try the URL fallback below */
      }
    }
    if (url && /^https?:\/\//i.test(url)) {
      // A named browser is a preference, not a requirement: if it has been
      // uninstalled since the link was made, the link should still open.
      if (browser) {
        const { browsers } = await this.listBrowsers();
        const match = browsers.find((b) => b.name === browser || b.id === browser);
        try {
          // By bundle id where we know it: the .app can be renamed, and on this
          // machine Brave has been.
          await run('open', match ? ['-b', match.id, String(url)] : ['-a', String(browser), String(url)]);
          return { launched: 'url', url, browser };
        } catch {
          /* fall through to the default browser */
        }
      }
      await run('open', [String(url)]);
      return { launched: 'url', url };
    }
    throw ApiError.badRequest(
      app ? `Couldn't open "${app}", and no web fallback was provided.` : 'Provide an `app` or `url`.',
    );
  },

  /** The browsers actually installed, in the order people expect to see them. */
  async listBrowsers() {
    if (process.platform !== 'darwin') return { browsers: [] };
    if (Date.now() - browserCache.at < BROWSER_TTL_MS) return { browsers: browserCache.browsers };

    const apps = [...(await findApps())];
    const ids = await bundleIds(apps.map(([, appPath]) => appPath));

    const found = [];
    for (const [id, label] of BROWSERS) {
      const n = ids.indexOf(id);
      if (n < 0) continue;
      // `name` is what gets stored on the link and handed back to `open`. The
      // bundle id is used, so a browser renamed later still opens.
      found.push({ id, name: label, app: apps[n][0] });
    }
    browserCache = { at: Date.now(), browsers: found };
    return { browsers: found };
  },

  // Installed applications the user can add to the launchpad.
  async listApps() {
    if (process.platform !== 'darwin') return { apps: [] };
    const apps = await findApps();
    return { apps: [...apps.keys()].sort((a, b) => a.localeCompare(b)).map((name) => ({ name })) };
  },

  // The app's own icon as a PNG buffer (cached). Name is validated against the
  // installed apps so it can't be used to read arbitrary files.
  async appIcon(name) {
    if (!name) throw ApiError.badRequest('Provide an app `name`.');
    if (iconCache.has(name)) return iconCache.get(name);
    if (inflight.has(name)) return inflight.get(name);

    const task = (async () => {
      const apps = await findApps();
      // By the name of the .app first, and by what the app calls itself second:
      // a bundle can be renamed on disk without changing what it is, and this
      // machine's Brave sits at TV.app. Without the second lookup the browser
      // badge asked for an icon that, by filename, nothing had.
      let appPath = apps.get(name);
      if (!appPath) {
        const browser = (await this.listBrowsers()).browsers.find((b) => b.name === name || b.id === name);
        if (browser) appPath = apps.get(browser.app);
      }
      if (!appPath) throw ApiError.notFound(`App "${name}" not found.`);
      const buffer = await extractIcon(appPath);
      iconCache.set(name, buffer);
      return buffer;
    })();
    inflight.set(name, task);
    try {
      return await task;
    } finally {
      inflight.delete(name);
    }
  },
};
