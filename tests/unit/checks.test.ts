import { describe, expect, it } from 'vitest';
import type { KernelState } from '../../src/shared/bridge';
import type { Profile, Proxy } from '../../src/renderer/src/api';
import { health, proxyState } from '../../src/renderer/src/checks';

const seattle = { country: 'US', countryName: 'United States', region: 'Washington', city: 'Seattle', lat: 47.6, lon: -122.3, timezone: 'America/Los_Angeles', locale: 'en-US' };
const proxy = (id: string, check: Partial<NonNullable<Proxy['lastCheck']>> | null, backupId: string | null = null): Proxy => ({
  id, name: id, type: 'socks5', host: `${id}.example.net`, port: 1080, username: null, hasPassword: false, backupId, profiles: 1, history: [], lastExit: null,
  createdAt: '', updatedAt: '',
  lastCheck: check && { ok: true, ms: 180, ip: '172.58.1.2', geo: seattle, error: null, checkedAt: '2026-10-21T00:00:00Z', ...check }
});
const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1', workspaceId: 'w1', number: 1, name: 'US-Store-01', groupId: null, ownerId: null, departmentId: null, tags: [], kernel: 'chromium', kernelVersion: '150.0.7871.186', os: 'windows',
  fingerprint: { kind: 'chromium', seed: 42, hardwareConcurrency: 8 }, proxyId: 'main', timezoneOverride: null, localeOverride: null, notes: null,
  lastOpenedAt: null, lastOpenedBy: null, createdAt: '', updatedAt: '', deletedAt: null, deletedBy: null, version: 1, syncMode: 'cloud', searchEngine: 'none', restoreTabs: true, extensionIds: [], data: null, lock: null,
  lastExit: null, prevExit: null, report: null, starred: false, ...over
});
const kernel = (version: string, over: Partial<KernelState> = {}): KernelState => ({ kind: 'chromium', version, installed: true, available: true, recommended: false, size: 150_000_000, note: null, addedAt: null, recommendedAt: null, ...over });
const kernels: KernelState[] = [kernel('150.0.7871.186', { recommended: true })];
const map = (...list: Proxy[]) => new Map(list.map(p => [p.id, p]));
const ids = (h: ReturnType<typeof health>) => h.checks.map(c => `${c.level}:${c.id}`);

describe('proxyState', () => {
  it('tells apart missing, unchecked, answering, slow and down proxies', () => {
    expect(proxyState(undefined)).toBe('none');
    expect(proxyState(proxy('a', null))).toBe('unchecked');
    expect(proxyState(proxy('a', {}))).toBe('ok');
    expect(proxyState(proxy('a', { ms: 900 }))).toBe('slow');
    expect(proxyState(proxy('a', { ok: false, ms: null, geo: null }))).toBe('down');
  });
});

describe('health', () => {
  it('stamps a profile whose proxy answers and nothing is set by hand as isolated', () => {
    const h = health(profile(), map(proxy('main', {})), kernels);
    expect(h.level).toBe('ok');
    expect(ids(h)).toEqual(['ok:proxy-ok', 'ok:tz-ok', 'ok:lang-ok', 'ok:geo', 'ok:rtc', 'ok:engine-ok']);
  });

  it('flags a time zone or language set by hand that differs from the exit', () => {
    const h = health(profile({ timezoneOverride: 'Asia/Shanghai', localeOverride: 'de-DE' }), map(proxy('main', {})), kernels);
    expect(h.level).toBe('warn');
    expect(h.mismatch).toBe(true);
    expect(h.checks.find(c => c.id === 'tz-mismatch')?.fix).toEqual({ kind: 'follow-tz' });
    expect(h.checks.find(c => c.id === 'lang-mismatch')?.fix).toEqual({ kind: 'follow-lang' });
    expect(health(profile({ timezoneOverride: 'America/Los_Angeles', localeOverride: 'en-US' }), map(proxy('main', {})), kernels).mismatch).toBe(false);
  });

  it('is offline when the proxy is down without a working backup, and uses the backup when there is one', () => {
    const down = { ok: false, ms: null, ip: null, geo: null, error: 'timeout' };
    const offline = health(profile(), map(proxy('main', down)), kernels);
    expect(offline.level).toBe('bad');
    expect(offline.checks[0]).toEqual({ id: 'proxy-down', level: 'bad', fix: { kind: 'check', proxyId: 'main' } });
    expect(offline.checks[1]).toEqual({ id: 'tz-pending', level: 'warn' });

    const covered = health(profile(), map(proxy('main', down, 'spare'), proxy('spare', { ms: 210 })), kernels);
    expect(covered.level).toBe('warn');
    expect(covered.line?.id).toBe('spare');
    expect(covered.geo?.city).toBe('Seattle');
    expect(covered.checks[0]).toEqual({ id: 'proxy-backup', level: 'warn', fix: { kind: 'backup', proxyId: 'spare' } });
  });

  it('asks for a proxy check or a proxy, and follows this computer without one', () => {
    expect(ids(health(profile(), map(proxy('main', null)), kernels))).toEqual(['warn:proxy-unchecked', 'warn:tz-pending', 'ok:engine-ok']);
    expect(ids(health(profile({ proxyId: null }), map(), kernels))).toEqual(['warn:proxy-none', 'ok:tz-host', 'ok:engine-ok']);
  });

  it('offers engine downloads and upgrades to the recommended version without counting them as problems, but flags engines this system lacks', () => {
    const two = [kernel('151.0.1', { installed: false, recommended: true }), kernel('150.0.7871.186')];
    const older = health(profile(), map(proxy('main', {})), two);
    expect(older.level).toBe('ok');
    expect(older.checks.at(-1)).toEqual({ id: 'engine-older', level: 'ok', fix: { kind: 'use-engine', version: '151.0.1' } });
    // A newer version that isn't the recommended one is no reason to upgrade.
    expect(health(profile(), map(proxy('main', {})), [kernel('151.0.1'), ...kernels]).checks.at(-1)).toEqual({ id: 'engine-ok', level: 'ok' });

    const missing = health(profile(), map(proxy('main', {})), [{ ...kernels[0], installed: false }]);
    expect(missing.level).toBe('ok');
    expect(missing.checks.at(-1)).toEqual({ id: 'engine-missing', level: 'todo', fix: { kind: 'download', version: '150.0.7871.186' } });

    const mac = [kernel('148.0.7778.215', { recommended: true })];
    const unavailable = health(profile(), map(proxy('main', {})), mac);
    expect(unavailable.level).toBe('warn');
    expect(unavailable.checks.at(-1)).toEqual({ id: 'engine-unavailable', level: 'warn', fix: { kind: 'use-engine', version: '148.0.7778.215' } });

    // Taken off the catalog but downloaded here: it still opens, and the recommended version is offered.
    const retired = health(profile(), map(proxy('main', {})), [kernel('151.0.1', { recommended: true, installed: false }), kernel('150.0.7871.186', { available: false })]);
    expect(retired.checks.at(-1)).toEqual({ id: 'engine-older', level: 'ok', fix: { kind: 'use-engine', version: '151.0.1' } });
  });
});
