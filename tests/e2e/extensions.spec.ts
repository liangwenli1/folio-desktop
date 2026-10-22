// The extension library: added from a store or a file, installed in profiles of its engine, checked before it is
// installed. A package changed in storage is refused (P5 acceptance); a damaged local copy is fetched again.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { API, ENGINE_ENV, account, chromiumProfile, dataDir, hasKernels, lastStatus, launch, logIn, opened } from './helpers';

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
  await expect(win.getByTestId('plan-name')).toBeVisible();
  const cr = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-CR') })).json();
  const fp = await win.evaluate(() => window.folio.newFingerprint('firefox', 'linux'));
  const ff = await (await acct.api.post(`${base}/profiles`, { data: { name: 'Shop-FF', kernel: 'firefox', os: 'linux', ...fp } })).json();

  // Chromium from the Chrome Web Store, Firefox from a file.
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Extensions' }).click();
  await win.getByRole('button', { name: '+ Add extension' }).click();
  let dialog = win.getByRole('dialog', { name: 'Add an extension' });
  await dialog.getByRole('button', { name: 'Chrome Web Store' }).click();
  await dialog.getByLabel('Link or extension id').fill('https://chromewebstore.google.com/detail/shop-helper/abcdefghijklmnopabcdefghijklmnop');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Shop Helper added to the library' })).toBeVisible();
  await win.getByRole('button', { name: '+ Add extension' }).click();
  dialog = win.getByRole('dialog', { name: 'Add an extension' });
  await dialog.getByRole('group', { name: 'Engine' }).getByRole('button', { name: 'Firefox' }).click();
  await dialog.getByLabel('Choose a file…').setInputFiles({ name: 'helper.xpi', mimeType: 'application/x-xpinstall', buffer: firefox('1.0') });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(win.locator('tr[data-extension="Shop Helper FF"]')).toContainText('1.0');
  // A new version from addons.mozilla.org keeps the add-on's identity.
  await win.locator('tr[data-extension="Shop Helper FF"]').getByRole('button', { name: 'New version' }).click();
  dialog = win.getByRole('dialog', { name: 'New version of Shop Helper FF' });
  await dialog.getByRole('button', { name: 'addons.mozilla.org' }).click();
  await dialog.getByLabel('Link to the add-on (or its short name)').fill('https://addons.mozilla.org/en-US/firefox/addon/shop-helper/');
  await dialog.getByRole('button', { name: 'Upload' }).click();
  await expect(win.locator('tr[data-extension="Shop Helper FF"]')).toContainText('2.0');
  const library = (await (await acct.api.get(`${base}/extensions`)).json()).extensions;
  const crExt = library.find((e: { kernel: string }) => e.kernel === 'chromium');
  expect(crExt).toMatchObject({ source: 'store', storeId: 'abcdefghijklmnopabcdefghijklmnop' });

  // Chromium through the profile form, Firefox through the bulk actions (which pass over the Chromium profile).
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Profiles/ }).click();
  await win.getByRole('button', { name: 'Shop-CR', exact: true }).click();
  await win.getByRole('complementary', { name: 'Profile' }).getByRole('button', { name: 'Edit' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await form.getByRole('group', { name: 'Extensions' }).getByLabel('Shop Helper').check();
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toHaveCount(0);
  await win.getByRole('button', { name: 'Close details' }).click();
  await win.getByLabel('Select all shown').check();
  await win.getByTestId('bulk').getByLabel('Extensions…').selectOption({ label: 'Shop Helper FF · Firefox' });
  await expect(win.getByRole('status').filter({ hasText: 'Shop Helper FF installed in 1 profile; 1 skipped' })).toBeVisible();

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
  await expect(win2.getByTestId('plan-name')).toBeVisible();
  expect(await opened(win2, cr.id)).toMatchObject({ state: 'running', extensionErrors: ['Shop Helper'] });
  await expect(win2.getByRole('status').filter({ hasText: 'Shop-CR opened without Shop Helper: it didn’t pass the integrity check.' })).toBeVisible();
  expect(await helper(other, cr.id, stores.page)).toBeNull();
  await other.close();
  await stores.close();
});
