// What can tie profiles to each other in a site's eyes: sharing a proxy or an exit IP, connecting straight from this
// computer, an exit that moved since last time, and identical fingerprints or canvas drawings. Read from the profiles'
// own records (their proxies, the exits seen when they opened, their health reports).
import type { Profile } from './api';

export type RiskKind = 'same-proxy' | 'same-ip' | 'direct' | 'moved-country' | 'moved-ip' | 'same-fp' | 'same-canvas';
// `bad`: a site is likely to link them; `warn`: worth fixing; `info`: worth knowing.
export interface Risk { kind: RiskKind; level: 'bad' | 'warn' | 'info'; ids: string[]; what: string; from?: { lat: number; lon: number }; to?: { lat: number; lon: number } }

const groups = <K>(list: Profile[], key: (p: Profile) => K | null) => {
  const by = new Map<K, Profile[]>();
  for (const p of list){ const k = key(p); if (k !== null) by.set(k, [...(by.get(k) ?? []), p]); }
  return [...by.entries()].filter(([, ps]) => ps.length > 1);
};
const sameFingerprint = (p: Profile) => (p.fingerprint.kind === 'chromium' ? `c:${p.fingerprint.seed}` : `f:${JSON.stringify(p.fingerprint.config)}`);

export function risks(profiles: Profile[], proxyName: (id: string) => string): Risk[] {
  const live = profiles.filter(p => !p.deletedAt);
  const out: Risk[] = [];
  for (const [id, ps] of groups(live, p => p.proxyId)) out.push({ kind: 'same-proxy', level: 'warn', ids: ps.map(p => p.id), what: proxyName(id) });
  // Different proxies that came out of the same address: they look separate but aren't.
  for (const [ip, ps] of groups(live, p => p.lastExit?.ip ?? null)){
    if (new Set(ps.map(p => p.proxyId)).size > 1) out.push({ kind: 'same-ip', level: 'bad', ids: ps.map(p => p.id), what: ip });
  }
  const direct = live.filter(p => !p.proxyId);
  if (direct.length > 1) out.push({ kind: 'direct', level: 'warn', ids: direct.map(p => p.id), what: '' });
  for (const p of live){
    const a = p.prevExit, b = p.lastExit;
    if (!a || !b || a.ip === b.ip) continue;
    const moved = a.geo && b.geo && a.geo.country !== b.geo.country;
    out.push({
      kind: moved ? 'moved-country' : 'moved-ip', level: moved ? 'bad' : 'info', ids: [p.id],
      what: moved ? `${a.geo!.countryName} → ${b.geo!.countryName}` : `${a.ip} → ${b.ip}`,
      ...(a.geo && b.geo ? { from: { lat: a.geo.lat, lon: a.geo.lon }, to: { lat: b.geo.lat, lon: b.geo.lon } } : {})
    });
  }
  for (const [, ps] of groups(live, sameFingerprint)) out.push({ kind: 'same-fp', level: 'bad', ids: ps.map(p => p.id), what: '' });
  for (const [hash, ps] of groups(live, p => p.report?.canvas ?? null)) out.push({ kind: 'same-canvas', level: 'warn', ids: ps.map(p => p.id), what: hash });
  return out;
}

// The risks that involve each profile.
export function byProfile(list: Risk[]){
  const m = new Map<string, Risk[]>();
  for (const r of list) for (const id of r.ids) m.set(id, [...(m.get(id) ?? []), r]);
  return m;
}
