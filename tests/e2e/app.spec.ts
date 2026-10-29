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

test('the sign-in page shows three profiles as cards beside the form, standing still', async () => {
  const app = await launch(dataDir());
  const win = await app.firstWindow();
  const cards = win.locator('.login-pc');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('US-Store-01');
  await expect(cards.nth(0)).toContainText('Running');
  await expect(cards.nth(1)).toContainText('Restoring');
  await expect(cards.nth(2)).toContainText('Not running');
  // Nothing on the page moves: the restoring card's ring stands still.
  expect(await cards.nth(1).locator('.spin').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
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
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Account' }).click();
  await win.getByRole('navigation', { name: 'Account' }).getByRole('button', { name: 'Log out' }).click();
  await win.getByRole('dialog', { name: 'Log out' }).getByRole('button', { name: 'Log out' }).click();
  await expect(win.locator('#email')).toBeVisible();
  await app.close();

  app = await launch(dir);
  await expect((await app.firstWindow()).locator('#email')).toBeVisible();
  await app.close();
});

test('the button at the top right switches light and dark at a click, and this computer keeps it', async () => {
  const { email } = await account();
  const dir = dataDir();
  let app = await launch(dir);
  let win = await logIn(app, email);
  const dark = () => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  expect(await dark()).toBe(false);
  await win.getByRole('button', { name: 'Switch to dark' }).click();
  await expect.poll(dark).toBe(true);
  await expect(win.getByRole('button', { name: 'Switch to light' })).toBeVisible();
  await app.close();

  app = await launch(dir);
  win = await app.firstWindow();
  await expect(win.getByRole('button', { name: 'Switch to light' })).toBeVisible();
  expect(await dark()).toBe(true);
  // Platform settings show the same choice, and offer the system's.
  await win.getByRole('button', { name: 'Settings', exact: true }).click();
  await win.getByRole('navigation', { name: 'Settings' }).getByRole('button', { name: 'This computer' }).click();
  const theme = win.getByRole('group', { name: 'Theme' });
  await expect(theme.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  await theme.getByRole('button', { name: 'System' }).click();
  await expect.poll(dark).toBe(false);
  await expect(win.getByRole('button', { name: 'Switch to dark' })).toBeVisible();
  await win.getByRole('button', { name: 'Switch to dark' }).click();
  await expect(theme.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  await app.close();
});

test('the menu folds to its icons from the button beside the name, opens from the mark, and this computer keeps it', async () => {
  const { email } = await account();
  const dir = dataDir();
  let app = await launch(dir);
  let win = await logIn(app, email);
  const label = () => win.getByRole('navigation', { name: 'Main' }).getByText('Profiles', { exact: true });
  await expect(label()).toBeVisible();
  await win.getByRole('button', { name: 'Collapse menu' }).click();
  await expect(label()).toBeHidden();
  // Each icon still says what it is, and still goes there.
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Account' }).click();
  await expect(win.getByRole('heading', { name: 'Account' })).toBeVisible();
  await app.close();

  app = await launch(dir);
  win = await app.firstWindow();
  await expect(win.getByRole('button', { name: 'Expand menu' })).toBeVisible();
  await expect(label()).toBeHidden();
  await win.getByRole('button', { name: 'Expand menu' }).click();
  await expect(label()).toBeVisible();
  await expect(win.getByRole('button', { name: 'Collapse menu' })).toBeVisible();
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
  await win.getByRole('button', { name: '平台设置', exact: true }).click();
  await win.getByRole('navigation', { name: '平台设置' }).getByRole('button', { name: '套餐与用量' }).click();
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
