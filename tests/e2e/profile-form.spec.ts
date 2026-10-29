// The profile form in five sections: a new profile starts from the workspace's defaults and keeps its start page and
// window size; its extensions come from the library or are added to it from the form; an edit says what changed, asks
// before throwing it away, and waits for a running profile to stop before its engine, system, proxy or fingerprint can
// change, saying why when one is tried. Groups show under their parents, the person using it once among the owners,
// and a saved profile moves to another system once that is confirmed.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { strToU8, zipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { API, ENGINE_ENV, account, chromiumProfile, dataDir, detail, hasKernels, launch, logIn, opened } from './helpers';

test.setTimeout(180_000);
const pkg = (name: string, version: string) => Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name, version })) }));

test('the extension section searches the library and adds to it from a download link or a file, ticked at once', async () => {
  const server = http.createServer((req, res) => { if (req.url === '/files/notes.zip') return res.end(pkg('Quick Notes', '3.1')); res.statusCode = 404; res.end(); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  for (const [n, v] of [['Order Helper', '2.4.1'], ['Price Watch', '1.0']]) await acct.api.post(`${base}/extensions?kernel=chromium`, { headers: { 'content-type': 'application/octet-stream' }, data: pkg(n, v) });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('button', { name: 'New profile' }).click();
  const form = win.getByRole('dialog', { name: 'New profile' });
  const sec = form.getByRole('region', { name: 'Extensions' });
  await sec.getByRole('searchbox', { name: 'Search the library' }).fill('price');
  await expect(sec.getByRole('listitem')).toHaveCount(1);
  await sec.getByLabel('Price Watch').check();
  await sec.getByRole('searchbox', { name: 'Search the library' }).fill('');
  await expect(sec.getByRole('listitem')).toHaveCount(2);
  await expect(sec).toContainText('1 selected');
  // From a download link: it joins the library, ticked.
  await sec.getByLabel('Store link, extension ID or download link').fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}/files/notes.zip`);
  await sec.getByRole('button', { name: 'Add to the library' }).click();
  await expect(sec.getByLabel('Quick Notes')).toBeChecked();
  await expect(sec).toContainText('2 selected');
  // From a file on this computer.
  await sec.getByRole('group', { name: 'From' }).getByRole('button', { name: 'File' }).click();
  await sec.getByLabel('Choose a file').setInputFiles({ name: 'tabs.zip', mimeType: 'application/zip', buffer: pkg('Tab Saver', '0.9') });
  await sec.getByRole('button', { name: 'Add to the library' }).click();
  await expect(sec.getByLabel('Tab Saver')).toBeChecked();
  await form.getByRole('button', { name: 'Create profile' }).click();
  await expect(form).toHaveCount(0);
  const library = (await (await acct.api.get(`${base}/extensions`)).json()).extensions as { id: string; name: string; source: string }[];
  expect(library.find(e => e.name === 'Quick Notes')).toMatchObject({ source: 'upload' });
  const made = (await (await acct.api.get(`${base}/profiles`)).json()).profiles[0] as { extensionIds: string[] };
  expect(made.extensionIds.sort()).toEqual(library.filter(e => e.name !== 'Order Helper').map(e => e.id).sort());
  await app.close();
  server.close();
});

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
  await detail(win).getByRole('button', { name: 'Edit profile' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await expect(form.getByRole('status')).toContainText('Changes apply the next time it opens');
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

test('while it runs, what it was started with waits until it is stopped, and trying it says why', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account();
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const p = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Run-1') })).json();
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.locator(`tr[data-id="${p.id}"]`)).toBeVisible();
  expect(await opened(win, p.id)).toMatchObject({ state: 'running' });
  await win.locator(`tr[data-id="${p.id}"]`).getByRole('button', { name: 'Run-1', exact: true }).click();
  await detail(win).getByRole('button', { name: 'Edit profile' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  // Nothing is greyed out (option B, 10-28): trying the engine, the proxy or the fingerprint says why, and changes nothing.
  const ask = win.getByRole('dialog', { name: 'The profile is running' });
  await expect(form.getByRole('combobox', { name: 'Browser engine' })).toBeEnabled();
  await form.getByRole('combobox', { name: 'Browser engine' }).click();
  await expect(ask).toContainText('Stop it to change its engine, system, proxy or fingerprint.');
  await expect(win.getByRole('listbox')).toHaveCount(0);
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await form.getByRole('radio', { name: 'Saved proxy' }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(form.getByRole('radio', { name: 'No proxy' })).toBeChecked();
  await form.getByRole('button', { name: 'New random fingerprint' }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  // The rest can still change, for the next time it opens; the foot says it runs, with Stop, and no more.
  await expect(form.getByRole('textbox', { name: 'Name', exact: true })).toBeEnabled();
  await expect(form.getByRole('status')).toHaveText('RunningStop profile');
  await form.getByRole('button', { name: 'Cancel' }).click();

  // The profile's Fingerprint tab the same way: no note, the fields as always, and trying one says why.
  await detail(win).getByRole('tab', { name: 'Fingerprint' }).click();
  await expect(detail(win).getByText('Changes apply the next time the profile opens.')).toHaveCount(0);
  const cores = detail(win).getByRole('combobox', { name: 'CPU cores' });
  await expect(cores).toBeEnabled();
  await cores.click();
  await expect(win.getByRole('listbox')).toHaveCount(0);
  // Stop from there, and the field can be picked.
  await ask.getByRole('button', { name: 'Stop profile' }).click();
  await expect(detail(win).getByText('Changes apply the next time the profile opens.')).toBeVisible({ timeout: 60_000 });
  await cores.click();
  await expect(win.getByRole('listbox')).toBeVisible();
  await expect(ask).toHaveCount(0);
  await win.keyboard.press('Escape');

  // And in the form, the engine.
  await detail(win).getByRole('button', { name: 'Edit profile' }).click();
  await expect(form.getByRole('status')).toContainText('Changes apply the next time it opens');
  await form.getByRole('combobox', { name: 'Browser engine' }).click();
  await expect(win.getByRole('listbox')).toBeVisible();
  await expect(ask).toHaveCount(0);
  await app.close();
});

test('groups sit under their parents, the owner list has its user once, and a saved profile changes system once confirmed', async () => {
  const acct = await account();
  const base = `${API}/workspaces/${acct.workspaceId}`;
    const us = await (await acct.api.post(`${base}/groups`, { data: { name: 'US sites' } })).json();
  await acct.api.post(`${base}/groups`, { data: { name: 'Los Angeles', parentId: us.id } });
  await acct.api.post(`${base}/groups`, { data: { name: 'Berlin' } });
  const p = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Sys-1') })).json();
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);

  // A new profile: groups in their tree, a child indented under its parent and found by its path; the owner list has
  // its user once, chosen.
  await win.getByRole('button', { name: 'New profile' }).click();
  const form = win.getByRole('dialog', { name: 'New profile' });
  await form.getByRole('combobox', { name: 'Group' }).click();
  const list = win.getByRole('listbox');
  await expect(list.getByRole('option')).toHaveText(['No group', 'Berlin', 'US sites', 'Los Angeles', 'New group']);
  expect(await list.getByRole('option', { name: 'Los Angeles' }).evaluate(el => getComputedStyle(el).paddingLeft)).toBe('28px');
  await win.locator('.sel-search input').fill('angeles');
  await expect(list.getByRole('option')).toHaveText(['US sites / Los Angeles']);
  await list.getByRole('option').click();
  await expect(form.getByRole('combobox', { name: 'Group' })).toHaveText('US sites / Los Angeles');
  const owner = form.getByRole('combobox', { name: 'Assigned to' });
  await expect(owner).toContainText(`${acct.email} (you)`);
  await owner.click();
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.getByRole('option').nth(0)).toHaveText('Unassigned');
  await expect(list.getByRole('option').nth(1)).toContainText(`${acct.email} (you)`);
  await win.keyboard.press('Escape');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await win.getByRole('dialog', { name: 'Discard unsaved changes?' }).getByRole('button', { name: 'Discard changes' }).click();

  // A saved profile: another system only once confirmed, with a fingerprint drawn for it.
  await win.locator(`tr[data-id="${p.id}"]`).getByRole('button', { name: 'Sys-1', exact: true }).click();
  await detail(win).getByRole('button', { name: 'Edit profile' }).click();
  const edit = win.getByRole('dialog', { name: 'Edit profile' });
  const systems = edit.getByRole('group', { name: 'Operating system' });
  await systems.getByRole('button', { name: 'macOS' }).click();
  const ask = win.getByRole('dialog', { name: 'Change the system?' });
  await expect(ask).toContainText('drawn again for macOS');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(systems.getByRole('button', { name: 'Windows' })).toHaveAttribute('aria-pressed', 'true');
  await systems.getByRole('button', { name: 'macOS' }).click();
  await ask.getByRole('button', { name: 'Change' }).click();
  await expect(systems.getByRole('button', { name: 'macOS' })).toHaveAttribute('aria-pressed', 'true');
  await expect(edit.getByText('Sites will see a new device')).toBeVisible();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  const saved = (await (await acct.api.get(`${base}/profiles`)).json()).profiles.find((x: { id: string }) => x.id === p.id);
  expect(saved.os).toBe('macos');
  expect(saved.fingerprint).not.toEqual(p.fingerprint);
  await app.close();
});
