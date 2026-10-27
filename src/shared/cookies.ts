// Cookie files people bring and take away: JSON (Cookie-Editor and EditThisCookie, Playwright, or a whole
// storage state) and Netscape cookies.txt. Inside Folio, cookies are in Playwright's shape.
export interface Cookie {
  name: string; value: string; domain: string; path: string;
  expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None';
}

// What identifies a cookie: two with the same name, domain and path are the same cookie.
export type CookieKey = Pick<Cookie, 'name' | 'domain' | 'path'>;
export const cookieKey = (c: CookieKey) => `${c.name}\u0000${c.domain}\u0000${c.path}`;
// A cookie as changed: without a value it keeps the one it has.
export type CookieEdit = Omit<Cookie, 'value'> & { value?: string };
// Which of a profile's cookies an export takes: one site's, or those picked; all when neither.
export interface CookieScope { domain?: string; cookies?: CookieKey[] }

const SAME_SITE: Record<string, Cookie['sameSite']> = { strict: 'Strict', lax: 'Lax', none: 'None', no_restriction: 'None', unspecified: 'Lax' };

// Each entry of a file as read: a cookie, or why it is none (a JSON entry without a name, a value or a domain; a
// cookies.txt line without its seven fields), with the name and domain it gave.
export type Entry = { cookie: Cookie } | { why: 'name' | 'value' | 'domain' | 'line'; name: string; domain: string };

// Throws on JSON that does not parse. Comments and blank lines of cookies.txt are no entries.
export function readCookies(text: string): { format: 'json' | 'netscape'; entries: Entry[] } {
  const t = text.trim();
  if (t.startsWith('[') || t.startsWith('{')){
    const data = JSON.parse(t) as unknown;
    const list = Array.isArray(data) ? data : Array.isArray((data as { cookies?: unknown }).cookies) ? (data as { cookies: unknown[] }).cookies : [];
    return { format: 'json', entries: list.map(fromJson) };
  }
  return { format: 'netscape', entries: t.split(/\r?\n/).flatMap(fromNetscape) };
}
// The cookies of a file, leaving out what isn't one.
export const parseCookies = (text: string) => readCookies(text).entries.flatMap(e => ('cookie' in e ? [e.cookie] : []));

function fromJson(x: unknown): Entry {
  const c = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const name = typeof c.name === 'string' ? c.name : '', domain = typeof c.domain === 'string' ? c.domain : '';
  const why = typeof c.name !== 'string' ? 'name' : typeof c.value !== 'string' ? 'value' : !domain ? 'domain' : null;
  if (why) return { why, name, domain };
  // Playwright says `expires`, Cookie-Editor `expirationDate` (both seconds); session cookies have neither.
  const expires = c.session === true ? -1 : typeof c.expires === 'number' ? c.expires : typeof c.expirationDate === 'number' ? c.expirationDate : -1;
  return { cookie: {
    name, value: c.value as string, domain, path: typeof c.path === 'string' && c.path ? c.path : '/',
    expires: expires > 0 ? Math.round(expires) : -1, httpOnly: c.httpOnly === true, secure: c.secure === true,
    sameSite: SAME_SITE[String(c.sameSite ?? '').toLowerCase()] ?? 'Lax'
  } };
}

function fromNetscape(line: string): Entry[] {
  const httpOnly = line.startsWith('#HttpOnly_');
  const l = httpOnly ? line.slice('#HttpOnly_'.length) : line;
  if (!l.trim() || l.startsWith('#')) return [];
  const f = l.split('\t');
  if (f.length < 7) return [{ why: 'line', name: '', domain: '' }];
  const [domain, , path, secure, expiry, name, ...value] = f;
  if (!domain) return [{ why: 'domain', name, domain }];
  return [{ cookie: { name, value: value.join('\t'), domain, path: path || '/', expires: Number(expiry) > 0 ? Number(expiry) : -1, httpOnly, secure: secure.toUpperCase() === 'TRUE', sameSite: 'Lax' } }];
}

// Cookie-Editor's JSON, which most browser extensions and antidetect browsers import.
export function toJson(cookies: Cookie[]){
  return JSON.stringify(cookies.map(c => ({
    domain: c.domain, ...(c.expires > 0 ? { expirationDate: c.expires } : {}), hostOnly: !c.domain.startsWith('.'), httpOnly: c.httpOnly, name: c.name,
    path: c.path, sameSite: c.sameSite === 'None' ? 'no_restriction' : c.sameSite.toLowerCase(), secure: c.secure, session: c.expires <= 0, storeId: null, value: c.value
  })), null, 2) + '\n';
}

export function toNetscape(cookies: Cookie[]){
  const lines = cookies.map(c => [
    `${c.httpOnly ? '#HttpOnly_' : ''}${c.domain}`, c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE',
    String(c.expires > 0 ? c.expires : 0), c.name, c.value
  ].join('\t'));
  return ['# Netscape HTTP Cookie File', ...lines, ''].join('\n');
}
