// Taking cookies out and bringing them in, keeping sign-ins on one computer, and cookies in spreadsheets.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { ENGINE_ENV, account, chromiumProfile, dataDir, hasKernels, lastStatus, launch, logIn, opened } from './helpers';

test.setTimeout(180_000);
const cookies = JSON.stringify([
  { domain: '.shop.example', expirationDate: 1893456000, hostOnly: false, httpOnly: true, name: 'sid', path: '/', sameSite: 'lax', secure: true, session: false, value: 'abc' },
  { domain: 'shop.example', hostOnly: true, httpOnly: false, name: 'pref', path: '/', sameSite: 'strict', secure: false, session: true, value: 'dark' }
]);
const detail = (win: Page) => win.getByRole('complementary', { name: 'Profile' });
// Saving goes where the test says, instead of asking.
const saveTo = (app: ElectronApplication, path: string) => app.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
}, path);
async function importFile(win: Page, text: string){
  await detail(win).getByTestId('storage').locator('input[type=file]').setInputFiles({ name: 'cookies.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}

test('cookies come in from a file and go out as JSON; kept on one computer, Folio holds no copy', async () => {
  const acct = await account();
  await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: chromiumProfile('Shop-07') });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await win.getByRole('button', { name: 'Shop-07', exact: true }).click();
  const storage = detail(win).getByTestId('storage');
  await expect(storage).toContainText('Nothing saved yet');

  await importFile(win, cookies);
  await expect(win.getByRole('status').filter({ hasText: '2 cookies imported' })).toBeVisible();
  await expect(storage.locator('.store')).toContainText('2Cookies');

  const out = join(mkdtempSync(join(tmpdir(), 'folio-export-')), 'shop.json');
  await saveTo(app, out);
  await storage.getByRole('button', { name: 'JSON' }).click();
  await expect(win.getByRole('status').filter({ hasText: `1 profile exported to ${out}` })).toBeVisible();
  const exported = JSON.parse(readFileSync(out, 'utf8'));
  expect(exported.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).sort()).toEqual(['pref=dark', 'sid=abc']);

  await detail(win).getByRole('button', { name: 'Edit' }).click();
  const form = win.getByRole('dialog', { name: 'Edit profile' });
  await form.getByLabel('Sign-ins').selectOption({ label: 'Keep on the computer that uses it' });
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(storage).toContainText('Kept on the computer that uses it; Folio holds no copy.');
  await expect(storage.getByRole('button', { name: 'JSON' })).toHaveCount(0);
  const p = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/profiles`)).json()).profiles[0];
  expect(p).toMatchObject({ syncMode: 'local', data: null });
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
  await expect(win.locator('tr[data-id]')).toHaveCount(2);
  const list = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/profiles`)).json()).profiles;
  expect(list.map((p: { name: string; data: { cookies: number } | null }) => [p.name, p.data?.cookies ?? 0])).toEqual([['With-Cookies', 2], ['Without', 0]]);
  await app.close();
});

test('cookies imported into a running profile reach its browser at once', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account();
  const p = await (await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, { data: chromiumProfile('Live') })).json();
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByTestId('plan-name')).toBeVisible();
  expect(await opened(win, p.id)).toMatchObject({ state: 'running' });
  await win.getByRole('button', { name: 'Live', exact: true }).click();
  await importFile(win, cookies);
  await expect(win.getByRole('status').filter({ hasText: '2 cookies imported' })).toBeVisible();
  const inBrowser = await app.evaluate(async (_e, id) => {
    const r = (globalThis as unknown as { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> }).__folioRunning.get(id)!;
    return (await r.ctx.cookies()).map(c => c.name).sort();
  }, p.id);
  expect(inBrowser).toEqual(['pref', 'sid']);
  await win.evaluate(id => window.folio.stopProfile(id), p.id);
  await expect.poll(async () => (await lastStatus(win, p.id))?.state, { timeout: 60_000 }).toBe('stopped');
  // Closing saved what the browser had (the session cookie does not outlive the browser).
  const saved = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/profiles`)).json()).profiles[0];
  expect(saved.data.cookies).toBeGreaterThanOrEqual(1);
  await app.close();
});
