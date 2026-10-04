// Agent Office as a desktop app: an Electron window around the same office the `agent-office`
// command runs. The office itself is a child process (dist/server/server/desktop/index.js) started
// with ELECTRON_RUN_AS_NODE=1, so the Electron binary acts as Node for it and for everything it
// spawns: agent hooks, the workers' MCP server and the terminal host all call `process.execPath`, and
// they must land on Node, not on a windowless Electron. Nothing of the office runs in a renderer.
const { app, BrowserWindow, desktopCapturer, dialog, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const START_TIMEOUT_MS = 120_000;

let office = null; // the office's child process
let win = null; // its window
let origin = null; // where the window is allowed to stay

/** The office entry that ships with the app: the built server, beside package.json. */
function hostEntry() {
  return path.join(app.getAppPath(), 'dist', 'server', 'server', 'desktop', 'index.js');
}

/** The office's own flags, after Electron's (and the app path, when run from a checkout). */
function officeArgs() {
  return process.argv.slice(app.isPackaged ? 1 : 2);
}

/** Starts the office and resolves with the sign-in url it hands back over IPC. */
function startOffice() {
  const entry = hostEntry();
  office = spawn(process.execPath, [entry, ...officeArgs()], {
    // What turns the Electron binary into Node, for this child and every process after it.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    cwd: os.homedir(),
  });
  const child = office;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the office did not start in time')), START_TIMEOUT_MS);
    const fail = (err) => {
      clearTimeout(timer);
      reject(err);
    };
    child.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ready') {
        clearTimeout(timer);
        resolve(msg);
      } else if (msg.type === 'failed') fail(new Error(msg.message));
    });
    child.once('error', fail);
    child.once('exit', (code) => fail(new Error(`the office stopped (exit ${code})`)));
  });
}

/** What the window shows while the office opens its floors. */
function splashPage() {
  const html = `<!doctype html><meta charset="utf-8"><title>Agent Office</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#14131a;color:#e8e6df;
font:15px system-ui,-apple-system,sans-serif}main{text-align:center}p{margin:14px 0 0;color:#9a97a8}i{width:34px;height:34px;
display:block;margin:0 auto;border:3px solid #3a3846;border-top-color:#e8c547;border-radius:50%;animation:s .9s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}</style>
<main><i></i><p>Starting the office…</p></main>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#14131a',
    title: 'Agent Office',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => (win = null));
  // A link in the office opens in the system browser; the window itself never leaves the office.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!origin || url === origin || url.startsWith(origin + '/') || url.startsWith(origin + '#')) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  return win;
}

/** Voice and screen sharing: the page may ask for the microphone, and to show one of the screens. */
function allowMedia() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture' || permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
  });
  // On Windows the OS picker takes this over; the source is the fallback for platforms without one.
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      callback({ video: sources[0] });
    },
    { useSystemPicker: true },
  );
}

/** Asks the office to stop the way Ctrl+C does, then makes sure it is gone. */
function stopOffice() {
  const child = office;
  if (!child) return;
  office = null;
  try {
    child.send({ type: 'quit' });
  } catch {
    // Already gone.
  }
  setTimeout(() => {
    try {
      child.kill();
    } catch {
      // Already gone.
    }
  }, 2000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    allowMedia();
    const window = createWindow();
    await window.loadURL(splashPage());
    try {
      const ready = await startOffice();
      origin = new URL(ready.url).origin;
      await window.loadURL(ready.url);
    } catch (err) {
      dialog.showErrorBox('Agent Office could not start', String((err && err.message) || err));
      app.quit();
    }
  });

  app.on('before-quit', stopOffice);
  app.on('window-all-closed', () => app.quit());
}
