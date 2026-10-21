// The desktop session token, kept encrypted with the OS keychain (Electron safeStorage).
// Where no keychain is available the token lives in memory only, so the user logs in each launch.
import { app, safeStorage } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const file = () => join(app.getPath('userData'), 'session.bin');
let token: string | null = null;

export async function loadToken(){
  if (!safeStorage.isEncryptionAvailable()) return;
  try { token = safeStorage.decryptString(await readFile(file())); } catch { token = null; }
}

export const getToken = () => token;

export async function setToken(value: string){
  token = value;
  if (safeStorage.isEncryptionAvailable()) await writeFile(file(), safeStorage.encryptString(value), { mode: 0o600 });
}

export async function clearToken(){
  token = null;
  await rm(file(), { force: true });
}
