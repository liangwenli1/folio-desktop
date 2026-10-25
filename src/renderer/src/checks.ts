// The consistency check behind a profile's stamp, its row in the list and the "Needs attention" filter.
// It reads only what the server and this computer know: the proxy's last check, the profile's overrides,
// and which engines are on this computer.
import type { KernelState } from '@shared/bridge';
import type { Geo, Profile, Proxy } from './api';

export const SLOW_MS = 800, VERY_SLOW_MS = 2000;
// How a latency reads: green up to SLOW_MS, yellow up to VERY_SLOW_MS, red beyond it or without an answer.
export const latencyTone = (ms: number | null) => (ms === null ? 'bad' : ms <= SLOW_MS ? 'good' : ms <= VERY_SLOW_MS ? 'warn' : 'bad');
export type Level = 'ok' | 'warn' | 'bad';
// `todo`: something to do on this computer (a download) that is not a problem with the profile.
export type CheckLevel = Level | 'todo';
export type ProxyState = 'none' | 'unchecked' | 'ok' | 'slow' | 'down';
export type Fix =
  | { kind: 'check'; proxyId: string } | { kind: 'backup'; proxyId: string } | { kind: 'choose-proxy' }
  | { kind: 'follow-tz' } | { kind: 'follow-lang' }
  | { kind: 'download'; version: string } | { kind: 'use-engine'; version: string } | { kind: 'edit' };
export type CheckId =
  | 'proxy-ok' | 'proxy-slow' | 'proxy-down' | 'proxy-backup' | 'proxy-none' | 'proxy-unchecked'
  | 'tz-ok' | 'tz-host' | 'tz-pending' | 'tz-mismatch' | 'lang-ok' | 'lang-mismatch' | 'geo' | 'rtc' | 'rtc-off' | 'fp-real'
  | 'engine-ok' | 'engine-older' | 'engine-missing' | 'engine-unavailable';
export interface Check { id: CheckId; level: CheckLevel; fix?: Fix }

export interface Health {
  checks: Check[]; level: Level; proxy: ProxyState; mismatch: boolean;
  px?: Proxy; backup?: Proxy;
  // The line a launch would use now (the backup takes over when the main line is down) and where it exits.
  line?: Proxy; geo: Geo | null;
}

export function proxyState(px: Proxy | undefined): ProxyState {
  if (!px) return 'none';
  const c = px.lastCheck;
  if (!c) return 'unchecked';
  if (!c.ok) return 'down';
  return (c.ms ?? 0) > SLOW_MS ? 'slow' : 'ok';
}

const up = (s: ProxyState) => s === 'ok' || s === 'slow';

export function health(p: Profile, proxies: Map<string, Proxy>, kernels: KernelState[]): Health {
  const px = p.proxyId ? proxies.get(p.proxyId) : undefined;
  const backup = px?.backupId ? proxies.get(px.backupId) : undefined;
  const state = proxyState(px), backupUp = up(proxyState(backup));
  const line = state === 'down' && backupUp ? backup : px;
  const geo = line?.lastCheck?.ok ? line.lastCheck.geo : null;
  const checks: Check[] = [];

  if (!px) checks.push({ id: 'proxy-none', level: 'warn', fix: { kind: 'choose-proxy' } });
  else if (state === 'unchecked') checks.push({ id: 'proxy-unchecked', level: 'warn', fix: { kind: 'check', proxyId: px.id } });
  else if (state === 'down') checks.push(backupUp
    ? { id: 'proxy-backup', level: 'warn', fix: { kind: 'backup', proxyId: backup!.id } }
    : { id: 'proxy-down', level: 'bad', fix: { kind: 'check', proxyId: px.id } });
  else if (state === 'slow') checks.push({ id: 'proxy-slow', level: 'warn', fix: backupUp ? { kind: 'backup', proxyId: backup!.id } : { kind: 'check', proxyId: px.id } });
  else checks.push({ id: 'proxy-ok', level: 'ok' });

  // With a proxy whose exit isn't known (not checked, or down), the time zone falls back to this computer's for now.
  const tzMismatch = !!(geo && p.timezoneOverride && p.timezoneOverride !== geo.timezone);
  if (tzMismatch) checks.push({ id: 'tz-mismatch', level: 'warn', fix: { kind: 'follow-tz' } });
  else if (geo || p.timezoneOverride) checks.push({ id: 'tz-ok', level: 'ok' });
  else checks.push(px ? { id: 'tz-pending', level: 'warn' } : { id: 'tz-host', level: 'ok' });
  const region = p.localeOverride?.split('-')[1]?.toUpperCase();
  const langMismatch = !!(geo && region && region !== geo.country);
  if (langMismatch) checks.push({ id: 'lang-mismatch', level: 'warn', fix: { kind: 'follow-lang' } });
  else if (geo || p.localeOverride) checks.push({ id: 'lang-ok', level: 'ok' });
  const fp = p.fingerprint;
  if (geo) checks.push({ id: 'geo', level: 'ok' }, { id: fp.kind === 'firefox' && fp.webrtc === 'block' ? 'rtc-off' : 'rtc', level: 'ok' });
  // This computer's own Canvas or GPU is the same in every profile on it.
  if (fp.kind === 'chromium' && (fp.canvas === 'real' || fp.webgl === 'real')) checks.push({ id: 'fp-real', level: 'warn', fix: { kind: 'edit' } });

  // Engines are a fact about this computer: a missing download is not a problem with the profile. A version the
  // catalog no longer has still opens where it is downloaded; elsewhere the profile moves to the recommended one.
  const versions = kernels.filter(k => k.kind === p.kernel);
  const latest = versions.find(k => k.recommended) ?? versions.find(k => k.available);
  if (latest){
    const mine = versions.find(k => k.version === p.kernelVersion);
    if (!mine) checks.push({ id: 'engine-unavailable', level: 'warn', fix: { kind: 'use-engine', version: latest.version } });
    else if (!mine.installed) checks.push({ id: 'engine-missing', level: 'todo', fix: { kind: 'download', version: mine.version } });
    else if (latest.version !== mine.version) checks.push({ id: 'engine-older', level: 'ok', fix: { kind: 'use-engine', version: latest.version } });
    else checks.push({ id: 'engine-ok', level: 'ok' });
  }

  const level: Level = checks.some(c => c.level === 'bad') ? 'bad' : checks.some(c => c.level === 'warn') ? 'warn' : 'ok';
  return { checks, level, proxy: state, mismatch: tzMismatch || langMismatch, px, backup, line, geo };
}

export const ENGINES: Record<Profile['kernel'], string> = { chromium: 'Chromium', firefox: 'Firefox' };
export const engineName = (kind: Profile['kernel'], version: string) => `${ENGINES[kind]} ${version.split('.')[0]}`;

// A GPU as people name it, from the renderer string a browser reports.
export const gpuName = (renderer: string) => renderer.replace(/, or similar$/, '')
  .replace(/^ANGLE \([^,]+, (.+?)(?: \(0x[0-9A-Fa-f]+\))? (?:Direct3D|OpenGL|Vulkan|Metal).*$/, '$1');

// What a fingerprint pins down, for the new-profile preview and a profile's details. Chromium derives the rest from
// the seed inside the engine, and its screen is this computer's; Camoufox stores every value, but its Canvas is up to
// the engine. `webrtc`: 'udp' blocks what doesn't go through the proxy, 'replace' shows the exit IP, 'block' turns it off.
export function fingerprintFacts(fp: Profile['fingerprint']){
  if (fp.kind === 'chromium') return {
    seed: fp.seed.toString(16).padStart(8, '0'), cores: fp.hardwareConcurrency, screen: null, gpu: null,
    webrtc: 'udp' as const, webgl: fp.webgl ?? 'spoof', canvas: fp.canvas ?? 'noise'
  };
  const c = fp.config, num = (k: string) => (typeof c[k] === 'number' ? c[k] as number : null);
  return {
    seed: null, cores: num('navigator.hardwareConcurrency'),
    screen: num('screen.width') && num('screen.height') ? `${num('screen.width')} × ${num('screen.height')}` : null,
    gpu: typeof c['webGl:renderer'] === 'string' ? gpuName(c['webGl:renderer']) : null,
    webrtc: fp.webrtc ?? 'replace', webgl: 'spoof' as const, canvas: 'engine' as const
  };
}
