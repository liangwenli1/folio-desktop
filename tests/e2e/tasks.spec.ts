// Tasks: the P4 acceptance. A flow runs on ten profiles three at a time; the ones that fail are tried again, the
// results export as CSV, and another person in the team sees the same run.
import { mkdtempSync, readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { account, choose, chromiumProfile, dataDir, ENGINE_ENV, hasKernels, launch, logIn } from './helpers';

test.setTimeout(420_000);
const nav = (win: Page, name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });
const saveTo = (app: ElectronApplication, path: string) => app.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
}, path);

// A site that counts how many profiles are between their visit and their leave, and turns some away the first time.
async function startSite(failFirst: string[]){
  const inside = new Set<string>(), visits = new Map<string, number>();
  let most = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x'), p = u.searchParams.get('p') ?? '';
    res.setHeader('content-type', 'text/html');
    if (u.pathname === '/visit'){
      inside.add(p); most = Math.max(most, inside.size);
      const n = (visits.get(p) ?? 0) + 1;
      visits.set(p, n);
      return res.end(failFirst.includes(p) && n === 1 ? '<title>busy</title>Try later' : `<title>ok</title><p id="ok">visited ${p} ${u.searchParams.get('code')}</p>`);
    }
    if (u.pathname === '/leave') inside.delete(p);
    res.end('<title>bye</title>');
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}/`, most: () => most, visits, close: () => new Promise<void>(r => server.close(() => r())) };
}

test('a flow runs on 10 profiles 3 at a time, failures are retried, and the results export as CSV', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const site = await startSite(['0003', '0009']);
  const owner = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${owner.workspaceId}`;
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, owner.email);
  await expect(win.getByTestId('plan-name')).toBeVisible();
  for (let i = 1; i <= 8; i++) await owner.api.post(`${base}/profiles`, { data: chromiumProfile(`Shop-${String(i).padStart(2, '0')}`) });
  for (const name of ['Shop-09', 'Shop-10']){
    const fp = await win.evaluate(() => window.folio.newFingerprint('firefox', 'linux'));
    await owner.api.post(`${base}/profiles`, { data: { name, kernel: 'firefox', os: 'linux', ...fp } });
  }
  await owner.api.post(`${base}/flows`, { data: { name: 'Visit', steps: [
    { type: 'open', url: `${site.url}visit?p={{profile.number}}&code={{code}}` },
    { type: 'wait', until: 'visible', seconds: 3, maxSeconds: null, selector: '#ok' },
    { type: 'extract', selector: '#ok', attribute: null, variable: 'visit' },
    { type: 'wait', until: 'time', seconds: 1.5, maxSeconds: null, selector: null },
    { type: 'open', url: `${site.url}leave?p={{profile.number}}` }
  ] } });

  // The task, made in the workbench: every profile, three at a time, one retry, a code per profile.
  await nav(win, 'Scheduled tasks').click();
  await win.getByRole('button', { name: 'New task' }).click();
  const form = win.getByRole('dialog', { name: 'New task' });
  await form.getByLabel('Name').fill('Daily visit');
  await form.getByLabel('Select all shown').check();
  await expect(form.getByText('Profiles · 10 selected')).toBeVisible();
  await choose(form.getByLabel('At a time'), '3');
  await choose(form.getByLabel('When one fails'), 'Retry once');
  await form.getByRole('textbox', { name: 'Variables per profile' }).fill(['profile,code', ...Array.from({ length: 10 }, (_, i) => `#${i + 1},c${i + 1}`)].join('\n'));
  await expect(form.getByRole('status')).toHaveText('code for 10 profiles.');
  await form.getByRole('button', { name: 'Create task' }).click();
  await expect(win.getByRole('heading', { name: 'Daily visit' })).toBeVisible();

  await win.getByRole('button', { name: 'Run', exact: true }).click();
  const results = win.getByRole('region', { name: 'Run results' });
  await expect(results.locator('.run-sum')).toContainText('Finished', { timeout: 300_000 });
  await expect(results.locator('.run-sum')).toContainText('10 done');
  expect(site.most()).toBe(3);
  expect(site.visits.get('0003')).toBe(2);
  expect(site.visits.get('0009')).toBe(2);
  expect(site.visits.get('0001')).toBe(1);
  const retried = results.locator('tr[data-item="Shop-03"]');
  await expect(retried.locator('td').nth(2)).toHaveText('2');
  await retried.getByRole('button', { name: 'Shop-03' }).click();
  await expect(results.locator('.log-row')).toContainText('Try 1');
  await expect(results.locator('.log-row')).toContainText('Timed out');
  await expect(results.locator('tr[data-item="Shop-10"]')).toContainText('visited 0010 c10');

  const out = join(mkdtempSync(join(tmpdir(), 'folio-run-')), 'run.csv');
  await saveTo(app, out);
  await results.getByRole('button', { name: 'Export CSV' }).click();
  await expect(win.getByRole('status').filter({ hasText: `Saved to ${out}` })).toBeVisible();
  const lines = readFileSync(out, 'utf8').replace(/^﻿/, '').split('\r\n');
  expect(lines[0]).toBe('Number,Profile,Result,Tries,Problem,visit');
  expect(lines).toHaveLength(11);
  expect(lines[3]).toBe('0003,Shop-03,Done,2,,visited 0003 c3');

  // Another person in the team sees the same run and its results.
  const admin = await account();
  const inv = await owner.api.post(`${base}/invitations`, { data: { email: admin.email, role: 'admin', departmentIds: [] } });
  expect(inv.ok()).toBe(true);
  await owner.api.patch(base, { data: { name: 'Larkspur Trading' } });
  const app2 = await launch(dataDir());
  const win2 = await logIn(app2, admin.email);
  await win2.getByTestId('ws-name').click();
  await win2.locator('[data-invite="Larkspur Trading"]').getByRole('button', { name: 'Join' }).click();
  await nav(win2, 'Scheduled tasks').click();
  await expect(win2.locator('tr[data-task="Daily visit"]')).toContainText('Finished10 done');
  await win2.getByRole('button', { name: 'Daily visit', exact: true }).click();
  await expect(win2.getByRole('region', { name: 'Run results' }).locator('tr[data-item]')).toHaveCount(10);
  await app2.close();
  await app.close();
  await site.close();
});

test('stopping a run closes what is open and leaves the rest not run', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const site = await startSite([]);
  const owner = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${owner.workspaceId}`;
  const ids: string[] = [];
  for (let i = 1; i <= 4; i++) ids.push((await (await owner.api.post(`${base}/profiles`, { data: chromiumProfile(`Slow-${i}`) })).json()).id);
  const flow = await (await owner.api.post(`${base}/flows`, { data: { name: 'Linger', steps: [
    { type: 'open', url: `${site.url}visit?p={{profile.number}}` }, { type: 'wait', until: 'time', seconds: 60, maxSeconds: null, selector: null }
  ] } })).json();
  await owner.api.post(`${base}/tasks`, { data: { name: 'Linger', flowId: flow.id, profileIds: ids, concurrency: 2, retries: 0, timeoutMin: 5 } });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, owner.email);
  await nav(win, 'Scheduled tasks').click();
  await win.getByRole('button', { name: 'Run Linger' }).click();
  await expect.poll(() => site.visits.size, { timeout: 60_000 }).toBe(2);
  await win.locator('tr[data-task="Linger"]').getByRole('button', { name: 'Stop' }).click();
  await expect(win.locator('tr[data-task="Linger"]')).toContainText('Stopped', { timeout: 60_000 });
  await expect(win.locator('tr[data-task="Linger"]')).toContainText('4 not run');
  // Nothing is left open, and the run took the profiles' locks with it.
  const list = (await (await owner.api.get(`${base}/profiles`)).json()).profiles;
  expect(list.every((p: { lock: unknown }) => p.lock === null)).toBe(true);
  expect(await win.evaluate(() => window.folio.statuses())).toEqual([]);
  await app.close();
  await site.close();
});
