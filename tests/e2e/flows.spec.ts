// Flows: made in the editor, shared with the team, and tried on a profile in each engine.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { ENGINE_ENV, account, chromiumProfile, dataDir, hasKernels, launch, logIn, roleId } from './helpers';

test.setTimeout(180_000);
const nav = (win: Page, name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });
const step = (win: Page, path: string) => win.locator(`li[data-step="${path}"]`);
// The chart's node for a step, and the panel beside the chart where the picked step is changed.
const node = (win: Page, path: string) => step(win, path).locator(':scope > .fnode');
const panel = (win: Page) => win.getByRole('region', { name: 'Step settings' });

async function addStep(win: Page, type: string, scope = win.getByRole('region', { name: 'Steps' })){
  await scope.getByRole('button', { name: 'Add step' }).last().click();
  await win.getByRole('menu', { name: 'Add step' }).getByRole('menuitem', { name: type, exact: true }).click();
}

// A sign-in page: typing a name and pressing the button greets that name.
async function startShop(){
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><title>Shop</title><input id="email"><button id="go" onclick="document.getElementById('out').textContent='Hello '+document.getElementById('email').value">Sign in</button><p id="out"></p>`);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}/`, close: () => new Promise<void>(r => server.close(() => r())) };
}

test('a flow is built step by step, saved for the team, and read-only for members who did not make it', async () => {
  const owner = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const app = await launch(dataDir());
  const win = await logIn(app, owner.email);
  await nav(win, 'Flows').click();
  await expect(win.getByText('No flows yet.')).toBeVisible();
  await win.getByRole('button', { name: 'New flow' }).click();
  await win.getByLabel('Flow name').fill('Morning check');

  // A step just added is the one the panel shows.
  await addStep(win, 'Open URL');
  await panel(win).getByLabel('Address').fill('https://shop.example/login');
  await addStep(win, 'If');
  await expect(win.getByText('1 step needs filling in before saving.')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await panel(win).getByLabel('Element', { exact: true }).fill('text=Welcome');
  // The condition's two branches, side by side under it.
  await expect(step(win, '2').getByRole('group', { name: 'When true' })).toBeVisible();
  await expect(step(win, '2').getByRole('group', { name: 'Otherwise' })).toBeVisible();
  await addStep(win, 'Extract', step(win, '2').getByRole('group', { name: 'When true' }));
  await panel(win).getByLabel('Element', { exact: true }).fill('.balance');
  await panel(win).getByLabel('Into variable').fill('balance');
  await expect(node(win, '2.1')).toContainText('.balance');
  await addStep(win, 'Wait');
  await panel(win).getByRole('button', { name: 'Move step 3 up' }).click();
  await expect(step(win, '2')).toHaveAttribute('aria-label', '2 Wait');
  // Another node picked: the panel shows its settings.
  await node(win, '1').click();
  await expect(panel(win).getByLabel('Address')).toHaveValue('https://shop.example/login');
  await win.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(win.getByRole('status').filter({ hasText: 'Flow saved' })).toBeVisible();

  const [flow] = (await (await owner.api.get(`/workspaces/${owner.workspaceId}/flows`)).json()).flows;
  expect(flow).toMatchObject({ name: 'Morning check', version: 0 });
  expect(flow.steps).toEqual([
    { type: 'open', url: 'https://shop.example/login' },
    { type: 'wait', until: 'time', seconds: 2, maxSeconds: null, selector: null },
    { type: 'if', test: { kind: 'exists', selector: 'text=Welcome' }, then: [{ type: 'extract', selector: '.balance', attribute: null, variable: 'balance' }], else: [] }
  ]);
  await win.getByRole('button', { name: 'Back to flows' }).click();
  await expect(win.locator('tr[data-flow="Morning check"]')).toContainText('4');

  // A member sees it but can't change it; duplicating gives them their own copy to edit.
  const member = await account();
  await owner.api.patch(`/workspaces/${owner.workspaceId}`, { data: { name: 'Larkspur Trading' } });
  await owner.api.post(`/workspaces/${owner.workspaceId}/invitations`, { data: { email: member.email, roleId: await roleId(owner.api, owner.workspaceId, 'member') } });
  const app2 = await launch(dataDir());
  const win2 = await logIn(app2, member.email);
  await win2.getByTestId('ws-name').click();
  await win2.locator('[data-invite="Larkspur Trading"]').getByRole('button', { name: 'Join' }).click();
  await expect(win2.getByTestId('ws-name')).toHaveText('Larkspur Trading');
  await nav(win2, 'Flows').click();
  const row = win2.locator('tr[data-flow="Morning check"]');
  await expect(row).toContainText(owner.email);
  await row.getByRole('button', { name: 'View' }).click();
  await expect(win2.getByText('Only whoever created this flow')).toBeVisible();
  await expect(panel(win2).getByLabel('Address')).toBeDisabled();
  await win2.getByRole('button', { name: 'Duplicate to edit' }).click();
  await expect(win2.getByLabel('Flow name')).toHaveValue('Morning check (copy)');
  await expect(panel(win2).getByLabel('Address')).toBeEnabled();

  // A change made elsewhere shows up in the list without reloading.
  await win2.getByRole('button', { name: 'Back to flows' }).click();
  await owner.api.patch(`/flows/${flow.id}`, { data: { version: 0, name: 'Evening check' } });
  await expect(win2.locator('tr[data-flow="Evening check"]')).toBeVisible();
  await app2.close();
  await app.close();
});

for (const kernel of ['chromium', 'firefox'] as const){
  test(`${kernel}: a trial run opens the profile, shows each step as it runs and what it extracted`, async () => {
    test.skip(!hasKernels, 'browser engines are not unpacked here');
    const shop = await startShop();
    const acct = await account();
    const app = await launch(dataDir(), ENGINE_ENV);
    const win = await logIn(app, acct.email);
    await expect(win.getByTestId('plan-name')).toBeVisible();
    const body = kernel === 'chromium' ? chromiumProfile('Shop-01')
      : { name: 'Shop-01', kernel, os: 'linux', ...(await win.evaluate(() => window.folio.newFingerprint('firefox', 'linux'))) };
    await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: body });
    await acct.api.post(`/workspaces/${acct.workspaceId}/flows`, { data: { name: 'Greet', steps: [
      { type: 'open', url: '{{site}}' },
      { type: 'type', selector: '#email', text: '{{who}} of {{profile.name}}', slow: false },
      { type: 'click', selector: 'text=Sign in' },
      { type: 'extract', selector: '#out', attribute: null, variable: 'greeting' }
    ] } });

    await nav(win, 'Flows').click();
    await win.getByRole('button', { name: 'Greet', exact: true }).click();
    const trial = win.getByRole('complementary', { name: 'Trial run' });
    await trial.getByLabel(/^Variables for this run/).fill(`site=${shop.url}\nwho=Ada`);
    await trial.getByRole('button', { name: 'Run' }).click();
    await expect(trial.getByRole('status')).toHaveText(/Finished\./, { timeout: 120_000 });
    await expect(trial.getByRole('list', { name: 'Log' }).locator('li')).toHaveCount(4);
    await expect(trial.getByRole('status')).toContainText('Hello Ada of Shop-01');

    // A failing step is named in the log; the profile stays open for another try.
    await addStep(win, 'Wait');
    await panel(win).getByRole('button', { name: 'Element to appear' }).click();
    await panel(win).getByLabel('Element', { exact: true }).fill('#never');
    await panel(win).getByLabel('Give up after (s)').fill('1');
    await trial.getByRole('button', { name: 'Run' }).click();
    await expect(trial.getByRole('status')).toContainText('Stopped at a failed step: Timed out', { timeout: 60_000 });
    await expect(trial.locator('.run-log li.bad')).toContainText('#never');
    await shop.close();
    await app.close();
  });
}
