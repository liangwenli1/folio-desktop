import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import type { Method } from '../shared/bridge';
import { login, logout, request } from './api';
import { getToken, loadToken } from './session';

const SITE_URL = process.env.FOLIO_SITE_URL ?? 'http://localhost:47120';
const DEV_URL = process.env.ELECTRON_RENDERER_URL;

// Linux machines without a keyring (tests in containers) opt into Chromium's basic password store.
// Real installs are Windows and macOS, where safeStorage uses DPAPI or the Keychain.
const BASIC_STORE = process.platform === 'linux' && process.env.FOLIO_PASSWORD_STORE === 'basic';
if (BASIC_STORE) app.commandLine.appendSwitch('password-store', 'basic');
if (process.env.FOLIO_USER_DATA) app.setPath('userData', process.env.FOLIO_USER_DATA);

function createWindow(){
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, show: false, title: 'Folio', backgroundColor: '#F1F3EF',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  win.once('ready-to-show', () => win.show());
  // The renderer never navigates or opens windows; links to the site go to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE_URL)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('focus', () => win.webContents.send('app:focus'));
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

ipcMain.handle('folio:login', (_e, email: string, password: string) => login(String(email), String(password)));
ipcMain.handle('folio:logout', () => logout());
ipcMain.handle('folio:hasSession', () => !!getToken());
ipcMain.handle('folio:api', (_e, method: Method, path: string, body?: unknown) => request(method, String(path), body));
ipcMain.handle('folio:openSite', async (_e, path: string) => {
  if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) await shell.openExternal(SITE_URL + path);
});
ipcMain.handle('folio:info', () => ({ locale: app.getLocale(), version: app.getVersion(), siteUrl: SITE_URL }));

app.whenReady().then(async () => {
  if (BASIC_STORE) safeStorage.setUsePlainTextEncryption(true);
  await loadToken();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
