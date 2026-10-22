import { describe, expect, it } from 'vitest';
import { parseCookies, toJson, toNetscape, type Cookie } from '../../src/shared/cookies';

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
});
