// Scheduled tasks and sign-in checks: running on time on their computer, recording times missed while it was off,
// staying in the background when the window closes, and telling the person when a profile is signed out.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { ENGINE_ENV, account, chromiumProfile, dataDir, hasKernels, launch, logIn } from './helpers';

test.setTimeout(420_000);
const DAY = 86_400_000;
const nav = (win: Page, name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });

// An account page: profile 0001 is signed in (it has an avatar), the others are not.
async function startSite(){
  let visits = 0;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url!, 'http://x').searchParams.get('p');
    res.setHeader('content-type', 'text/html');
    if (req.url!.startsWith('/account')) visits++;
    res.end(p === '0001' || !p ? '<title>Account</title><img id="avatar" alt="me"><p id="hello">Hello</p>' : '<title>Log in</title><button>Log in</button>');
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}/`, visits: () => visits, close: () => new Promise<void>(r => server.close(() => r())) };
}
// The app as if the clock read `at`.
const launchAt = (dir: string, at: number) => launch(dir, { ...ENGINE_ENV, FOLIO_TEST_CLOCK_OFFSET_MS: String(at - Date.now()) });
const windows = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.isVisible()));

test('a daily task runs on time on its computer; times missed while Folio was closed are recorded and can be run', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const site = await startSite();
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-01') });
  await acct.api.post(`${base}/flows`, { data: { name: 'Look', steps: [
    { type: 'open', url: `${site.url}account` }, { type: 'extract', selector: '#hello', attribute: null, variable: 'hello' }
  ] } });
  const dir = dataDir();
  const at = Math.ceil(Date.now() / 60_000) * 60_000 + 3 * 60_000;
  const hhmm = new Date(at).toTimeString().slice(0, 5);

  let app = await launch(dir, ENGINE_ENV);
  let win = await logIn(app, acct.email);
  await nav(win, 'Scheduled tasks').click();
  await win.getByRole('button', { name: 'New task' }).click();
  const form = win.getByRole('dialog', { name: 'New task' });
  await form.getByLabel('Name').fill('Daily look');
  await form.getByLabel('Select all shown').check();
  await form.getByRole('group', { name: 'When it runs' }).getByRole('button', { name: 'Daily' }).click();
  await form.getByLabel('Time', { exact: true }).fill(hhmm);
  for (const day of ['Sat', 'Sun']) await form.getByRole('group', { name: 'Days' }).getByRole('button', { name: day }).click();
  await expect(form.getByText('It runs on this computer, at this computer’s time.')).toBeVisible();
  await form.getByRole('button', { name: 'Create task' }).click();
  await expect(win.getByRole('heading', { name: 'Daily look' })).toBeVisible();
  await expect(win.locator('.ttl .sub')).toContainText(`Every day ${hhmm}`);
  // Startup at login is a Windows and macOS setting; this Linux machine doesn't offer it.
  await win.locator('.me').click();
  await expect(win.getByRole('switch', { name: 'Start with this computer' })).toHaveCount(0);
  await app.close();

  // Ten seconds before its time: the next check runs it.
  app = await launchAt(dir, at - 10_000);
  win = await app.firstWindow();
  await nav(win, 'Scheduled tasks').click();
  await expect(win.locator('tr[data-task="Daily look"]')).toContainText('Finished', { timeout: 120_000 });
  await win.getByRole('button', { name: 'Daily look', exact: true }).click();
  const runs = () => win.getByRole('region', { name: 'Runs' }).locator('li');
  await expect(runs()).toHaveCount(1);
  await expect(runs().first()).toContainText('Scheduled');
  await expect(win.locator('tr[data-item="Shop-01"]')).toContainText('Hello');

  // With a schedule on this computer, closing the window leaves Folio running.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  expect(await windows(app)).toEqual([false]);
  await app.close();

  // Two days later: both times passed while Folio was closed. They are recorded, not run late.
  app = await launchAt(dir, at + 2 * DAY + 3_600_000);
  win = await app.firstWindow();
  await nav(win, 'Scheduled tasks').click();
  await win.getByRole('button', { name: 'Daily look', exact: true }).click();
  await expect(runs()).toHaveCount(3, { timeout: 60_000 });
  await expect(runs().filter({ hasText: 'Missed' })).toHaveCount(2);
  expect(site.visits()).toBe(1);
  await runs().filter({ hasText: 'Missed' }).first().getByRole('button').click();
  const note = win.getByRole('region', { name: 'Run results' }).locator('.away-note');
  await expect(note).toContainText('Nothing ran at');
  await note.getByRole('button', { name: 'Run it now' }).click();
  await expect(runs()).toHaveCount(4);
  await expect(win.getByRole('region', { name: 'Run results' }).locator('.run-sum')).toContainText('Finished', { timeout: 120_000 });
  expect(site.visits()).toBe(2);
  await app.close();
  await site.close();
});

test('a sign-in check that finds a profile signed out sends a notification that opens the run, and is not retried', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const site = await startSite();
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${acct.workspaceId}`;
  for (const name of ['Shop-01', 'Shop-02']) await acct.api.post(`${base}/profiles`, { data: chromiumProfile(name) });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);

  // The flow, from the template.
  await nav(win, 'Flows').click();
  await win.getByRole('button', { name: 'Sign-in check template' }).click();
  await expect(win.getByLabel('Flow name')).toHaveValue('Sign-in check');
  // The template's step is the one the panel shows.
  const check = win.getByRole('region', { name: 'Step settings' });
  await check.getByLabel('Address').fill(`${site.url}account?p={{profile.number}}`);
  await check.getByLabel('Element', { exact: true }).fill('#avatar');
  await win.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Flow saved' })).toBeVisible();
  const flow = (await (await acct.api.get(`${base}/flows`)).json()).flows[0];
  const ids = (await (await acct.api.get(`${base}/profiles`)).json()).profiles.map((p: { id: string }) => p.id);
  await acct.api.post(`${base}/tasks`, { data: { name: 'Morning sign-in check', flowId: flow.id, profileIds: ids, concurrency: 2, retries: 1, timeoutMin: 5 } });

  // Notifications are recorded instead of shown.
  await win.evaluate(() => {
    const w = window as unknown as { notes: { title: string; body: string; onclick?: () => void }[]; Notification: unknown };
    w.notes = [];
    w.Notification = class { onclick?: () => void; constructor(title: string, o: { body: string }){ w.notes.push(Object.assign(this, { title, body: o.body })); } };
  });
  await nav(win, 'Scheduled tasks').click();
  await win.getByRole('button', { name: 'Run Morning sign-in check' }).click();
  await expect(win.locator('tr[data-task="Morning sign-in check"]')).toContainText('1 done · 1 signed out', { timeout: 120_000 });
  const notes = await win.evaluate(() => (window as unknown as { notes: { title: string; body: string }[] }).notes.map(n => ({ title: n.title, body: n.body })));
  expect(notes).toEqual([{ title: 'Shop-02 is signed out', body: 'Morning sign-in check: Shop-02' }]);
  expect(site.visits()).toBe(2);

  // Clicking it opens the run, where the profile shows as signed out after one try.
  await nav(win, 'Flows').click();
  await win.evaluate(() => (window as unknown as { notes: { onclick: () => void }[] }).notes[0].onclick());
  await expect(win.getByRole('heading', { name: 'Morning sign-in check' })).toBeVisible();
  const row = win.locator('tr[data-item="Shop-02"]');
  await expect(row).toContainText('Signed out');
  await expect(row.locator('td').nth(2)).toHaveText('1');
  await app.close();
  await site.close();
});
