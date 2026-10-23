// Browser engines on this machine. Which versions exist comes from Folio's catalog (GET /kernels), kept on disk so
// engines already here still open offline; a download comes from the address the server hands out (the upstream
// release, or Folio's storage) and is checked against the catalog's sha256. Platform admins add versions by uploading
// a package straight to Folio's storage. Installed under <userData>/kernels/<kind>-<version>/; FOLIO_KERNELS_DIR
// points elsewhere (tests, development).
import { app, net } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { KernelKind, KernelState } from '../shared/bridge';
import { api } from './api';

type Archive = 'zip' | 'tar.xz' | 'dmg';
interface Row { id: string; kind: KernelKind; version: string; platform: string; archive: Archive; size: number; sha256: string; recommended: boolean; ready: boolean }

const platform = `${process.platform}-${process.arch}`;
const root = () => process.env.FOLIO_KERNELS_DIR ?? join(app.getPath('userData'), 'kernels');
const dirOf = (kind: KernelKind, version: string) => join(root(), `${kind}-${version}`);
const catalogFile = () => join(app.getPath('userData'), 'kernel-catalog.json');
const run = promisify(execFile);
// Where the program file sits in each engine's package.
const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const EXE: Record<KernelKind, Record<typeof os, RegExp>> = {
  chromium: { linux: /\/chrome$/, win: /\\chrome\.exe$/, mac: /\.app\/Contents\/MacOS\/[^/]*Chromium[^/]*$/i },
  firefox: { linux: /\/camoufox-bin$/, win: /\\camoufox\.exe$/, mac: /\.app\/Contents\/MacOS\/camoufox$/ }
};

// Newest version first: "150.0.7871.186" before "148.0.7778.215", "156.0.1-beta.36" before "156.0.1-beta.9".
const parts = (v: string) => v.split(/[^0-9]+/).filter(Boolean).map(Number);
export function newestFirst(a: string, b: string){
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (y[i] ?? -1) - (x[i] ?? -1);
  return 0;
}

// This platform's part of the catalog: fresh from the server when it answers, otherwise the last copy on disk.
async function catalog(): Promise<Row[]> {
  const r = await api<{ kernels: Row[] }>('GET', '/kernels');
  if (r.ok){
    const rows = r.data.kernels.filter(k => k.ready && k.platform === platform);
    await writeFile(catalogFile(), JSON.stringify(rows)).catch(() => {});
    return rows;
  }
  return JSON.parse(await readFile(catalogFile(), 'utf8').catch(() => '[]')) as Row[];
}

async function findExe(dir: string, pattern: RegExp){
  const entries = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
  return entries.map(e => join(dir, e)).find(p => pattern.test(p)) ?? null;
}

// Path of the engine executable, or null when that version is not on this machine.
export async function resolve(kind: KernelKind, version: string): Promise<string | null> {
  const dir = dirOf(kind, version);
  const marker = join(dir, '.folio-kernel.json');
  if (existsSync(marker)) return JSON.parse(await readFile(marker, 'utf8')).exe;
  // Pre-extracted engines (FOLIO_KERNELS_DIR) have no marker yet.
  const exe = existsSync(dir) ? await findExe(dir, EXE[kind][os]) : null;
  if (exe) await writeFile(marker, JSON.stringify({ exe })).catch(() => {});
  return exe;
}

// The versions in the catalog for this platform, and versions downloaded here that the catalog no longer has (their
// profiles still open). Newest first within each engine.
export async function list(): Promise<KernelState[]> {
  const rows = await catalog();
  const here = (await readdir(root()).catch(() => [] as string[])).map(n => n.match(/^(chromium|firefox)-(.+)$/)).filter(m => m && !m[2].endsWith('.download'))
    .map(m => ({ kind: m![1] as KernelKind, version: m![2] }));
  const all = [
    ...rows.map(k => ({ kind: k.kind, version: k.version, size: k.size, recommended: k.recommended, available: true })),
    ...here.filter(h => !rows.some(k => k.kind === h.kind && k.version === h.version)).map(h => ({ ...h, size: null, recommended: false, available: false }))
  ];
  const out = await Promise.all(all.map(async k => ({ ...k, installed: !!(await resolve(k.kind, k.version)) })));
  return out.filter(k => k.available || k.installed).sort((a, b) => a.kind.localeCompare(b.kind) || newestFirst(a.version, b.version));
}

// The version new profiles get: the recommended one for this platform, else the newest.
export async function recommended(kind: KernelKind){
  const rows = (await catalog()).filter(k => k.kind === kind).sort((a, b) => newestFirst(a.version, b.version));
  return (rows.find(k => k.recommended) ?? rows[0])?.version ?? null;
}

const installing = new Map<string, Promise<string>>();

export function install(kind: KernelKind, version: string, onProgress: (done: number, total: number) => void){
  const key = `${kind}-${version}`;
  if (!installing.has(key)) installing.set(key, doInstall(kind, version, onProgress).finally(() => installing.delete(key)));
  return installing.get(key)!;
}

async function doInstall(kind: KernelKind, version: string, onProgress: (done: number, total: number) => void){
  const row = (await catalog()).find(k => k.kind === kind && k.version === version);
  if (!row) throw new Error(`${kind} ${version} is not available for ${platform}`);
  const where = await api<{ url: string }>('GET', `/kernels/${row.id}/download`);
  if (!where.ok) throw new Error(where.error.message);
  const dir = dirOf(kind, version), tmp = `${dir}.download`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const file = join(tmp, `kernel.${row.archive}`);

  const res = await net.fetch(where.data.url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length') ?? row.size);
  const hash = createHash('sha256'), out = createWriteStream(file);
  let done = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>){
    hash.update(chunk); done += chunk.length;
    if (!out.write(chunk)) await new Promise<void>(r => out.once('drain', () => r()));
    onProgress(done, total);
  }
  await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  if (hash.digest('hex') !== row.sha256) throw new Error('The download is damaged (checksum mismatch). Try again.');

  const dest = join(tmp, 'app');
  await mkdir(dest);
  if (row.archive === 'dmg'){
    const mnt = join(tmp, 'mnt');
    await mkdir(mnt);
    await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mnt, file]);
    try {
      for (const e of await readdir(mnt)) if (e.endsWith('.app')) await run('ditto', [join(mnt, e), join(dest, e)]);
    } finally { await run('hdiutil', ['detach', mnt]); }
  } else if (row.archive === 'zip' && process.platform === 'darwin'){
    await run('ditto', ['-x', '-k', file, dest]);
  } else if (row.archive === 'zip' && process.platform === 'linux'){
    await run('unzip', ['-q', file, '-d', dest]).catch(e => { if (e.code !== 1) throw e; }); // 1 = warnings about font file names
  } else {
    await run('tar', ['-xf', file, '-C', dest]);
  }
  await rm(file);
  const exe = await findExe(dest, EXE[kind][os]);
  if (!exe) throw new Error('The engine was downloaded but its program file is missing');
  await rm(dir, { recursive: true, force: true });
  await rename(tmp, dir);
  const final = exe.replace(tmp, dir);
  await writeFile(join(dir, '.folio-kernel.json'), JSON.stringify({ exe: final }));
  return final;
}

// Deletes a downloaded version from this computer (it downloads again when a profile needs it).
export const remove = (kind: KernelKind, version: string) => rm(dirOf(kind, version), { recursive: true, force: true });

export const archiveOf = (name: string): Archive | null => (/\.tar\.xz$/i.test(name) ? 'tar.xz' : /\.zip$/i.test(name) ? 'zip' : /\.dmg$/i.test(name) ? 'dmg' : null);

// Adds a version to the catalog (platform admins): works out the package's size and sha256 here, then sends it
// straight to Folio's storage at the address the server signs (with its length, which storage requires, so not
// through Electron's buffered uploads) and has the server check it in.
export async function upload(path: string, meta: { kind: KernelKind; version: string; platform: string }, onProgress: (stage: 'hash' | 'upload', done: number, total: number) => void){
  const archive = archiveOf(path);
  if (!archive) throw new Error('kernel_archive');
  const { size } = await stat(path);
  const hash = createHash('sha256');
  let read = 0;
  for await (const chunk of createReadStream(path)){ hash.update(chunk as Buffer); read += (chunk as Buffer).length; onProgress('hash', read, size); }
  const made = await api<{ kernel: { id: string }; uploadUrl: string }>('POST', '/kernels', { ...meta, archive, size, sha256: hash.digest('hex') });
  if (!made.ok) throw new Error(made.error.code);
  const url = new URL(made.data.uploadUrl);
  await new Promise<void>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, { method: 'PUT', headers: { 'content-length': size } }, res => {
      res.resume();
      if (res.statusCode === 200) resolve(); else reject(new Error('upload_failed'));
    });
    req.on('error', () => reject(new Error('upload_failed')));
    let sent = 0;
    createReadStream(path).on('data', chunk => { sent += chunk.length; onProgress('upload', sent, size); }).pipe(req);
  });
  const done = await api('POST', `/kernels/${made.data.kernel.id}/complete`);
  if (!done.ok) throw new Error(done.error.code);
}
