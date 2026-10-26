// The profile form in four sections: a new profile starts from the workspace's defaults and keeps its start page and
// window size; an edit says what changed, asks before throwing it away, and waits for a running profile to stop
// before its engine, proxy or fingerprint can change.
import { expect, test } from '@playwright/test';
import { API, ENGINE_ENV, account, chromiumProfile, dataDir, hasKernels, launch, logIn, opened } from './helpers';

test.setTimeout(180_000);

test('a new profile starts from the workspace defaults and keeps its start page and window size', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const group = await (await acct.api.post(`${base}/groups`, { data: { name: 'EU stores' } })).json();
  const proxy = await (await acct.api.post(`${base}/proxies`, { data: { name: 'DE-01', type: 'socks5', host: '198.51.100.7', port: 1080 } })).json();
  expect((await acct.api.patch(base, { data: { settings: { defaultGroupId: group.id, defaultProxyId: proxy.id } } })).ok()).toBe(true);
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('button', { name: 'New profile' }).click();
  const form = win.getByRole('dialog', { name: 'New profile' });
  await expect(form.getByRole('combobox', { name: 'Group' })).toContainText('EU stores');
  await expect(form.getByRole('combobox', { name: 'Choose a proxy' })).toContainText('DE-01');

  // A start page that isn't an address is pointed out and focused; the rail flags its section.
  await form.getByLabel('Start page').fill('shop.example');
  await form.getByRole('radio', { name: 'Custom', exact: true }).check();
  await form.getByLabel('Width').fill('1000');
  await form.getByLabel('Height').fill('700');
  await form.getByRole('button', { name: 'Create profile' }).click();
  await expect(form.getByLabel('Start page')).toBeFocused();
  await expect(form.getByText('Use an address that starts with http:// or https://.')).toBeVisible();
  await expect(form.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: /Opening/ }).getByLabel('Something here needs fixing')).toBeVisible();
  await form.getByLabel('Start page').fill('https://shop.example/');
  await form.getByRole('button', { name: 'Create profile' }).click();
  await expect(form).toBeHidden();
  const p = (await (await acct.api.get(`${base}/profiles`)).json()).profiles[0];
  expect(p).toMatchObject({ groupId: group.id, proxyId: proxy.id, startUrl: 'https://shop.example/', windowMode: 'custom', windowWidth: 1000, windowHeight: 700 });
  await app.close();
});

test('an edit says what changed and asks before throwing it away', async () => {
  const acct = await account();
  const base = `${API}/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-1') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.locator('tr[data-id]').getByRole('button', { name: 'Shop-1', exact: true }).click();
  await win.getByRole('dialog', { name: 'Profile', exact: true }).getByRole('button', { name: 'Edit' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await expect(form.getByRole('status')).toContainText('Changes apply the next time it opens.');
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Shop-1 DE');
  await form.getByLabel('Notes').fill('Berlin');
  await expect(form.getByText('2 changed')).toBeVisible();

  // Closing asks first; keeping on editing keeps what was typed, discarding saves nothing.
  await win.keyboard.press('Escape');
  const ask = win.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await ask.getByRole('button', { name: 'Keep editing' }).click();
  await expect(ask).toBeHidden();
  await expect(form.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Shop-1 DE');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await ask.getByRole('button', { name: 'Discard changes' }).click();
  await expect(form).toBeHidden();
  expect((await (await acct.api.get(`${base}/profiles`)).json()).profiles[0].name).toBe('Shop-1');
  await app.close();
});

test('while it runs, what it was started with waits until it is stopped', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account();
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const p = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Run-1') })).json();
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.locator(`tr[data-id="${p.id}"]`)).toBeVisible();
  expect(await opened(win, p.id)).toMatchObject({ state: 'running' });
  await win.locator(`tr[data-id="${p.id}"]`).getByRole('button', { name: 'Run-1', exact: true }).click();
  await win.getByRole('dialog', { name: 'Profile', exact: true }).getByRole('button', { name: 'Edit' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await expect(form.getByRole('combobox', { name: 'Browser engine' })).toBeDisabled();
  await expect(form.getByRole('radio', { name: 'No proxy' })).toBeDisabled();
  await expect(form.getByRole('button', { name: 'Random fingerprint' })).toBeDisabled();
  // The rest can still change, for the next time it opens.
  await expect(form.getByRole('textbox', { name: 'Name', exact: true })).toBeEnabled();

  await form.getByRole('button', { name: 'Stop profile' }).click();
  await expect(form.getByRole('combobox', { name: 'Browser engine' })).toBeEnabled({ timeout: 60_000 });
  await expect(form.getByRole('status')).toContainText('Changes apply the next time it opens.');
  await app.close();
});
