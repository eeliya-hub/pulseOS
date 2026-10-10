const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, components, dialog, nativeTheme, shell } = require('electron');

/**
 * Pulse OS as an application.
 *
 * The whole thing already was one — a server and a page, both local, talking to
 * nobody but this machine. This is the shell that makes it look like one: a
 * window with a dock icon, started by double-clicking something, kept running
 * by the OS rather than by two terminal tabs.
 *
 * The API runs in this process rather than as a child. There is nothing to
 * supervise, nothing to orphan when the window closes, and no port handshake —
 * the window cannot open before the server is listening because the same
 * function does both.
 */
// CommonJS, deliberately. Electron loads a main process this way on every
// platform and version; its ESM support needs the entry to be reached through
// the package's `main` field and resolves `electron` to the npm shim when it is
// not, which fails with the API simply missing.
const here = __dirname;
const packaged = app.isPackaged;

/*
 * Let the player start without waiting to be clicked.
 *
 * Chromium refuses to play audio that no gesture asked for, which is right for
 * a web page you did not ask to make noise and wrong here: this is a dashboard
 * whose whole job includes resuming what you were listening to, and asking it
 * from the assistant, or from a phone over Spotify Connect, is a request with
 * no click anywhere near it. Without this the track loads, sits at 0:00 and
 * reports itself as not playing.
 */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// In a packaged app the shell is inside the asar and everything it loads at
// runtime is unpacked beside it — the backend because import() cannot read an
// archive, the built front end and node_modules because they are read as files.
// In development it is all two directories up, where the workspaces live.
const root = packaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : path.resolve(here, '..');
const webRoot = path.join(root, 'frontend', 'dist');

/**
 * Where the keys live.
 *
 * Inside the bundle is the wrong place: it is read-only, it is replaced wholesale
 * by every update, and editing it means right-clicking into an application's
 * insides. So the file lives in Application Support, which survives updates and
 * can be opened from the menu. The bundled one is copied there the first time,
 * so a fresh install still starts configured.
 */
function resolveEnv() {
  const userEnv = path.join(app.getPath('userData'), '.env');
  const shipped = path.join(root, 'backend', '.env');

  // Seeded when there is nothing there yet, and also when what is there says
  // nothing — a file of comments and blank lines is what the app writes when it
  // launches with no configuration to copy, and without this check that
  // placeholder shadows the real thing for ever: the file exists, so it is
  // never replaced, and every integration stays switched off with no clue why.
  // A file with even one setting in it is somebody's, and is left alone.
  const configured = (file) => {
    try {
      return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .some((line) => /^\s*[A-Z0-9_]+\s*=/i.test(line));
    } catch {
      return false;
    }
  };

  if (!configured(userEnv)) {
    try {
      fs.mkdirSync(path.dirname(userEnv), { recursive: true });
      if (configured(shipped)) fs.copyFileSync(shipped, userEnv);
      else if (!fs.existsSync(userEnv)) {
        fs.writeFileSync(userEnv, '# Pulse OS configuration. Add API keys here.\n');
      }
    } catch {
      /* unwritable home: fall through and run on whatever the environment has */
    }
  }
  return userEnv;
}

async function startServer() {
  // dotenv is read at import time by the config module, so the path has to be
  // in the environment before anything from the backend is loaded.
  process.env.DOTENV_CONFIG_PATH = resolveEnv();
  // By path, not by name. This file is inside the asar and the modules are
  // beside it in the unpacked tree, which Node's resolver has no reason to look
  // in — a bare `require('dotenv')` here finds nothing.
  require(path.join(root, 'node_modules', 'dotenv')).config({ path: process.env.DOTENV_CONFIG_PATH });

  // The backend is ESM and this is not, so it is reached with import() — and by
  // file:// URL, because an absolute path with a space in it is not a valid
  // module specifier and this app's own folder may well have one.
  const load = (...parts) => import(pathToFileURL(path.join(root, 'backend', 'src', ...parts)).href);
  const { createApp } = await load('app.js');
  const { attachVoiceGateway } = await load('realtime', 'voiceGateway.js');
  const { config } = await load('config', 'env.js');

  const api = createApp({ webRoot });

  // One broken integration should not take the window down with it; the same
  // reasoning as the standalone server, and the same handlers.
  process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
  process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

  /*
   * Listen on both loopback addresses, and only those.
   *
   * `localhost` is not one address. On this machine it resolves to ::1 before
   * 127.0.0.1, and the two OAuth callbacks are registered against different
   * ones — Google's against localhost, Spotify's against 127.0.0.1 — so
   * answering on one of them means the other's sign-in lands on a closed door.
   *
   * Both, and no further: a dashboard with the house keys in it has no business
   * being reachable from the rest of the network, which is what listening
   * without naming a host would do.
   */
  const bind = (host) =>
    new Promise((resolve, reject) => {
      const server = createServer(api);
      attachVoiceGateway(server);
      server.once('error', reject);
      server.listen(config.port, host, () => resolve(server));
    });

  for (const host of ['127.0.0.1', '::1']) {
    try {
      await bind(host);
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
      /*
       * Something else already has the port.
       *
       * Worth saying out loud rather than carrying on, because carrying on is
       * what made this confusing: the dev server binds every interface, this
       * one took 127.0.0.1, both appeared to start, and the window asked
       * `localhost` — which went to the other server, which has no front end to
       * serve and politely answered with its API's status line. An app showing
       * you a line of JSON gives no hint that the cause is a terminal tab.
       */
      dialog.showErrorBox(
        'Port 4000 is already in use',
        'Something else on this machine is using port 4000 — most likely a `npm run dev` server ' +
          'from a terminal. Pulse needs that exact port, because the Spotify and Google sign-ins ' +
          'are registered against it.\n\nQuit the other server, then open Pulse again.',
      );
      app.exit(1);
      return null;
    }
  }

  // The address the window opens, named the same way it was bound.
  return `http://127.0.0.1:${config.port}`;
}

function createWindow(url) {
  const win = new BrowserWindow({
    show: false,
    backgroundColor: '#0a0d1c', // the app's own ink, so there is no white flash
    titleBarStyle: 'hiddenInset', // the dashboard draws its own top bar
    trafficLightPosition: { x: 18, y: 18 },
    minWidth: 960,
    minHeight: 600,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Filling the screen is the point of a dashboard, so it opens filled rather
  // than opening small and waiting to be dragged.
  win.maximize();
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // A link to somewhere else is somewhere else: it belongs in a browser, not in
  // a window with no address bar to tell you where you have ended up.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  win.loadURL(url);
  return win;
}

function buildMenu(url) {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' }] : []),
      {
        label: 'Pulse',
        submenu: [
          {
            label: 'Open at Login',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: false }),
          },
          { type: 'separator' },
          {
            label: 'Open Configuration Folder',
            click: () => shell.openPath(app.getPath('userData')),
          },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => BrowserWindow.getAllWindows()[0]?.loadURL(url),
          },
        ],
      },
      { role: 'editMenu' },
      {
        role: 'viewMenu',
        submenu: [
          { role: 'togglefullscreen' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'resetZoom' },
          { type: 'separator' },
          { role: 'toggleDevTools' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}

// One window, one instance. Opening it again should raise the one that is
// already there rather than start a second server on a port it cannot have.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';

    /*
     * Wait for Widevine before opening anything.
     *
     * Stock Electron ships no content decryption module at all — only ClearKey,
     * which nothing commercial uses — so Spotify's Web Playback SDK could not
     * create a player and the app could not be its own speaker. It failed with
     * one line, "No supported keysystem was found", thrown from inside the SDK
     * where nothing was listening, and the view quietly fell back to asking
     * which other device to play on.
     *
     * This is the Castlabs build of Electron, which carries the module. It is
     * fetched and verified on first launch, so the wait is real the first time
     * and instant afterwards. A failure here is not fatal: without it the app
     * still runs and still controls Spotify on another device, which is what it
     * was doing before.
     */
    try {
      await components.whenReady();
    } catch (error) {
      console.error('Widevine unavailable — playback in this window will not work:', error?.message ?? error);
    }
    // On first run, start with the OS. It is a dashboard — the whole point is
    // that it is already there — and the menu item turns it off.
    if (!app.getLoginItemSettings().openAtLogin) {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
    }

    const url = await startServer();
    if (!url) return; // the port was taken; the dialog has already said so
    buildMenu(url);
    createWindow(url);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
    });
  });

  // A dashboard that quits when you close its window is a web page. Closing the
  // window on a Mac puts it away; the dock icon brings it back.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
