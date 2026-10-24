// Spreadsheet import of profiles. Reads CSV or TSV as Excel and Numbers save it (quotes, a byte-order mark,
// commas, semicolons or tabs), with headers in English or Chinese. Proxy lines are checked by the server.
import type { KernelKind, Os } from '@shared/bridge';
import { parseCookies } from '@shared/cookies';
import { SEARCH_ENGINES, SEARCH_IDS, type SearchEngine } from '@shared/search';

export interface ImportRow {
  line: number; name: string; group: string | null; tags: string[]; os: Os; kernel: KernelKind;
  proxy: string | null; timezone: string | null; language: string | null; notes: string | null;
  searchEngine: SearchEngine; restoreTabs: boolean;
  // Cookies in any format the cookie import reads, imported once the profile exists.
  cookies: string | null;
}
export type Problem = 'header' | 'name' | 'os' | 'engine' | 'tags' | 'timezone' | 'language' | 'search' | 'restoreTabs' | 'cookies';
export interface RowError { line: number; problem: Problem; value?: string }

export const MAX_ROWS = 500;
export const TEMPLATE = [
  'name,group,tags,os,engine,proxy,timezone,language,search engine,restore tabs,notes',
  'US-Store-01,US stores,flagship|new,windows,chromium,socks5://user:pass@us1.example.net:1080,,,google,yes,',
  'EU-Store-DE-01,EU stores,,macos,firefox,de1.example.net:8080:user:pass,Europe/Berlin,de-DE,,no,Shop admin'
].join('\n');

const HEADERS: Record<string, keyof Omit<ImportRow, 'line'>> = {
  name: 'name', 名称: 'name', 环境名称: 'name', group: 'group', 分组: 'group', tags: 'tags', 标签: 'tags',
  os: 'os', system: 'os', 系统: 'os', engine: 'kernel', kernel: 'kernel', 内核: 'kernel', proxy: 'proxy', 代理: 'proxy',
  timezone: 'timezone', 'time zone': 'timezone', 时区: 'timezone', language: 'language', 语言: 'language', notes: 'notes', 备注: 'notes',
  'search engine': 'searchEngine', search: 'searchEngine', 搜索引擎: 'searchEngine', 'restore tabs': 'restoreTabs', 恢复标签页: 'restoreTabs',
  cookies: 'cookies', cookie: 'cookies'
};

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0];
  const delim = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++){
    const c = src[i];
    if (quoted){
      if (c !== '"') cell += c;
      else if (src[i + 1] === '"'){ cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim){ row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r'){
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const osOf = (v: string): Os | null => {
  const s = v.toLowerCase().replace(/\s+/g, '');
  if (!s || s.startsWith('win')) return 'windows';
  if (s.startsWith('mac') || s.startsWith('osx')) return 'macos';
  return s.startsWith('linux') ? 'linux' : null;
};
const kernelOf = (v: string): KernelKind | null => {
  const s = v.toLowerCase().trim();
  if (!s || s === 'chromium' || s === 'chrome') return 'chromium';
  return s === 'firefox' || s === 'camoufox' ? 'firefox' : null;
};
// By id or name (百度 too); empty is none.
const searchOf = (v: string): SearchEngine | null => {
  const s = v.toLowerCase().replace(/\s+/g, '');
  if (!s || s === '无') return 'none';
  if (s === '百度') return 'baidu';
  return SEARCH_IDS.find(id => id === s || (id !== 'none' && SEARCH_ENGINES[id].name.toLowerCase() === s)) ?? null;
};
// Empty is on, as for a profile made in the app.
const yesNo = (v: string) => {
  const s = v.toLowerCase().trim();
  return !s || ['yes', 'y', 'true', '1', 'on', '是', '开启'].includes(s) ? true : ['no', 'n', 'false', '0', 'off', '否', '关闭'].includes(s) ? false : null;
};
const validTz = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
const validCookies = (text: string) => { try { return parseCookies(text).length > 0; } catch { return false; } };

export function readProfiles(text: string): { rows: ImportRow[]; errors: RowError[] } {
  const [head, ...body] = parseCsv(text);
  const cols = (head ?? []).map(h => HEADERS[h.trim().toLowerCase()] ?? null);
  if (!cols.includes('name')) return { rows: [], errors: [{ line: 1, problem: 'header' }] };
  const rows: ImportRow[] = [], errors: RowError[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (k: keyof Omit<ImportRow, 'line'>) => (cells[cols.indexOf(k)] ?? '').trim();
    const name = get('name'), os = osOf(get('os')), kernel = kernelOf(get('kernel'));
    const tags = get('tags').split(/[|;、]/).map(t => t.trim()).filter(Boolean);
    const timezone = get('timezone') || null, language = get('language') || null, cookies = get('cookies') || null;
    const searchEngine = searchOf(get('searchEngine')), restoreTabs = yesNo(get('restoreTabs'));
    if (!name || name.length > 80) errors.push({ line, problem: 'name', value: name });
    else if (!os) errors.push({ line, problem: 'os', value: get('os') });
    else if (!kernel) errors.push({ line, problem: 'engine', value: get('kernel') });
    else if (tags.length > 10 || tags.some(t => t.length > 24)) errors.push({ line, problem: 'tags' });
    else if (timezone && !validTz(timezone)) errors.push({ line, problem: 'timezone', value: timezone });
    else if (language && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) errors.push({ line, problem: 'language', value: language });
    else if (!searchEngine) errors.push({ line, problem: 'search', value: get('searchEngine') });
    else if (restoreTabs === null) errors.push({ line, problem: 'restoreTabs', value: get('restoreTabs') });
    else if (cookies && !validCookies(cookies)) errors.push({ line, problem: 'cookies' });
    else rows.push({ line, name, group: get('group') || null, tags, os, kernel, proxy: get('proxy') || null, timezone, language, notes: get('notes') || null, searchEngine, restoreTabs, cookies });
  });
  return { rows, errors };
}

// Per-profile variables for a task: the first column names the profile (its name, or its number like #0042),
// every other column is a variable. Only the task's profiles can be named.
export type VarProblem = 'header' | 'variable' | 'profile' | 'repeat';
export interface VarError { line: number; problem: VarProblem; value?: string }
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
export function readVariables(text: string, profiles: { id: string; name: string; number: number }[]){
  const [head, ...body] = parseCsv(text);
  const names = (head ?? []).slice(1).map(h => h.trim());
  const errors: VarError[] = [];
  const vars: Record<string, Record<string, string>> = {};
  if (!names.length) return { vars, names, errors: [{ line: 1, problem: 'header' as const }] };
  const bad = names.find(n => !VAR_NAME.test(n));
  if (bad !== undefined) return { vars, names, errors: [{ line: 1, problem: 'variable' as const, value: bad }] };
  body.forEach((cells, i) => {
    const line = i + 2, ref = (cells[0] ?? '').trim();
    const num = /^#?\d+$/.test(ref) ? Number(ref.replace('#', '')) : null;
    const p = profiles.find(x => x.name === ref) ?? (num === null ? undefined : profiles.find(x => x.number === num));
    if (!p) errors.push({ line, problem: 'profile', value: ref });
    else if (vars[p.id]) errors.push({ line, problem: 'repeat', value: ref });
    else vars[p.id] = Object.fromEntries(names.map((n, k) => [n, (cells[k + 1] ?? '').trim()]));
  });
  return { vars, names, errors };
}

export const toCsv = (rows: (string | number)[][]) => rows.map(r => r.map(v => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\r\n');
