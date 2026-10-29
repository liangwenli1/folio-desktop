// The person's own page (design v2 32–34): the name colleagues see, a new password, and the notices they get.
import { expect, test } from '@playwright/test';
import { PASSWORD, account, dataDir, launch, logIn } from './helpers';

test.setTimeout(120_000);

test('a display name, a new password and which notices to get', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const dir = dataDir();
  let app = await launch(dir);
  let win = await logIn(app, acct.email);

  await win.click('.me');
  await expect(win.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(win.getByLabel('Email')).toHaveValue(acct.email);
  await expect(win.getByLabel('Email')).toBeDisabled();
  // No display name to set (the user, 10-29): people are their email everywhere.
  await expect(win.getByRole('textbox', { name: 'Display name' })).toHaveCount(0);
  await win.locator('#ac-note').fill('Storefront');
  await win.getByRole('button', { name: 'Save changes' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Profile saved' })).toBeVisible();
  await expect(win.locator('.me')).toContainText(acct.email);
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Team' }).click();
  await expect(win.locator(`tr[data-member="${acct.email}"]`)).toContainText(`${acct.email} (you)`);

  // A new password needs the current one; then it is the one to log in with.
  await win.click('.me');
  await win.getByRole('navigation', { name: 'Profile' }).getByRole('button', { name: 'Change password' }).click();
  await win.getByLabel('Current password').fill('not the password');
  await win.getByLabel(/^New password/).fill('a brand new password');
  await win.getByLabel('Confirm new password').fill('a brand new password');
  await win.getByRole('button', { name: 'Save changes' }).click();
  await expect(win.getByText('The current password isn’t right.')).toBeVisible();
  await expect(win.getByLabel('Current password')).toBeFocused();
  await win.getByLabel('Current password').fill(PASSWORD);
  await win.getByRole('button', { name: 'Save changes' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Password changed' })).toContainText('Sign-ins on other computers have ended');

  // Notices are the person's own and stay with the account.
  await win.getByRole('button', { name: 'Settings', exact: true }).click();
  await win.getByRole('navigation', { name: 'Settings' }).getByRole('button', { name: 'Notifications' }).click();
  await win.getByRole('combobox', { name: 'Batch task finished' }).click();
  await win.getByRole('option', { name: 'Off' }).click();
  await win.getByRole('button', { name: 'Save changes' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();

  // Logging out asks first, then the new password logs in.
  await win.click('.me');
  await win.getByRole('navigation', { name: 'Profile' }).getByRole('button', { name: 'Log out' }).click();
  await win.getByRole('dialog', { name: 'Log out' }).getByRole('button', { name: 'Log out' }).click();
  await expect(win.locator('#email')).toBeVisible();
  await app.close();
  app = await launch(dir);
  win = await logIn(app, acct.email, 'a brand new password');
  await win.getByRole('button', { name: 'Settings', exact: true }).click();
  await win.getByRole('navigation', { name: 'Settings' }).getByRole('button', { name: 'Notifications' }).click();
  await expect(win.getByRole('combobox', { name: 'Batch task finished' })).toContainText('Off');
  await expect(win.getByRole('combobox', { name: 'Batch task with failures' })).toContainText('On');
  await app.close();
});
