import { expect, test } from '@playwright/test';
import { account, chromiumProfile, dataDir, launch, logIn } from './helpers';

test('the activity log says who did what, and each profile shows its recent entries', async () => {
  const acct = await account();
  const base = `/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/groups`, { data: { name: 'EU stores' } });
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-07') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await win.getByRole('button', { name: 'Shop-07', exact: true }).click();
  const detail = win.getByRole('dialog', { name: 'Profile', exact: true });
  await detail.getByRole('button', { name: 'Edit' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await form.getByLabel('Name', { exact: true }).fill('Shop Berlin');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await detail.getByRole('tab', { name: 'Activity' }).click();
  const recent = detail.getByTestId('recent');
  await expect(recent).toContainText(`${acct.email} changed the name of Shop Berlin #0001`);
  await expect(recent).toContainText(`${acct.email} created Shop-07 #0001`);
  await win.keyboard.press('Escape');

  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Activity log/ }).click();
  const items = win.locator('tr[data-action]');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText('changed the name of Shop Berlin');
  await expect(items.last()).toContainText(acct.email);
  await expect(items.last()).toContainText('created the group EU stores');
  const kinds = win.getByRole('group', { name: 'Showing' });
  await kinds.getByRole('button', { name: 'Profile changes' }).click();
  await expect(items).toHaveCount(2);
  await kinds.getByRole('button', { name: 'Team' }).click();
  await expect(win.getByText('Nothing here yet.')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  await app.close();
});
