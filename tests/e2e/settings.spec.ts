// The Settings page: what the workspace keeps, and who may change it.
import { expect, test } from '@playwright/test';
import { API, account, dataDir, launch, logIn, roleId } from './helpers';

test.setTimeout(120_000);

test('the workspace keeps what new profiles start with, and only a manager may change it', async () => {
  const owner = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const group = await (await owner.api.post(`${API}/workspaces/${owner.workspaceId}/groups`, { data: { name: 'US stores' } })).json();
  const dir = dataDir();
  let app = await launch(dir);
  let win = await logIn(app, owner.email);
  const open = (name: string) => win.getByRole('button', { name, exact: true }).click();

  await open('Settings');
  await expect(win.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await win.getByLabel('Workspace name').fill('Larkspur Trading');
  await expect(win.getByLabel('Workspace ID')).toHaveValue(owner.workspaceId);

  await open('Profile defaults');
  await win.getByRole('combobox', { name: 'Default group' }).click();
  await win.getByRole('option', { name: 'US stores' }).click();
  await open('Opening');
  await win.getByRole('switch', { name: 'Stop the profile when its last window closes' }).uncheck();
  await win.getByRole('button', { name: 'Save settings' }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
  await app.close();

  // They are the workspace's, so they are there on the next start.
  app = await launch(dir);
  win = await app.firstWindow();
  await expect(win.getByTestId('ws-name')).toHaveText('Larkspur Trading');
  await open('Settings');
  await open('Opening');
  await expect(win.getByRole('switch', { name: 'Stop the profile when its last window closes' })).not.toBeChecked();
  await open('Profile defaults');
  await expect(win.getByRole('combobox', { name: 'Default group' })).toContainText('US stores');
  await app.close();

  // A member sees them and cannot change them, and has no Plan & billing page at all.
  const member = await account();
  await owner.api.post(`${API}/workspaces/${owner.workspaceId}/invitations`, {
    data: { email: member.email, roleId: await roleId(owner.api, owner.workspaceId, 'member') }
  });
  const theirs = await launch(dataDir());
  const win2 = await logIn(theirs, member.email);
  await win2.getByTestId('ws-name').click();
  await win2.locator('[data-invite="Larkspur Trading"]').getByRole('button', { name: 'Join' }).click();
  await expect(win2.getByTestId('ws-name')).toHaveText('Larkspur Trading');
  await win2.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(win2.getByLabel('Workspace name')).toBeDisabled();
  await expect(win2.getByRole('button', { name: 'Save settings' })).toHaveCount(0);
  await expect(win2.getByRole('button', { name: 'Plan & billing', exact: true })).toHaveCount(0);
  await theirs.close();
});
