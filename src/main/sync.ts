// A profile's sign-in state (cookies, local storage, IndexedDB) between computers. The server keeps the latest
// package; this computer remembers which package its user-data folder matches and which sites it has stored
// data for, because the browser only reports storage for sites it is told about.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { BrowserContext } from 'playwright-core';
import { api } from './api';

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
export interface Local { sha256: string | null; origins: string[]; workspaceId: string | null }

const FILE = '.folio-sync.json';
const MAX_ORIGINS = 300;

export async function readLocal(dir: string): Promise<Local> {
  try { return JSON.parse(await readFile(join(dir, FILE), 'utf8')) as Local; } catch { return { sha256: null, origins: [], workspaceId: null }; }
}
export const writeLocal = (dir: string, l: Local) => writeFile(join(dir, FILE), JSON.stringify(l));

// Most recently used last; the oldest drop off past the cap.
export function addOrigins(list: string[], more: Iterable<string>){
  const add = [...more];
  return [...list.filter(o => !add.includes(o)), ...add].slice(-MAX_ORIGINS);
}

// Sorted so the same state packs to the same bytes, and an unchanged profile uploads nothing.
function pack(state: StorageState){
  const sorted: StorageState = {
    cookies: [...state.cookies].sort((a, b) => `${a.domain}${a.path}${a.name}`.localeCompare(`${b.domain}${b.path}${b.name}`)),
    origins: [...state.origins].sort((a, b) => a.origin.localeCompare(b.origin))
  };
  const body = gzipSync(JSON.stringify(sorted));
  return { body, sha256: createHash('sha256').update(body).digest('hex'), query: counts(sorted) };
}

// What the server shows about a state: cookies, local storage and IndexedDB together as they travel, sites.
export const counts = (state: StorageState) =>
  `cookies=${state.cookies.length}&storageBytes=${Buffer.byteLength(JSON.stringify(state.origins))}&origins=${state.origins.length}`;

export async function download(id: string){
  const r = await api<Buffer>('GET', `/profiles/${id}/data`);
  if (!r.ok) throw new Error(r.error.code);
  return { state: JSON.parse(gunzipSync(r.data).toString('utf8')) as StorageState, sha256: createHash('sha256').update(r.data).digest('hex') };
}

// Uploads unless the server already has these bytes from this computer. 'lost' when another computer holds the lock.
export async function upload(id: string, state: StorageState, local: Local): Promise<'saved' | 'unchanged' | 'lost'> {
  const { body, sha256, query } = pack(state);
  if (sha256 === local.sha256) return 'unchanged';
  const r = await api('PUT', `/profiles/${id}/data?${query}`, body);
  if (!r.ok){
    if (r.error.code === 'lock_lost') return 'lost';
    throw new Error(r.error.code);
  }
  local.sha256 = sha256;
  return 'saved';
}
