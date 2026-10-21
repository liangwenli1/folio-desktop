import { expect, test } from '@playwright/test';
import { SITE, account, dataDir, launch, logIn } from './helpers';

test('the plan bought on the website shows up after logging in', async () => {
  const { email, api } = await account({ buy: { plan: 'studio', period: 'monthly' } });
  await api.post('/workspaces', { data: { name: 'EU stores' } });
  const app = await launch(dataDir());
  const win = await logIn(app, email);

  await expect(win.getByTestId('plan-name')).toHaveText('Studio');
  await expect(win.getByTestId('plan-usage')).toHaveText('0 of 100 profiles');
  await expect(win.getByTestId('plan-status')).toContainText('Renews');

  await win.click('.ws');
  await win.getByRole('option', { name: /EU stores/ }).click();
  await expect(win.getByTestId('ws-name')).toHaveText('EU stores');
  await expect(win.getByTestId('plan-usage')).toHaveText('0 of 5 profiles');
  await app.close();
});

test('a wrong password explains what went wrong', async () => {
  const { email } = await account();
  const app = await launch(dataDir());
  const win = await app.firstWindow();
  await win.fill('#email', email);
  await win.fill('#password', 'not the password');
  await win.click('button[type="submit"]');
  await expect(win.getByRole('alert')).toHaveText('The email or password is not right.');
  await app.close();
});

test('the session survives a restart and ends on log out', async () => {
  const { email } = await account();
  const dir = dataDir();
  let app = await launch(dir);
  let win = await logIn(app, email);
  await expect(win.getByTestId('plan-name')).toHaveText('Free');
  await app.close();

  app = await launch(dir);
  win = await app.firstWindow();
  await expect(win.getByTestId('plan-name')).toHaveText('Free');
  await win.click('.me');
  await win.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(win.locator('#email')).toBeVisible();
  await app.close();

  app = await launch(dir);
  await expect((await app.firstWindow()).locator('#email')).toBeVisible();
  await app.close();
});

test('Chinese accounts get the Chinese workbench, and upgrading opens the site checkout', async () => {
  const { email, workspaceId } = await account({ locale: 'zh' });
  const app = await launch(dataDir());
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as { opened?: string[] }).opened = opened;
    shell.openExternal = async (url: string) => { opened.push(url); };
  });
  const win = await logIn(app, email);
  await expect(win.getByTestId('plan-name')).toHaveText('体验版');
  await expect(win.getByTestId('plan-usage')).toHaveText('已用 0 / 5 个环境');
  await win.getByTestId('plan-buy').click();
  await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual([`${SITE}/zh/checkout/?ws=${workspaceId}`]);
  await app.close();
});
