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

// The browsers a link can be told to open in. Matched against what is actually
// installed, so the picker only ever offers real choices.
const BROWSERS = [
  'Safari',
  'Google Chrome',
  'Google Chrome Canary',
  'Firefox',
  'Firefox Developer Edition',
  'Microsoft Edge',
  'Brave Browser',
  'Arc',
  'Opera',
  'Vivaldi',
  'Zen Browser',
  'Orion',
  'Chromium',
  'DuckDuckGo',
];

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
        try {
          await run('open', ['-a', String(browser), String(url)]);
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
    const apps = await findApps();
    return { browsers: BROWSERS.filter((name) => apps.has(name)).map((name) => ({ name })) };
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
      const appPath = (await findApps()).get(name);
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
