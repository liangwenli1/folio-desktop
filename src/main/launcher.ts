// Opens and closes profiles. Every launch: fetch the launch details, check the proxy (falling back to its
// backup line), align time zone, language and location with the exit IP, start the local forwarder, start
// the engine. Closing the browser window cleans up.
import { app } from 'electron';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';
import { Camoufox } from 'camoufox';
import { api } from './api';
import { prepareFirefox } from './fingerprint';
import { startForwarder, type Forwarder } from './forwarder';
import { resolve as resolveKernel } from './kernels';
import { echoThrough, type ProxySecret } from './proxy-check';
import type { CheckResult, Fingerprint, Geo, KernelKind, Os, ProfileStatus } from '../shared/bridge';

interface LaunchProfile {
  id: string; kernel: KernelKind; kernelVersion: string; os: Os; fingerprint: Fingerprint;
  timezoneOverride: string | null; localeOverride: string | null;
}
interface LaunchData { profile: LaunchProfile; proxy: ProxySecret | null; backup: ProxySecret | null }

class LaunchError extends Error { constructor(public code: string){ super(code); } }

const running = new Map<string, { ctx: BrowserContext; fwd: Forwarder; status: ProfileStatus }>();
// End-to-end tests drive the launched browsers through this; it is not set in normal runs.
if (process.env.FOLIO_TEST_HOOKS) (globalThis as { __folioRunning?: typeof running }).__folioRunning = running;
const starting = new Set<string>();
let notify: (s: ProfileStatus) => void = () => {};
export const onStatus = (fn: (s: ProfileStatus) => void) => { notify = fn; };
export const statuses = () => [...running.values()].map(r => r.status);

const report = (proxyId: string, r: CheckResult) => api('POST', `/proxies/${proxyId}/check`, r);

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

export async function open(id: string){
  if (running.has(id) || starting.has(id)) return;
  starting.add(id);
  notify({ id, state: 'starting' });
  let fwd: Forwarder | null = null;
  try {
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

    fwd = await startForwarder(line);
    const dir = join(app.getPath('userData'), 'profiles', profile.id);
    await mkdir(dir, { recursive: true });
    const ctx = profile.kernel === 'chromium'
      ? await launchChromium(exe, dir, profile, fwd.port, tz, locale, geo)
      : await launchFirefox(exe, dir, profile, fwd.port, tz, locale, geo, check?.ip ?? null);

    const status: ProfileStatus = { id, state: 'running', startedAt: Date.now(), usedBackup, exitIp: check?.ip ?? null, exitGeo: geo };
    running.set(id, { ctx, fwd, status });
    ctx.on('close', () => { void finish(id); });
    void api('POST', `/profiles/${id}/opened`);
    notify(status);
  } catch (e){
    await fwd?.close();
    notify({ id, state: 'error', error: e instanceof LaunchError ? e.code : 'launch_failed' });
    if (!(e instanceof LaunchError)) console.error('launch failed', e);
  } finally {
    starting.delete(id);
  }
}

async function finish(id: string){
  const r = running.get(id);
  if (!r) return;
  running.delete(id);
  await r.fwd.close();
  notify({ id, state: 'stopped' });
}

export async function stop(id: string){
  const r = running.get(id);
  if (r) await r.ctx.close().catch(() => finish(id));
}

export async function stopAll(){
  await Promise.all([...running.keys()].map(stop));
}
