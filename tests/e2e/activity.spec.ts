import { expect, test } from '@playwright/test';
import { account, choose, chromiumProfile, dataDir, detail as page, launch, logIn } from './helpers';

test('the activity log says who did what, and each profile shows its recent entries', async () => {
  const acct = await account();
  const base = `/workspaces/${acct.workspaceId}`;
  await acct.api.post(`${base}/groups`, { data: { name: 'EU stores' } });
  await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-07') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  // People go by the name colleagues see.
  const name = acct.email.split('@')[0];

  await win.getByRole('button', { name: 'Shop-07', exact: true }).click();
  const detail = page(win);
  await detail.getByRole('button', { name: 'Edit profile' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Shop Berlin');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(detail.getByTestId('recent')).toContainText(`changed the name of Shop Berlin #0001by ${name}`);
  await detail.getByRole('tab', { name: 'Activity' }).click();
  const rows = detail.locator('tr[data-action]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('changed the name of Shop Berlin #0001');
  await expect(rows.first()).toContainText(name);
  await expect(rows.last()).toContainText('created Shop-07 #0001');
  await win.keyboard.press('Escape');

  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Activity log/ }).click();
  const items = win.locator('tr[data-action]');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText('changed the name of Shop Berlin');
  await expect(items.last()).toContainText(name);
  await expect(items.last()).toContainText('created the group EU stores');
  // When, on one line as in the other lists: the day, then the time.
  await expect(items.first().locator('td').first()).toHaveText(/^Today \d{2}:\d{2} [AP]M$/);
  // An entry's details beside the log: what it changed, from what to what.
  await items.first().getByRole('button', { name: 'View' }).click();
  const entry = win.getByRole('complementary', { name: 'Entry details' });
  await expect(entry).toContainText('Edit profile');
  await expect(entry.locator('.lg-changes tbody tr')).toHaveText([/^nameShop-07Shop Berlin$/]);
  // Found by a word, and by kind.
  await win.getByRole('searchbox', { name: /^Search by name/ }).fill('EU stores');
  await expect(items).toHaveCount(1);
  await win.getByRole('searchbox', { name: /^Search by name/ }).fill('');
  await expect(items).toHaveCount(3);
  const kinds = win.getByRole('combobox', { name: 'Action' });
  await choose(kinds, 'Profile changes');
  await expect(items).toHaveCount(2);
  await choose(kinds, 'Team');
  await expect(win.getByText('Nothing matches')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Export log' })).toHaveCount(0);
  await app.close();
});

test('a role is told what it may not see: no profiles at all, and only its own part of the log', async () => {
  const owner = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const member = await account();
  const base = `/workspaces/${owner.workspaceId}`;
  await owner.api.patch(base, { data: { name: 'Larkspur Trading' } });
  await owner.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-07') });
  const desk = await (await owner.api.post(`${base}/roles`, { data: { name: 'Proxy desk', permissions: ['proxies.view'] } })).json();
  await owner.api.post(`${base}/invitations`, { data: { email: member.email, roleId: desk.id } });
  const app = await launch(dataDir());
  const win = await logIn(app, member.email);
  await win.getByTestId('ws-name').click();
  await win.locator('[data-invite="Larkspur Trading"]').getByRole('button', { name: 'Join' }).click();
  await expect(win.getByTestId('ws-name')).toHaveText('Larkspur Trading');

  // Profiles are out of the role's reach: the list says so, and whom to ask, instead of a load that failed.
  await expect(win.getByText('No access', { exact: true })).toBeVisible();
  await expect(win.getByText(`Ask the workspace’s owner (${owner.email}) for access.`, { exact: false })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Email the owner' })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Load again' })).toHaveCount(0);

  // Without "view the log", the log is the person's own part of it, and says so.
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Activity log' }).click();
  await expect(win.getByText('Your role shows your own actions and what was done to the profiles you can see.')).toBeVisible();
  await expect(win.locator('tr[data-action]')).toHaveCount(1);
  await expect(win.locator('tr[data-action="member.join"]')).toBeVisible();
  await app.close();
});
