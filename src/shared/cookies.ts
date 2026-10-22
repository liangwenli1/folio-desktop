// Cookie files people bring and take away: JSON (Cookie-Editor and EditThisCookie, Playwright, or a whole
// storage state) and Netscape cookies.txt. Inside Folio, cookies are in Playwright's shape.
export interface Cookie {
  name: string; value: string; domain: string; path: string;
  expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None';
}

const SAME_SITE: Record<string, Cookie['sameSite']> = { strict: 'Strict', lax: 'Lax', none: 'None', no_restriction: 'None', unspecified: 'Lax' };

// Throws on JSON that does not parse; entries that are not cookies are skipped.
export function parseCookies(text: string): Cookie[] {
  const t = text.trim();
  if (t.startsWith('[') || t.startsWith('{')){
    const data = JSON.parse(t) as unknown;
    const list = Array.isArray(data) ? data : Array.isArray((data as { cookies?: unknown }).cookies) ? (data as { cookies: unknown[] }).cookies : [];
    return list.flatMap(fromJson);
  }
  return t.split(/\r?\n/).flatMap(fromNetscape);
}

function fromJson(x: unknown): Cookie[] {
  const c = x as Record<string, unknown>;
  if (!c || typeof c.name !== 'string' || typeof c.value !== 'string' || typeof c.domain !== 'string' || !c.domain) return [];
  // Playwright says `expires`, Cookie-Editor `expirationDate` (both seconds); session cookies have neither.
  const expires = c.session === true ? -1 : typeof c.expires === 'number' ? c.expires : typeof c.expirationDate === 'number' ? c.expirationDate : -1;
  return [{
    name: c.name, value: c.value, domain: c.domain, path: typeof c.path === 'string' && c.path ? c.path : '/',
    expires: expires > 0 ? Math.round(expires) : -1, httpOnly: c.httpOnly === true, secure: c.secure === true,
    sameSite: SAME_SITE[String(c.sameSite ?? '').toLowerCase()] ?? 'Lax'
  }];
}

function fromNetscape(line: string): Cookie[] {
  const httpOnly = line.startsWith('#HttpOnly_');
  const l = httpOnly ? line.slice('#HttpOnly_'.length) : line;
  if (!l.trim() || l.startsWith('#')) return [];
  const f = l.split('\t');
  if (f.length < 7 || !f[0]) return [];
  const [domain, , path, secure, expiry, name, ...value] = f;
  return [{ name, value: value.join('\t'), domain, path: path || '/', expires: Number(expiry) > 0 ? Number(expiry) : -1, httpOnly, secure: secure.toUpperCase() === 'TRUE', sameSite: 'Lax' }];
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
