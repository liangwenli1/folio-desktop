// A team across two computers: inviting, assigning, members' limits, and removing someone who has a profile open.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { account, choose, chromiumProfile, dataDir, ENGINE_ENV, hasKernels, lastStatus, launch, logIn, opened } from './helpers';

test.setTimeout(240_000);
const STUDIO = { plan: 'studio', period: 'monthly' };
const nav = (win: Page, name: RegExp) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });

async function invite(owner: Page, email: string, role: 'Member' | 'Admin' = 'Member'){
  await nav(owner, /^Team/).click();
  await owner.getByRole('button', { name: 'Invite people' }).click();
  const dialog = owner.getByRole('dialog', { name: 'Invite people' });
  await dialog.getByRole('textbox', { name: /^Emails/ }).fill(email);
  await choose(dialog.getByRole('combobox', { name: 'Role' }), role);
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(dialog.getByRole('status')).toContainText(email);
  await expect(dialog.getByRole('status')).toContainText('Invitation sent');
  await dialog.getByRole('button', { name: 'Done' }).click();
}

// The invited person accepts from the workspace menu of their own workbench.
async function accept(member: Page, workspace: string){
  await member.getByTestId('ws-name').click();
  await member.locator(`[data-invite="${workspace}"]`).getByRole('button', { name: 'Join' }).click();
  await expect(member.getByTestId('ws-name')).toHaveText(workspace);
}

test('a member removed from the team loses the profile they have open, and its copy on their computer', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const owner = await account({ buy: STUDIO });
  const member = await account();
  await owner.api.patch(`/workspaces/${owner.workspaceId}`, { data: { name: 'Larkspur Trading' } });
  const memberId = (await (await member.api.get('/me')).json()).user.id as string;
  const p = await (await owner.api.post(`/workspaces/${owner.workspaceId}/profiles`, { data: chromiumProfile('Shop-07') })).json();

  const o = await launch(dataDir(), ENGINE_ENV);
  const memberData = dataDir();
  const m = await launch(memberData, ENGINE_ENV);
  const [winO, winM] = await Promise.all([logIn(o, owner.email), logIn(m, member.email)]);
  await invite(winO, member.email);
  await accept(winM, 'Larkspur Trading');
  await expect(winM.locator('tr[data-id]')).toHaveCount(0);

  // The owner assigns the profile to the member, who now sees and opens it.
  await nav(winO, /^Profiles/).click();
  await winO.getByRole('checkbox', { name: 'Select Shop-07' }).check();
  await choose(winO.getByTestId('bulk').getByRole('combobox', { name: 'More' }), new RegExp(`^${member.email.split('@')[0]}`));
  await expect(winM.locator('tr[data-id]', { hasText: 'Shop-07' })).toBeVisible({ timeout: 5000 });
  expect(await opened(winM, p.id)).toMatchObject({ state: 'running' });
  const folder = join(memberData, 'profiles', memberId, p.id);
  expect(existsSync(folder)).toBe(true);

  // Removed: the browser closes, the folder goes, the workspace disappears from their workbench.
  await nav(winO, /^Team/).click();
  const name = member.email.split('@')[0];
  await winO.getByRole('button', { name: `More for ${name}` }).click();
  await winO.getByRole('menuitem', { name: 'Remove from workspace' }).click();
  await winO.getByRole('dialog', { name: `Remove ${name}` }).getByRole('button', { name: 'Remove from workspace' }).click();
  await expect.poll(async () => (await lastStatus(winM, p.id))?.state, { timeout: 15_000 }).toBe('stopped');
  await expect(winM.getByRole('status').filter({ hasText: 'You’re no longer in Larkspur Trading' })).toBeVisible();
  await expect(winM.getByTestId('ws-name')).not.toHaveText('Larkspur Trading');
  await expect.poll(() => existsSync(folder)).toBe(false);
  expect((await member.api.get(`/workspaces/${owner.workspaceId}`)).status()).toBe(404);

  // The profile is back with the owner, free to open.
  const back = (await (await owner.api.get(`/workspaces/${owner.workspaceId}/profiles`)).json()).profiles[0];
  expect(back).toMatchObject({ ownerId: expect.any(String), lock: null });
  expect(back.ownerId).not.toBe(memberId);
  await Promise.all([o.close(), m.close()]);
});

test('members work with their own profiles only, and can leave', async () => {
  const owner = await account({ buy: STUDIO });
  const member = await account();
  await owner.api.patch(`/workspaces/${owner.workspaceId}`, { data: { name: 'Larkspur Trading' } });
  await owner.api.post(`/workspaces/${owner.workspaceId}/profiles`, { data: chromiumProfile('Owner-1') });
  const o = await launch(dataDir()), m = await launch(dataDir());
  const [winO, winM] = await Promise.all([logIn(o, owner.email), logIn(m, member.email)]);
  await invite(winO, member.email);
  await accept(winM, 'Larkspur Trading');

  // No proxy library, no Trash, no importing or deleting; their new profile is theirs.
  await expect(nav(winM, /^Proxies/)).toHaveCount(0);
  await expect(nav(winM, /^Trash/)).toHaveCount(0);
  await expect(winM.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
  await winM.getByRole('button', { name: 'New profile' }).click();
  const form = winM.getByRole('dialog', { name: 'New profile' });
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Member-1');
  await expect(form.getByRole('radio', { name: 'New proxy' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Create profile' }).click();
  await expect(winM.locator('tr[data-id]')).toHaveCount(1);
  await winM.getByRole('checkbox', { name: 'Select Member-1' }).check();
  await winM.getByTestId('bulk').getByRole('combobox', { name: 'More' }).click();
  await expect(winM.getByRole('listbox').getByRole('option', { name: 'Delete' })).toHaveCount(0);
  await winM.keyboard.press('Escape');
  await winM.getByRole('button', { name: 'Member-1', exact: true }).click();
  await expect(winM.getByTestId('assigned')).toHaveText(member.email.split('@')[0]);
  await winM.keyboard.press('Escape');

  // The owner sees both, with who each belongs to.
  await nav(winO, /^Profiles/).click();
  await expect(winO.locator('tr[data-id]')).toHaveCount(2);

  // Leaving hands the profile to the owner and takes the workspace out of the member's workbench.
  await nav(winM, /^Team/).click();
  await expect(winM.locator('[data-member]')).toHaveCount(2);
  await expect(winM.getByRole('button', { name: 'Invite' })).toHaveCount(0);
  await winM.getByRole('button', { name: 'Leave workspace' }).click();
  await winM.getByRole('dialog', { name: 'Leave Larkspur Trading?' }).getByRole('button', { name: 'Leave' }).click();
  await expect(winM.getByTestId('ws-name')).not.toHaveText('Larkspur Trading');
  const ownerId = (await (await owner.api.get('/me')).json()).user.id;
  expect((await (await owner.api.get(`/workspaces/${owner.workspaceId}/profiles`)).json()).profiles.every((x: { ownerId: string }) => x.ownerId === ownerId)).toBe(true);
  await Promise.all([o.close(), m.close()]);
});
