import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, request, test, type ElectronApplication } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:47110';
const SITE = 'http://localhost:47120';
const PASSWORD = 'correct horse battery';
let n = 0;

// Creates an account the way the website does: register, verify, and optionally buy a plan.
async function account({ locale = 'en', buy }: { locale?: 'en' | 'zh'; buy?: { plan: string; period: string } } = {}){
  const email = `desk${Date.now().toString(36)}${n++}@example.com`;
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: SITE } });
  await api.post('/auth/register', { data: { email, password: PASSWORD, locale } });
  const { code } = await (await api.get(`/dev/mail?email=${encodeURIComponent(email)}`)).json();
  await api.post('/auth/verify-email', { data: { code } });
  const me = await (await api.get('/me')).json();
  const workspaceId = me.workspaces[0].id as string;
  if (buy){
    const { checkoutId } = await (await api.post(`/workspaces/${workspaceId}/billing/checkout`, { data: { ...buy, addonPacks: 0 } })).json();
    await api.post(`/billing/checkouts/${checkoutId}/pay`, { data: { card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' } } });
  }
  return { email, workspaceId, api };
}

function launch(userData: string){
  return electron.launch({
    args: ['out/main/index.js', '--no-sandbox'],
    env: { ...process.env, FOLIO_API_URL: API, FOLIO_SITE_URL: SITE, FOLIO_PASSWORD_STORE: 'basic', FOLIO_USER_DATA: userData }
  });
}

async function logIn(app: ElectronApplication, email: string){
  const win = await app.firstWindow();
  await win.fill('#email', email);
  await win.fill('#password', PASSWORD);
  await win.click('button[type="submit"]');
  return win;
}

test('the plan bought on the website shows up after logging in', async () => {
  const { email, api } = await account({ buy: { plan: 'studio', period: 'monthly' } });
  await api.post('/workspaces', { data: { name: 'EU stores' } });
  const app = await launch(mkdtempSync(join(tmpdir(), 'folio-')));
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
  const app = await launch(mkdtempSync(join(tmpdir(), 'folio-')));
  const win = await app.firstWindow();
  await win.fill('#email', email);
  await win.fill('#password', 'not the password');
  await win.click('button[type="submit"]');
  await expect(win.getByRole('alert')).toHaveText('The email or password is not right.');
  await app.close();
});

test('the session survives a restart and ends on log out', async () => {
  const { email } = await account();
  const dir = mkdtempSync(join(tmpdir(), 'folio-'));
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
  const app = await launch(mkdtempSync(join(tmpdir(), 'folio-')));
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
