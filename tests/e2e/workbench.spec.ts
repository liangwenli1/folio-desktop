// The workbench as people use it: proxies and profiles made in the UI, live sync between two computers,
// bulk actions with the Trash, imports, and the one-click fixes of the consistency check.
import { expect, test, type Page } from '@playwright/test';
import { startSocks5 } from '../fixtures/proxies';
import { account, choose, chromiumProfile, dataDir, ENGINE_ENV, hasKernels, inBrowser, launch, logIn, startProbe } from './helpers';

test.setTimeout(120_000);
const STUDIO = { plan: 'studio', period: 'monthly' };
const seattle = { country: 'US', countryName: 'United States', region: 'Washington', city: 'Seattle', lat: 47.6, lon: -122.3, timezone: 'America/Los_Angeles', locale: 'en-US' };
const row = (win: Page, name: string) => win.locator('tr[data-id]', { has: win.getByRole('button', { name, exact: true }) });
const detail = (win: Page) => win.getByRole('complementary', { name: 'Profile' });

test('a first profile behind a SOCKS5 proxy with a password, set up and opened from the getting-started steps', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  test.setTimeout(240_000);
  const socks = await startSocks5('alice', 's3cret');
  const probe = await startProbe();
  const acct = await account({ buy: STUDIO });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  const steps = win.getByTestId('onboarding');

  await steps.getByRole('button', { name: 'Add a proxy' }).click();
  const proxyForm = win.getByRole('dialog', { name: 'Add proxy' });
  await proxyForm.getByLabel('Host').fill('127.0.0.1');
  await proxyForm.getByLabel('Port').fill(String(socks.port));
  await proxyForm.getByLabel('Username').fill('alice');
  await proxyForm.getByLabel('Password').fill('s3cret');
  await proxyForm.getByRole('button', { name: 'Save' }).click();
  await expect(steps.locator('[data-step="proxy"]')).toHaveClass(/done/);

  await steps.getByRole('button', { name: 'Create a profile' }).click();
  const form = win.getByRole('dialog', { name: 'New profile' });
  await form.getByLabel('Name', { exact: true }).fill('US-Store-01');
  await choose(form.getByLabel('Proxy'), { index: 1 });
  await expect(form.getByTestId('fingerprint')).toContainText('Chromium 150');
  await form.getByRole('button', { name: 'Create profile' }).click();

  // The proxy check (started when the proxy was saved) puts the exit in the row and on the card.
  const r = row(win, 'US-Store-01');
  await expect(r).toContainText('Seattle', { timeout: 20_000 });
  await r.getByRole('button', { name: 'US-Store-01', exact: true }).click();
  await expect(detail(win).getByTestId('verdict')).toHaveText('All consistent');

  await detail(win).getByRole('button', { name: 'Open profile' }).click();
  await expect(r.locator('.run')).toBeVisible({ timeout: 90_000 });
  const seen = await inBrowser(app, (await r.getAttribute('data-id'))!, probe.url);
  expect(seen).toMatchObject({ tz: 'America/Los_Angeles', lang: 'en-US', webdriver: false, rtc: [] });
  expect(socks.seen.some(d => d.endsWith(`:${probe.port}`))).toBe(true);

  await detail(win).getByRole('button', { name: /^Stop/ }).click();
  await expect(detail(win).getByRole('button', { name: 'Open profile' })).toBeVisible();
  await expect(steps).toBeHidden();
  await app.close(); await socks.close(); await probe.close();
});

test('an edit on one computer shows up on the other within seconds', async () => {
  const acct = await account({ buy: STUDIO });
  await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: chromiumProfile('Shared-01') });
  const a = await launch(dataDir()), b = await launch(dataDir());
  const [winA, winB] = await Promise.all([logIn(a, acct.email), logIn(b, acct.email)]);
  const edit = async (win: Page, name: string) => {
    await row(win, name).getByRole('button', { name, exact: true }).click();
    await detail(win).getByRole('button', { name: 'Edit' }).click();
    return win.getByRole('dialog', { name: 'Edit profile' });
  };
  // B starts editing first, then A saves a change.
  const formB = await edit(winB, 'Shared-01');
  const formA = await edit(winA, 'Shared-01');
  await formA.getByLabel('Name', { exact: true }).fill('Shared-01 renamed');
  await formA.getByLabel('Tags').fill('vip');
  await formA.getByRole('button', { name: 'Save changes' }).click();
  await expect(row(winB, 'Shared-01 renamed')).toContainText('vip', { timeout: 5000 });

  // B's save would undo A's rename without knowing: it is refused once, then replaces it on purpose.
  await formB.getByLabel('Notes').fill('from B');
  await formB.getByRole('button', { name: 'Save changes' }).click();
  await expect(formB.getByRole('alert')).toContainText('Someone changed this profile while you were editing');
  await formB.getByRole('button', { name: 'Save changes' }).click();
  await expect(formB).toBeHidden();
  await expect(row(winA, 'Shared-01')).toBeVisible({ timeout: 5000 });

  await winB.keyboard.press('Escape');
  await winB.getByRole('button', { name: 'New group' }).click();
  await winB.getByLabel('Group name').fill('EU stores');
  await winB.getByLabel('Group name').press('Enter');
  await expect(winA.locator('.groups')).toContainText('EU stores', { timeout: 5000 });
  await Promise.all([a.close(), b.close()]);
});

test('bulk actions, undoing a move to the Trash, and restoring only within the plan', async () => {
  const acct = await account(); // Free: 5 profiles
  const base = `/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/groups`, { data: { name: 'US stores' } });
  await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: ['P-1', 'P-2', 'P-3'].map(n => chromiumProfile(n)) } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await win.getByRole('checkbox', { name: 'Select P-1' }).check();
  await win.getByRole('checkbox', { name: 'Select P-2' }).check();
  const bulk = win.getByTestId('bulk');
  await choose(bulk.getByRole('combobox', { name: 'Move to group…' }), 'US stores');
  await expect(row(win, 'P-1')).toContainText('US stores');
  await expect(row(win, 'P-2')).toContainText('US stores');
  await bulk.getByRole('button', { name: 'Tag' }).click();
  await bulk.getByRole('textbox', { name: 'Tag name' }).fill('vip');
  await bulk.getByRole('button', { name: 'Add tag' }).click();
  await expect(row(win, 'P-2').locator('.tag')).toHaveText('vip');

  await bulk.getByRole('button', { name: 'Delete' }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(row(win, 'P-1')).toBeHidden();
  await win.getByRole('status').filter({ hasText: '2 profiles moved to Trash' }).getByRole('button', { name: 'Undo' }).click();
  await expect(row(win, 'P-1')).toBeVisible();

  await win.getByRole('checkbox', { name: 'Select P-1' }).check();
  await win.getByTestId('bulk').getByRole('button', { name: 'Delete' }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await win.getByRole('button', { name: /^Trash/ }).click();
  await expect(row(win, 'P-1').or(win.locator('tr[data-id]', { hasText: 'P-1' }))).toBeVisible();

  // Fill the plan (2 active + 3 = 5 of 5): restoring no longer fits.
  await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: ['P-4', 'P-5', 'P-6'].map(n => chromiumProfile(n)) } });
  const trashed = win.locator('tr[data-id]', { hasText: 'P-1' });
  await trashed.getByRole('button', { name: 'Restore' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'no room for more profiles' })).toBeVisible();
  await trashed.getByRole('button', { name: 'Delete forever' }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Delete forever' }).click();
  await expect(win.getByText('The Trash is empty.')).toBeVisible();
  await app.close();
});

test('proxy lists and spreadsheets import, reusing proxies that are already saved', async () => {
  const acct = await account({ buy: STUDIO });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await win.getByRole('button', { name: /^Proxies/ }).click();
  await win.getByRole('button', { name: 'Import', exact: true }).click();
  const pi = win.getByRole('dialog', { name: 'Import proxies' });
  await pi.getByRole('textbox').fill('socks5://a:b@one.example.net:1080\ntwo.example.net:8080\nnot a proxy');
  await pi.getByRole('button', { name: 'Import' }).click();
  await expect(pi.getByRole('status')).toContainText('2 proxies added');
  await expect(pi.getByRole('status')).toContainText('Line 3');
  await pi.getByRole('button', { name: 'Close' }).first().click();
  // Proxies show as cards first.
  await expect(win.locator('li.pxc[data-id]')).toHaveCount(2);

  await win.getByRole('button', { name: /^Profiles/ }).click();
  await win.getByRole('button', { name: 'Import', exact: true }).click();
  const ci = win.getByRole('dialog', { name: 'Import profiles' });
  const csv = ci.getByRole('textbox', { name: 'CSV' });
  await csv.fill('name,os\n,windows\nB,xp');
  await expect(ci.getByRole('status')).toContainText('Row 2');
  await expect(ci.getByRole('status')).toContainText('Row 3');
  await csv.fill('name,group,tags,os,proxy\nCSV-01,Imported,a|b,macos,socks5://a:b@one.example.net:1080\nCSV-02,Imported,,windows,');
  await ci.getByRole('button', { name: 'Import 2 profiles' }).click();
  await expect(row(win, 'CSV-01')).toContainText('Imported');
  await expect(row(win, 'CSV-01')).toContainText('macOS');
  await expect(win.locator('.groups')).toContainText('Imported');
  await expect(win.getByRole('button', { name: /^Proxies/ })).toContainText('2');
  await app.close();
});

test('the consistency check fixes a hand-set time zone and moves a dead line to its backup', async () => {
  const acct = await account({ buy: STUDIO });
  const base = `/workspaces/${acct.workspaceId}`;
  const proxy = async (host: string, check: object) => {
    const p = await (await acct.api.post(`${base}/proxies`, { data: { type: 'socks5', host, port: 1080 } })).json();
    await acct.api.post(`/proxies/${p.id}/check`, { data: check });
    return p.id as string;
  };
  const spare = await proxy('spare.example.net', { ok: true, ms: 210, ip: '172.58.1.2', geo: seattle, error: null });
  const main = await proxy('main.example.net', { ok: false, ms: null, ip: null, geo: null, error: 'timeout' });
  await acct.api.patch(`/proxies/${main}`, { data: { backupId: spare } });
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Fix-Me', { proxyId: main, timezoneOverride: 'Asia/Shanghai' }) });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await row(win, 'Fix-Me').getByRole('button', { name: 'Fix-Me', exact: true }).click();
  const card = detail(win);
  await expect(card.getByTestId('verdict')).toHaveText('Needs a look');
  await expect(card.locator('[data-check="proxy-backup"]')).toBeVisible();
  await card.locator('[data-check="tz-mismatch"]').getByRole('button', { name: 'Follow the proxy' }).click();
  await expect(card.locator('[data-check="tz-ok"]')).toContainText('America/Los_Angeles');
  await card.locator('[data-check="proxy-backup"]').getByRole('button', { name: 'Make the backup the main line' }).click();
  await expect(card.locator('[data-check="proxy-ok"]')).toContainText('spare.example.net');
  await expect(card.getByTestId('verdict')).toHaveText('All consistent');
  await app.close();
});

test('the list switches to cards and stays that way; profiles opened together show their progress in a tray', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account({ buy: STUDIO });
  for (const n of ['Tray-1', 'Tray-2']) await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: chromiumProfile(n) });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  const views = win.getByRole('group', { name: 'View' });
  await views.getByRole('button', { name: 'Cards' }).click();
  await expect(win.locator('li.pcard')).toHaveCount(2);
  await win.reload();
  await expect(win.locator('li.pcard')).toHaveCount(2);
  await views.getByRole('button', { name: 'List' }).click();

  for (const n of ['Tray-1', 'Tray-2']) await win.getByRole('checkbox', { name: `Select ${n}` }).check();
  await win.getByTestId('bulk').getByRole('button', { name: 'Open' }).click();
  const tray = win.getByRole('status', { name: 'Opening 2 profiles' });
  await expect(tray.locator('li')).toHaveCount(2);
  await expect(tray).toContainText('2 of 2 done', { timeout: 90_000 });
  await expect(tray.locator('li.run')).toHaveCount(2);
  // Everything opened: the tray goes by itself.
  await expect(tray).toBeHidden({ timeout: 10_000 });
  await app.close();
});
