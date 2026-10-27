// Opens and closes profiles. Opening: take the profile's lock (one computer at a time), fetch the launch details,
// check the proxy (falling back to its backup line), bring the profile's folder up to the saved sign-in state,
// align time zone, language and location with the exit IP, set its search engine, start the local forwarder and the
// engine, and open its start pages. Both engines start without a window, which keeps them alive when their last window
// closes: the profile then stops, or, when the workspace says so, keeps running without a window until a window is
// opened again or it is stopped. While it runs, the lock is renewed and cookies are saved every few minutes. When the
// browser closes (however it closes), its folder is read back with the engine offline, the state (with the tabs it
// had open) is uploaded and the lock released.
import { app, screen } from 'electron';
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
import { chromiumSearchDue, setChromiumSearch, withFirefoxSearch } from './search';
import { addOrigins, download, readLocal, upload, writeLocal, type Local, type StorageState } from './sync';
import type { CheckResult, CheckupFacts, Debugging, Fingerprint, Geo, KernelKind, Os, ProfileStatus } from '../shared/bridge';
import type { Cookie, CookieKey } from '../shared/cookies';
import { SEARCH_ENGINES, type SearchEngine } from '../shared/search';

interface LaunchProfile {
  id: string; workspaceId: string; syncMode: 'cloud' | 'local'; kernel: KernelKind; kernelVersion: string; os: Os; fingerprint: Fingerprint;
  timezoneOverride: string | null; localeOverride: string | null; searchEngine: SearchEngine; restoreTabs: boolean;
  startUrl: string | null; windowMode: 'default' | 'custom' | 'maximized'; windowWidth: number | null; windowHeight: number | null;
}
interface LaunchData { profile: LaunchProfile; proxy: ProxySecret | null; backup: ProxySecret | null; extensions: Extension[]; stopOnWindowClose: boolean }

// `reason` says why the proxy check failed, for 'proxy_down'.
class LaunchError extends Error { constructor(public code: string, public reason?: string){ super(code); } }

const RENEW_MS = 30_000, AUTOSAVE_MS = 5 * 60_000;
// Tabs kept for the next opening. Tabs that close within a second of each other at the end went with the browser.
const MAX_TABS = 20, TAB_GRACE_MS = 1000;

interface Running {
  ctx: BrowserContext; fwd: Forwarder; status: ProfileStatus; profile: LaunchProfile; exe: string; dir: string;
  // Whether closing its last window stops it (otherwise it runs on without one); set once it is being stopped.
  stopOnClose: boolean; stopping?: boolean;
  // What this computer's folder matches, and the package downloaded at opening (its sites' storage).
  local: Local; saved: StorageState | null;
  visited: Set<string>; timers: NodeJS.Timeout[]; done: Promise<void>;
  // Set when this computer may no longer save the profile: taken over elsewhere, or the account left the workspace.
  lost: null | 'lock_lost' | 'removed';
  // Where scripts connect, when it was opened through the local API.
  debug: Debugging | null;
  // The extensions it opened with, whose data is saved with its sign-ins.
  extensions: Extension[];
  // Its tabs in the order they opened, with their addresses ('' until they show a site) and when they closed, when
  // they are kept for next time (see open()); otherwise the tabs kept from before, saved again unchanged.
  tabs: Map<Page, Tab> | null; keptTabs: string[];
}
interface Tab { url: string; closedAt: number | null }
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

// Without a window of its own: --no-startup-window, with the DevTools pipe, keeps Chromium alive after its last window.
async function launchChromium(exe: string, dir: string, p: LaunchProfile, port: number, tz: string, locale: string, geo: Geo | null, debug: boolean, extensions: string[]){
  const fp = p.fingerprint as Extract<Fingerprint, { kind: 'chromium' }>;
  const real = [fp.canvas === 'real' && 'canvas', fp.webgl === 'real' && 'gpu'].filter(Boolean);
  // Only our own switches: Playwright's defaults include --disable-extensions, --force-color-profile and others
  // that change behaviour a site can see (see docs/kernel-evaluation.md).
  const args = [
    '--remote-debugging-pipe', ...(debug ? ['--remote-debugging-port=0'] : []), `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--no-startup-window',
    `--fingerprint=${fp.seed}`, `--fingerprint-platform=${p.os}`, '--fingerprint-brand=Chrome', `--fingerprint-hardware-concurrency=${fp.hardwareConcurrency}`,
    ...(real.length ? [`--disable-spoofing=${real.join(',')}`] : []),
    `--lang=${locale}`, `--accept-lang=${locale},${locale.split('-')[0]}`, `--timezone=${tz}`,
    `--proxy-server=http://127.0.0.1:${port}`, '--disable-non-proxied-udp',
    ...(extensions.length ? [`--load-extension=${extensions.join(',')}`] : []),
    ...(p.windowMode === 'maximized' ? ['--start-maximized'] : []),
    ...(p.windowMode === 'custom' && p.windowWidth && p.windowHeight ? [`--window-size=${p.windowWidth},${p.windowHeight}`] : []),
    ...testOnly()
  ];
  return chromium.launchPersistentContext(dir, {
    executablePath: exe, headless: false, viewport: null, ignoreDefaultArgs: true, args,
    ...(geo ? { geolocation: { latitude: geo.lat, longitude: geo.lon, accuracy: 50 }, permissions: ['geolocation'] } : {})
  });
}

async function launchFirefox(exe: string, dir: string, p: LaunchProfile, port: number, tz: string, locale: string, geo: Geo | null, exitIp: string | null, bidiPort: number | null,
  extensions: { dirs: string[]; uuids: Record<string, string> }){
  const fp = p.fingerprint as Extract<Fingerprint, { kind: 'firefox' }>;
  const block = fp.webrtc === 'block';
  // Camoufox otherwise shows the host's time zone and the real public IP over WebRTC (P0 evaluation).
  const config: Record<string, unknown> = fitWindow(sizedWindow(p, {
    ...fp.config, timezone: tz,
    ...(geo ? { 'geolocation:latitude': geo.lat, 'geolocation:longitude': geo.lon, 'geolocation:accuracy': 50 } : {}),
    ...(exitIp && !exitIp.includes(':') && !block ? { 'webrtc:ipv4': exitIp } : {})
  }));
  await prepareFirefox();
  return Camoufox({
    executable_path: exe, persistent_context: true, user_data_dir: dir, headless: false, os: p.os, locale, config,
    // Lets flow scripts that start with mw: see the page's own JavaScript; it does nothing until a script asks.
    i_know_what_im_doing: true, exclude_addons: ['UBO'], main_world_eval: true, addons: extensions.dirs, block_webrtc: block,
    proxy: { server: `http://127.0.0.1:${port}`, ...(process.env.FOLIO_PROXY_LOOPBACK ? {} : { bypass: '127.0.0.1,localhost' }) },
    firefox_user_prefs: {
      ...(process.env.FOLIO_PROXY_LOOPBACK ? { 'network.proxy.allow_hijacking_localhost': true } : {}),
      ...(extensions.dirs.length ? { 'extensions.webextensions.uuids': JSON.stringify(extensions.uuids) } : {})
    },
    // Playwright's own arguments for Firefox, without its start page and with -silent: no window of its own, and
    // Juggler keeps Firefox alive after its last window (Playwright then doesn't wait for a first one either).
    ignoreDefaultArgs: true,
    args: ['-no-remote', '-wait-for-browser', '-foreground', '-profile', dir, '-juggler-pipe', '-silent', ...(bidiPort ? [`--remote-debugging-port=${bidiPort}`] : [])]
  }) as Promise<BrowserContext>;
}

// Firefox's window at the size the profile asks for: its own width and height, or this screen's work area. The
// browser's own bars keep the room they had in the fingerprint.
function sizedWindow(p: LaunchProfile, config: Record<string, unknown>){
  const size = p.windowMode === 'maximized' ? screen.getPrimaryDisplay().workAreaSize
    : p.windowMode === 'custom' && p.windowWidth && p.windowHeight ? { width: p.windowWidth, height: p.windowHeight } : null;
  if (!size) return config;
  for (const [axis, want] of [['Width', size.width], ['Height', size.height]] as const){
    const outer = config[`window.outer${axis}`], inner = config[`window.inner${axis}`];
    const bars = typeof outer === 'number' && typeof inner === 'number' ? Math.max(0, outer - inner) : 0;
    config[`window.outer${axis}`] = want;
    if (typeof inner === 'number') config[`window.inner${axis}`] = Math.max(1, want - bars);
  }
  return config;
}

// A claimed screen bigger than this computer's keeps its size, but the window shrinks to fit the real one (with the
// same gap for the browser's own bars), as a window that isn't maximized would.
function fitWindow(config: Record<string, unknown>){
  const area = screen.getPrimaryDisplay().workAreaSize;
  for (const [axis, cap] of [['Width', area.width], ['Height', area.height]] as const){
    const outer = config[`window.outer${axis}`], inner = config[`window.inner${axis}`];
    if (typeof outer !== 'number' || outer <= cap) continue;
    config[`window.outer${axis}`] = cap;
    if (typeof inner === 'number') config[`window.inner${axis}`] = Math.max(1, cap - Math.max(0, outer - inner));
  }
  return config;
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
// answered locally), to write or read its storage. Firefox reads the search engine here too, so it gets the profile's
// own (Firefox reapplies a changed one over the person's choice).
async function offline(p: LaunchProfile, exe: string, dir: string){
  const dead = 'http://127.0.0.1:9';
  const ctx = p.kernel === 'chromium'
    ? await chromium.launchPersistentContext(dir, {
      executablePath: exe, headless: true, ignoreDefaultArgs: true,
      args: ['--remote-debugging-pipe', '--headless=new', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
        `--proxy-server=${dead}`, '--proxy-bypass-list=<-loopback>', ...(process.env.FOLIO_KERNEL_NO_SANDBOX ? ['--no-sandbox'] : []), 'about:blank']
    })
    : await prepareFirefox().then(() => withFirefoxSearch(exe, p.searchEngine, () => Camoufox({
      executable_path: exe, persistent_context: true, user_data_dir: dir, headless: true, os: p.os,
      config: (p.fingerprint as Extract<Fingerprint, { kind: 'firefox' }>).config, i_know_what_im_doing: true, exclude_addons: ['UBO'],
      proxy: { server: dead }, firefox_user_prefs: { 'network.proxy.allow_hijacking_localhost': true }
    }) as Promise<BrowserContext>));
  await ctx.route('**/*', r => r.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  return ctx;
}

async function restore(p: LaunchProfile, exe: string, dir: string, state: StorageState){
  const ctx = await offline(p, exe, dir);
  try { await ctx.setStorageState({ cookies: state.cookies, origins: state.origins }); } finally { await ctx.close(); }
}

// Pages in a new window (the browser has none open), each in a tab in order, loading in the background; a blank one
// without.
async function openTabs(ctx: BrowserContext, urls: string[]){
  for (const url of urls.length ? urls : ['about:blank']){
    const page = await ctx.newPage();
    if (url !== 'about:blank') void page.goto(url).catch(() => {});
  }
  await ctx.pages()[0]?.bringToFront().catch(() => {});
}
// The open tabs, or once the browser has closed, the last ones to close.
function tabsOf(r: Running){
  if (!r.tabs) return r.keptTabs;
  const all = [...r.tabs.values()], open = all.filter(t => t.closedAt === null);
  const last = Math.max(0, ...all.map(t => t.closedAt ?? 0));
  return (open.length ? open : all.filter(t => last - t.closedAt! < TAB_GRACE_MS)).map(t => t.url).filter(Boolean).slice(0, MAX_TABS);
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
// listens for scripts: CDP for Chromium, WebDriver BiDi for Firefox, on this computer only. `tabs`: opened for the
// person at the computer, it comes back with the tabs it was closed with (unless the profile says not to), else on
// its search engine's home page, and the tabs it closes with are kept. Opened for a script, a flow or window sync, it
// starts on one blank tab and leaves the kept tabs alone.
export async function open(id: string, opts: { api?: boolean; tabs?: boolean } = {}): Promise<string | null> {
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
    const { profile, proxy, backup, extensions, stopOnWindowClose } = r.data;
    const exe = await resolveKernel(profile.kernel, profile.kernelVersion);
    if (!exe) throw new LaunchError('kernel_missing');

    let line = proxy, check: CheckResult | null = null, usedBackup = false;
    if (proxy){
      notify({ id, state: 'starting', stage: 'proxy' });
      check = await echoThrough(proxy);
      void report(proxy.id, check);
      if (!check.ok && backup){
        const b = await echoThrough(backup);
        void report(backup.id, b);
        if (b.ok){ line = backup; check = b; usedBackup = true; }
      }
      if (!check.ok) throw new LaunchError('proxy_down', check.error ?? undefined);
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
        notify({ id, state: 'restoring', stage: 'restore' });
        await restore(profile, exe, dir, pkg.state);
        await writeExtensionData(dir, extensions, pkg.state.extensions);
        local.sha256 = pkg.sha256;
        local.origins = addOrigins(local.origins, pkg.state.origins.map(o => o.origin));
        await writeLocal(dir, local);
      }
    }

    notify({ id, state: 'starting', stage: 'launch' });
    const ext = await prepareExtensions(profile, extensions, dir);
    fwd = await startForwarder(line);
    const port = fwd.port;
    if (opts.api) await rm(join(dir, 'DevToolsActivePort'), { force: true });
    const bidiPort = opts.api && profile.kernel === 'firefox' ? await freePort() : null;
    // A changed search engine is set first, in the engine without a window.
    if (profile.kernel === 'chromium' && await chromiumSearchDue(dir, profile.searchEngine)){
      const hidden = await offline(profile, exe, dir);
      try { await setChromiumSearch(hidden, profile.searchEngine); } finally { await hidden.close(); }
    }
    const keptTabs = (profile.syncMode === 'cloud' ? saved?.tabs : local.tabs) ?? [];
    const engine = profile.searchEngine === 'none' ? null : SEARCH_ENGINES[profile.searchEngine];
    const start = !opts.tabs ? [] : profile.restoreTabs && keptTabs.length ? keptTabs : profile.startUrl ? [profile.startUrl] : engine ? [engine.home] : [];
    const ctx = profile.kernel === 'chromium'
      ? await launchChromium(exe, dir, profile, port, tz, locale, geo, !!opts.api, ext.dirs)
      : await withFirefoxSearch(exe, profile.searchEngine, () => launchFirefox(exe, dir, profile, port, tz, locale, geo, check?.ip ?? null, bidiPort, ext));
    const debug: Debugging | null = !opts.api ? null
      : bidiPort ? { protocol: 'webdriver-bidi', wsEndpoint: `ws://127.0.0.1:${bidiPort}/session` } : await cdpAddress(dir);

    const visited = new Set<string>();
    const tabs = opts.tabs ? new Map<Page, Tab>() : null;
    const track = (page: Page) => {
      const tab: Tab = { url: '', closedAt: null };
      tabs?.set(page, tab);
      windowBack(id);
      // A page may arrive already on its address (a popup).
      const seen = (url: string) => {
        const u = URL.parse(url);
        if (u?.protocol === 'http:' || u?.protocol === 'https:'){ visited.add(u.origin); tab.url = u.href; }
      };
      seen(page.url());
      page.on('framenavigated', f => { if (f === page.mainFrame()) seen(f.url()); });
      // Tabs closed earlier than that are forgotten.
      page.on('close', () => {
        tab.closedAt = Date.now();
        for (const [p, t] of tabs ?? []) if (t.closedAt !== null && tab.closedAt - t.closedAt >= TAB_GRACE_MS) tabs!.delete(p);
        if (!ctx.pages().length) windowsGone(id);
      });
    };
    ctx.on('page', track);
    await openTabs(ctx, start);
    const status: ProfileStatus = { id, state: 'running', startedAt: Date.now(), usedBackup, exitIp: check?.ip ?? null, exitGeo: geo, ...(ext.failed.length ? { extensionErrors: ext.failed } : {}) };
    const entry: Running = {
      ctx, fwd, status, profile, exe, dir, stopOnClose: stopOnWindowClose, local, saved, visited, lost: null, debug, extensions, tabs, keptTabs,
      timers: [setInterval(() => void renew(id), RENEW_MS), setInterval(() => void autosave(id), AUTOSAVE_MS)],
      done: new Promise(resolve => ctx.on('close', () => { void finish(id).finally(resolve); }))
    };
    running.set(id, entry);
    notify(status);
    // Its window was closed while it was still starting.
    if (!ctx.pages().length) windowsGone(id);
    // Where it went out from this time, for the warnings about profiles that look related or moved.
    if (check?.ip) void api('POST', `/profiles/${id}/exit`, { ip: check.ip, geo });
    return null;
  } catch (e){
    await fwd?.close();
    if (locked) await api('DELETE', `/profiles/${id}/lock`);
    const error = e instanceof LaunchError ? e.code : 'launch_failed';
    notify({ id, state: 'error', error, ...(e instanceof LaunchError && e.reason ? { reason: e.reason } : {}) });
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
    const result = await upload(id, { cookies: await r.ctx.cookies(), origins: r.saved?.origins ?? [], extensions: r.saved?.extensions, tabs: tabsOf(r) }, r.local);
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
  if (!r.lost && r.profile.syncMode === 'local'){
    r.local.tabs = tabsOf(r);
    await writeLocal(r.dir, r.local);
    await api('DELETE', `/profiles/${id}/lock`);
  }
  else if (!r.lost){
    r.status = { id, state: 'saving' };
    notify(r.status);
    try {
      r.local.origins = addOrigins(r.local.origins, r.visited);
      // Extension data is read straight from the folder, before the engine starts again without its extensions.
      const extensions = await collectExtensionData(r.dir, r.extensions);
      const state = { ...(await harvest(r.profile, r.exe, r.dir, r.local.origins)), extensions, tabs: tabsOf(r) };
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
// The running browser and its folder, for window sync and tiling.
export const browserOf = (id: string) => { const r = running.get(id); return r ? { ctx: r.ctx, kernel: r.profile.kernel, dir: r.dir } : null; };
// The self-check page: what a site can read from inside the profile's browser. WebRTC asks a public STUN server for
// this connection's addresses; canvas and WebGL are drawn and hashed (FNV-1a, as crypto.subtle needs a secure page).
const CHECKUP = `async () => {
  const hash = s => { let a = 0x811c9dc5, b = 0x01000193; for (let i = 0; i < s.length; i++){ a = Math.imul(a ^ s.charCodeAt(i), 16777619); b = Math.imul(b ^ s.charCodeAt(i), 2246822519); } return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')); };
  const ips = await new Promise(done => {
    const found = new Set();
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); } catch { return done([]); }
    pc.onicecandidate = e => {
      if (!e.candidate) return done([...found]);
      const m = e.candidate.candidate.match(/ (\\d+\\.\\d+\\.\\d+\\.\\d+|[0-9a-f]*:[0-9a-f:]+) /i);
      if (m) found.add(m[1]);
    };
    pc.createDataChannel('folio');
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => done([]));
    setTimeout(() => done([...found]), 4000);
  });
  const c = document.createElement('canvas'); c.width = 280; c.height = 60;
  const x = c.getContext('2d'); x.textBaseline = 'top'; x.font = '16px Arial'; x.fillStyle = '#f60'; x.fillRect(120, 1, 62, 20);
  x.fillStyle = '#069'; x.fillText('Folio check 1.2 \\u2713', 2, 15); x.fillStyle = 'rgba(102,204,0,.7)'; x.fillText('Folio check 1.2 \\u2713', 4, 17);
  let webgl = null;
  try {
    const g = document.createElement('canvas').getContext('webgl');
    if (g){ const d = g.getExtension('WEBGL_debug_renderer_info'); webgl = hash([g.getParameter(d ? d.UNMASKED_VENDOR_WEBGL : g.VENDOR), g.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : g.RENDERER), ...(g.getSupportedExtensions() || [])].join('|')); }
  } catch {}
  return { ips, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language, userAgent: navigator.userAgent, canvas: hash(c.toDataURL()), webgl };
}`;

// Runs the self-check in a new tab of the profile's browser (opening the profile first if needed), then closes it.
export async function checkup(id: string): Promise<{ ok: true; facts: CheckupFacts; exitIp: string | null; exitGeo: Geo | null } | { ok: false; error: string }> {
  if (!running.has(id)){
    const why = await open(id, { tabs: true });
    if (why) return { ok: false, error: why };
  }
  const r = running.get(id)!;
  const page = await r.ctx.newPage();
  try {
    await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><title>Folio</title><body style="font:16px system-ui;padding:40px">Folio …</body>'));
    return { ok: true, facts: await page.evaluate(`(${CHECKUP})()`) as CheckupFacts, exitIp: r.status.exitIp ?? null, exitGeo: r.status.exitGeo ?? null };
  } catch (e){
    console.error('checkup failed', e);
    return { ok: false, error: 'checkup_failed' };
  } finally { await page.close().catch(() => {}); }
}

// Its last window closed: it stops, or keeps running without a window (the workspace's choice).
function windowsGone(id: string){
  const r = running.get(id);
  if (!r || r.lost || r.stopping || r.status.noWindow) return;
  if (r.stopOnClose){ void stop(id); return; }
  r.status = { ...r.status, noWindow: true };
  notify(r.status);
}
// A window again, opened from Folio or by a flow, a script or the health check.
function windowBack(id: string){
  const r = running.get(id);
  if (!r?.status.noWindow) return;
  const { noWindow: _, ...rest } = r.status;
  r.status = rest;
  notify(r.status);
}

// Brings a running profile's window to the front (going to its window, or the command palette's "switch to it"). One
// running without a window gets one again, with the tabs it was closed with.
export async function focus(id: string){
  const r = running.get(id);
  if (!r) return;
  const page = r.ctx.pages()[0];
  if (page) await page.bringToFront().catch(() => {});
  else await openTabs(r.ctx, r.tabs ? tabsOf(r) : []);
}
// A new tab in the profile's browser, for a flow to run in.
export async function newPage(id: string){
  const r = running.get(id);
  return r ? { page: await r.ctx.newPage(), kernel: r.profile.kernel } : null;
}
// Adds imported cookies to the browser, or takes deleted ones out of it, when the profile runs on this computer.
export async function addCookies(id: string, cookies: Cookie[]){
  await running.get(id)?.ctx.addCookies(cookies);
}
export async function removeCookies(id: string, keys: CookieKey[]){
  const ctx = running.get(id)?.ctx;
  for (const k of ctx ? keys : []) await ctx!.clearCookies({ name: k.name, domain: k.domain, path: k.path });
}

// Resolves once the state is saved and the lock released.
export async function stop(id: string){
  const r = running.get(id);
  if (!r) return;
  r.stopping = true;
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
