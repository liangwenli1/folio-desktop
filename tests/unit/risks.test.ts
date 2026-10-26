import { describe, expect, it } from 'vitest';
import type { Profile } from '../../src/renderer/src/api';
import { byProfile, risks } from '../../src/renderer/src/risks';

const geo = (country: string, countryName: string, lat: number, lon: number) => ({ country, countryName, region: null, city: null, lat, lon, timezone: 'UTC', locale: 'en-US' });
let n = 0;
const profile = (over: Partial<Profile> = {}): Profile => ({
  id: `p${++n}`, workspaceId: 'w1', number: n, name: `Shop-${n}`, groupId: null, ownerId: null, tags: [], kernel: 'chromium', kernelVersion: '150.0.7871.186', os: 'windows',
  fingerprint: { kind: 'chromium', seed: 1000 + n, hardwareConcurrency: 8 }, proxyId: `px${n}`, timezoneOverride: null, localeOverride: null, notes: null,
  lastOpenedAt: null, lastOpenedBy: null, createdAt: '', updatedAt: '', deletedAt: null, deletedBy: null, version: 1, syncMode: 'cloud', searchEngine: 'none', restoreTabs: true, startUrl: null, windowMode: 'default', windowWidth: null, windowHeight: null, extensionIds: [], data: null, lock: null,
  lastExit: null, prevExit: null, report: null, starred: false, ...over
});
const kinds = (list: ReturnType<typeof risks>) => list.map(r => `${r.level}:${r.kind}`).sort();

describe('risks', () => {
  it('finds nothing for profiles with their own proxies, exits and fingerprints', () => {
    expect(risks([profile(), profile()], () => '')).toEqual([]);
  });

  it('flags a shared proxy, and the same exit IP behind different proxies more strongly', () => {
    const exit = { ip: '172.58.1.2', geo: null, at: '' };
    const a = profile({ proxyId: 'shared' }), b = profile({ proxyId: 'shared' });
    const c = profile({ lastExit: exit }), e = profile({ lastExit: exit });
    const found = risks([a, b, c, e], id => (id === 'shared' ? 'US-ISP' : ''));
    expect(kinds(found)).toEqual(['bad:same-ip', 'warn:same-proxy']);
    expect(found.find(r => r.kind === 'same-proxy')).toMatchObject({ ids: [a.id, b.id], what: 'US-ISP' });
    expect(found.find(r => r.kind === 'same-ip')).toMatchObject({ ids: [c.id, e.id], what: '172.58.1.2' });
    // The same IP through one shared proxy is the shared proxy, not a second warning.
    expect(kinds(risks([profile({ proxyId: 'x', lastExit: exit }), profile({ proxyId: 'x', lastExit: exit })], () => 'X'))).toEqual(['warn:same-proxy']);
  });

  it('flags profiles without a proxy together, a move to another country strongly and a new IP lightly', () => {
    const moved = profile({ prevExit: { ip: '1.1.1.1', geo: geo('US', 'United States', 47, -122), at: '' }, lastExit: { ip: '2.2.2.2', geo: geo('GB', 'United Kingdom', 51, 0), at: '' } });
    const nudged = profile({ prevExit: { ip: '1.1.1.1', geo: geo('US', 'United States', 47, -122), at: '' }, lastExit: { ip: '3.3.3.3', geo: geo('US', 'United States', 40, -74), at: '' } });
    const found = risks([profile({ proxyId: null }), profile({ proxyId: null }), moved, nudged], () => '');
    expect(kinds(found)).toEqual(['bad:moved-country', 'info:moved-ip', 'warn:direct']);
    expect(found.find(r => r.kind === 'moved-country')).toMatchObject({ what: 'United States → United Kingdom', from: { lat: 47, lon: -122 }, to: { lat: 51, lon: 0 } });
  });

  it('flags identical fingerprints and identical canvas drawings, and lists each profile\'s risks', () => {
    const fp = { kind: 'chromium' as const, seed: 42, hardwareConcurrency: 8 };
    const a = profile({ fingerprint: fp }), b = profile({ fingerprint: fp });
    const report = { at: '', checks: [], canvas: 'abc', webgl: null };
    const c = profile({ report }), e = profile({ report });
    const found = risks([a, b, c, e, profile({ fingerprint: fp, deletedAt: '2026-10-01' })], () => '');
    expect(kinds(found)).toEqual(['bad:same-fp', 'warn:same-canvas']);
    expect(found.find(r => r.kind === 'same-fp')!.ids).toEqual([a.id, b.id]);
    expect(byProfile(found).get(c.id)!.map(r => r.kind)).toEqual(['same-canvas']);
  });
});
