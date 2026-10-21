// The consistency check behind a profile's stamp, its row in the list and the "Needs attention" filter.
// It reads only what the server and this computer know: the proxy's last check, the profile's overrides,
// and which engines are on this computer.
import type { KernelState } from '@shared/bridge';
import type { Geo, Profile, Proxy } from './api';

export const SLOW_MS = 800;
export type Level = 'ok' | 'warn' | 'bad';
export type ProxyState = 'none' | 'unchecked' | 'ok' | 'slow' | 'down';
export type Fix =
  | { kind: 'check'; proxyId: string } | { kind: 'backup'; proxyId: string } | { kind: 'choose-proxy' }
  | { kind: 'follow-tz' } | { kind: 'follow-lang' }
  | { kind: 'download'; version: string } | { kind: 'use-engine'; version: string };
export type CheckId =
  | 'proxy-ok' | 'proxy-slow' | 'proxy-down' | 'proxy-backup' | 'proxy-none' | 'proxy-unchecked'
  | 'tz-ok' | 'tz-host' | 'tz-mismatch' | 'lang-ok' | 'lang-mismatch' | 'geo' | 'rtc'
  | 'engine-ok' | 'engine-older' | 'engine-missing' | 'engine-unavailable';
export interface Check { id: CheckId; level: Level; fix?: Fix }

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

  const tzMismatch = !!(geo && p.timezoneOverride && p.timezoneOverride !== geo.timezone);
  checks.push(tzMismatch ? { id: 'tz-mismatch', level: 'warn', fix: { kind: 'follow-tz' } } : { id: geo || p.timezoneOverride ? 'tz-ok' : 'tz-host', level: 'ok' });
  const region = p.localeOverride?.split('-')[1]?.toUpperCase();
  const langMismatch = !!(geo && region && region !== geo.country);
  if (langMismatch) checks.push({ id: 'lang-mismatch', level: 'warn', fix: { kind: 'follow-lang' } });
  else if (geo || p.localeOverride) checks.push({ id: 'lang-ok', level: 'ok' });
  if (geo) checks.push({ id: 'geo', level: 'ok' }, { id: 'rtc', level: 'ok' });

  // Engines are a fact about this computer: a missing download is not a problem with the profile.
  const versions = kernels.filter(k => k.kind === p.kernel);
  if (versions.length){
    const mine = versions.find(k => k.version === p.kernelVersion), latest = versions[0];
    if (!mine) checks.push({ id: 'engine-unavailable', level: 'warn', fix: { kind: 'use-engine', version: latest.version } });
    else if (!mine.installed) checks.push({ id: 'engine-missing', level: 'ok', fix: { kind: 'download', version: mine.version } });
    else if (latest.version !== mine.version) checks.push({ id: 'engine-older', level: 'ok', fix: { kind: 'use-engine', version: latest.version } });
    else checks.push({ id: 'engine-ok', level: 'ok' });
  }

  const level: Level = checks.some(c => c.level === 'bad') ? 'bad' : checks.some(c => c.level === 'warn') ? 'warn' : 'ok';
  return { checks, level, proxy: state, mismatch: tzMismatch || langMismatch, px, backup, line, geo };
}

export const engineName = (kind: Profile['kernel'], version: string) => `${kind === 'chromium' ? 'Chromium' : 'Firefox'} ${version.split('.')[0]}`;

// What a fingerprint pins down, for the passport card and the new-profile dialog. Chromium derives the rest
// from the seed inside the engine; Camoufox stores every value.
export function fingerprintFacts(fp: Profile['fingerprint']){
  if (fp.kind === 'chromium') return { seed: fp.seed.toString(16).padStart(8, '0'), cores: fp.hardwareConcurrency, screen: null, gpu: null };
  const c = fp.config, num = (k: string) => (typeof c[k] === 'number' ? c[k] as number : null);
  return {
    seed: null, cores: num('navigator.hardwareConcurrency'),
    screen: num('screen.width') && num('screen.height') ? `${num('screen.width')} × ${num('screen.height')}` : null,
    gpu: typeof c['webGl:renderer'] === 'string' ? c['webGl:renderer'] : null
  };
}
