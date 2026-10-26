// The redesigned pages' own behaviour: the Trash's cards and who deleted what, installing an extension from its card,
// the engines' download settings, copying a waiting invitation's link again, and a profile's browser settings.
import { strToU8, zipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { account, choose, chromiumProfile, dataDir, launch, logIn, roleId, backToList, detail } from './helpers';

const STUDIO = { plan: 'studio', period: 'monthly' };
const nav = (win: import('@playwright/test').Page, name: RegExp) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

test('the Trash shows who deleted each profile, picks several on cards, and restores them all', async () => {
  const acct = await account();
  const base = `/workspaces/${acct.workspaceId}`;
  const ids = (await (await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: ['Old-1', 'Old-2', 'Old-3'].map(n => chromiumProfile(n)) } })).json()).profiles.map((p: { id: string }) => p.id);
  await acct.api.post(`${base}/profiles/batch`, { data: { ids, action: 'trash' } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await nav(win, /^Trash/);
  const row = win.locator('tr[data-id]', { hasText: 'Old-1' });
  await expect(row).toContainText(acct.email);
  await expect(row.getByRole('button', { name: 'Restore' })).toBeVisible();

  await win.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Cards' }).click();
  await expect(win.locator('li.pcard')).toHaveCount(3);
  for (const n of ['Old-1', 'Old-2']) await win.getByRole('checkbox', { name: `Select ${n}` }).check();
  await expect(win.getByTestId('bulk')).toContainText('2 selected');
  await win.getByTestId('bulk').locator('.bb.close').click();
  await win.getByRole('button', { name: 'Restore all' }).click();
  await expect(win.getByText('The Trash is empty.')).toBeVisible();
  await app.close();
});

test('an extension goes into the profiles picked from its card', async () => {
  const acct = await account({ buy: STUDIO });
  const base = `/workspaces/${acct.workspaceId}`;
  const pkg = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'Order Helper', version: '2.4.1' })) }));
  await acct.api.post(`${base}/extensions?kernel=chromium`, { headers: { 'content-type': 'application/octet-stream' }, data: pkg });
  for (const n of ['Shop-1', 'Shop-2']) await acct.api.post(`${base}/profiles`, { data: chromiumProfile(n) });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await nav(win, /^Extensions/);
  await win.locator('[data-extension="Order Helper"]').getByRole('button', { name: 'Install in profiles…' }).click();
  const dialog = win.getByRole('dialog', { name: 'Install Order Helper' });
  await dialog.getByRole('checkbox', { name: /Shop-1/ }).check();
  await dialog.getByRole('button', { name: 'Install in 1 profile' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Order Helper installed in 1 profile' })).toBeVisible();
  const profiles = (await (await acct.api.get(`${base}/profiles`)).json()).profiles as { name: string; extensionIds: string[] }[];
  expect(profiles.map(p => [p.name, p.extensionIds.length])).toEqual(expect.arrayContaining([['Shop-1', 1], ['Shop-2', 0]]));
  await expect(win.locator('[data-extension="Order Helper"]')).toContainText('1 profile');
  await app.close();
});

test('the engines’ download settings stay on this computer', async () => {
  const acct = await account();
  const dir = dataDir();
  let app = await launch(dir);
  let win = await logIn(app, acct.email);
  await nav(win, /^Engines/);
  const settings = win.getByRole('region', { name: 'Download settings' });
  await expect(settings.getByRole('switch', { name: 'Download updates automatically' })).toBeChecked();
  await settings.getByRole('switch', { name: 'Download only while idle' }).check();
  await expect(win.locator('tr[data-engine="chromium"][data-version="150.0.7871.186"]')).toContainText('Recommended');
  await app.close();

  app = await launch(dir);
  win = await app.firstWindow();
  await nav(win, /^Engines/);
  await expect(win.getByRole('region', { name: 'Download settings' }).getByRole('switch', { name: 'Download only while idle' })).toBeChecked();
  await app.close();
});

test('a waiting invitation’s link can be copied again, which replaces the old link', async () => {
  const acct = await account({ buy: STUDIO });
  const sent = await (await acct.api.post(`/workspaces/${acct.workspaceId}/invitations`, { data: { email: `copy-${Date.now()}@example.com`, roleId: await roleId(acct.api, acct.workspaceId, 'member') } })).json();
  const token = new URL(sent.link).searchParams.get('token');
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await nav(win, /^Team/);
  await win.getByRole('tab', { name: /^Invitations/ }).click();
  await win.locator('tr[data-invitation]').getByRole('button', { name: /^More for / }).click();
  await win.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'A new invitation link was copied' })).toBeVisible();
  expect((await acct.api.get(`/invitations/by-token/${token}`)).status()).toBe(404);
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied).toContain('/invite/?token=');
  await app.close();
});

test('a profile’s search engine and tab setting: chosen when it is made, shown in its details, changed in bulk', async () => {
  const acct = await account();
  const base = `/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-1') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('button', { name: 'New profile' }).first().click();
  const form = win.getByRole('dialog', { name: 'New profile' });
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Shop-2');
  await choose(form.getByLabel('Search engine'), 'Baidu');
  await form.getByRole('switch', { name: 'Restore last tabs' }).uncheck();
  await expect(form.getByRole('combobox', { name: 'Browser engine' })).toContainText('Chromium 150');
  await form.getByRole('button', { name: 'Create profile' }).click();

  const row = win.locator('tr[data-id]', { hasText: 'Shop-2' });
  await row.getByRole('button', { name: 'Shop-2', exact: true }).click();
  await expect(detail(win)).toContainText('Search engineBaidu');
  await expect(detail(win)).toContainText('On openingOpens the Baidu home page');
  await backToList(win);

  for (const n of ['Shop-1', 'Shop-2']) await win.getByRole('checkbox', { name: `Select ${n}` }).check();
  await choose(win.getByTestId('bulk').getByRole('combobox', { name: 'More' }), 'Bing');
  await expect(win.getByRole('status').filter({ hasText: 'Search engine set to Bing on 2 profiles' })).toBeVisible();
  await choose(win.getByTestId('bulk').getByRole('combobox', { name: 'More' }), 'On');
  await expect(win.getByRole('status').filter({ hasText: 'Restoring tabs turned on on 2 profiles' })).toBeVisible();
  const profiles = (await (await acct.api.get(`${base}/profiles`)).json()).profiles as { name: string; searchEngine: string; restoreTabs: boolean }[];
  expect(profiles.map(p => [p.name, p.searchEngine, p.restoreTabs])).toEqual([['Shop-1', 'bing', true], ['Shop-2', 'bing', true]]);
  await row.getByRole('button', { name: 'Shop-2', exact: true }).click();
  await expect(detail(win)).toContainText('On openingRestores the last tabs');
  await app.close();
});
