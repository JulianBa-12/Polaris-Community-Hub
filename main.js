/*
 * POLARIS Client — inoffizieller Electron-Client für Kirka.io
 * Eigener Code, implementiert die bekannten Community-Features.
 */

const { app, BrowserWindow, protocol, session, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const KIRKA_URL = 'https://kirka.io/';
const PROTOCOL = 'polaris';

/* ---------- Pfade ---------- */

const dir = {
  config: () => path.join(app.getPath('userData'), 'config.json'),
  css: () => path.join(app.getPath('userData'), 'quick.css'),
  scripts: () => path.join(app.getPath('userData'), 'scripts'),
  swap: () => path.join(app.getPath('userData'), 'swap'),
};

function ensureDirs() {
  for (const d of [dir.scripts(), dir.swap()]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(dir.css())) {
    const def = path.join(__dirname, '..', 'assets', 'default-quick.css');
    fs.copyFileSync(fs.existsSync(def) ? def : path.join(process.resourcesPath || '', 'assets', 'default-quick.css'), dir.css());
  }
}

/* ---------- Konfiguration ---------- */

const defaultConfig = {
  fpsUnlock: true,      // VSync/Frame-Limit deaktivieren
  adblock: true,        // Werbenetzwerke blockieren
  crosshair: { enabled: false, size: 10, gap: 4, thickness: 2, dot: true, color: '#ffffff', opacity: 1 },
  menuKey: 'F2',        // Taste für das Client-Menü
  rpc: { enabled: false, appId: '' },
  showFps: true,
};

function loadConfig() {
  try {
    return { ...defaultConfig, ...JSON.parse(fs.readFileSync(dir.config(), 'utf8')) };
  } catch {
    return { ...defaultConfig };
  }
}

let config = loadConfig();

function saveConfig() {
  fs.writeFileSync(dir.config(), JSON.stringify(config, null, 2));
}

/* ---------- FPS-Unlock & Performance ---------- */

function applyPerformanceFlags() {
  if (config.fpsUnlock) {
    app.commandLine.appendSwitch('disable-gpu-vsync');
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    app.commandLine.appendSwitch('enable-features', 'Vulkan');
  }
  app.commandLine.appendSwitch('ignore-gpu-blacklist');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

/* ---------- Adblock ---------- */

const BLOCKED_HOSTS = [
  'adinplay.com', 'vlitag.com', 'aiptag', 'adnxs.com', 'doubleclick.net',
  'googlesyndication.com', 'googletagmanager.com', 'google-analytics.com',
  'criteo.com', 'pubmatic.com', 'rubiconproject.com', 'scorecardresearch.com',
];

function installAdblock(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    if (!config.adblock) return cb({});
    let host = '';
    try { host = new URL(details.url).hostname; } catch { return cb({}); }
    if (BLOCKED_HOSTS.some((h) => host.includes(h))) return cb({ cancel: true });
    cb({});
  });
}

/* ---------- Resource-Swapper ---------- */

function registerSwapProtocol() {
  protocol.registerFileProtocol('pol-swap', (request, cb) => {
    const rel = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''));
    const file = path.join(dir.swap(), rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return cb(file);
    cb({ error: -2 });
  });

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://kirka.io/*', 'https://api2.kirka.io/*'] }, (details, cb) => {
    try {
      const u = new URL(details.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '').replace(/^assets\//, '');
      const local = path.join(dir.swap(), rel);
      if (fs.existsSync(local) && fs.statSync(local).isFile()) {
        return cb({ redirectURL: 'pol-swap:///' + rel });
      }
    } catch {}
    cb({});
  });
}

/* ---------- Discord Rich Presence (optional) ---------- */

let rpcClient = null;

function initRpc() {
  if (!config.rpc.enabled || !config.rpc.appId) return;
  try {
    const DiscordRPC = require('discord-rpc');
    DiscordRPC.register(config.rpc.appId);
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });
    rpcClient.on('ready', () => {
      rpcClient.setActivity({
        details: 'Spielt Kirka.io',
        state: 'POLARIS Client',
        largeImageKey: 'kirka',
        instance: false,
      });
    });
    rpcClient.login({ clientId: config.rpc.appId }).catch(() => {});
  } catch {
    rpcClient = null;
  }
}

function updateRpc(state) {
  if (rpcClient) {
    rpcClient.setActivity({
      details: state || 'Spielt Kirka.io',
      state: 'POLARIS Client',
      largeImageKey: 'kirka',
      instance: false,
    }).catch(() => {});
  }
}

/* ---------- Quick CSS ---------- */

let injectedCssKeys = [];

function applyCss(webContents, css) {
  for (const key of injectedCssKeys) {
    try { webContents.removeInsertedCSS(key); } catch {}
  }
  injectedCssKeys = [];
  if (css && css.trim()) {
    webContents.insertCSS(css).then((key) => injectedCssKeys.push(key));
  }
}

/* ---------- Fenster ---------- */

let win = null;

function createWindow(url = KIRKA_URL) {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    title: 'POLARIS Client — Kirka.io',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  installAdblock(win.webContents.session);
  win.loadURL(url);

  // Injector nach jedem Laden erneut ausführen
  const inject = () => {
    const injector = fs.readFileSync(path.join(__dirname, 'injector.js'), 'utf8');
    win.webContents.executeJavaScript(injector).catch(() => {});
    const css = fs.readFileSync(dir.css(), 'utf8');
    applyCss(win.webContents, css);
  };
  win.webContents.on('did-finish-load', inject);
  win.webContents.on('did-navigate-in-page', () => setTimeout(inject, 200));

  // Externe Links im Standard-Browser öffnen
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (!u.includes('kirka.io')) {
      shell.openExternal(u);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return win;
}

/* ---------- Deeplinks (polaris://) ---------- */

app.setAsDefaultProtocolClient(PROTOCOL);

function handleDeeplink(u) {
  if (!u || !win) return;
  try {
    const url = new URL(u);
    const target = 'https://kirka.io/' + (url.pathname || '').replace(/^\/+/, '');
    if (target !== KIRKA_URL) win.loadURL(target);
  } catch {}
}

app.on('second-instance', (_e, argv) => {
  const link = argv.find((a) => a.startsWith(PROTOCOL + '://'));
  if (link) handleDeeplink(link);
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

/* ---------- IPC ---------- */

function registerIpc() {
  ipcMain.handle('config:get', () => config);
  ipcMain.handle('config:set', (_e, patch) => {
    config = { ...config, ...patch };
    saveConfig();
    return config;
  });
  ipcMain.handle('css:get', () => fs.readFileSync(dir.css(), 'utf8'));
  ipcMain.handle('css:save', (_e, css) => {
    fs.writeFileSync(dir.css(), css || '');
    if (win) applyCss(win.webContents, css);
    return true;
  });
  ipcMain.handle('css:apply', (_e, css) => {
    if (win) applyCss(win.webContents, css);
    return true;
  });
  ipcMain.handle('scripts:run', (_e, code) => {
    if (win) win.webContents.executeJavaScript(code).catch(() => {});
    return true;
  });
  ipcMain.handle('presence:update', (_e, state) => { updateRpc(state); return true; });
  ipcMain.handle('folder:open', (_e, which) => {
    const target = which === 'swap' ? dir.swap() : dir.scripts();
    shell.openPath(target);
    return target;
  });
  ipcMain.handle('config:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Einstellungen exportieren',
      defaultPath: 'polaris-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return true;
  });
  ipcMain.handle('config:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Einstellungen importieren',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return false;
    try {
      config = { ...defaultConfig, ...JSON.parse(fs.readFileSync(filePaths[0], 'utf8')) };
      saveConfig();
      return true;
    } catch { return false; }
  });
  ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(); return true; });
}

/* ---------- Start ---------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  applyPerformanceFlags();
  protocol.registerSchemesAsPrivileged([
    { scheme: 'pol-swap', privileges: { standard: false, supportFetchAPI: true, stream: true } },
  ]);

  app.whenReady().then(() => {
    ensureDirs();
    registerSwapProtocol();
    registerIpc();
    createWindow();
    initRpc();
  });

  app.on('open-url', (_e, url) => handleDeeplink(url));
  app.on('window-all-closed', () => app.quit());
}
