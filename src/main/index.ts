import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, screen, shell, Tray } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { ExtensionSource, KernelKind, Labels, Method, Os, Step } from '../shared/bridge';
import { forRenderer, login, logout } from './api';
import { getToken, loadToken } from './session';
import { watch } from './changes';
import { generate } from './fingerprint';
import { install, latest, list as listKernels, resolve as resolveKernel } from './kernels';
import { forget } from './account';
import { addCookies, discard, isRunning, onStatus, open, prune, saveNow, statuses, stop, stopAll, verify } from './launcher';
import { parseCookies, toJson, toNetscape, type Cookie } from '../shared/cookies';
import { api } from './api';
import { exportWorkspace, importWorkspace, seal, unseal, type Bundle } from './transfer';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { checkById, checkWorkspace } from './proxy-check';
import { activeRuns, onRuns, onSignedOut, runTask, screenshotPath, stopRun, stopRuns, tryFlow } from './runs';
import { hasScheduled, onScheduled, startScheduler, stopScheduler, tick } from './schedule';
import { createApiToken, loadLocalApi, localApi, revokeApiToken, setLocalApi } from './local-api';
import { fromStore } from './extensions';
import { leftWindowSync, onWindowSync, setLeader, startWindowSync, stopWindowSync, syncGoto, windowSync } from './windowsync';
import { tile } from './tile';

const SITE_URL = process.env.FOLIO_SITE_URL ?? 'http://localhost:47120';
const DEV_URL = process.env.ELECTRON_RENDERER_URL;
const HEALTH_EVERY = 10 * 60_000;

// Linux machines without a keyring (tests in containers) opt into Chromium's basic password store.
// Real installs are Windows and macOS, where safeStorage uses DPAPI or the Keychain.
const BASIC_STORE = process.platform === 'linux' && process.env.FOLIO_PASSWORD_STORE === 'basic';
if (BASIC_STORE) app.commandLine.appendSwitch('password-store', 'basic');
if (process.env.FOLIO_USER_DATA) app.setPath('userData', process.env.FOLIO_USER_DATA);
// One Folio per computer (per data folder): starting it again brings the running one forward.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => showWindow());

const send = (channel: string, payload: unknown) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload));

// Started with the computer: no window until the person opens one from the tray.
const startedHidden = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);
let labels: Labels = { open: 'Open Folio', quit: 'Quit Folio', background: 'Folio keeps running in the background for scheduled tasks.' };
let tray: Tray | null = null, toldBackground = false;

function showWindow(){
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return createWindow();
  win.show();
  win.focus();
}

// While this computer has scheduled tasks (or Folio started with the computer), it lives in the tray or menu bar.
function updateTray(){
  const want = hasScheduled() || startedHidden;
  if (!want){ tray?.destroy(); tray = null; return; }
  if (!tray){
    tray = new Tray(join(import.meta.dirname, `../../resources/${process.platform === 'darwin' ? 'trayTemplate' : 'tray'}.png`));
    tray.on('click', showWindow);
  }
  tray.setToolTip('Folio');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: labels.open, click: showWindow }, { type: 'separator' }, { label: labels.quit, click: () => app.quit() }]));
}
onScheduled(updateTray);

function createWindow(){
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, show: false, title: 'Folio', backgroundColor: '#F1F3EF',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  win.once('ready-to-show', () => { if (!startedHidden) win.show(); });
  // With scheduled tasks here, closing the window keeps Folio running so they still run; it says so once.
  win.on('close', e => {
    if (quitting || !hasScheduled()) return;
    e.preventDefault();
    win.hide();
    updateTray();
    if (!toldBackground && Notification.isSupported()){ toldBackground = true; new Notification({ title: 'Folio', body: labels.background }).show(); }
  });
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

ipcMain.handle('folio:login', async (_e, email: string, password: string) => {
  forget();
  const r = await login(String(email), String(password));
  if (r.ok) startScheduler();
  return r;
});
ipcMain.handle('folio:logout', async () => { watching(null); stopScheduler(); stopWindowSync(); await stopRuns(); await stopAll(); forget(); return logout(); });
ipcMain.handle('folio:hasSession', () => !!getToken());
ipcMain.handle('folio:api', (_e, method: Method, path: string, body?: unknown) => forRenderer(method, String(path), body));
ipcMain.handle('folio:openSite', async (_e, path: string) => {
  if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) await shell.openExternal(SITE_URL + path);
});
ipcMain.handle('folio:saveFile', async (e, name: string, content: string) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await (win ? dialog.showSaveDialog(win, { defaultPath: join(app.getPath('downloads'), basename(String(name))) }) : dialog.showSaveDialog({ defaultPath: String(name) }));
  if (r.canceled || !r.filePath) return null;
  await writeFile(r.filePath, String(content));
  return r.filePath;
});
// Exports go through the server (owners and admins only, and logged); a profile running here saves first.
ipcMain.handle('folio:exportCookies', async (e, profiles: { id: string; name: string; number: number }[], format: 'json' | 'netscape') => {
  const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const ext = format === 'json' ? 'json' : 'txt';
  const fileOf = (p: { name: string; number: number }) => `${p.name.replace(/[\\/:*?"<>|]+/g, '_')}-${String(p.number).padStart(4, '0')}.${ext}`;
  let dir: string, single: string | null = null;
  if (profiles.length === 1){
    const r = await (win ? dialog.showSaveDialog(win, { defaultPath: join(app.getPath('downloads'), fileOf(profiles[0])) }) : dialog.showSaveDialog({ defaultPath: fileOf(profiles[0]) }));
    if (r.canceled || !r.filePath) return null;
    single = r.filePath; dir = dirname(r.filePath);
  } else {
    const r = await (win ? dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }) : dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] }));
    if (r.canceled || !r.filePaths[0]) return null;
    dir = r.filePaths[0];
  }
  let saved = 0;
  const failed: { name: string; code: string }[] = [];
  for (const p of profiles){
    if (isRunning(p.id)) await saveNow(p.id);
    const r = await api<{ cookies: Cookie[] }>('GET', `/profiles/${p.id}/cookies`);
    if (!r.ok){ failed.push({ name: p.name, code: r.error.code }); continue; }
    await writeFile(single ?? join(dir, fileOf(p)), format === 'json' ? toJson(r.data.cookies) : toNetscape(r.data.cookies));
    saved++;
  }
  return { saved, failed, path: single ?? dir };
});

// Imports go into the saved state on the server; a profile running here also gets them in its browser.
ipcMain.handle('folio:importCookies', async (_e, id: string, text: string) => {
  let cookies: Cookie[];
  try { cookies = parseCookies(String(text)); } catch { cookies = []; }
  if (!cookies.length) return { ok: false, error: { code: 'cookies_unreadable', message: 'No cookies found in this file', status: 400 } };
  const running = isRunning(id);
  if (running) await addCookies(id, cookies);
  const r = await api('POST', `/profiles/${id}/cookies`, { cookies });
  // A profile kept on this computer has no saved state: the running browser is where they go.
  if (!r.ok && !(running && r.error.code === 'local_only')) return r;
  return { ok: true, data: { count: cookies.length } };
});

// Workspace files. A picked file waits here, by token, until it is unlocked and imported.
const failure = (code: string) => ({ ok: false, error: { code, message: code, status: 400 } });
const picked = new Map<string, { file: Buffer; bundle?: Bundle }>();
ipcMain.handle('folio:exportWorkspace', async (e, workspaceId: string, passphrase: string) => {
  if (String(passphrase).length < 10) return failure('passphrase_short');
  let bundle: Bundle;
  try { bundle = await exportWorkspace(String(workspaceId)); } catch (err){ return failure((err as Error).message); }
  const win = BrowserWindow.fromWebContents(e.sender);
  const name = `${bundle.workspace.replace(/[\\/:*?"<>|]+/g, '_')}-${bundle.exportedAt.slice(0, 10)}.folio`;
  const r = await (win ? dialog.showSaveDialog(win, { defaultPath: join(app.getPath('downloads'), name) }) : dialog.showSaveDialog({ defaultPath: name }));
  if (r.canceled || !r.filePath) return { ok: true, data: null };
  await writeFile(r.filePath, await seal(bundle, String(passphrase)));
  return { ok: true, data: { path: r.filePath, profiles: bundle.profiles.length } };
});
ipcMain.handle('folio:pickImport', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = { properties: ['openFile' as const], filters: [{ name: 'Folio', extensions: ['folio'] }] };
  const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
  if (r.canceled || !r.filePaths[0]) return null;
  const token = randomUUID();
  picked.set(token, { file: await readFile(r.filePaths[0]) });
  return { token, name: basename(r.filePaths[0]) };
});
ipcMain.handle('folio:unlockImport', async (_e, token: string, passphrase: string) => {
  const p = picked.get(String(token));
  if (!p) return failure('not_found');
  try { p.bundle = await unseal(p.file, String(passphrase)); } catch (err){ return failure((err as Error).message); }
  const b = p.bundle;
  return { ok: true, data: { workspace: b.workspace, exportedAt: b.exportedAt, profiles: b.profiles.length, proxies: b.proxies.length, groups: b.groups.length, extensions: b.extensions?.length ?? 0, signedIn: Object.keys(b.states).length } };
});
ipcMain.handle('folio:runImport', async (_e, token: string, workspaceId: string) => {
  const p = picked.get(String(token));
  if (!p?.bundle) return failure('not_found');
  try {
    const result = await importWorkspace(String(workspaceId), p.bundle);
    picked.delete(String(token));
    return { ok: true, data: result };
  } catch (err){ return failure((err as Error).message); }
});

ipcMain.handle('folio:info', () => ({ locale: app.getLocale(), version: app.getVersion(), siteUrl: SITE_URL, platform: process.platform }));

// The open workspace: live changes, plus a proxy health check every ten minutes. A change to profiles may be a
// takeover of one running here, so their locks are checked right away.
let health: NodeJS.Timeout | null = null;
function watching(workspaceId: string | null){
  watch(workspaceId, c => {
    send('app:change', c);
    if (c.kind === 'profiles') verify(c.ids);
    if (c.kind === 'tasks') void tick();
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

onStatus(s => { send('profile:status', s); if (s.state === 'stopped' || s.state === 'error') leftWindowSync(s.id); });
onWindowSync(s => send('sync:state', s));
ipcMain.handle('folio:startWindowSync', (_e, ids: string[], leader?: string) => startWindowSync(Array.isArray(ids) ? ids.map(String) : [], leader ? String(leader) : undefined));
ipcMain.handle('folio:stopWindowSync', () => stopWindowSync());
ipcMain.handle('folio:setSyncLeader', (_e, id: string) => setLeader(String(id)));
ipcMain.handle('folio:syncGoto', (_e, url: string) => syncGoto(String(url)));
ipcMain.handle('folio:windowSync', () => windowSync());
ipcMain.handle('folio:tileWindows', e => {
  const s = windowSync(), win = BrowserWindow.fromWebContents(e.sender);
  return s && win ? tile(s.members.map(m => m.id), screen.getDisplayMatching(win.getBounds()).workArea) : null;
});
ipcMain.handle('folio:openProfile', (_e, id: string) => { void open(String(id)); });
ipcMain.handle('folio:stopProfile', (_e, id: string) => stop(String(id)));
ipcMain.handle('folio:statuses', () => statuses());
ipcMain.handle('folio:checkProxy', (_e, id: string) => checkById(String(id)));

// Trial runs from the flow editor, each by a token its progress events carry.
const trials = new Map<string, AbortController>();
ipcMain.handle('folio:tryFlow', (_e, profileId: string, steps: Step[], vars: Record<string, string>) => {
  const token = randomUUID(), abort = new AbortController();
  trials.set(token, abort);
  void tryFlow(String(profileId), steps, { ...vars }, abort.signal, ev => send('flow:event', { token, ...ev })).finally(() => trials.delete(token));
  return token;
});
ipcMain.handle('folio:stopFlow', (_e, token: string) => { trials.get(String(token))?.abort(); });
ipcMain.handle('folio:showFile', (_e, path: string) => { const full = screenshotPath(String(path)); if (full) shell.showItemInFolder(full); });
onRuns(runs => send('runs:active', runs));
onSignedOut(e => send('runs:signed-out', e));
ipcMain.handle('folio:runTask', (_e, taskId: string, trigger: 'manual' | 'rerun', profileIds?: string[]) =>
  runTask(String(taskId), trigger === 'rerun' ? 'rerun' : 'manual', Array.isArray(profileIds) ? profileIds.map(String) : undefined));
ipcMain.handle('folio:stopRun', (_e, runId: string) => { stopRun(String(runId)); });
ipcMain.handle('folio:activeRuns', () => activeRuns());
ipcMain.handle('folio:showWindow', () => showWindow());
ipcMain.handle('folio:setLabels', (_e, l: Labels) => { labels = { open: String(l.open), quit: String(l.quit), background: String(l.background) }; updateTray(); });
// Extension packages go up as bytes, straight from the picked file or from the store.
async function extensionBytes(kernel: KernelKind, from: ExtensionSource){
  if ('file' in from) return { bytes: Buffer.from(from.file), query: 'source=upload' };
  const got = await fromStore(kernel, String(from.store));
  return { bytes: got.bytes, query: `source=store&storeId=${encodeURIComponent(got.storeId)}` };
}
ipcMain.handle('folio:addExtension', async (_e, workspaceId: string, kernel: KernelKind, from: ExtensionSource) => {
  try {
    const { bytes, query } = await extensionBytes(kernel, from);
    return await api('POST', `/workspaces/${String(workspaceId)}/extensions?kernel=${kernel === 'firefox' ? 'firefox' : 'chromium'}&${query}`, bytes);
  } catch (err){ return failure((err as Error).message); }
});
ipcMain.handle('folio:updateExtension', async (_e, id: string, kernel: KernelKind, from: ExtensionSource) => {
  try {
    const { bytes, query } = await extensionBytes(kernel, from);
    return await api('PUT', `/extensions/${String(id)}/package?${query}`, bytes);
  } catch (err){ return failure((err as Error).message); }
});
ipcMain.handle('folio:localApi', () => localApi());
ipcMain.handle('folio:setLocalApi', (_e, change: { enabled?: boolean; port?: number }) => setLocalApi({ enabled: change?.enabled, port: change?.port === undefined ? undefined : Number(change.port) }));
ipcMain.handle('folio:createApiToken', (_e, name: string, workspaceId: string) => createApiToken(String(name), String(workspaceId)));
ipcMain.handle('folio:revokeApiToken', (_e, id: string) => revokeApiToken(String(id)));
const startupSupported = process.platform === 'win32' || process.platform === 'darwin';
ipcMain.handle('folio:startup', () => ({ supported: startupSupported, enabled: startupSupported && app.getLoginItemSettings().openAtLogin }));
ipcMain.handle('folio:setStartup', (_e, on: boolean) => {
  if (startupSupported) app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
});

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
  await loadLocalApi();
  createWindow();
  if (getToken()) startScheduler();
  updateTray();
  app.on('activate', showWindow);
});

// Stop task runs and close every running profile before quitting, so no engine is left behind.
let quitting = false;
app.on('before-quit', e => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  void stopRuns().then(stopAll).finally(() => app.quit());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
