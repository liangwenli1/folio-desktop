// Opens and closes profiles. Opening: take the profile's lock (one computer at a time), fetch the launch details,
// check the proxy (falling back to its backup line), bring the profile's folder up to the saved sign-in state,
// align time zone, language and location with the exit IP, start the local forwarder and the engine. While it
// runs, the lock is renewed and cookies are saved every few minutes. When the browser closes (however it
// closes), its folder is read back with the engine offline, the state is uploaded and the lock released.
import { app } from 'electron';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { Camoufox } from 'camoufox';
import { me } from './account';
import { api } from './api';
import { prepareFirefox } from './fingerprint';
import { startForwarder, type Forwarder } from './forwarder';
import { resolve as resolveKernel } from './kernels';
import { echoThrough, type ProxySecret } from './proxy-check';
import { collectExtensionData, prepareExtensions, writeExtensionData, type Extension } from './extensions';
import { addOrigins, download, readLocal, upload, writeLocal, type Local, type StorageState } from './sync';
import type { CheckResult, Debugging, Fingerprint, Geo, KernelKind, Os, ProfileStatus } from '../shared/bridge';
import type { Cookie } from '../shared/cookies';

interface LaunchProfile {
  id: string; workspaceId: string; syncMode: 'cloud' | 'local'; kernel: KernelKind; kernelVersion: string; os: Os; fingerprint: Fingerprint;
  timezoneOverride: string | null; localeOverride: string | null;
}
interface LaunchData { profile: LaunchProfile; proxy: ProxySecret | null; backup: ProxySecret | null; extensions: Extension[] }

class LaunchError extends Error { constructor(public code: string){ super(code); } }

const RENEW_MS = 30_000, AUTOSAVE_MS = 5 * 60_000;

interface Running {
  ctx: BrowserContext; fwd: Forwarder; status: ProfileStatus; profile: LaunchProfile; exe: string; dir: string;
  // What this computer's folder matches, and the package downloaded at opening (its sites' storage).
  local: Local; saved: StorageState | null;
  visited: Set<string>; timers: NodeJS.Timeout[]; done: Promise<void>;
  // Set when this computer may no longer save the profile: taken over elsewhere, or the account left the workspace.
  lost: null | 'lock_lost' | 'removed';
  // Where scripts connect, when it was opened through the local API.
  debug: Debugging | null;
  // The extensions it opened with, whose data is saved with its sign-ins.
  extensions: Extension[];
}
const running = new Map<string, Running>();
// End-to-end tests drive the launched browsers through this; it is not set in normal runs.
if (process.env.FOLIO_TEST_HOOKS) (globalThis as { __folioRunning?: typeof running }).__folioRunning = running;
const starting = new Set<string>();
let notify: (s: ProfileStatus) => void = () => {};
export const onStatus = (fn: (s: ProfileStatus) => void) => { notify = fn; };
export const statuses = () => [...running.values()].map(r => r.status);

const report = (proxyId: string, r: CheckResult) => api('POST', `/proxies/${proxyId}/check`, r);
const profilesOf = (userId: string) => join(app.getPath('userData'), 'profiles', userId);

// Switches that only make sense on a Linux test machine without a GPU or user namespaces.
const testOnly = () => [
  ...(process.env.FOLIO_KERNEL_NO_SANDBOX ? ['--no-sandbox'] : []),
  ...(process.env.FOLIO_PROXY_LOOPBACK ? ['--proxy-bypass-list=<-loopback>'] : [])
];

async function launchChromium(exe: string, dir: string, p: LaunchProfile, port: number, tz: string, locale: string, geo: Geo | null, debug: boolean, extensions: string[]){
  const fp = p.fingerprint as Extract<Fingerprint, { kind: 'chromium' }>;
  // Only our own switches: Playwright's defaults include --disable-extensions, --force-color-profile and others
  // that change behaviour a site can see (see docs/kernel-evaluation.md).
  const args = [
    '--remote-debugging-pipe', ...(debug ? ['--remote-debugging-port=0'] : []), `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    `--fingerprint=${fp.seed}`, `--fingerprint-platform=${p.os}`, '--fingerprint-brand=Chrome', `--fingerprint-hardware-concurrency=${fp.hardwareConcurrency}`,
    `--lang=${locale}`, `--accept-lang=${locale},${locale.split('-')[0]}`, `--timezone=${tz}`,
    `--proxy-server=http://127.0.0.1:${port}`, '--disable-non-proxied-udp',
    ...(extensions.length ? [`--load-extension=${extensions.join(',')}`] : []),
    ...testOnly(), 'about:blank'
  ];
  return chromium.launchPersistentContext(dir, {
    executablePath: exe, headless: false, viewport: null, ignoreDefaultArgs: true, args,
    ...(geo ? { geolocation: { latitude: geo.lat, longitude: geo.lon, accuracy: 50 }, permissions: ['geolocation'] } : {})
  });
}

async function launchFirefox(exe: string, dir: string, p: LaunchProfile, port: number, tz: string, locale: string, geo: Geo | null, exitIp: string | null, bidiPort: number | null,
  extensions: { dirs: string[]; uuids: Record<string, string> }){
  const fp = p.fingerprint as Extract<Fingerprint, { kind: 'firefox' }>;
  // Camoufox otherwise shows the host's time zone and the real public IP over WebRTC (P0 evaluation).
  const config: Record<string, unknown> = {
    ...fp.config, timezone: tz,
    ...(geo ? { 'geolocation:latitude': geo.lat, 'geolocation:longitude': geo.lon, 'geolocation:accuracy': 50 } : {}),
    ...(exitIp && !exitIp.includes(':') ? { 'webrtc:ipv4': exitIp } : {})
  };
  await prepareFirefox();
  return Camoufox({
    executable_path: exe, persistent_context: true, user_data_dir: dir, headless: false, os: p.os, locale, config,
    // Lets flow scripts that start with mw: see the page's own JavaScript; it does nothing until a script asks.
    i_know_what_im_doing: true, exclude_addons: ['UBO'], main_world_eval: true, addons: extensions.dirs,
    proxy: { server: `http://127.0.0.1:${port}`, ...(process.env.FOLIO_PROXY_LOOPBACK ? {} : { bypass: '127.0.0.1,localhost' }) },
    firefox_user_prefs: {
      ...(process.env.FOLIO_PROXY_LOOPBACK ? { 'network.proxy.allow_hijacking_localhost': true } : {}),
      ...(extensions.dirs.length ? { 'extensions.webextensions.uuids': JSON.stringify(extensions.uuids) } : {})
    },
    ...(bidiPort ? { args: [`--remote-debugging-port=${bidiPort}`] } : {})
  }) as Promise<BrowserContext>;
}

// A port nothing listens on right now, for Firefox's WebDriver BiDi server.
function freePort(){
  return new Promise<number>((resolve, reject) => {
    const srv = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

// Chromium writes the debugging port it picked, and the browser's path, into the profile's folder.
async function cdpAddress(dir: string): Promise<Debugging> {
  for (let i = 0; i < 100; i++){
    const [port, path] = (await readFile(join(dir, 'DevToolsActivePort'), 'utf8').catch(() => '')).trim().split('\n');
    if (port && path) return { protocol: 'cdp', wsEndpoint: `ws://127.0.0.1:${port}${path}`, debuggerAddress: `127.0.0.1:${port}` };
    await new Promise(r => setTimeout(r, 100));
  }
  throw new LaunchError('launch_failed');
}

// The engine on a profile's folder with no window and no network (a proxy nobody listens on, and every page
// answered locally), to write or read its storage.
async function offline(p: LaunchProfile, exe: string, dir: string){
  const dead = 'http://127.0.0.1:9';
  const ctx = p.kernel === 'chromium'
    ? await chromium.launchPersistentContext(dir, {
      executablePath: exe, headless: true, ignoreDefaultArgs: true,
      args: ['--remote-debugging-pipe', '--headless=new', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
        `--proxy-server=${dead}`, '--proxy-bypass-list=<-loopback>', ...(process.env.FOLIO_KERNEL_NO_SANDBOX ? ['--no-sandbox'] : []), 'about:blank']
    })
    : await prepareFirefox().then(() => Camoufox({
      executable_path: exe, persistent_context: true, user_data_dir: dir, headless: true, os: p.os,
      config: (p.fingerprint as Extract<Fingerprint, { kind: 'firefox' }>).config, i_know_what_im_doing: true, exclude_addons: ['UBO'],
      proxy: { server: dead }, firefox_user_prefs: { 'network.proxy.allow_hijacking_localhost': true }
    }) as Promise<BrowserContext>);
  await ctx.route('**/*', r => r.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  return ctx;
}

async function restore(p: LaunchProfile, exe: string, dir: string, state: StorageState){
  const ctx = await offline(p, exe, dir);
  try { await ctx.setStorageState({ cookies: state.cookies, origins: state.origins }); } finally { await ctx.close(); }
}

// Visiting each known site is how the engine is asked for that site's storage.
async function harvest(p: LaunchProfile, exe: string, dir: string, origins: string[]){
  const ctx = await offline(p, exe, dir);
  try {
    const page = ctx.pages()[0] ?? await ctx.newPage();
    for (const o of origins) await page.goto(o).catch(() => {});
    return await ctx.storageState({ indexedDB: true });
  } finally { await ctx.close(); }
}

// Resolves when the browser is up (null) or could not start (the reason). Opened for the local API, it also
// listens for scripts: CDP for Chromium, WebDriver BiDi for Firefox, on this computer only.
export async function open(id: string, opts: { api?: boolean } = {}): Promise<string | null> {
  if (running.has(id)) return null;
  if (starting.has(id)) return 'starting';
  starting.add(id);
  notify({ id, state: 'starting' });
  let fwd: Forwarder | null = null, locked = false;
  try {
    const lock = await api<{ data: unknown }>('POST', `/profiles/${id}/lock`, opts.api ? { via: 'api' } : undefined);
    if (!lock.ok) throw new LaunchError(lock.error.code);
    locked = true;
    const r = await api<LaunchData>('GET', `/profiles/${id}/launch`);
    if (!r.ok) throw new LaunchError(r.error.code);
    const { profile, proxy, backup, extensions } = r.data;
    const exe = await resolveKernel(profile.kernel, profile.kernelVersion);
    if (!exe) throw new LaunchError('kernel_missing');

    let line = proxy, check: CheckResult | null = null, usedBackup = false;
    if (proxy){
      check = await echoThrough(proxy);
      void report(proxy.id, check);
      if (!check.ok && backup){
        const b = await echoThrough(backup);
        void report(backup.id, b);
        if (b.ok){ line = backup; check = b; usedBackup = true; }
      }
      if (!check.ok) throw new LaunchError('proxy_down');
    }
    const geo = check?.geo ?? null;
    const tz = profile.timezoneOverride ?? geo?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = profile.localeOverride ?? geo?.locale ?? 'en-US';

    const who = await me();
    if (!who) throw new LaunchError('unauthenticated');
    const dir = join(profilesOf(who.id), profile.id);
    await mkdir(dir, { recursive: true });
    // Recorded right away, so the folder can be found if the account leaves the workspace.
    const local = { ...(await readLocal(dir)), workspaceId: profile.workspaceId };
    await writeLocal(dir, local);
    let saved: StorageState | null = null;
    // The server's package wins when it is not the one this folder already matches (it was used elsewhere).
    // Profiles kept on one computer have none.
    if (lock.data.data && profile.syncMode === 'cloud'){
      const pkg = await download(id);
      saved = pkg.state;
      if (pkg.sha256 !== local.sha256){
        notify({ id, state: 'restoring' });
        await restore(profile, exe, dir, pkg.state);
        await writeExtensionData(dir, extensions, pkg.state.extensions);
        local.sha256 = pkg.sha256;
        local.origins = addOrigins(local.origins, pkg.state.origins.map(o => o.origin));
        await writeLocal(dir, local);
      }
    }

    const ext = await prepareExtensions(profile, extensions, dir);
    fwd = await startForwarder(line);
    if (opts.api) await rm(join(dir, 'DevToolsActivePort'), { force: true });
    const bidiPort = opts.api && profile.kernel === 'firefox' ? await freePort() : null;
    const ctx = profile.kernel === 'chromium'
      ? await launchChromium(exe, dir, profile, fwd.port, tz, locale, geo, !!opts.api, ext.dirs)
      : await launchFirefox(exe, dir, profile, fwd.port, tz, locale, geo, check?.ip ?? null, bidiPort, ext);
    const debug: Debugging | null = !opts.api ? null
      : bidiPort ? { protocol: 'webdriver-bidi', wsEndpoint: `ws://127.0.0.1:${bidiPort}/session` } : await cdpAddress(dir);

    const visited = new Set<string>();
    const track = (page: Page) => page.on('framenavigated', f => {
      const u = f === page.mainFrame() ? URL.parse(f.url()) : null;
      if (u?.protocol === 'http:' || u?.protocol === 'https:') visited.add(u.origin);
    });
    ctx.pages().forEach(track);
    ctx.on('page', track);
    const status: ProfileStatus = { id, state: 'running', startedAt: Date.now(), usedBackup, exitIp: check?.ip ?? null, exitGeo: geo, ...(ext.failed.length ? { extensionErrors: ext.failed } : {}) };
    const entry: Running = {
      ctx, fwd, status, profile, exe, dir, local, saved, visited, lost: null, debug, extensions,
      timers: [setInterval(() => void renew(id), RENEW_MS), setInterval(() => void autosave(id), AUTOSAVE_MS)],
      done: new Promise(resolve => ctx.on('close', () => { void finish(id).finally(resolve); }))
    };
    running.set(id, entry);
    notify(status);
    return null;
  } catch (e){
    await fwd?.close();
    if (locked) await api('DELETE', `/profiles/${id}/lock`);
    const error = e instanceof LaunchError ? e.code : 'launch_failed';
    notify({ id, state: 'error', error });
    if (!(e instanceof LaunchError)) console.error('launch failed', e);
    return error;
  } finally {
    starting.delete(id);
  }
}

// Another computer took the profile over: close it here without saving over their state.
async function renew(id: string){
  const r = running.get(id);
  if (!r || r.lost) return;
  const res = await api('POST', `/profiles/${id}/lock/renew`);
  if (!res.ok && res.error.code === 'lock_lost'){ r.lost = 'lock_lost'; await r.ctx.close().catch(() => {}); }
}
// Checks the locks of running profiles now, rather than at the next renewal (called on change events).
export const verify = (ids?: string[]) => (ids ?? [...running.keys()]).filter(id => running.has(id)).forEach(id => void renew(id));

// Cookies only: reading other sites' storage would need the engine to load them while the user works.
async function autosave(id: string){
  const r = running.get(id);
  if (!r || r.lost || r.profile.syncMode === 'local') return;
  try {
    const result = await upload(id, { cookies: await r.ctx.cookies(), origins: r.saved?.origins ?? [], extensions: r.saved?.extensions }, r.local);
    if (result === 'lost'){ r.lost = 'lock_lost'; await r.ctx.close().catch(() => {}); }
    else await writeLocal(r.dir, r.local);
  } catch (e){ console.error('autosave failed', e); }
}

async function finish(id: string){
  const r = running.get(id);
  if (!r) return;
  r.timers.forEach(clearInterval);
  await r.fwd.close();
  // A profile of a workspace the account left just stops; its folder is deleted by discard().
  let error = r.lost === 'lock_lost' ? 'lock_lost' : undefined;
  if (!r.lost && r.profile.syncMode === 'local') await api('DELETE', `/profiles/${id}/lock`);
  else if (!r.lost){
    r.status = { id, state: 'saving' };
    notify(r.status);
    try {
      r.local.origins = addOrigins(r.local.origins, r.visited);
      // Extension data is read straight from the folder, before the engine starts again without its extensions.
      const extensions = await collectExtensionData(r.dir, r.extensions);
      const state = { ...(await harvest(r.profile, r.exe, r.dir, r.local.origins)), extensions };
      if (await upload(id, state, r.local) === 'lost') error = 'lock_lost';
      await writeLocal(r.dir, r.local);
    } catch (e){
      console.error('saving sign-in state failed', e);
      error = 'save_failed';
    }
    await api('DELETE', `/profiles/${id}/lock`);
  }
  running.delete(id);
  notify(error ? { id, state: 'error', error } : { id, state: 'stopped' });
}

// Saves the running profile's cookies now (before exporting them), when it runs on this computer.
export const saveNow = (id: string) => autosave(id);
export const isRunning = (id: string) => running.has(id);
export const debugOf = (id: string) => running.get(id)?.debug ?? null;
// A new tab in the profile's browser, for a flow to run in.
export async function newPage(id: string){
  const r = running.get(id);
  return r ? { page: await r.ctx.newPage(), kernel: r.profile.kernel } : null;
}
// Adds imported cookies to the browser, when the profile runs on this computer.
export async function addCookies(id: string, cookies: Cookie[]){
  await running.get(id)?.ctx.addCookies(cookies);
}

// Resolves once the state is saved and the lock released.
export async function stop(id: string){
  const r = running.get(id);
  if (!r) return;
  await r.ctx.close().catch(() => {});
  await r.done;
}

export async function stopAll(){
  await Promise.all([...running.keys()].map(stop));
}

// The account was taken out of a workspace: its profiles close here without saving, and their folders go.
export async function discard(workspaceId: string){
  await Promise.all([...running.values()].filter(r => r.profile.workspaceId === workspaceId).map(async r => {
    r.lost = 'removed';
    await r.ctx.close().catch(() => {});
    await r.done;
  }));
  const who = await me();
  if (who) await removeFolders(who.id, ws => ws === workspaceId);
}

// Folders of workspaces the account is no longer in (it was removed while this computer was off).
export async function prune(){
  const who = await me(true);
  if (who) await removeFolders(who.id, ws => !who.workspaceIds.includes(ws));
}

async function removeFolders(userId: string, match: (workspaceId: string) => boolean){
  const root = profilesOf(userId);
  for (const id of await readdir(root).catch(() => [] as string[])){
    if (running.has(id) || starting.has(id)) continue;
    const { workspaceId } = await readLocal(join(root, id));
    if (workspaceId && match(workspaceId)) await rm(join(root, id), { recursive: true, force: true });
  }
}
