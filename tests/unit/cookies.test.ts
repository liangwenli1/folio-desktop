import { describe, expect, it } from 'vitest';
import { cookieKey, parseCookies, readCookies, toJson, toNetscape, type Cookie } from '../../src/shared/cookies';

const sid: Cookie = { name: 'sid', value: 'a\tb', domain: '.shop.example', path: '/', expires: 1893456000, httpOnly: true, secure: true, sameSite: 'None' };
const pref: Cookie = { name: 'pref', value: 'dark', domain: 'shop.example', path: '/app', expires: -1, httpOnly: false, secure: false, sameSite: 'Strict' };

describe('cookie files', () => {
  it('round-trip through Cookie-Editor JSON and Netscape', () => {
    expect(parseCookies(toJson([sid, pref]))).toEqual([sid, pref]);
    // cookies.txt has no SameSite column: cookies come back as Lax.
    expect(parseCookies(toNetscape([sid, pref]))).toEqual([{ ...sid, sameSite: 'Lax' }, { ...pref, sameSite: 'Lax' }]);
    expect(toNetscape([sid]).split('\n')[1]).toBe('#HttpOnly_.shop.example\tTRUE\t/\tTRUE\t1893456000\tsid\ta\tb');
  });

  it('read Playwright cookies and storage states, and skip what is not a cookie', () => {
    const playwright = [{ name: 'sid', value: 'v', domain: 'x.example', path: '/', expires: 2000000000.4, httpOnly: false, secure: true, sameSite: 'Lax' }, { name: 'broken' }];
    expect(parseCookies(JSON.stringify(playwright))).toEqual([{ name: 'sid', value: 'v', domain: 'x.example', path: '/', expires: 2000000000, httpOnly: false, secure: true, sameSite: 'Lax' }]);
    expect(parseCookies(JSON.stringify({ cookies: playwright, origins: [] }))).toHaveLength(1);
    expect(parseCookies('# Netscape HTTP Cookie File\n\nnot a cookie line\n')).toEqual([]);
    expect(() => parseCookies('[{"name": ')).toThrow();
  });

  it('say which entries are not cookies, and why', () => {
    const json = readCookies(JSON.stringify([{ name: 'a', value: '1', domain: '.x.example' }, { value: '2', domain: 'x.example' }, { name: 'c', domain: 'x.example' }, { name: 'd', value: '4' }]));
    expect(json.format).toBe('json');
    expect(json.entries.map(e => ('cookie' in e ? 'ok' : e.why))).toEqual(['ok', 'name', 'value', 'domain']);
    expect(json.entries[3]).toEqual({ why: 'domain', name: 'd', domain: '' });
    const txt = readCookies('# Netscape HTTP Cookie File\nx.example\tFALSE\t/\tFALSE\t0\tsid\tv\nnot a cookie line\n\tFALSE\t/\tFALSE\t0\tlost\tv\n');
    expect(txt.format).toBe('netscape');
    expect(txt.entries.map(e => ('cookie' in e ? e.cookie.name : `${e.why}:${e.name}`))).toEqual(['sid', 'line:', 'domain:lost']);
    // The same cookie whatever its value or expiry: name, domain and path say which it is.
    const later: Cookie = { ...sid, value: 'other', expires: -1 };
    expect(cookieKey(later)).toBe(cookieKey(sid));
    expect(cookieKey({ ...sid, path: '/app' })).not.toBe(cookieKey(sid));
  });
});
