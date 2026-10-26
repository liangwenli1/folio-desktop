// The team page: someone's access (their role and, on the Company plan, their groups) edited from their row, several
// people invited at once for a chosen time, and the Roles tab: a built-in role changed and put back, and a role of
// the workspace's own made and deleted.
import { expect, test, type Page } from '@playwright/test';
import { API, account, choose, dataDir, launch, logIn, roleId } from './helpers';

const teamPage = (win: Page) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Team' }).click();

test('someone’s access is edited from their row, and several people are invited at once', async () => {
  const owner = await account({ buy: { plan: 'company', period: 'monthly' } });
  const member = await account();
  const base = `${API}/workspaces/${owner.workspaceId}`;
  await owner.api.post(`${base}/invitations`, { data: { email: member.email, roleId: await roleId(owner.api, owner.workspaceId, 'member'), notify: false } });
  const invitation = (await (await member.api.get(`${API}/me/invitations`)).json()).invitations[0];
  await member.api.post(`${API}/invitations/${invitation.id}/accept`);
  await owner.api.post(`${base}/groups`, { data: { name: 'Ads' } });

  const app = await launch(dataDir());
  const win = await logIn(app, owner.email);
  await teamPage(win);
  await expect(win.getByLabel('Seats')).toContainText('2 in use · no limit');
  const row = win.locator(`tr[data-member="${member.email}"]`);
  await row.getByRole('button', { name: 'Edit access' }).click();
  const access = win.getByRole('dialog', { name: `Access for ${member.email}` });
  await choose(access.getByRole('combobox', { name: 'Role' }), 'Viewer');
  await access.getByRole('checkbox', { name: 'Ads' }).check();
  await access.getByRole('button', { name: 'Save' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Access saved' })).toBeVisible();
  await expect(row).toContainText('Viewer');
  await expect(row).toContainText('Ads');

  const n = Date.now();
  await win.getByRole('button', { name: 'Invite people' }).click();
  const invite = win.getByRole('dialog', { name: 'Invite people' });
  const emails = invite.getByRole('textbox', { name: /^Emails/ });
  await emails.fill(`a-${n}@example.com,`);
  await emails.fill(`b-${n}@example.com`);
  await emails.press('Enter');
  await choose(invite.getByRole('combobox', { name: 'Link works for' }), '3 days');
  await invite.getByRole('button', { name: 'Send invitation' }).click();
  await expect(invite.getByRole('status')).toContainText(`a-${n}@example.com`);
  await expect(invite.getByRole('status')).toContainText(`b-${n}@example.com`);
  await invite.getByRole('button', { name: 'Done' }).click();
  await win.getByRole('tab', { name: /^Invitations/ }).click();
  await expect(win.locator('tr[data-invitation]')).toHaveCount(2);
  const waiting = (await (await owner.api.get(`${base}/invitations`)).json()).invitations as { createdAt: string; expiresAt: string }[];
  expect(waiting.map(i => Date.parse(i.expiresAt) - Date.parse(i.createdAt))).toEqual([3 * 86_400_000, 3 * 86_400_000]);
  await app.close();
});

test('a built-in role is changed and put back, and a role of the workspace’s own is made and deleted', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await teamPage(win);
  await win.getByRole('tab', { name: 'Roles' }).click();
  const memberRole = win.getByRole('region', { name: 'Member', exact: true });
  const del = memberRole.locator('tr[data-permission="profiles.delete"]').getByRole('switch');
  await expect(del).not.toBeChecked();
  await del.check();
  await memberRole.getByRole('button', { name: 'Save permissions' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Member saved' })).toBeVisible();
  const permsOf = async (key: string) => ((await (await acct.api.get(`${base}/roles`)).json()).roles as { key: string; name: string; permissions: string[] }[]).find(r => r.key === key || r.name === key)?.permissions;
  expect(await permsOf('member')).toContain('profiles.delete');
  await memberRole.getByRole('button', { name: 'Restore defaults' }).click();
  await expect(del).not.toBeChecked();
  await memberRole.getByRole('button', { name: 'Save permissions' }).click();
  await expect.poll(() => permsOf('member')).not.toContain('profiles.delete');

  await win.getByRole('button', { name: 'New role' }).click();
  const dialog = win.getByRole('dialog', { name: 'New role' });
  await dialog.getByRole('textbox', { name: /^Role name/ }).fill('Ops');
  await choose(dialog.getByRole('combobox', { name: 'Start from' }), 'Viewer');
  await dialog.getByRole('button', { name: 'Create role' }).click();
  const ops = win.getByRole('region', { name: 'Ops' });
  await expect(ops.locator('tr[data-permission="proxies.view"]').getByRole('switch')).toBeChecked();
  await expect(ops.locator('tr[data-permission="profiles.create"]').getByRole('switch')).not.toBeChecked();
  await ops.getByRole('button', { name: 'Delete role' }).click();
  await win.getByRole('dialog', { name: 'Delete the role Ops?' }).getByRole('button', { name: 'Delete role' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Ops deleted' })).toBeVisible();
  expect(await permsOf('Ops')).toBeUndefined();
  await app.close();
});
