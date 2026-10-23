// What can link profiles, favourites, and the health check run inside a profile's browser.
import { expect, test } from '@playwright/test';
import { startSocks5 } from '../fixtures/proxies';
import { ENGINE_ENV, account, chromiumProfile, dataDir, hasKernels, launch, logIn } from './helpers';

test.setTimeout(180_000);
const STUDIO = { plan: 'studio', period: 'monthly' };

test('profiles sharing a proxy are flagged and can be shown together; favourites come first', async () => {
  const acct = await account({ buy: STUDIO });
  const base = `/workspaces/${acct.workspaceId}`;
  const proxy = (await (await acct.api.post(`${base}/proxies`, { data: { name: 'Shared line', type: 'http', host: '10.1.1.1', port: 8080 } })).json()).id;
  for (const n of ['Alpha', 'Bravo']) await acct.api.post(`${base}/profiles`, { data: chromiumProfile(n, { proxyId: proxy }) });
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Charlie') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  const bar = win.getByTestId('risks');
  await expect(bar).toContainText('1 thing could link your profiles');
  await bar.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(bar.locator('[data-risk="same-proxy"]')).toContainText('2 profiles share the proxy Shared line');
  await bar.locator('[data-risk="same-proxy"]').getByRole('button', { name: 'Show these profiles' }).click();
  await expect(win.locator('tr[data-id]')).toHaveCount(2);
  await win.getByRole('button', { name: 'Show all profiles' }).click();
  await expect(win.locator('tr[data-id]')).toHaveCount(3);
  const row = (name: string) => win.locator('tr[data-id]', { has: win.getByRole('button', { name, exact: true }) });
  await win.getByRole('button', { name: 'Alpha', exact: true }).click();
  await expect(win.getByRole('complementary', { name: 'Profile' }).locator('[data-risk="same-proxy"]')).toContainText('Bravo');
  await win.keyboard.press('Escape');

  // A favourite goes to the top, and has a filter of its own.
  await row('Charlie').hover();
  await row('Charlie').getByRole('button', { name: 'Add to favourites' }).click();
  await expect(win.locator('tr[data-id]').first()).toContainText('Charlie');
  await win.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Favourites' }).click();
  await expect(win.locator('tr[data-id]')).toHaveCount(1);
  const listed = (await (await acct.api.get(`${base}/profiles`)).json()).profiles as { name: string; starred: boolean }[];
  expect(listed.find(p => p.name === 'Charlie')!.starred).toBe(true);
  await app.close();
});

test('the health check reads the profile from inside its browser and passes a well-set profile', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const socks = await startSocks5('alice', 's3cret');
  const acct = await account({ buy: STUDIO });
  const base = `/workspaces/${acct.workspaceId}`;
  const proxyId = (await (await acct.api.post(`${base}/proxies`, { data: { type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'alice', password: 's3cret' } })).json()).id;
  const p = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Checked', { proxyId }) })).json();
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await win.locator('tr[data-id]', { hasText: 'Checked' }).click();
  const detail = win.getByRole('complementary', { name: 'Profile' });
  await detail.getByRole('button', { name: 'Health check' }).click();
  const report = win.getByRole('dialog', { name: 'Health check · Checked' });
  await expect(report.getByTestId('report')).toContainText('PASSED', { timeout: 120_000 });
  await expect(report.locator('[data-check="timezone"]')).toContainText('America/Los_Angeles');
  await expect(report.locator('[data-check="ua"]')).toContainText('Windows');
  await report.getByRole('button', { name: 'Close' }).last().click();
  await expect(detail).toContainText('Last health check');

  const saved = (await (await acct.api.get(`${base}/profiles`)).json()).profiles.find((x: { id: string }) => x.id === p.id);
  expect(saved.report.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
  expect(saved.report.canvas).toMatch(/^[0-9a-f]{16}$/);
  // Opening it recorded where it went out.
  expect(saved.lastExit.ip).toBeTruthy();
  await app.close(); await socks.close();
});
