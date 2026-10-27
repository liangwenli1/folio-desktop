// The profiles list as the delivery spec lays it out: status tabs with counts, twenty a page, a reset for the
// filters, and editing several profiles at once while the running ones are left alone.
import { expect, test } from '@playwright/test';
import { API, ENGINE_ENV, account, chromiumProfile, choose, dataDir, hasKernels, launch, logIn, opened } from './helpers';

test.setTimeout(180_000);

test('pages of twenty, tabs that count, and a reset that brings everything back', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: Array.from({ length: 22 }, (_, i) => chromiumProfile(`Shop-${String(i + 1).padStart(2, '0')}`)) } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await expect(win.locator('tr[data-id]')).toHaveCount(20);
  await expect(win.getByRole('tab', { name: /^All/ })).toContainText('22');
  await expect(win.getByRole('tab', { name: /^Not running/ })).toContainText('22');
  await expect(win.getByRole('navigation', { name: '22 records' })).toBeVisible();
  await win.getByRole('button', { name: 'Page 2' }).click();
  await expect(win.locator('tr[data-id]')).toHaveCount(2);

  // A search goes back to the first page; the reset clears it.
  await win.getByRole('searchbox', { name: 'Search profiles' }).fill('Shop-0');
  await expect(win.locator('tr[data-id]')).toHaveCount(9);
  await win.getByRole('button', { name: 'Reset' }).click();
  await expect(win.locator('tr[data-id]')).toHaveCount(20);
  // Reset stays in its place, greyed out while nothing is filtered (v2 01).
  await expect(win.getByRole('button', { name: 'Reset' })).toBeDisabled();

  // The header box picks this page, not the whole list.
  await win.getByRole('checkbox', { name: 'Select this page' }).check();
  await expect(win.getByTestId('bulk')).toContainText('20 selected');
  await app.close();
});

test('editing several at once skips the running ones, and says so', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const group = await (await acct.api.post(`${base}/groups`, { data: { name: 'EU stores' } })).json();
  const [a, b] = (await (await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: [chromiumProfile('Edit-A'), chromiumProfile('Edit-B')] } })).json()).profiles;
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.locator(`tr[data-id="${a.id}"]`)).toBeVisible();
  expect(await opened(win, a.id)).toMatchObject({ state: 'running' });

  for (const id of [a.id, b.id]) await win.locator(`tr[data-id="${id}"]`).getByRole('checkbox').check();
  await win.getByTestId('bulk').getByRole('button', { name: 'Bulk edit' }).click();
  const dialog = win.getByRole('dialog', { name: 'Bulk edit profiles' });
  await dialog.getByRole('checkbox', { name: 'Group' }).check();
  await choose(dialog.getByRole('combobox', { name: 'Group' }), 'EU stores');
  await dialog.getByRole('checkbox', { name: 'Start page' }).check();
  await dialog.getByRole('textbox').fill('https://shop.example/');
  await expect(dialog).toContainText('1 to change · 1 skipped');
  await expect(dialog).toContainText('1 of them is running');
  await dialog.getByRole('button', { name: 'Change 1 profile' }).click();
  await expect(win.getByRole('status').filter({ hasText: '1 profile changed' })).toBeVisible();

  const list = (await (await acct.api.get(`${base}/profiles`)).json()).profiles as { id: string; groupId: string | null; startUrl: string | null }[];
  expect(list.find(p => p.id === b.id)).toMatchObject({ groupId: group.id, startUrl: 'https://shop.example/' });
  expect(list.find(p => p.id === a.id)).toMatchObject({ groupId: null, startUrl: null });

  // The task center has the edit as a job: the running one failed for being open; once it stops, a retry reaches it.
  const nav = (name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
  await nav('Task center');
  const job = win.locator('tr[data-job="profile.edit"]');
  await expect(job).toContainText('Partly failed');
  await job.getByRole('button', { name: 'View' }).click();
  const panel = win.getByRole('complementary', { name: 'Edit profiles' });
  await expect(panel.locator('tr[data-item="Edit-A"]')).toContainText('The profile was running');
  await win.evaluate(id => window.folio.stopProfile(id), a.id);
  await expect.poll(async () => (await win.evaluate(id => window.folio.statuses(), a.id)).length, { timeout: 60_000 }).toBe(0);
  await panel.getByRole('button', { name: 'Retry failed (1)' }).click();
  await expect(job).toContainText('Done', { timeout: 30_000 });
  expect(((await (await acct.api.get(`${base}/profiles`)).json()).profiles as { id: string; groupId: string | null }[]).find(p => p.id === a.id)).toMatchObject({ groupId: group.id });
  await nav('Profiles');

  // With the box cleared, the running one is changed too.
  expect(await opened(win, a.id)).toMatchObject({ state: 'running' });
  for (const id of [a.id, b.id]) await win.locator(`tr[data-id="${id}"]`).getByRole('checkbox').check();
  await win.getByTestId('bulk').getByRole('button', { name: 'Bulk edit' }).click();
  await dialog.getByRole('checkbox', { name: 'Start page' }).check();
  await dialog.getByRole('textbox').fill('https://other.example/');
  await dialog.getByRole('checkbox', { name: 'Only change profiles that are not running' }).uncheck();
  await expect(dialog).toContainText('2 to change · 0 skipped');
  await dialog.getByRole('button', { name: 'Change 2 profiles' }).click();
  await expect.poll(async () => ((await (await acct.api.get(`${base}/profiles`)).json()).profiles as { startUrl: string }[]).map(p => p.startUrl))
    .toEqual(['https://other.example/', 'https://other.example/']);
  await app.close();
});
