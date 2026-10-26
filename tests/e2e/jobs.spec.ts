// The task center: proxies checked together are a job with each one's result, and retrying runs only the failed ones
// again; an import is a job whose lines say what came in and why the rest didn't.
import { expect, test, type Page } from '@playwright/test';
import { API, account, dataDir, launch, logIn } from './helpers';

const nav = (win: Page, name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

test('proxies checked together are a job, and a retry runs the failed ones again', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `${API}/workspaces/${acct.workspaceId}`;
  // Nothing listens on these ports: both checks fail.
  for (const [name, port] of [['Dead-1', 9], ['Dead-2', 19]] as const) await acct.api.post(`${base}/proxies`, { data: { name, type: 'socks5', host: '127.0.0.1', port } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await nav(win, 'Proxies');
  await win.getByRole('button', { name: 'Check all' }).click();
  await nav(win, 'Task center');
  const row = win.locator('tr[data-job="proxy.check"]');
  await expect(row).toContainText('Failed', { timeout: 60_000 });
  await expect(row).toContainText('2 / 2');
  await row.getByRole('button', { name: 'View' }).click();
  const panel = win.getByRole('complementary', { name: 'Check proxies' });
  await expect(panel.locator('tr[data-item]')).toHaveCount(2);
  await expect(panel.locator('tr[data-item="Dead-1"]')).toContainText('Failed');
  await panel.getByRole('button', { name: 'Retry failed (2)' }).click();
  const jobs = async () => (await (await acct.api.get(`${base}/jobs`)).json()).jobs as { id: string; kind: string; status: string; failed: number }[];
  await expect.poll(async () => (await jobs())[0], { timeout: 60_000 }).toMatchObject({ kind: 'proxy.check', status: 'partial', failed: 2 });
  const items = (await (await acct.api.get(`${API}/jobs/${(await jobs())[0].id}`)).json()).items as { attempts: number }[];
  expect(items.map(i => i.attempts)).toEqual([2, 2]);
  await panel.getByRole('tab', { name: 'Log' }).click();
  await expect(panel.getByRole('listitem')).not.toHaveCount(0);
  await app.close();
});

test('an import is a job whose lines say what came in and why the rest didn’t', async () => {
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const app = await launch(dataDir());
  const win = await logIn(app, acct.email);
  await nav(win, 'Proxies');
  await win.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = win.getByRole('dialog', { name: 'Import proxies' });
  await dialog.getByRole('textbox', { name: /^Proxy list/ }).fill('one.example.net:1080\nnot a proxy');
  await expect(dialog.getByTestId('import-counts')).toContainText('1 valid');
  await dialog.getByRole('button', { name: 'Import 1 proxy' }).click();
  await expect(dialog).toBeHidden();
  await nav(win, 'Task center');
  const row = win.locator('tr[data-job="proxy.import"]');
  await expect(row).toContainText('Partly failed');
  await row.getByRole('button', { name: 'View' }).click();
  const panel = win.getByRole('complementary', { name: 'Import proxies' });
  await expect(panel.locator('tr[data-item="not a proxy"]')).toContainText('Not a proxy line');
  await expect(panel.locator('tr[data-item="one.example.net:1080"]')).toContainText('Done');
  // Nothing to retry: a line that couldn't be read fails the same way again.
  await expect(panel.getByRole('button', { name: /^Retry failed/ })).toHaveCount(0);
  await app.close();
});
