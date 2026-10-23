import { expect, test } from '@playwright/test';
import { account, choose, chromiumProfile, dataDir, launch, logIn } from './helpers';

test('the activity log says who did what, and each profile shows its recent entries', async () => {
  const acct = await account();
  const base = `/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/groups`, { data: { name: 'EU stores' } });
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-07') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await win.getByRole('button', { name: 'Shop-07', exact: true }).click();
  const detail = win.getByRole('complementary', { name: 'Profile' });
  await detail.getByRole('button', { name: 'Edit' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await form.getByLabel('Name', { exact: true }).fill('Shop Berlin');
  await form.getByRole('button', { name: 'Save changes' }).click();
  const recent = detail.getByTestId('recent');
  await expect(recent).toContainText(`${acct.email} changed the name of Shop Berlin #0001`);
  await expect(recent).toContainText(`${acct.email} created Shop-07 #0001`);
  await win.keyboard.press('Escape');

  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Activity log/ }).click();
  await expect(win.getByText('Kept for 7 days on this plan')).toBeVisible();
  const items = win.locator('.log-list li');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText('changed the name of Shop Berlin');
  await expect(items.last()).toContainText(`${acct.email} created the group EU stores`);
  await choose(win.getByRole('combobox', { name: 'Showing' }), 'Profile changes');
  await expect(items).toHaveCount(2);
  await choose(win.getByRole('combobox', { name: 'Showing' }), 'Team');
  await expect(win.getByText('Nothing here yet.')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  await app.close();
});
