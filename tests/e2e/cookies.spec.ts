// The Cookies tab: cookies come in after a preview, are listed without their values, shown on request, edited and
// deleted (in the open browser too); sign-ins kept on one computer; cookies in spreadsheets.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { account, choose, chromiumProfile, dataDir, detail, ENGINE_ENV, hasKernels, lastStatus, launch, logIn, opened } from './helpers';

test.setTimeout(180_000);
const cookies = JSON.stringify([
  { domain: '.shop.example', expirationDate: 1893456000, hostOnly: false, httpOnly: true, name: 'sid', path: '/', sameSite: 'lax', secure: true, session: false, value: 'abc' },
  { domain: 'shop.example', hostOnly: true, httpOnly: false, name: 'pref', path: '/', sameSite: 'strict', secure: false, session: true, value: 'dark' }
]);
// Saving goes where the test says, instead of asking.
const saveTo = (app: ElectronApplication, path: string) => app.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
}, path);
async function importText(win: Page, name: string, text: string, n: number){
  await detail(win).getByRole('button', { name: 'Import cookies' }).click();
  const dialog = win.getByRole('dialog', { name: `Import cookies into ${name}` });
  await dialog.getByRole('textbox', { name: 'Paste text' }).fill(text);
  await dialog.getByRole('button', { name: `Import ${n} ${n === 1 ? 'cookie' : 'cookies'}` }).click();
  await expect(win.getByRole('status').filter({ hasText: `${n} ${n === 1 ? 'cookie' : 'cookies'} imported` })).toBeVisible();
}

test('cookies come in after a preview; values show on request; edited, deleted and exported; kept on one computer, none listed', async () => {
  const acct = await account();
  const p = await (await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: chromiumProfile('Shop-07') })).json();
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('button', { name: 'Shop-07', exact: true }).click();
  const page = detail(win);
  await page.getByRole('tab', { name: 'Cookies' }).click();
  await expect(page).toContainText('Nothing saved yet');

  // The preview says what each entry is before anything comes in.
  await page.getByRole('button', { name: 'Import cookies' }).click();
  const dialog = win.getByRole('dialog', { name: 'Import cookies into Shop-07' });
  await dialog.getByRole('textbox', { name: 'Paste text' }).fill(JSON.stringify([...JSON.parse(cookies), { name: 'broken', domain: 'shop.example' }]));
  await expect(dialog).toContainText('Read as JSON.');
  await expect(dialog).toContainText('2 valid · 1 invalid');
  await expect(dialog.locator('tr[data-entry="3"]')).toContainText('No value');
  await dialog.getByRole('button', { name: 'Import 2 cookies' }).click();
  await expect(win.getByRole('status').filter({ hasText: '2 cookies imported' })).toBeVisible();
  const rows = page.locator('tr[data-cookie]');
  await expect(rows).toHaveCount(2);
  await expect(page).toContainText('2 cookies');

  // Values stay hidden until asked for, and the read is recorded.
  await rows.filter({ hasText: 'sid' }).click();
  const panel = page.getByRole('complementary', { name: 'Cookie details' });
  await expect(panel.getByTestId('cookie-value')).toHaveText('••••••••••');
  await panel.getByRole('button', { name: 'Show' }).click();
  await expect(panel.getByTestId('cookie-value')).toHaveText('abc');
  const log = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/activity?profileId=${p.id}`)).json()).entries as { action: string }[];
  expect(log.map(e => e.action)).toContain('cookies.export');

  // A cookie already saved is replaced, or kept when asked.
  await page.getByRole('button', { name: 'Import cookies' }).click();
  await dialog.getByRole('textbox', { name: 'Paste text' }).fill(JSON.stringify([{ name: 'sid', value: 'new', domain: '.shop.example', path: '/' }, { name: 'lang', value: 'de', domain: 'shop.example', path: '/' }]));
  await expect(dialog.locator('tr[data-entry="1"]')).toContainText('replaces the saved one');
  await dialog.getByRole('radio', { name: 'Keep saved' }).check();
  await expect(dialog.locator('tr[data-entry="1"]')).toContainText('already saved: kept');
  await dialog.getByRole('button', { name: 'Import 1 cookie' }).click();
  await expect(rows).toHaveCount(3);

  // Edited to a new value; deleted after asking.
  await rows.filter({ hasText: 'lang' }).getByRole('button', { name: 'Edit' }).click();
  const edit = win.getByRole('dialog', { name: 'Edit cookie' });
  await expect(edit.getByLabel('Value')).toHaveValue('de');
  await edit.getByLabel('Value').fill('fr');
  await edit.getByRole('button', { name: 'Save cookie' }).click();
  await expect(edit).toBeHidden();
  await rows.filter({ hasText: 'pref' }).getByRole('button', { name: 'Actions for pref' }).click();
  await win.getByRole('menuitem', { name: 'Delete' }).click();
  await win.getByRole('dialog', { name: 'Delete this cookie?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(win.getByRole('status').filter({ hasText: '1 cookie deleted' })).toBeVisible();
  await expect(rows).toHaveCount(2);
  const values = (await (await acct.api.get(`/profiles/${p.id}/cookies/values`)).json()).cookies as { name: string; value: string }[];
  expect(values.map(c => `${c.name}=${c.value}`).sort()).toEqual(['lang=fr', 'sid=abc']);

  // Exported as Cookie-Editor JSON.
  const out = join(mkdtempSync(join(tmpdir(), 'folio-export-')), 'shop.json');
  await saveTo(app, out);
  await choose(page.getByRole('combobox', { name: 'Export' }), 'JSON');
  await expect(win.getByRole('status').filter({ hasText: `1 profile exported to ${out}` })).toBeVisible();
  const exported = JSON.parse(readFileSync(out, 'utf8'));
  expect(exported.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).sort()).toEqual(['lang=fr', 'sid=abc']);

  // Kept on one computer: Folio holds no copy, so there is nothing to list.
  await page.getByRole('button', { name: 'Edit profile' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await choose(form.getByLabel('Sign-ins'), 'Keep on the computer that uses it');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toContainText('Folio holds no copy to list here');
  await expect(page.getByRole('combobox', { name: 'Export' })).toHaveCount(0);
  const saved = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/profiles`)).json()).profiles[0];
  expect(saved).toMatchObject({ syncMode: 'local', data: null });
  await app.close();
});

test('a spreadsheet can bring cookies with each profile', async () => {
  const acct = await account();
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = win.getByRole('dialog', { name: 'Import profiles' });
  await dialog.getByRole('textbox', { name: 'CSV' }).fill(`name,cookies\nWith-Cookies,"${cookies.replace(/"/g, '""')}"\nWithout,`);
  await dialog.getByRole('button', { name: 'Import 2 profiles' }).click();
  // Profiles are created first and their cookies imported after; the notice comes when both are done.
  await expect(win.getByRole('status').filter({ hasText: '2 profiles imported' })).toBeVisible();
  await expect(win.locator('tr[data-id]')).toHaveCount(2);
  const list = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/profiles`)).json()).profiles;
  expect(list.map((p: { name: string; data: { cookies: number } | null }) => [p.name, p.data?.cookies ?? 0])).toEqual([['With-Cookies', 2], ['Without', 0]]);
  await app.close();
});

test('cookies imported into a running profile reach its browser at once, and deleted ones leave it', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account();
  const p = await (await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: chromiumProfile('Live') })).json();
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(await opened(win, p.id)).toMatchObject({ state: 'running' });
  await win.getByRole('button', { name: 'Live', exact: true }).click();
  await detail(win).getByRole('tab', { name: 'Cookies' }).click();
  await importText(win, 'Live', cookies, 2);
  const inBrowser = () => app.evaluate(async (_e, id) => {
    const r = (globalThis as unknown as { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> }).__folioRunning.get(id)!;
    return (await r.ctx.cookies()).map(c => c.name).sort();
  }, p.id);
  expect(await inBrowser()).toEqual(['pref', 'sid']);

  // Deleted while it runs: out of the browser as well, so closing it doesn't bring the cookie back.
  const rows = detail(win).locator('tr[data-cookie]');
  await rows.filter({ hasText: 'sid' }).getByRole('button', { name: 'Actions for sid' }).click();
  await win.getByRole('menuitem', { name: 'Delete' }).click();
  await win.getByRole('dialog', { name: 'Delete this cookie?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(rows).toHaveCount(1);
  expect(await inBrowser()).toEqual(['pref']);
  await win.evaluate(id => window.folio.stopProfile(id), p.id);
  await expect.poll(async () => (await lastStatus(win, p.id))?.state, { timeout: 60_000 }).toBe('stopped');
  const left = (await (await acct.api.get(`/profiles/${p.id}/cookies`)).json()).cookies as { name: string }[];
  expect(left.map(c => c.name)).not.toContain('sid');
  await app.close();
});
