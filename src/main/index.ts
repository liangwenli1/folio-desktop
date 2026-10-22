import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import type { KernelKind, Method, Os } from '../shared/bridge';
import { forRenderer, login, logout } from './api';
import { getToken, loadToken } from './session';
import { watch } from './changes';
import { generate } from './fingerprint';
import { install, latest, list as listKernels, resolve as resolveKernel } from './kernels';
import { forget } from './account';
import { discard, onStatus, open, prune, statuses, stop, stopAll, verify } from './launcher';
import { checkById, checkWorkspace } from './proxy-check';

const SITE_URL = process.env.FOLIO_SITE_URL ?? 'http://localhost:47120';
const DEV_URL = process.env.ELECTRON_RENDERER_URL;
const HEALTH_EVERY = 10 * 60_000;

// Linux machines without a keyring (tests in containers) opt into Chromium's basic password store.
// Real installs are Windows and macOS, where safeStorage uses DPAPI or the Keychain.
const BASIC_STORE = process.platform === 'linux' && process.env.FOLIO_PASSWORD_STORE === 'basic';
if (BASIC_STORE) app.commandLine.appendSwitch('password-store', 'basic');
if (process.env.FOLIO_USER_DATA) app.setPath('userData', process.env.FOLIO_USER_DATA);

const send = (channel: string, payload: unknown) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload));

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

ipcMain.handle('folio:login', (_e, email: string, password: string) => { forget(); return login(String(email), String(password)); });
ipcMain.handle('folio:logout', async () => { watching(null); await stopAll(); forget(); return logout(); });
ipcMain.handle('folio:hasSession', () => !!getToken());
ipcMain.handle('folio:api', (_e, method: Method, path: string, body?: unknown) => forRenderer(method, String(path), body));
ipcMain.handle('folio:openSite', async (_e, path: string) => {
  if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) await shell.openExternal(SITE_URL + path);
});
ipcMain.handle('folio:info', () => ({ locale: app.getLocale(), version: app.getVersion(), siteUrl: SITE_URL, platform: process.platform }));

// The open workspace: live changes, plus a proxy health check every ten minutes. A change to profiles may be a
// takeover of one running here, so their locks are checked right away.
let health: NodeJS.Timeout | null = null;
function watching(workspaceId: string | null){
  watch(workspaceId, c => {
    send('app:change', c);
    if (c.kind === 'profiles') verify(c.ids);
    // This account was taken out of the workspace: the server has closed the stream.
    if (c.kind === 'removed' && workspaceId){ watching(null); void discard(workspaceId); }
  });
  if (health) clearInterval(health);
  health = workspaceId ? setInterval(() => { void checkWorkspace(workspaceId); }, HEALTH_EVERY) : null;
}
ipcMain.handle('folio:watch', (_e, workspaceId: string | null) => {
  watching(typeof workspaceId === 'string' ? workspaceId : null);
  void prune();
});

onStatus(s => send('profile:status', s));
ipcMain.handle('folio:openProfile', (_e, id: string) => { void open(String(id)); });
ipcMain.handle('folio:stopProfile', (_e, id: string) => stop(String(id)));
ipcMain.handle('folio:statuses', () => statuses());
ipcMain.handle('folio:checkProxy', (_e, id: string) => checkById(String(id)));

ipcMain.handle('folio:newFingerprint', async (_e, kind: KernelKind, os: Os) => {
  const kernelVersion = latest(kind);
  if (!kernelVersion) return { ok: false, error: { code: 'kernel_unavailable', message: 'This engine is not available on this computer', status: 400 } };
  try {
    const exe = kind === 'firefox' ? await resolveKernel(kind, kernelVersion) : null;
    return { ok: true, data: { fingerprint: await generate(kind, os, exe), kernelVersion } };
  } catch (e){
    const code = (e as Error).message === 'kernel_missing' ? 'kernel_missing' : 'internal';
    return { ok: false, error: { code, message: String(e), status: 400 } };
  }
});
ipcMain.handle('folio:kernels', () => listKernels());
ipcMain.handle('folio:installKernel', async (_e, kind: KernelKind, version: string) => {
  try {
    await install(kind, version, (done, total) => send('kernel:progress', { kind, version, done, total }));
    send('kernel:progress', { kind, version, done: 1, total: 1, finished: true });
  } catch (e){
    send('kernel:progress', { kind, version, done: 0, total: 0, error: (e as Error).message });
  }
});

app.whenReady().then(async () => {
  if (BASIC_STORE) safeStorage.setUsePlainTextEncryption(true);
  await loadToken();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Close every running profile before quitting, so no engine is left behind.
let quitting = false;
app.on('before-quit', e => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  void stopAll().finally(() => app.quit());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
