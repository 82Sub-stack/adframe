const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow = null;
let localServer = null;
let localServerUrl = null;

function isLocalAppUrl(url) {
  return Boolean(localServerUrl && url.startsWith(localServerUrl));
}

function findChromiumExecutable(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return null;

  const executableNames = process.platform === 'win32'
    ? ['chrome.exe']
    : ['Google Chrome for Testing', 'Chromium', 'chrome'];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && executableNames.includes(entry.name)) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        queue.push(fullPath);
      }
    }
  }

  return null;
}

function configureDesktopEnvironment() {
  const dataDir = app.getPath('userData');
  process.env.ADFRAME_DESKTOP = 'true';
  process.env.ADFRAME_DATA_DIR = dataDir;
  process.env.ADFRAME_APP_VERSION = app.getVersion();
  process.env.ADFRAME_CHROMIUM_MODE = 'bundled';
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';

  const bundledChromiumRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'chromium')
    : path.join(__dirname, '..', 'server', '.local-chromium');
  const chromiumExecutable = findChromiumExecutable(bundledChromiumRoot);

  if (chromiumExecutable) {
    process.env.PUPPETEER_EXECUTABLE_PATH = chromiumExecutable;
  } else if (app.isPackaged) {
    console.warn('Bundled Chromium executable was not found. Puppeteer will use its default resolution.');
  }

  return { dataDir };
}

function startLocalServer({ dataDir }) {
  const { createApp } = require('../server/app');
  const expressApp = createApp({
    dataDir,
    isDesktop: true,
    staticDir: path.join(__dirname, '..', 'client', 'dist'),
  });

  return new Promise((resolve, reject) => {
    const server = expressApp.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
    server.on('error', reject);
  });
}

function registerIpcHandlers() {
  ipcMain.handle('adframe:select-output-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('adframe:get-app-info', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle('adframe:open-external', async (event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url) && !isLocalAppUrl(url)) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });
}

async function createMainWindow() {
  const env = configureDesktopEnvironment();
  if (!localServer || !localServerUrl) {
    const { server, url } = await startLocalServer(env);
    localServer = server;
    localServerUrl = url;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: 'AdFrame',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isLocalAppUrl(targetUrl)) {
      return { action: 'allow' };
    }
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isLocalAppUrl(targetUrl)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(localServerUrl);
}

async function shutdown() {
  const { closeBrowser } = require('../server/services/puppeteer');
  await closeBrowser();

  if (localServer) {
    await new Promise((resolve) => localServer.close(resolve));
    localServer = null;
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (!localServer) return;
  event.preventDefault();
  shutdown()
    .catch((err) => console.error('Failed to shut down cleanly:', err))
    .finally(() => app.exit(0));
});
