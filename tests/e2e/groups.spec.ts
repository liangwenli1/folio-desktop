// The Groups page: the tree counts what is in and under each group, a group's profiles can be taken out of it, its
// settings move, recolour and describe it, deleting it sends its profiles somewhere chosen, and a new group starts under
// the one picked. On the Company plan a group says who reaches it, and a role set there is the person's everywhere.
import { expect, test, type Page } from '@playwright/test';
import { API, account, choose, chromiumProfile, dataDir, launch, logIn, roleId } from './helpers';

const groupsPage = (win: Page) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Groups' }).click();
type G = { id: string; name: string; parentId: string | null; color: string; description: string | null; memberIds: string[] };

test('groups nest and count what is under them, and are set up and deleted from their page', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const shops = await (await acct.api.post(`${base}/groups`, { data: { name: 'Shops' } })).json();
  const us = await (await acct.api.post(`${base}/groups`, { data: { name: 'US', parentId: shops.id } })).json();
  await acct.api.post(`${base}/profiles/bulk`, { data: { profiles: [
    chromiumProfile('US-1', { groupId: us.id }), chromiumProfile('US-2', { groupId: us.id }), chromiumProfile('Shop-1', { groupId: shops.id }), chromiumProfile('Loose-1')
  ] } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await groupsPage(win);
  const tree = win.getByRole('tree', { name: 'Group directory' });
  const shopsItem = tree.getByRole('button', { name: /^Shops/ });
  await expect(shopsItem).toContainText('3');
  await tree.getByRole('button', { name: /^US/ }).click();
  await expect(win.getByTestId('group-title')).toHaveText('US');
  await expect(win.locator('tr[data-id]')).toHaveCount(2);

  await win.getByRole('checkbox', { name: 'Select US-2' }).check();
  await win.getByTestId('bulk').getByRole('button', { name: 'Remove from group' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Removed from the group' })).toContainText('1 profile');
  await expect(win.locator('tr[data-id]')).toHaveCount(1);

  // Moved to the top level, recoloured and described.
  const settings = win.getByRole('complementary', { name: 'Group settings' });
  await choose(settings.getByRole('combobox', { name: 'Parent group' }), 'None (top level)');
  await settings.getByRole('button', { name: 'Purple' }).click();
  await settings.getByRole('textbox', { name: /^Description/ }).fill('Storefronts in the US');
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Group settings saved' })).toBeVisible();
  await expect.poll(async () => ((await (await acct.api.get(`${base}/groups`)).json()).groups as G[]).find(g => g.name === 'US'))
    .toMatchObject({ parentId: null, color: 'purple', description: 'Storefronts in the US' });
  await expect(shopsItem).toContainText('1');

  // Deleted: its profile goes to Shops.
  await settings.getByRole('button', { name: 'Delete group' }).click();
  const del = win.getByRole('dialog', { name: 'Delete “US”?' });
  await expect(del).toContainText('“US” has 1 profile.');
  await choose(del.getByRole('combobox', { name: 'Move them to' }), 'Shops');
  await del.getByRole('button', { name: 'Move and delete' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Group deleted' })).toContainText('US');
  await expect(shopsItem).toContainText('2');

  // A new group starts under the one picked.
  await shopsItem.click();
  await win.getByRole('button', { name: 'New group' }).click();
  const dialog = win.getByRole('dialog', { name: 'New group' });
  await expect(dialog.getByRole('combobox', { name: 'Parent group' })).toContainText('Shops');
  await dialog.getByRole('textbox', { name: /^Group name/ }).fill('EU');
  await dialog.getByRole('button', { name: 'Create group' }).click();
  await expect(win.getByTestId('group-title')).toHaveText('EU');
  expect(((await (await acct.api.get(`${base}/groups`)).json()).groups as G[]).find(g => g.name === 'EU')).toMatchObject({ parentId: shops.id });
  await app.close();
});

test('on the Company plan a group says who reaches it, and a role set there is the person’s everywhere', async () => {
  const owner = await account({ buy: { plan: 'company', period: 'monthly' } });
  const member = await account();
  const base = `${API}/workspaces/${owner.workspaceId}`;
  await owner.api.post(`${base}/invitations`, { data: { email: member.email, roleId: await roleId(owner.api, owner.workspaceId, 'member'), notify: false } });
  const invitation = (await (await member.api.get(`${API}/me/invitations`)).json()).invitations[0];
  expect((await member.api.post(`${API}/invitations/${invitation.id}/accept`)).ok()).toBe(true);
  const memberId = (await (await member.api.get(`${API}/me`)).json()).user.id as string;
  const ads = await (await owner.api.post(`${base}/groups`, { data: { name: 'Ads' } })).json();
  await owner.api.post(`${base}/profiles`, { data: chromiumProfile('Ads-1', { groupId: ads.id }) });
  await owner.api.post(`${base}/profiles`, { data: chromiumProfile('Other-1') });

  const app = await launch(dataDir());
  const win = await logIn(app, owner.email);
  await groupsPage(win);
  await win.getByRole('tree', { name: 'Group directory' }).getByRole('button', { name: /^Ads/ }).click();
  const settings = win.getByRole('complementary', { name: 'Group settings' });
  // People go by their email (the user, 10-29).
  const name = member.email;
  await choose(settings.getByRole('combobox', { name: 'Add member' }), new RegExp(`^${name}`));
  await choose(settings.getByRole('combobox', { name: `Role of ${name}` }), 'Viewer');
  await expect(settings).toContainText('A role applies across the workspace');
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Group settings saved' })).toBeVisible();

  expect(((await (await owner.api.get(`${base}/groups`)).json()).groups as G[]).find(g => g.id === ads.id)!.memberIds).toEqual([memberId]);
  const members = (await (await owner.api.get(`${base}/members`)).json()).members as { userId: string; role: { key: string } }[];
  expect(members.find(m => m.userId === memberId)!.role.key).toBe('viewer');
  expect(((await (await member.api.get(`${base}/profiles`)).json()).profiles as { name: string }[]).map(p => p.name)).toEqual(['Ads-1']);
  await expect(win.getByTestId('group-title')).toHaveText('Ads');
  await expect(win.getByRole('main').getByText('1 profile · 1 member')).toBeVisible();
  await app.close();
});
