// Moving a profile to another proxy from its menu (lines that don't answer can't be picked), taking proxies off their
// profiles in bulk, what a card shows of a proxy, and checking what is typed in its form.
import { expect, test } from '@playwright/test';
import { API, account, chromiumProfile, dataDir, launch, logIn } from './helpers';
import { startSocks5 } from '../fixtures/proxies';

const seattle = { country: 'US', countryName: 'United States', region: 'Washington', city: 'Seattle', lat: 47.6, lon: -122.3, timezone: 'America/Los_Angeles', locale: 'en-US' };

test('a profile changes proxy from its menu, and proxies are unbound in bulk', async () => {
  const acct = await account();
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const add = async (name: string, ok: boolean) => {
    const p = await (await acct.api.post(`${base}/proxies`, { data: { name, type: 'socks5', host: `${name.toLowerCase()}.example.net`, port: 1080 } })).json();
    await acct.api.post(`${API}/proxies/${p.id}/check`, { data: ok ? { ok, ms: 140, ip: '203.0.113.9', geo: seattle, error: null } : { ok, ms: null, ip: null, geo: null, error: 'timeout' } });
    return p.id as string;
  };
  const a = await add('Line-A', true), b = await add('Line-B', true), down = await add('Line-Down', false);
  const shop = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop', { proxyId: a }) })).json();
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  await win.locator(`tr[data-id="${shop.id}"]`).getByRole('button', { name: 'Actions for Shop' }).click();
  await win.getByRole('menuitem', { name: 'Change proxy' }).click();
  const dialog = win.getByRole('dialog', { name: 'Change proxy' });
  await expect(dialog).toContainText('Line-A');
  await expect(dialog.locator(`tr[data-id="${down}"]`).getByRole('radio')).toBeDisabled();
  await expect(dialog.locator(`tr[data-id="${a}"]`)).toHaveCount(0);
  await dialog.locator(`tr[data-id="${b}"]`).click();
  await dialog.getByRole('button', { name: 'Change proxy' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Shop now connects through Line-B' })).toBeVisible();
  const proxyOf = async () => ((await (await acct.api.get(`${base}/profiles`)).json()).profiles[0] as { proxyId: string | null }).proxyId;
  expect(await proxyOf()).toBe(b);

  // Taken off in bulk: the profile goes without a proxy.
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Proxies' }).click();
  await win.locator(`tr[data-id="${b}"]`).getByRole('checkbox').check();
  await win.getByTestId('bulk').getByRole('button', { name: 'Unassign' }).click();
  await win.getByRole('dialog', { name: 'Unassign 1 proxy from 1 profile?' }).getByRole('button', { name: 'Unassign' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Proxy unassigned' })).toContainText('1 profile');
  expect(await proxyOf()).toBeNull();
  await app.close();
});

test('a card shows a proxy’s address but not its account, and why it is down; the form checks and saves what is typed', async () => {
  const socks = await startSocks5('u1', 'right-pass');
  const acct = await account();
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const down = await (await acct.api.post(`${base}/proxies`, { data: { name: 'Line-X', type: 'socks5', host: '203.0.113.9', port: 20000, username: 'acct-user-7', password: 'pw' } })).json();
  await acct.api.post(`${API}/proxies/${down.id}/check`, { data: { ok: false, ms: null, ip: null, geo: null, error: 'proxy_protocol' } });
  const local = await (await acct.api.post(`${base}/proxies`, { data: { name: 'Local', type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'u1', password: 'wrong-pass' } })).json();
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Proxies/ }).click();
  await win.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Cards' }).click();
  const card = win.locator('li.pxc', { hasText: 'Line-X' });
  await expect(card).toContainText('203.0.113.9:20000');
  await expect(card).not.toContainText('acct-user-7');
  await expect(card.locator('.pxc-down')).toContainText('The proxy didn’t answer in the chosen protocol · Couldn’t connect the last time');
  // The password as typed, without the spaces a paste brought along; checked before it is saved, and then saved.
  await win.locator('li.pxc', { hasText: 'Local' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const form = win.getByRole('dialog', { name: 'Edit proxy' });
  await form.locator('#px-pass').fill('  right-pass ');
  await form.getByRole('button', { name: 'Check connection' }).click();
  await expect(form.getByTestId('proxy-test')).toContainText('Connected', { timeout: 30_000 });
  await expect(form).toContainText('Checked with the details as typed; not saved yet');
  await form.getByRole('button', { name: 'Save proxy' }).click();
  await expect(form).toBeHidden();
  expect((await (await acct.api.get(`${API}/proxies/${local.id}/credentials`)).json()).password).toBe('right-pass');
  await app.close();
  await socks.close();
});
