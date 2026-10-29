// The extension library: added from a store or a file, installed in profiles of its engine, checked before it is
// installed. A package changed in storage is refused (P5 acceptance); a damaged local copy is fetched again.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { account, API, bulkMore, choose, chromiumProfile, dataDir, ENGINE_ENV, hasKernels, lastStatus, launch, logIn, opened, back, detail } from './helpers';

test.setTimeout(300_000);
const zip = (files: Record<string, string>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
const marker = (v: string) => `document.documentElement.dataset.helper = '${v}';`;
const CHROMIUM = zip({ 'manifest.json': JSON.stringify({ manifest_version: 3, name: 'Shop Helper', version: '1.0', content_scripts: [{ matches: ['<all_urls>'], js: ['c.js'] }] }), 'c.js': marker('chromium') });
const firefox = (version: string) => zip({ 'manifest.json': JSON.stringify({ manifest_version: 2, name: 'Shop Helper FF', version, browser_specific_settings: { gecko: { id: 'helper@shop.example' } }, content_scripts: [{ matches: ['<all_urls>'], js: ['c.js'] }] }), 'c.js': marker(`firefox-${version}`) });
const crx = (z: Buffer) => { const h = Buffer.alloc(12); h.write('Cr24', 0, 'latin1'); h.writeUInt32LE(3, 4); h.writeUInt32LE(0, 8); return Buffer.concat([h, z]); };

// The stores, and a page for the extensions to mark.
async function startStores(){
  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (req.url!.startsWith('/crx/abcdefghijklmnopabcdefghijklmnop')) return res.end(crx(CHROMIUM));
    if (req.url === '/amo/shop-helper/') return res.end(JSON.stringify({ current_version: { file: { url: `${base}/files/helper-2.0.xpi` } } }));
    if (req.url === '/files/helper-2.0.xpi') return res.end(firefox('2.0'));
    res.setHeader('content-type', 'text/html');
    res.end('<title>page</title>');
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, page: `http://localhost:${(server.address() as AddressInfo).port}/page`, env: { FOLIO_CHROME_STORE_URL: `${base}/crx/{id}`, FOLIO_AMO_API: `${base}/amo/` }, close: () => new Promise<void>(r => server.close(() => r())) };
}
// What the extension wrote into a page the profile's browser loads.
const helper = (app: ElectronApplication, id: string, url: string) => app.evaluate(async (_e, { id, url }) => {
  const r = (globalThis as unknown as { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> }).__folioRunning.get(id)!;
  const page = r.ctx.pages()[0] ?? await r.ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(1500);
  return page.evaluate(() => document.documentElement.dataset.helper ?? null);
}, { id, url });
const stop = async (win: Page, id: string) => {
  await win.evaluate(pid => window.folio.stopProfile(pid), id);
  await expect.poll(async () => (await lastStatus(win, id))?.state, { timeout: 60_000 }).toBe('stopped');
};

test('extensions from a store or a file reach the profiles of their engine, and a tampered package is refused', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const stores = await startStores();
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${acct.workspaceId}`;
  const userData = dataDir();
  const app = await launch(userData, { ...ENGINE_ENV, ...stores.env });
  const win = await logIn(app, acct.email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  const cr = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-CR') })).json();
  const fp = await win.evaluate(() => window.folio.newFingerprint('firefox', 'linux'));
  const ff = await (await acct.api.post(`${base}/profiles`, { data: { name: 'Shop-FF', kernel: 'firefox', os: 'linux', ...fp } })).json();

  // Chromium from the Chrome Web Store, Firefox from a file.
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Extensions' }).click();
  // The header's button (an empty library offers the same one).
  await win.locator('.main > .bar').getByRole('button', { name: 'Add extension' }).click();
  let dialog = win.getByRole('dialog', { name: 'Add extension' });
  await dialog.getByLabel('Store link, extension ID or download link').fill('https://chromewebstore.google.com/detail/shop-helper/abcdefghijklmnopabcdefghijklmnop');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Added to the library' })).toContainText('Shop Helper');
  await win.locator('.main > .bar').getByRole('button', { name: 'Add extension' }).click();
  dialog = win.getByRole('dialog', { name: 'Add extension' });
  await dialog.getByRole('group', { name: 'Engine' }).getByRole('button', { name: 'Firefox' }).click();
  await dialog.getByRole('group', { name: 'From' }).getByRole('button', { name: 'File' }).click();
  await dialog.getByLabel('Choose a file').setInputFiles({ name: 'helper.xpi', mimeType: 'application/x-xpinstall', buffer: firefox('1.0') });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(win.locator('[data-extension="Shop Helper FF"]')).toContainText('1.0');
  // A new version from addons.mozilla.org keeps the add-on's identity.
  await win.locator('[data-extension="Shop Helper FF"]').getByRole('button', { name: 'More actions' }).click();
  await win.getByRole('menuitem', { name: 'New version' }).click();
  dialog = win.getByRole('dialog', { name: 'New version of Shop Helper FF' });
  await dialog.getByRole('group', { name: 'From' }).getByRole('button', { name: 'Link' }).click();
  await dialog.getByLabel('Add-on link, short name or download link').fill('https://addons.mozilla.org/en-US/firefox/addon/shop-helper/');
  await dialog.getByRole('button', { name: 'Upload' }).click();
  await expect(win.locator('[data-extension="Shop Helper FF"]')).toContainText('2.0');
  const library = (await (await acct.api.get(`${base}/extensions`)).json()).extensions;
  const crExt = library.find((e: { kernel: string }) => e.kernel === 'chromium');
  expect(crExt).toMatchObject({ source: 'store', storeId: 'abcdefghijklmnopabcdefghijklmnop' });

  // Chromium through the profile form, Firefox through the bulk actions (which pass over the Chromium profile).
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Profiles/ }).click();
  await win.getByRole('button', { name: 'Shop-CR', exact: true }).click();
  await detail(win).getByRole('button', { name: 'Edit profile' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await form.getByRole('region', { name: 'Extensions' }).getByLabel('Shop Helper').check();
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toHaveCount(0);
  await back(win);
  await win.getByLabel('Select this page').check();
  await bulkMore(win, 'Bulk edit');
  const bulk = win.getByRole('dialog', { name: 'Bulk edit profiles' });
  await bulk.getByRole('checkbox', { name: 'Extension' }).check();
  await choose(bulk.getByRole('combobox', { name: 'Extension' }), /^Shop Helper FF/);
  await expect(bulk.locator('.be-lines')).toContainText('Install: Shop Helper FF');
  await bulk.getByRole('button', { name: 'Change 2 profiles' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Profiles changed' })).toContainText('2 profiles');

  expect(await opened(win, cr.id)).toMatchObject({ state: 'running' });
  expect(await helper(app, cr.id, stores.page)).toBe('chromium');
  expect(await opened(win, ff.id)).toMatchObject({ state: 'running' });
  expect(await helper(app, ff.id, stores.page)).toBe('firefox-2.0');
  await stop(win, cr.id);
  await stop(win, ff.id);

  // A damaged copy on this computer is fetched again from Folio rather than installed.
  const cached = join(userData, 'extensions', crExt.id);
  const file = join(cached, readdirSync(cached)[0]);
  const bytes = readFileSync(file);
  bytes[bytes.length - 1] ^= 0xff;
  writeFileSync(file, bytes);
  expect(await opened(win, cr.id)).toMatchObject({ state: 'running' });
  expect(await helper(app, cr.id, stores.page)).toBe('chromium');
  await stop(win, cr.id);
  await app.close();

  // Changed in storage: on a computer without a copy, the profile opens without it and says why.
  expect((await acct.api.post(`${API}/dev/extensions/${crExt.id}/tamper`)).status()).toBe(204);
  const other = await launch(dataDir(), { ...ENGINE_ENV, ...stores.env });
  const win2 = await logIn(other, acct.email);
  await expect(win2.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(await opened(win2, cr.id)).toMatchObject({ state: 'running', extensionErrors: ['Shop Helper'] });
  await expect(win2.getByRole('alert').filter({ hasText: 'Shop-CR opened without Shop Helper: it didn’t pass the integrity check.' })).toBeVisible();
  expect(await helper(other, cr.id, stores.page)).toBeNull();
  await other.close();
  await stores.close();
});

// An extension that keeps a value in storage.local and in its own IndexedDB: a page opened with ?set=… stores it,
// and every page shows what the extension finds.
function keeper(kernel: 'chromium' | 'firefox'){
  const api = kernel === 'chromium' ? 'chrome' : 'browser';
  const bg = `
    const db = () => new Promise((ok, no) => { const r = indexedDB.open('keeper', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    const get = async () => { const d = await db(); return new Promise(ok => { const q = d.transaction('kv').objectStore('kv').get('v'); q.onsuccess = () => ok(q.result ?? null); }); };
    const put = async v => { const d = await db(); return new Promise(ok => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'v'); t.oncomplete = () => ok(); }); };
    ${api}.runtime.onMessage.addListener((m, _s, reply) => { (async () => {
      if (m.set){ await ${api}.storage.local.set({ v: m.set }); await put(m.set); }
      reply({ local: (await ${api}.storage.local.get('v')).v ?? null, db: await get() });
    })(); return true; });`;
  const content = `${api}.runtime.sendMessage({ set: new URL(location.href).searchParams.get('set') }, r => { document.documentElement.dataset.helper = JSON.stringify(r); });`;
  const manifest = kernel === 'chromium'
    ? { manifest_version: 3, name: 'Keeper', version: '1.0', permissions: ['storage'], background: { service_worker: 'bg.js' }, content_scripts: [{ matches: ['<all_urls>'], js: ['c.js'] }] }
    : { manifest_version: 2, name: 'Keeper', version: '1.0', permissions: ['storage'], browser_specific_settings: { gecko: { id: 'keeper@folio.test' } }, background: { scripts: ['bg.js'] }, content_scripts: [{ matches: ['<all_urls>'], js: ['c.js'] }] };
  return zip({ 'manifest.json': JSON.stringify(manifest), 'bg.js': bg, 'c.js': content });
}
// Waits for the extension to answer on the page, in a tab of its own: the profile's restored tabs may still be loading.
const kept = (app: ElectronApplication, id: string, url: string) => app.evaluate(async (_e, { id, url }) => {
  const r = (globalThis as unknown as { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> }).__folioRunning.get(id)!;
  const page = await r.ctx.newPage();
  await page.goto(url);
  for (let i = 0; i < 60; i++){
    const v = await page.evaluate(() => document.documentElement.dataset.helper ?? null);
    if (v) return JSON.parse(v);
    await page.waitForTimeout(250);
  }
  return null;
}, { id, url });

for (const kernel of ['chromium', 'firefox'] as const){
  test(`${kernel}: an extension’s own data follows the profile to the next computer`, async () => {
    test.skip(!hasKernels, 'browser engines are not unpacked here');
    const stores = await startStores();
    const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
    const base = `/workspaces/${acct.workspaceId}`;
    const ext = await (await acct.api.post(`${base}/extensions?kernel=${kernel}`, { headers: { 'content-type': 'application/octet-stream' }, data: keeper(kernel) })).json();
    const a = await launch(dataDir(), ENGINE_ENV);
    const winA = await logIn(a, acct.email);
    await expect(winA.getByRole('navigation', { name: 'Main' })).toBeVisible();
    const body = kernel === 'chromium' ? chromiumProfile('Wallet-01') : { name: 'Wallet-01', kernel, os: 'linux', ...(await winA.evaluate(() => window.folio.newFingerprint('firefox', 'linux'))) };
    const p = await (await acct.api.post(`${base}/profiles`, { data: { ...body, extensionIds: [ext.id] } })).json();

    expect(await opened(winA, p.id)).toMatchObject({ state: 'running' });
    expect(await kept(a, p.id, `${stores.page}?set=alpha-1`)).toEqual({ local: 'alpha-1', db: 'alpha-1' });
    await stop(winA, p.id);
    // Reopened on the same computer: still there.
    expect(await opened(winA, p.id)).toMatchObject({ state: 'running' });
    expect(await kept(a, p.id, stores.page)).toEqual({ local: 'alpha-1', db: 'alpha-1' });
    await stop(winA, p.id);
    await winA.getByRole('button', { name: 'Wallet-01', exact: true }).click();
    await expect(detail(winA).getByRole('region', { name: 'Basics' })).toContainText(ext.name);
    await a.close();

    // Another computer: restored with the sign-ins.
    const b = await launch(dataDir(), ENGINE_ENV);
    const winB = await logIn(b, acct.email);
    await expect(winB.getByRole('navigation', { name: 'Main' })).toBeVisible();
    expect(await opened(winB, p.id)).toMatchObject({ state: 'running' });
    expect(await kept(b, p.id, stores.page)).toEqual({ local: 'alpha-1', db: 'alpha-1' });
    await stop(winB, p.id);
    await b.close();
    await stores.close();
  });
}
