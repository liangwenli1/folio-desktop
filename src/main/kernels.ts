// Browser engines on this machine: which versions exist for this platform, where they are installed,
// and downloading them (checked against the published sha256) when a profile needs one.
// Installed under <userData>/kernels/<kind>-<version>/. FOLIO_KERNELS_DIR points elsewhere (tests, development).
import { app, net } from 'electron';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { KernelKind, KernelState } from '../shared/bridge';
type Archive = 'zip' | 'tar.xz' | 'dmg';
interface Asset { url: string; sha256: string; archive: Archive; exe: RegExp }

const GH = 'https://github.com';
const FPC = `${GH}/adryfish/fingerprint-chromium/releases/download`;
const CF = `${GH}/daijro/camoufox/releases/download`;
const chromeExe = { linux: /\/chrome$/, win: /\\chrome\.exe$/, mac: /\.app\/Contents\/MacOS\/[^/]*Chromium[^/]*$/i };
const foxExe = { linux: /\/camoufox-bin$/, win: /\\camoufox\.exe$/, mac: /\.app\/Contents\/MacOS\/camoufox$/ };

// Newest first. Checksums as published on GitHub (read 2026-10-21).
const MANIFEST: { kind: KernelKind; version: string; assets: Partial<Record<string, Asset>> }[] = [
  { kind: 'chromium', version: '150.0.7871.186', assets: {
    'linux-x64': { url: `${FPC}/150.0.7871.186/ungoogled-chromium-150.0.7871.186-1-x86_64_linux.tar.xz`, sha256: '48eff860053efd9ad498d51370f0a1f59f983df39c02a72ad2a8682cdead4055', archive: 'tar.xz', exe: chromeExe.linux },
    'win32-x64': { url: `${FPC}/150.0.7871.186/ungoogled-chromium_150.0.7871.186-1.1_windows_x64.zip`, sha256: '4d549c326e51ebbabf562fd365eb5380d9d4a81200da2c60f075c688d9a77e03', archive: 'zip', exe: chromeExe.win }
  } },
  // The engine's macOS builds stop at 148.
  { kind: 'chromium', version: '148.0.7778.215', assets: {
    'darwin-arm64': { url: `${FPC}/148.0.7778.215/ungoogled-chromium_148.0.7778.215-1.1_macos.dmg`, sha256: 'b72f091e2e1a7583eed389c4b8e3534ed355e568af8c8bbf8fc30a25e23ca679', archive: 'dmg', exe: chromeExe.mac },
    'darwin-x64': { url: `${FPC}/148.0.7778.215/ungoogled-chromium_148.0.7778.215-1.1_macos.dmg`, sha256: 'b72f091e2e1a7583eed389c4b8e3534ed355e568af8c8bbf8fc30a25e23ca679', archive: 'dmg', exe: chromeExe.mac }
  } },
  { kind: 'firefox', version: '156.0.1-beta.36', assets: {
    'linux-x64': { url: `${CF}/v156.0.1-beta.36/camoufox-156.0.1-beta.36-lin.x86_64.zip`, sha256: '72637885ee67c93466ad377831c647192f8f08fb5c6fd9279de1320b49dd2b53', archive: 'zip', exe: foxExe.linux },
    'win32-x64': { url: `${CF}/v156.0.1-beta.36/camoufox-156.0.1-beta.36-win.x86_64.zip`, sha256: '096fd4832a7a32f2aa7f7bdd07fe6253dda296cbe783acd7bc2c86cf5ae62031', archive: 'zip', exe: foxExe.win },
    'darwin-arm64': { url: `${CF}/v156.0.1-beta.36/camoufox-156.0.1-beta.36-mac.arm64.zip`, sha256: '0ad5663e40f4a2a836e28747256b79f39a5105905f1b244139a7a391f85fda32', archive: 'zip', exe: foxExe.mac },
    'darwin-x64': { url: `${CF}/v156.0.1-beta.36/camoufox-156.0.1-beta.36-mac.x86_64.zip`, sha256: 'abe133d2b1c7a8afe5a6af5f44adfd3169b16d4cc2268e99a81a41a6853f5782', archive: 'zip', exe: foxExe.mac }
  } }
];

const platform = `${process.platform}-${process.arch}`;
const root = () => process.env.FOLIO_KERNELS_DIR ?? join(app.getPath('userData'), 'kernels');
const dirOf = (kind: KernelKind, version: string) => join(root(), `${kind}-${version}`);
const run = promisify(execFile);

export function available(){
  return MANIFEST.filter(k => k.assets[platform]).map(k => ({ kind: k.kind, version: k.version }));
}

// The version new profiles get: the newest one built for this platform.
export function latest(kind: KernelKind){
  return MANIFEST.find(k => k.kind === kind && k.assets[platform])?.version ?? null;
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
  const asset = MANIFEST.find(k => k.kind === kind && k.version === version)?.assets[platform];
  // Pre-extracted engines (FOLIO_KERNELS_DIR) have no marker yet.
  const exe = asset && existsSync(dir) ? await findExe(dir, asset.exe) : null;
  if (exe) await writeFile(marker, JSON.stringify({ exe })).catch(() => {});
  return exe;
}

export async function list(): Promise<KernelState[]> {
  return Promise.all(available().map(async k => ({
    ...k, installed: !!(await resolve(k.kind, k.version)), sizeHint: k.kind === 'firefox' ? '1.3 GB' : '150 MB'
  })));
}

const installing = new Map<string, Promise<string>>();

export function install(kind: KernelKind, version: string, onProgress: (done: number, total: number) => void){
  const key = `${kind}-${version}`;
  if (!installing.has(key)) installing.set(key, doInstall(kind, version, onProgress).finally(() => installing.delete(key)));
  return installing.get(key)!;
}

async function doInstall(kind: KernelKind, version: string, onProgress: (done: number, total: number) => void){
  const asset = MANIFEST.find(k => k.kind === kind && k.version === version)?.assets[platform];
  if (!asset) throw new Error(`${kind} ${version} is not available for ${platform}`);
  const dir = dirOf(kind, version), tmp = `${dir}.download`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const file = join(tmp, `kernel.${asset.archive}`);

  const res = await net.fetch(asset.url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const hash = createHash('sha256'), out = createWriteStream(file);
  let done = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>){
    hash.update(chunk); done += chunk.length;
    if (!out.write(chunk)) await new Promise<void>(r => out.once('drain', () => r()));
    onProgress(done, total);
  }
  await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  if (hash.digest('hex') !== asset.sha256) throw new Error('The download is damaged (checksum mismatch). Try again.');

  const dest = join(tmp, 'app');
  await mkdir(dest);
  if (asset.archive === 'dmg'){
    const mnt = join(tmp, 'mnt');
    await mkdir(mnt);
    await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mnt, file]);
    try {
      for (const e of await readdir(mnt)) if (e.endsWith('.app')) await run('ditto', [join(mnt, e), join(dest, e)]);
    } finally { await run('hdiutil', ['detach', mnt]); }
  } else if (asset.archive === 'zip' && process.platform === 'darwin'){
    await run('ditto', ['-x', '-k', file, dest]);
  } else if (asset.archive === 'zip' && process.platform === 'linux'){
    await run('unzip', ['-q', file, '-d', dest]).catch(e => { if (e.code !== 1) throw e; }); // 1 = warnings about font file names
  } else {
    await run('tar', ['-xf', file, '-C', dest]);
  }
  await rm(file);
  const exe = await findExe(dest, asset.exe);
  if (!exe) throw new Error('The engine was downloaded but its program file is missing');
  await rm(dir, { recursive: true, force: true });
  await rename(tmp, dir);
  const final = exe.replace(tmp, dir);
  await writeFile(join(dir, '.folio-kernel.json'), JSON.stringify({ exe: final }));
  return final;
}
