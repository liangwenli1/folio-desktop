// Extensions from the workspace's library, installed into a profile when it opens. A package is downloaded once,
// kept on this computer, and checked every time against the server's signature and its sha256; a cached copy that
// no longer matches is fetched again, and one that still doesn't match is not installed. Each profile gets its own
// unpacked copy, with the identity that lets the extension's data follow the profile: the library's key in a
// Chromium manifest, the add-on id and a per-profile internal UUID for Firefox.
import { app, net } from 'electron';
import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { api } from './api';

// What the launch details say about each extension a profile opens with.
export interface Extension { id: string; name: string; kernel: 'chromium' | 'firefox'; version: string; extId: string; publicKey: string | null; sha256: string; signature: string }

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const cacheFile = (e: Extension) => join(app.getPath('userData'), 'extensions', e.id, `${e.sha256}.zip`);

let serverKey: Promise<KeyObject | null> | null = null;
function signingKey(){
  serverKey ??= api<{ publicKey: string }>('GET', '/extensions/key').then(r => {
    if (!r.ok){ serverKey = null; return null; }
    return createPublicKey({ key: Buffer.from(r.data.publicKey, 'base64'), format: 'der', type: 'spki' });
  });
  return serverKey;
}

// The package, when the server signed this identity and hash and the bytes have that hash.
async function verifiedPackage(e: Extension){
  const key = await signingKey();
  if (!key || !verify(null, Buffer.from(`folio-extension:${e.id}:${e.kernel}:${e.extId}:${e.sha256}`), key, Buffer.from(e.signature, 'base64'))) return null;
  const file = cacheFile(e);
  const cached = await readFile(file).catch(() => null);
  if (cached && sha256(cached) === e.sha256) return cached;
  const r = await api<Buffer>('GET', `/extensions/${e.id}/package`);
  if (!r.ok || !Buffer.isBuffer(r.data) || sha256(r.data) !== e.sha256){ await rm(file, { force: true }); return null; }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, r.data);
  return r.data;
}

// A UUID of its own for each profile and add-on, so sites can't link profiles through an extension's internal address.
export function firefoxUuid(profileId: string, extId: string){
  const h = createHash('sha256').update(`${profileId}:${extId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function unpack(e: Extension, bytes: Buffer, target: string){
  await rm(target, { recursive: true, force: true });
  const files = unzipSync(new Uint8Array(bytes));
  for (const [name, data] of Object.entries(files)){
    const path = normalize(name);
    if (name.endsWith('/') || path.startsWith('..') || path.startsWith('/')) continue;
    await mkdir(dirname(join(target, path)), { recursive: true });
    await writeFile(join(target, path), data);
  }
  const manifest = JSON.parse(strFromU8(files['manifest.json']).replace(/^﻿/, '')) as Record<string, any>;
  if (e.kernel === 'chromium') manifest.key = e.publicKey;
  else manifest.browser_specific_settings = { ...manifest.browser_specific_settings, gecko: { ...manifest.browser_specific_settings?.gecko, id: e.extId } };
  await writeFile(join(target, 'manifest.json'), strToU8(JSON.stringify(manifest, null, 2)));
}

// The folders to load for a profile, the names of extensions that failed their check, and (Firefox) the UUIDs.
export async function prepareExtensions(profile: { id: string; kernel: 'chromium' | 'firefox' }, list: Extension[], profileDir: string){
  const dirs: string[] = [], failed: string[] = [], uuids: Record<string, string> = {};
  for (const e of list.filter(x => x.kernel === profile.kernel)){
    const bytes = await verifiedPackage(e).catch(() => null);
    if (!bytes){ failed.push(e.name); continue; }
    const target = join(profileDir, '.folio-extensions', e.id);
    await unpack(e, bytes, target);
    dirs.push(target);
    if (e.kernel === 'firefox') uuids[e.extId] = firefoxUuid(profile.id, e.extId);
  }
  return { dirs, failed, uuids };
}

// Chrome Web Store (by id or link) and addons.mozilla.org (by link or slug). Tests point these at a local server.
const CHROME_STORE = process.env.FOLIO_CHROME_STORE_URL ?? 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=150.0.0.0&acceptformat=crx2,crx3&x=id%3D{id}%26uc';
const AMO_API = process.env.FOLIO_AMO_API ?? 'https://addons.mozilla.org/api/v5/addons/addon/';

export async function fromStore(kernel: 'chromium' | 'firefox', ref: string): Promise<{ bytes: Buffer; storeId: string }> {
  const get = async (url: string) => {
    const res = await net.fetch(url).catch(() => null);
    if (!res?.ok) throw new Error('store_failed');
    return res;
  };
  if (kernel === 'chromium'){
    const id = ref.match(/\b[a-p]{32}\b/)?.[0];
    if (!id) throw new Error('store_ref');
    return { bytes: Buffer.from(await (await get(CHROME_STORE.replace('{id}', id))).arrayBuffer()), storeId: id };
  }
  const slug = ref.match(/addons\.mozilla\.org\/(?:[\w-]+\/)?firefox\/addon\/([^/?#]+)/)?.[1] ?? (/^[\w.@-]+$/.test(ref.trim()) ? ref.trim() : null);
  if (!slug) throw new Error('store_ref');
  const info = await (await get(`${AMO_API}${encodeURIComponent(slug)}/`)).json() as { current_version?: { file?: { url?: string } } };
  const url = info.current_version?.file?.url;
  if (!url) throw new Error('store_failed');
  return { bytes: Buffer.from(await (await get(url)).arrayBuffer()), storeId: slug };
}
