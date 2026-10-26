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
  // How it went: why the failed ones failed is a click away, and so is running them again.
  const told = win.getByRole('status').filter({ hasText: 'Check proxies: 0 done, 2 failed' });
  await expect(told.getByRole('button', { name: 'Retry failed (2)' })).toBeVisible({ timeout: 60_000 });
  await told.getByRole('button', { name: 'See why' }).click();
  const row = win.locator('tr[data-job="proxy.check"]');
  await expect(row).toContainText('Failed');
  await expect(row).toContainText('2 / 2');
  const panel = win.getByRole('complementary', { name: 'Check proxies' });
  await expect(panel.locator('tr[data-item]')).toHaveCount(2);
  await expect(panel.locator('tr[data-item="Dead-1"]')).toContainText('Failed');
  await panel.getByRole('button', { name: 'Retry failed (2)' }).click();
  // Settled again only once both were tried a second time (until then it still reads as it did before the retry).
  const job = (await (await acct.api.get(`${base}/jobs`)).json()).jobs[0] as { id: string };
  await expect.poll(async () => {
    const j = (await (await acct.api.get(`${API}/jobs/${job.id}`)).json()) as { kind: string; status: string; failed: number; items: { attempts: number }[] };
    return { kind: j.kind, status: j.status, failed: j.failed, attempts: j.items.map(i => i.attempts) };
  }, { timeout: 60_000 }).toEqual({ kind: 'proxy.check', status: 'partial', failed: 2, attempts: [2, 2] });
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
