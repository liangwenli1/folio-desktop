// Dialogs keep the focus: it goes in, Tab stays inside, and closing gives it back to what opened it. A dialog with
// something typed in asks before dropping it. And the top bar says where you are and opens the search.
import { expect, test } from '@playwright/test';
import { account, dataDir, launch, logIn } from './helpers';

test.setTimeout(120_000);

test('a dialog takes the focus, keeps it, gives it back, and asks before dropping what was typed', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Proxies' }).click();
  await expect(win.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Proxies');

  const add = win.locator('header.bar').getByRole('button', { name: 'Add proxy' });
  await add.click();
  const dialog = win.getByRole('dialog', { name: 'Add proxy' });
  await expect(dialog.getByLabel('Name')).toBeFocused();
  for (let i = 0; i < 24; i++) await win.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await win.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();

  await add.click();
  await dialog.getByRole('textbox', { name: 'Host' }).fill('203.0.113.9');
  await win.keyboard.press('Escape');
  const ask = win.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(ask.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await ask.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).toBeHidden();

  // The top bar's search is the command palette.
  await win.locator('.top-search').click();
  await expect(win.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await win.keyboard.press('Escape');
  await app.close();
});
