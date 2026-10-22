// Opens and closes profiles. Opening: take the profile's lock (one computer at a time), fetch the launch details,
// check the proxy (falling back to its backup line), bring the profile's folder up to the saved sign-in state,
// align time zone, language and location with the exit IP, start the local forwarder and the engine. While it
// runs, the lock is renewed and cookies are saved every few minutes. When the browser closes (however it
// closes), its folder is read back with the engine offline, the state is uploaded and the lock released.
import { app } from 'electron';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { Camoufox } from 'camoufox';
import { me } from './account';
import { api } from './api';
import { prepareFirefox } from './fingerprint';
import { startForwarder, type Forwarder } from './forwarder';
import { resolve as resolveKernel } from './kernels';
import { echoThrough, type ProxySecret } from './proxy-check';
import { addOrigins, download, readLocal, upload, writeLocal, type Local, type StorageState } from './sync';
import type { CheckResult, Fingerprint, Geo, KernelKind, Os, ProfileStatus } from '../shared/bridge';

interface LaunchProfile {
  id: string; workspaceId: string; kernel: KernelKind; kernelVersion: string; os: Os; fingerprint: Fingerprint;
  timezoneOverride: string | null; localeOverride: string | null;
}
interface LaunchData { profile: LaunchProfile; proxy: ProxySecret | null; backup: ProxySecret | null }

class LaunchError extends Error { constructor(public code: string){ super(code); } }

const RENEW_MS = 30_000, AUTOSAVE_MS = 5 * 60_000;

interface Running {
  ctx: BrowserContext; fwd: Forwarder; status: ProfileStatus; profile: LaunchProfile; exe: string; dir: string;
  // What this computer's folder matches, and the package downloaded at opening (its sites' storage).
  local: Local; saved: StorageState | null;
  visited: Set<string>; timers: NodeJS.Timeout[]; done: Promise<void>;
  // Set when this computer may no longer save the profile: taken over elsewhere, or the account left the workspace.
  lost: null | 'lock_lost' | 'removed';
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

async function launchChromium(exe: string, dir: string, p: LaunchProfile, port: number, tz: string, locale: string, geo: Geo | null){
  const fp = p.fingerprint as Extract<Fingerprint, { kind: 'chromium' }>;
  // Only our own switches: Playwright's defaults include --disable-extensions, --force-color-profile and others
  // that change behaviour a site can see (see docs/kernel-evaluation.md).
  const args = [
    '--remote-debugging-pipe', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    `--fingerprint=${fp.seed}`, `--fingerprint-platform=${p.os}`, '--fingerprint-brand=Chrome', `--fingerprint-hardware-concurrency=${fp.hardwareConcurrency}`,
    `--lang=${locale}`, `--accept-lang=${locale},${locale.split('-')[0]}`, `--timezone=${tz}`,
    `--proxy-server=http://127.0.0.1:${port}`, '--disable-non-proxied-udp',
    ...testOnly(), 'about:blank'
  ];
  return chromium.launchPersistentContext(dir, {
    executablePath: exe, headless: false, viewport: null, ignoreDefaultArgs: true, args,
    ...(geo ? { geolocation: { latitude: geo.lat, longitude: geo.lon, accuracy: 50 }, permissions: ['geolocation'] } : {})
  });
}

async function launchFirefox(exe: string, dir: string, p: LaunchProfile, port: number, tz: string, locale: string, geo: Geo | null, exitIp: string | null){
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
    i_know_what_im_doing: true, exclude_addons: ['UBO'],
    proxy: { server: `http://127.0.0.1:${port}`, ...(process.env.FOLIO_PROXY_LOOPBACK ? {} : { bypass: '127.0.0.1,localhost' }) },
    firefox_user_prefs: process.env.FOLIO_PROXY_LOOPBACK ? { 'network.proxy.allow_hijacking_localhost': true } : {}
  }) as Promise<BrowserContext>;
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
  try { await ctx.setStorageState(state); } finally { await ctx.close(); }
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

export async function open(id: string){
  if (running.has(id) || starting.has(id)) return;
  starting.add(id);
  notify({ id, state: 'starting' });
  let fwd: Forwarder | null = null, locked = false;
  try {
    const lock = await api<{ data: unknown }>('POST', `/profiles/${id}/lock`);
    if (!lock.ok) throw new LaunchError(lock.error.code);
    locked = true;
    const r = await api<LaunchData>('GET', `/profiles/${id}/launch`);
    if (!r.ok) throw new LaunchError(r.error.code);
    const { profile, proxy, backup } = r.data;
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
    if (lock.data.data){
      const pkg = await download(id);
      saved = pkg.state;
      if (pkg.sha256 !== local.sha256){
        notify({ id, state: 'restoring' });
        await restore(profile, exe, dir, pkg.state);
        local.sha256 = pkg.sha256;
        local.origins = addOrigins(local.origins, pkg.state.origins.map(o => o.origin));
        await writeLocal(dir, local);
      }
    }

    fwd = await startForwarder(line);
    const ctx = profile.kernel === 'chromium'
      ? await launchChromium(exe, dir, profile, fwd.port, tz, locale, geo)
      : await launchFirefox(exe, dir, profile, fwd.port, tz, locale, geo, check?.ip ?? null);

    const visited = new Set<string>();
    const track = (page: Page) => page.on('framenavigated', f => {
      const u = f === page.mainFrame() ? URL.parse(f.url()) : null;
      if (u?.protocol === 'http:' || u?.protocol === 'https:') visited.add(u.origin);
    });
    ctx.pages().forEach(track);
    ctx.on('page', track);
    const status: ProfileStatus = { id, state: 'running', startedAt: Date.now(), usedBackup, exitIp: check?.ip ?? null, exitGeo: geo };
    const entry: Running = {
      ctx, fwd, status, profile, exe, dir, local, saved, visited, lost: null,
      timers: [setInterval(() => void renew(id), RENEW_MS), setInterval(() => void autosave(id), AUTOSAVE_MS)],
      done: new Promise(resolve => ctx.on('close', () => { void finish(id).finally(resolve); }))
    };
    running.set(id, entry);
    notify(status);
  } catch (e){
    await fwd?.close();
    if (locked) await api('DELETE', `/profiles/${id}/lock`);
    notify({ id, state: 'error', error: e instanceof LaunchError ? e.code : 'launch_failed' });
    if (!(e instanceof LaunchError)) console.error('launch failed', e);
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
  if (!r || r.lost) return;
  try {
    const result = await upload(id, { cookies: await r.ctx.cookies(), origins: r.saved?.origins ?? [] }, r.local);
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
  if (!r.lost){
    r.status = { id, state: 'saving' };
    notify(r.status);
    try {
      r.local.origins = addOrigins(r.local.origins, r.visited);
      const state = await harvest(r.profile, r.exe, r.dir, r.local.origins);
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
