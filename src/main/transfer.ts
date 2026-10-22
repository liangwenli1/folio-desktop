// A whole workspace in one .folio file: the server's list of profiles, groups and proxies plus each profile's
// saved sign-in state, gzip-compressed and encrypted with a key made from a passphrase (scrypt, AES-256-GCM).
// The passphrase never leaves this computer.
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, type ScryptOptions } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { api } from './api';
import { counts, type StorageState } from './sync';

const MAGIC = Buffer.from('FOLIO-EXPORT/1\n');
const KDF: ScryptOptions = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scrypt = (pass: string, salt: Buffer) => new Promise<Buffer>((ok, fail) => scryptCb(pass, salt, 32, KDF, (e, key) => (e ? fail(e) : ok(key))));

interface Listed { ref: string; saved: boolean }
export interface Bundle {
  workspace: string; exportedAt: string; groups: string[]; proxies: unknown[]; profiles: Listed[];
  // Each saved profile's sign-in state as the server holds it (gzip-compressed JSON), base64, by ref.
  states: Record<string, string>;
}

export async function seal(bundle: Bundle, passphrase: string){
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', await scrypt(passphrase, salt), iv);
  const body = Buffer.concat([c.update(gzipSync(JSON.stringify(bundle))), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}

// Throws 'not_folio' for other files and 'wrong_passphrase' when the key does not open it.
export async function unseal(file: Buffer, passphrase: string): Promise<Bundle> {
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not_folio');
  const at = MAGIC.length, salt = file.subarray(at, at + 16), iv = file.subarray(at + 16, at + 28);
  const d = createDecipheriv('aes-256-gcm', await scrypt(passphrase, salt), iv);
  d.setAuthTag(file.subarray(at + 28, at + 44));
  try { return JSON.parse(gunzipSync(Buffer.concat([d.update(file.subarray(at + 44)), d.final()])).toString('utf8')) as Bundle; }
  catch { throw new Error('wrong_passphrase'); }
}

export async function exportWorkspace(workspaceId: string){
  const r = await api<Omit<Bundle, 'states'>>('GET', `/workspaces/${workspaceId}/export`);
  if (!r.ok) throw new Error(r.error.code);
  const states: Record<string, string> = {};
  for (const p of r.data.profiles.filter(p => p.saved)){
    const s = await api<Buffer>('GET', `/profiles/${p.ref}/data`);
    if (s.ok) states[p.ref] = s.data.toString('base64');
  }
  return { ...r.data, states };
}

export async function importWorkspace(workspaceId: string, b: Bundle){
  const r = await api<{ profiles: { ref: string; id: string }[]; added: { profiles: number; proxies: number; groups: number } }>(
    'POST', `/workspaces/${workspaceId}/import`, { groups: b.groups, proxies: b.proxies, profiles: b.profiles });
  if (!r.ok) throw new Error(r.error.code);
  let signedIn = 0;
  for (const { ref, id } of r.data.profiles){
    if (!b.states[ref]) continue;
    const body = Buffer.from(b.states[ref], 'base64');
    const state = JSON.parse(gunzipSync(body).toString('utf8')) as StorageState;
    if ((await api('PUT', `/profiles/${id}/data?${counts(state)}`, body)).ok) signedIn++;
  }
  return { ...r.data.added, signedIn };
}
