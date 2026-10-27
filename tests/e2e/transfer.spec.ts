// A whole workspace out to a passphrase-protected file and into another workspace.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { account, chromiumProfile, dataDir, launch, logIn } from './helpers';

test.setTimeout(120_000);
const PASS = 'correct horse battery staple';
const menu = async (win: Page, item: string) => {
  await win.locator('.me').click();
  await win.getByRole('button', { name: item }).click();
};
// File dialogs answer with the test's path instead of asking.
const dialogs = (app: ElectronApplication, path: string) => app.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
}, path);

test('a workspace goes out to a .folio file and comes back in elsewhere, sign-ins and proxy passwords included', async () => {
  const from = await account();
  const base = `/workspaces/${from.workspaceId}`;
  await from.api.patch(base, { data: { name: 'Larkspur Trading' } });
  const g = await (await from.api.post(`${base}/groups`, { data: { name: 'EU stores' } })).json();
  const proxy = await (await from.api.post(`${base}/proxies`, { data: { type: 'socks5', host: 'de1.example.net', port: 1080, username: 'u', password: 'p@ss' } })).json();
  const shop = await (await from.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-DE', { groupId: g.id, proxyId: proxy.id }) })).json();
  await from.api.post(`${base}/profiles`, { data: chromiumProfile('Social-01') });
  await from.api.post(`/profiles/${shop.id}/cookies`, { data: { cookies: [{ name: 'sid', value: 'signed-in', domain: 'shop.example' }] } });
  const file = join(mkdtempSync(join(tmpdir(), 'folio-transfer-')), 'larkspur.folio');

  const a = await launch(dataDir());
  const winA = await logIn(a, from.email);
  await expect(winA.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await dialogs(a, file);
  await menu(winA, 'Export all data…');
  const ex = winA.getByRole('dialog', { name: 'Export all data' });
  await ex.getByLabel('Passphrase', { exact: true }).fill(PASS);
  await ex.getByLabel('Confirm passphrase').fill('something else entirely');
  await ex.getByRole('button', { name: 'Export' }).click();
  await expect(ex.getByRole('alert')).toHaveText('The two passphrases differ.');
  await ex.getByLabel('Confirm passphrase').fill(PASS);
  await ex.getByRole('button', { name: 'Export' }).click();
  await expect(winA.getByRole('status').filter({ hasText: `Saved to ${file}` })).toBeVisible();
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file).includes(Buffer.from('p@ss'))).toBe(false);
  await a.close();

  const to = await account();
  const b = await launch(dataDir());
  const winB = await logIn(b, to.email);
  await expect(winB.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await dialogs(b, file);
  await menu(winB, 'Import data…');
  const im = winB.getByRole('dialog', { name: 'Import data' });
  await im.getByRole('button', { name: 'Choose a .folio file…' }).click();
  await im.getByLabel('Passphrase').fill('not the right one!');
  await im.getByRole('button', { name: 'Unlock' }).click();
  await expect(im.getByRole('alert')).toHaveText('That passphrase doesn’t open this file.');
  await im.getByLabel('Passphrase').fill(PASS);
  await im.getByRole('button', { name: 'Unlock' }).click();
  await expect(im.getByRole('status')).toHaveText('From Larkspur Trading: 2 profiles (1 with sign-ins), 1 proxy, 1 group.');
  await im.getByRole('button', { name: 'Import' }).click();
  await expect(winB.getByRole('status').filter({ hasText: '2 profiles imported, 1 with sign-ins; 1 new proxy, 1 new group' })).toBeVisible();
  await expect(winB.locator('tr[data-id]')).toHaveCount(2);

  const list = (await (await to.api.get(`/workspaces/${to.workspaceId}/profiles`)).json()).profiles;
  const imported = list.find((p: { name: string }) => p.name === 'Shop-DE');
  expect(imported.data).toMatchObject({ cookies: 1 });
  const cookies = (await (await to.api.get(`/profiles/${imported.id}/cookies/values`)).json()).cookies;
  expect(cookies).toMatchObject([{ name: 'sid', value: 'signed-in' }]);
  const newProxy = (await (await to.api.get(`/workspaces/${to.workspaceId}/proxies`)).json()).proxies[0];
  expect(imported.proxyId).toBe(newProxy.id);
  expect((await (await to.api.get(`/proxies/${newProxy.id}/credentials`)).json()).password).toBe('p@ss');
  await b.close();
});
