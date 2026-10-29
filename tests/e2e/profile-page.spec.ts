// A profile's own page: its Fingerprint tab saves what it changes, the way back finds the list as it was left, and the
// workspace can have it show as soon as a profile starts.
import { expect, test } from '@playwright/test';
import { API, ENGINE_ENV, account, back, choose, chromiumProfile, dataDir, detail, hasKernels, launch, logIn } from './helpers';

test.setTimeout(180_000);

test('the fingerprint tab saves its changes, and the list comes back on the page it was left on', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: Array.from({ length: 22 }, (_, i) => chromiumProfile(`Shop-${String(i + 1).padStart(2, '0')}`)) } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('button', { name: 'Page 2' }).click();
  const name = (await win.locator('tr[data-id] .rowlink').first().textContent())!;
  await win.getByRole('button', { name, exact: true }).click();
  const page = detail(win);
  await expect(win.getByTestId('page-title')).toHaveText(name);

  await page.getByRole('tab', { name: 'Fingerprint' }).click();
  const save = page.getByRole('button', { name: 'Save fingerprint' });
  await expect(save).toBeDisabled();
  await choose(page.getByRole('combobox', { name: 'CPU cores' }), '12');
  await page.getByRole('switch', { name: 'Follow the proxy' }).first().uncheck();
  await page.getByLabel('Language', { exact: true }).fill('de-DE');
  // A look at another tab keeps the draft.
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByRole('tab', { name: 'Fingerprint' }).click();
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('de-DE');
  await save.click();
  await expect(win.getByRole('status').filter({ hasText: 'Fingerprint saved' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved configuration' })).toContainText('de-DE');
  await expect(save).toBeDisabled();
  const p = ((await (await acct.api.get(`${base}/profiles`)).json()).profiles as { name: string; localeOverride: string | null; fingerprint: { hardwareConcurrency: number } }[]).find(x => x.name === name)!;
  expect(p).toMatchObject({ localeOverride: 'de-DE', fingerprint: { hardwareConcurrency: 12 } });

  await back(win);
  await expect(win.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  await expect(win.locator('tr[data-id]')).toHaveCount(2);
  await app.close();
});

test('with the workspace set to, starting a profile from the list opens its page', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account();
  const base = `${API}/workspaces/${acct.workspaceId}`;
  expect((await acct.api.patch(base, { data: { settings: { openDetailAfterLaunch: true } } })).ok()).toBe(true);
  const p = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Opens-Page') })).json();
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await win.locator(`tr[data-id="${p.id}"]`).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(win.getByTestId('page-title')).toHaveText('Opens-Page');
  await expect(detail(win).locator('.dot-st.run')).toBeVisible({ timeout: 90_000 });
  await detail(win).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(detail(win).getByRole('button', { name: 'Open profile' })).toBeVisible({ timeout: 60_000 });
  await app.close();
});
