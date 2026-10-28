// The Trash page: how long profiles are kept (the workspace's setting) and how many days each has left, finding one by
// its ID, and restoring several into another group from the panel beside the table.
import { expect, test } from '@playwright/test';
import { API, account, choose, chromiumProfile, dataDir, launch, logIn } from './helpers';

test('the Trash says how long it keeps profiles, finds them by ID, and restores into another group', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const eu = await (await acct.api.post(`${base}/groups`, { data: { name: 'EU stores' } })).json();
  const made = (await (await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: ['Shop-1', 'Shop-2', 'Shop-3'].map(n => chromiumProfile(n)) } })).json()).profiles as { id: string; name: string; number: number }[];
  await acct.api.post(`${base}/profiles/batch`, { data: { ids: made.map(p => p.id), action: 'trash' } });
  expect((await acct.api.patch(base, { data: { settings: { trashDays: 7 } } })).ok()).toBe(true);

  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Trash' }).click();
  await expect(win.getByText('Kept for 7 days, then permanently deleted.')).toBeVisible();
  const rows = win.locator('tr[data-id]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('7 days');

  const search = win.getByRole('searchbox', { name: 'Search name or number' });
  await search.fill(`#${String(made[1].number).padStart(4, '0')}`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Shop-2');
  await search.fill('');

  for (const n of ['Shop-1', 'Shop-3']) await win.getByRole('checkbox', { name: `Select ${n}` }).check();
  const panel = win.getByRole('complementary', { name: '2 selected' });
  await choose(panel.getByRole('combobox', { name: 'Restore to' }), 'EU stores');
  await panel.getByRole('button', { name: 'Restore (2)' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Restored' })).toContainText('2 profiles');
  const list = (await (await acct.api.get(`${base}/profiles`)).json()).profiles as { name: string; groupId: string | null }[];
  expect(list.map(p => [p.name, p.groupId]).sort()).toEqual([['Shop-1', eu.id], ['Shop-3', eu.id]]);
  await expect(rows).toHaveCount(1);
  await app.close();
});
