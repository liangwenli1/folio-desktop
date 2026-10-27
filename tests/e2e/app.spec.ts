import { expect, test } from '@playwright/test';
import { SITE, account, dataDir, launch, logIn } from './helpers';

test('the plan bought on the website shows up after logging in', async () => {
  const { email, api } = await account({ buy: { plan: 'studio', period: 'monthly' } });
  await api.post('/workspaces', { data: { name: 'EU stores' } });
  const app = await launch(dataDir());
  const win = await logIn(app, email);

  // The plan is under Settings (design v2): Settings at the foot of the rail, then Plan and usage.
  const plan = async () => {
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByRole('navigation', { name: 'Settings' }).getByRole('button', { name: 'Plan and usage' }).click();
  };
  await plan();
  await expect(win.getByTestId('plan-name')).toHaveText('Studio');
  await expect(win.getByTestId('plan-status')).toContainText('Renews');
  await win.getByRole('tab', { name: 'Usage' }).click();
  await expect(win.getByTestId('plan-usage')).toHaveText('0 / 100');

  // The workspace button opens the switch dialog (v2 35).
  await win.click('.ws');
  const sw = win.getByRole('dialog', { name: 'Switch workspace' });
  await sw.getByRole('combobox', { name: 'Workspace' }).click();
  await win.getByRole('option', { name: /EU stores/ }).click();
  await sw.getByRole('button', { name: 'Switch' }).click();
  await expect(win.getByTestId('ws-name')).toHaveText('EU stores');
  await plan();
  await win.getByRole('tab', { name: 'Usage' }).click();
  await expect(win.getByTestId('plan-usage')).toHaveText('0 / 5');
  await app.close();
});

test('the sign-in page plays the walkthrough, which pauses with its button', async () => {
  const app = await launch(dataDir());
  const win = await app.firstWindow();
  const demo = win.getByRole('group', { name: /^Workbench walkthrough/ });
  await expect(demo).toHaveAttribute('data-state', 'playing');
  await expect(demo).not.toHaveAttribute('data-frame', '0', { timeout: 15_000 });
  await demo.getByRole('button', { name: 'Pause walkthrough' }).click();
  await expect(demo).toHaveAttribute('data-state', 'paused');
  const at = await demo.getAttribute('data-frame');
  await win.waitForTimeout(4000);
  await expect(demo).toHaveAttribute('data-frame', at!);
  await app.close();
});

test('a wrong password explains what went wrong', async () => {
  const { email } = await account();
  const app = await launch(dataDir());
  const win = await app.firstWindow();
  await win.fill('#email', email);
  await win.fill('#password', 'not the password');
  await win.click('button[type="submit"]');
  await expect(win.getByRole('alert')).toHaveText('The email or password is incorrect.');
  await app.close();
});

test('the session survives a restart and ends on log out', async () => {
  const { email } = await account();
  const dir = dataDir();
  let app = await launch(dir);
  let win = await logIn(app, email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await app.close();

  app = await launch(dir);
  win = await app.firstWindow();
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  // The account button opens the person's page; logging out from there asks first (design v2 34).
  await win.click('.me');
  await win.getByRole('navigation', { name: 'Profile' }).getByRole('button', { name: 'Log out' }).click();
  await win.getByRole('dialog', { name: 'Log out' }).getByRole('button', { name: 'Log out' }).click();
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
  await win.getByRole('button', { name: '设置', exact: true }).click();
  await win.getByRole('navigation', { name: '设置' }).getByRole('button', { name: '套餐与用量' }).click();
  await expect(win.getByTestId('plan-name')).toHaveText('体验版');
  await win.getByRole('tab', { name: '用量' }).click();
  await expect(win.getByTestId('plan-usage')).toHaveText('0 / 5');
  await win.getByRole('tab', { name: '当前套餐' }).click();
  await win.getByTestId('plan-buy').click();
  await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual([`${SITE}/zh/checkout/?ws=${workspaceId}`]);
  await app.close();
});

test('a newer version shows in the sidebar: restart to install on Windows, download from the site on macOS', async () => {
  const { email } = await account();
  const app = await launch(dataDir());
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as { opened?: string[] }).opened = opened;
    shell.openExternal = async (url: string) => { opened.push(url); };
  });
  const win = await logIn(app, email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  // What the update check reports, sent the way the main process sends it.
  const announce = (u: { version: string; installs: boolean }) => app.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows()[0].webContents.send('app:update', u), u);

  const notice = win.getByRole('status', { name: 'Folio 0.2.0 is ready to install.' });
  // Sent straight to the window, the news is lost if it lands before the workbench listens: send it until it shows.
  await expect(async () => {
    await announce({ version: '0.2.0', installs: true });
    await expect(notice.getByRole('button', { name: 'Restart to update' })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(notice).toContainText('Open profiles are saved and closed first.');

  await announce({ version: '0.2.1', installs: false });
  await win.getByRole('status', { name: 'Folio 0.2.1 is out.' }).getByRole('button', { name: 'Download' }).click();
  await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual([`${SITE}/en/download/`]);
  await app.close();
});
