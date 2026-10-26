// The workbench as people use it: proxies and profiles made in the UI, live sync between two computers,
// bulk actions with the Trash, imports, and the one-click fixes of the consistency check.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { startSocks5 } from '../fixtures/proxies';
import { account, choose, chromiumProfile, dataDir, ENGINE_ENV, hasKernels, inBrowser, launch, logIn, startProbe, detail } from './helpers';

test.setTimeout(120_000);
const STUDIO = { plan: 'studio', period: 'monthly' };
const seattle = { country: 'US', countryName: 'United States', region: 'Washington', city: 'Seattle', lat: 47.6, lon: -122.3, timezone: 'America/Los_Angeles', locale: 'en-US' };
const row = (win: Page, name: string) => win.locator('tr[data-id]', { has: win.getByRole('button', { name, exact: true }) });

test('a first profile behind a SOCKS5 proxy with a password, set up and opened from the workbench', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  test.setTimeout(240_000);
  const socks = await startSocks5('alice', 's3cret');
  const probe = await startProbe();
  const acct = await account({ buy: STUDIO });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  const nav = (name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

  await nav('Proxies');
  await win.getByRole('button', { name: 'Add proxy' }).click();
  const proxyForm = win.getByRole('dialog', { name: 'Add proxy' });
  await proxyForm.getByLabel('Host').fill('127.0.0.1');
  await proxyForm.getByLabel('Port').fill(String(socks.port));
  await proxyForm.getByRole('switch', { name: 'Authentication' }).check();
  await proxyForm.getByLabel('Username').fill('alice');
  await proxyForm.getByLabel('Password').fill('s3cret');
  // Checked before it is saved: where it comes out and how fast.
  await proxyForm.getByRole('button', { name: 'Test connection' }).click();
  await expect(proxyForm.getByTestId('proxy-test')).toContainText('Connected', { timeout: 20_000 });
  await expect(proxyForm.getByTestId('proxy-test')).toContainText('127.0.0.1');
  await proxyForm.getByRole('button', { name: 'Save proxy' }).click();
  await expect(proxyForm).toBeHidden();

  await nav('Profiles');
  await win.getByRole('button', { name: 'New profile' }).click();
  const form = win.getByRole('dialog', { name: 'New profile' });
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('US-Store-01');
  await choose(form.getByRole('combobox', { name: 'Choose a proxy' }), { index: 0 });
  await expect(form.getByRole('combobox', { name: 'Browser engine' })).toContainText('Chromium 150');
  await form.getByRole('button', { name: 'Create profile' }).click();

  // The proxy check (started when the proxy was saved) puts the exit in the row and on the card.
  const r = row(win, 'US-Store-01');
  await expect(r).toContainText('US 127.0.0.1', { timeout: 20_000 });
  const id = (await r.getAttribute('data-id'))!;
  await r.getByRole('button', { name: 'US-Store-01', exact: true }).click();
  await detail(win).getByRole('tab', { name: 'Fingerprint' }).click();
  await expect(detail(win).getByTestId('verdict')).toHaveText('All consistent');

  await detail(win).getByRole('button', { name: 'Open profile' }).click();
  await expect(detail(win).locator('.pd-head .dot-st.run')).toBeVisible({ timeout: 90_000 });
  const seen = await inBrowser(app, id, probe.url);
  expect(seen).toMatchObject({ tz: 'America/Los_Angeles', lang: 'en-US', webdriver: false, rtc: [] });
  expect(socks.seen.some(d => d.endsWith(`:${probe.port}`))).toBe(true);

  await detail(win).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(detail(win).getByRole('button', { name: 'Open profile' })).toBeVisible();
  await app.close(); await socks.close(); await probe.close();
});

test('an edit on one computer shows up on the other within seconds', async () => {
  const acct = await account({ buy: STUDIO });
  await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: chromiumProfile('Shared-01') });
  const a = await launch(dataDir()), b = await launch(dataDir());
  const [winA, winB] = await Promise.all([logIn(a, acct.email), logIn(b, acct.email)]);
  const edit = async (win: Page, name: string) => {
    await row(win, name).getByRole('button', { name, exact: true }).click();
    await detail(win).getByRole('button', { name: 'Edit profile' }).click();
    return win.getByRole('dialog', { name: 'Edit profile' });
  };
  // B starts editing first, then A saves a change.
  const formB = await edit(winB, 'Shared-01');
  const formA = await edit(winA, 'Shared-01');
  await formA.getByRole('textbox', { name: 'Name', exact: true }).fill('Shared-01 renamed');
  await formA.getByLabel('Tags').fill('vip');
  await formA.getByRole('button', { name: 'Save changes' }).click();
  // B has the profile's page open behind its form: the page follows.
  await expect(detail(winB).getByTestId('detail-name')).toHaveText('Shared-01 renamed', { timeout: 5000 });
  await expect(detail(winB).getByRole('region', { name: 'Basics' })).toContainText('vip');

  // B's save would undo A's rename without knowing: it is refused once, then replaces it on purpose.
  await formB.getByLabel('Notes').fill('from B');
  await formB.getByRole('button', { name: 'Save changes' }).click();
  await expect(formB.getByRole('alert')).toContainText('Someone changed this profile while you were editing');
  await formB.getByRole('button', { name: 'Save changes' }).click();
  await expect(formB).toBeHidden();
  await expect(detail(winA).getByTestId('detail-name')).toHaveText('Shared-01', { timeout: 5000 });

  await winB.keyboard.press('Escape');
  await winB.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Groups' }).click();
  await winB.getByRole('button', { name: 'New group' }).click();
  const newGroup = winB.getByRole('dialog', { name: 'New group' });
  await newGroup.getByRole('textbox', { name: /^Group name/ }).fill('EU stores');
  await newGroup.getByRole('button', { name: 'Create group' }).click();
  await winA.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Groups' }).click();
  await expect(winA.getByRole('tree', { name: 'Group list' })).toContainText('EU stores', { timeout: 5000 });
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
  const groups = win.getByRole('combobox', { name: 'Groups' });
  await choose(groups, 'US stores');
  await expect(win.locator('tr[data-id]')).toHaveText([/P-1/, /P-2/]);
  await choose(groups, 'All groups');
  await choose(bulk.getByRole('combobox', { name: 'More' }), 'Tag');
  await bulk.getByRole('textbox', { name: 'Tag name' }).fill('vip');
  await bulk.getByRole('button', { name: 'Add tag' }).click();
  await expect(row(win, 'P-2').locator('.tag')).toHaveText('vip');

  await choose(bulk.getByRole('combobox', { name: 'More' }), 'Delete');
  await win.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(row(win, 'P-1')).toBeHidden();
  await win.getByRole('status').filter({ hasText: '2 profiles moved to Trash' }).getByRole('button', { name: 'Undo' }).click();
  await expect(row(win, 'P-1')).toBeVisible();

  await win.getByRole('checkbox', { name: 'Select P-1' }).check();
  await choose(win.getByTestId('bulk').getByRole('combobox', { name: 'More' }), 'Delete');
  await win.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await win.getByRole('button', { name: /^Trash/ }).click();
  await expect(row(win, 'P-1').or(win.locator('tr[data-id]', { hasText: 'P-1' }))).toBeVisible();

  // Fill the plan (2 active + 3 = 5 of 5): restoring no longer fits.
  await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: ['P-4', 'P-5', 'P-6'].map(n => chromiumProfile(n)) } });
  const trashed = win.locator('tr[data-id]', { hasText: 'P-1' });
  await trashed.getByRole('button', { name: 'Restore' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'no room for more profiles' })).toBeVisible();
  await trashed.getByRole('button', { name: 'Delete forever' }).click();
  // Deleting for good asks for the profile's name.
  const purge = win.getByRole('dialog', { name: 'Delete 1 profile forever?' });
  await expect(purge.getByRole('button', { name: 'Delete forever' })).toBeDisabled();
  await purge.getByRole('textbox', { name: 'Type P-1 to confirm' }).fill('P-1');
  await purge.getByRole('button', { name: 'Delete forever' }).click();
  await expect(win.getByText('The Trash is empty')).toBeVisible();
  await app.close();
});

test('proxy lists and spreadsheets import, reusing proxies that are already saved', async () => {
  const acct = await account({ buy: STUDIO });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await win.getByRole('button', { name: /^Proxies/ }).click();
  await win.getByRole('button', { name: 'Import', exact: true }).click();
  const pi = win.getByRole('dialog', { name: 'Import proxies' });
  await pi.getByRole('textbox', { name: /^Proxy list/ }).fill('socks5://a:b@one.example.net:1080\ntwo.example.net:8080\nnot a proxy\n198.51.100.20:abc');
  // Every line is read first: what it is, or why it isn't one.
  await expect(pi.getByTestId('import-counts')).toHaveText('4 lines · 2 valid · 2 invalid');
  await expect(pi.locator('tr[data-line="3"]')).toContainText('Not a proxy line');
  await expect(pi.locator('tr[data-line="4"]')).toContainText('Port must be 1–65535');
  await pi.getByRole('textbox', { name: 'Naming' }).fill('Ops-{n}');
  await pi.getByRole('button', { name: 'Import 2 proxies' }).click();
  // Lines that couldn't be read make it a partly failed job, which the task center explains.
  await expect(win.getByRole('status').filter({ hasText: 'Import proxies: 2 done, 2 failed' })).toBeVisible();
  await expect(pi).toBeHidden();
  // Proxies show as a table first, named from the pattern.
  await expect(win.locator('tr[data-id]')).toHaveCount(2);
  await expect(win.locator('tr[data-id]')).toHaveText([/Ops-1/, /Ops-2/]);

  await win.getByRole('button', { name: /^Profiles/ }).click();
  await win.getByRole('button', { name: 'Import', exact: true }).click();
  const ci = win.getByRole('dialog', { name: 'Import profiles' });
  const csv = ci.getByRole('textbox', { name: 'CSV' });
  await csv.fill('name,os\n,windows\nB,xp');
  await expect(ci.getByRole('status')).toContainText('Row 2');
  await expect(ci.getByRole('status')).toContainText('Row 3');
  await csv.fill('name,group,tags,os,proxy\nCSV-01,Imported,a|b,macos,socks5://a:b@one.example.net:1080\nCSV-02,Imported,,windows,');
  await ci.getByRole('button', { name: 'Import 2 profiles' }).click();
  await expect(row(win, 'CSV-01')).toContainText('macOS');
  await choose(win.getByRole('combobox', { name: 'Groups' }), 'Imported');
  await expect(win.locator('tr[data-id]')).toHaveText([/CSV-0/, /CSV-0/]);
  // A group's colour, picked in its settings on the Groups page.
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Groups' }).click();
  await win.getByRole('tree', { name: 'Group list' }).getByRole('button', { name: /^Imported/ }).click();
  const settings = win.getByRole('complementary', { name: 'Group settings' });
  await settings.getByRole('button', { name: 'Teal' }).click();
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(win.locator('[data-group="Imported"] .gt-ic')).toHaveClass(/gc-teal/);
  expect((await (await acct.api.get(`/workspaces/${acct.workspaceId}/proxies`)).json()).proxies).toHaveLength(2);
  await app.close();
});

test('a proxy’s details show its checks and the profiles on it, which open in the profile list', async () => {
  const acct = await account({ buy: STUDIO });
  const base = `/workspaces/${acct.workspaceId}`;
  const add = async (name: string, check: object) => {
    const p = await (await acct.api.post(`${base}/proxies`, { data: { name, type: 'socks5', host: `${name.toLowerCase()}.example.net`, port: 1080 } })).json();
    await acct.api.post(`/proxies/${p.id}/check`, { data: check });
    return p.id as string;
  };
  const us = await add('US-Line', { ok: true, ms: 120, ip: '203.0.113.7', geo: seattle, error: null });
  await add('Dead-Line', { ok: false, ms: null, ip: null, geo: null, error: 'timeout' });
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('On-US', { proxyId: us }) });
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Direct') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Proxies' }).click();

  const rows = win.locator('tr[data-id]');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'US-Line' }).locator('.lat')).toHaveClass(/good/);
  await win.getByRole('button', { name: /^Unused/ }).click();
  await expect(rows).toHaveText([/Dead-Line/]);
  await choose(win.getByRole('combobox', { name: 'Status' }), 'All statuses');
  await choose(win.getByRole('combobox', { name: 'Region' }), 'United States');
  await expect(rows).toHaveText([/US-Line/]);

  // A quick look beside the list, then the proxy's own page.
  await rows.getByRole('button', { name: 'US-Line', exact: true }).click();
  const panel = win.getByRole('complementary', { name: 'Proxy', exact: true });
  await expect(panel.getByTestId('check-log')).toContainText('Answered · 120 ms');
  await expect(panel).toContainText('On-US');
  await panel.getByRole('button', { name: 'View details' }).click();
  const page = win.getByRole('main', { name: 'Proxy', exact: true });
  await expect(page.locator('.dstats')).toContainText('203.0.113.7');
  await expect(page.locator('.dstats')).toContainText('Seattle');
  await page.getByRole('tab', { name: /^Profiles/ }).click();
  await page.getByRole('button', { name: 'On-US', exact: true }).click();
  // The profile list shows only the profiles on that line, with the one picked open.
  await expect(detail(win).getByTestId('detail-name')).toHaveText('On-US');
  await win.keyboard.press('Escape');
  await expect(win.locator('tr[data-id]')).toHaveText([/On-US/]);
  await win.getByRole('button', { name: 'Show all profiles' }).click();
  await expect(win.locator('tr[data-id]')).toHaveCount(2);
  await app.close();
});

test('fingerprint choices when creating a profile; filters by engine; a profile moved to a group from its menu', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  test.setTimeout(180_000);
  const acct = await account({ buy: STUDIO });
  const base = `/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/groups`, { data: { name: 'EU shops', color: 'teal' } });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  const create = async (name: string, pick: (form: Locator) => Promise<void>) => {
    await win.getByRole('button', { name: 'New profile' }).click();
    const form = win.getByRole('dialog', { name: 'New profile' });
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await pick(form);
    await expect(form.getByRole('button', { name: 'Create profile' })).toBeEnabled({ timeout: 60_000 });
    await form.getByRole('button', { name: 'Create profile' }).click();
    await expect(form).toBeHidden();
  };
  const saved = async (name: string) => ((await (await acct.api.get(`${base}/profiles`)).json()).profiles as { name: string; fingerprint: Record<string, unknown> }[]).find(p => p.name === name)!.fingerprint;

  // Chromium: the screen is this computer's; Canvas and the GPU can show this computer's own values.
  await create('Real-GPU', async form => {
    await form.getByRole('button', { name: 'Edit fingerprint' }).click();
    await expect(form.getByRole('combobox', { name: 'Screen resolution' })).toBeDisabled();
    await choose(form.getByRole('combobox', { name: 'Canvas' }), 'This computer’s');
    await choose(form.getByRole('combobox', { name: 'WebGL' }), 'This computer’s GPU');
  });
  expect(await saved('Real-GPU')).toMatchObject({ kind: 'chromium', canvas: 'real', webgl: 'real' });
  await row(win, 'Real-GPU').getByRole('button', { name: 'Real-GPU', exact: true }).click();
  await expect(detail(win).getByRole('region', { name: 'Fingerprint summary' })).toContainText('This computer’s GPU');
  await detail(win).getByRole('tab', { name: 'Fingerprint' }).click();
  await expect(detail(win).locator('[data-check="fp-real"]')).toContainText('Canvas and WebGL show this computer’s own values');
  await win.keyboard.press('Escape');

  // Firefox: an exact screen, and WebRTC off.
  await create('FF-1080', async form => {
    await choose(form.getByRole('combobox', { name: 'Browser engine' }), /^Firefox/);
    await form.getByRole('button', { name: 'Edit fingerprint' }).click();
    await choose(form.getByRole('combobox', { name: 'Screen resolution' }), '1920 × 1080');
    await choose(form.getByRole('combobox', { name: 'WebRTC' }), 'Off');
    await expect(form.getByTestId('fingerprint')).toContainText('1920 × 1080', { timeout: 60_000 });
  });
  const ff = await saved('FF-1080');
  expect(ff).toMatchObject({ kind: 'firefox', webrtc: 'block' });
  expect((ff.config as Record<string, number>)['screen.width']).toBe(1920);

  await choose(win.getByRole('combobox', { name: 'Engine', exact: true }), 'Firefox 156');
  await expect(win.locator('tr[data-id]')).toHaveText([/FF-1080/]);
  await choose(win.getByRole('combobox', { name: 'Engine', exact: true }), 'All engines');

  await row(win, 'Real-GPU').getByRole('button', { name: 'Actions for Real-GPU' }).click();
  await win.getByRole('menuitem', { name: 'Move to group' }).click();
  await win.getByRole('dialog', { name: 'Move “Real-GPU” to a group' }).getByRole('button', { name: 'EU shops' }).click();
  await expect(row(win, 'Real-GPU').locator('.gtag')).toHaveText('EU shops');
  await expect(row(win, 'Real-GPU').locator('.gtag')).toHaveClass(/gc-teal/);
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
  await card.getByRole('tab', { name: 'Fingerprint' }).click();
  await expect(card.getByTestId('verdict')).toHaveText('Needs a look');
  await expect(card.locator('[data-check="proxy-backup"]')).toBeVisible();
  await card.locator('[data-check="tz-mismatch"]').getByRole('button', { name: 'Follow the proxy' }).click();
  await expect(card.locator('[data-check="tz-ok"]')).toBeVisible();
  await expect(card.getByRole('region', { name: 'Saved configuration' })).toContainText('America/Los_Angeles');
  await card.locator('[data-check="proxy-backup"]').getByRole('button', { name: 'Make the backup the main line' }).click();
  await expect(card.locator('[data-check="proxy-ok"]')).toBeVisible();
  await card.getByRole('tab', { name: 'Overview' }).click();
  await expect(card.getByRole('region', { name: 'Proxy connection' })).toContainText('spare.example.net');
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
