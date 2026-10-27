// Window sync (P5 acceptance): what is done in the leader's window happens in the followers' windows, across
// engines: clicks, typing (Chinese too), Enter, scrolling, opening an address, new tabs, working in another tab, closing it.
// Tiling puts the Chromium windows in a grid (moving Firefox windows needs Windows or macOS).
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { account, choose, chromiumProfile, dataDir, ENGINE_ENV, hasKernels, launch, logIn, opened } from './helpers';

test.setTimeout(300_000);

// Each window reports what happened in it, under the name it was given, and when that first arrived.
async function startSite(){
  const logs = new Map<string, string[]>(), times = new Map<string, number>();
  const page = `<!doctype html><title>sync</title>
    <button id="go" style="position:absolute;left:40px;top:40px">Go</button>
    <input id="q" style="position:absolute;left:40px;top:90px">
    <div style="height:5000px"></div>
    <script>
      const log = e => { const who = localStorage.getItem('who'); if (who) navigator.sendBeacon('/log?who=' + who + '&e=' + encodeURIComponent(e)); };
      log('load:' + location.search);
      document.getElementById('go').addEventListener('click', () => log('click:' + location.search));
      document.getElementById('q').addEventListener('keydown', e => { if (e.key === 'Enter') log('enter:' + e.target.value); });
      let t; addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => log('scroll:' + Math.round(scrollY / (document.documentElement.scrollHeight - innerHeight) * 10) / 10), 400); });
    </script>`;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    if (u.pathname === '/log'){
      const who = u.searchParams.get('who')!, e = u.searchParams.get('e')!;
      logs.set(who, [...(logs.get(who) ?? []), e]);
      if (!times.has(`${who} ${e}`)) times.set(`${who} ${e}`, Date.now());
      return res.end();
    }
    res.setHeader('content-type', 'text/html');
    res.end(page);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}/`, logs: (who: string) => logs.get(who) ?? [], when: (who: string, e: string) => times.get(`${who} ${e}`) ?? NaN,
    close: () => new Promise<void>(r => server.close(() => r()))
  };
}

type Running = { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> };
// Names a window: the site's pages report under it.
const name = (app: ElectronApplication, id: string, url: string, who: string) => app.evaluate(async (_e, { id, url, who }) => {
  const ctx = (globalThis as unknown as Running).__folioRunning.get(id)!.ctx;
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto(url);
  await page.evaluate(w => localStorage.setItem('who', w), who);
}, { id, url, who });
// The person working in the leader's window.
const inLeader = (app: ElectronApplication, id: string, step: string, url = '') => app.evaluate(async (_e, { id, step, url }) => {
  const ctx = (globalThis as unknown as Running).__folioRunning.get(id)!.ctx;
  const [first, second] = ctx.pages();
  if (step === 'click') await first.click('#go');
  if (step === 'type'){ await first.click('#q'); await first.keyboard.type('hello'); await first.keyboard.insertText(' 你好'); await first.keyboard.press('Enter'); }
  if (step === 'scroll') await first.mouse.wheel(0, 2500);
  if (step === 'goto') await first.goto(url);
  if (step === 'newtab') await ctx.newPage();
  if (step === 'goto2') await second.goto(url);
  if (step === 'switch'){ await first.bringToFront(); await first.click('#go'); }
  if (step === 'close') await second.close();
  return ctx.pages().length;
}, { id, step, url });
// Where a profile's window is and how big it is, as its page sees it.
const bounds = (app: ElectronApplication, id: string) => app.evaluate((_e, id) => (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages()[0]
  .evaluate(() => [screenX, screenY, outerWidth, outerHeight]), id);
const workArea = (app: ElectronApplication) => app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
const tabs = (app: ElectronApplication, id: string) => app.evaluate((_e, id) => (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages().length, id);

test('the leader’s clicks, typing, scrolling, addresses and tabs repeat in a Chromium and a Firefox follower', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const site = await startSite();
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${acct.workspaceId}`;
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  const lead = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Lead') })).json();
  const cr = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Follow-CR') })).json();
  const fp = await win.evaluate(() => window.folio.newFingerprint('firefox', 'linux'));
  const ff = await (await acct.api.post(`${base}/profiles`, { data: { name: 'Follow-FF', kernel: 'firefox', os: 'linux', ...fp } })).json();
  for (const [p, who] of [[lead, 'lead'], [cr, 'cr'], [ff, 'ff']] as const){
    expect(await opened(win, p.id)).toMatchObject({ state: 'running' });
    await name(app, p.id, `${site.url}?n=0`, who);
  }

  const state = await win.evaluate(ids => window.folio.startWindowSync(ids), [lead.id, cr.id, ff.id]);
  expect(state).toMatchObject({ leader: lead.id, members: [{ id: lead.id }, { id: cr.id }, { id: ff.id }] });
  const all = ['lead', 'cr', 'ff'];
  const settled = async (last: string) => {
    for (const who of all) await expect.poll(() => site.logs(who).at(-1), { timeout: 30_000, message: who }).toBe(last);
  };
  const pause = () => new Promise(r => setTimeout(r, 1700));

  await win.evaluate(url => window.folio.syncGoto(url), `${site.url}?n=1`);
  await settled('load:?n=1');
  await pause();
  await inLeader(app, lead.id, 'click');
  await settled('click:?n=1');
  await inLeader(app, lead.id, 'type');
  await settled('enter:hello 你好');
  await inLeader(app, lead.id, 'scroll');
  await expect.poll(() => site.logs('lead').at(-1)).toMatch(/^scroll:0\.[1-9]/);
  await settled(site.logs('lead').at(-1)!);
  await pause();
  // Opening an address, then a new tab with its own address.
  await inLeader(app, lead.id, 'goto', `${site.url}?n=2`);
  await settled('load:?n=2');
  await pause();
  await inLeader(app, lead.id, 'newtab');
  await expect.poll(() => tabs(app, ff.id)).toBe(2);
  await expect.poll(() => tabs(app, cr.id)).toBe(2);
  await pause();
  await inLeader(app, lead.id, 'goto2', `${site.url}?n=3`);
  await settled('load:?n=3');
  // Back to the first tab, where a click lands in the followers' first tab too; then the second tab closes everywhere.
  await inLeader(app, lead.id, 'switch');
  await settled('click:?n=2');
  await inLeader(app, lead.id, 'close');
  await expect.poll(() => tabs(app, cr.id)).toBe(1);
  await expect.poll(() => tabs(app, ff.id)).toBe(1);

  const seen = (who: string) => site.logs(who).filter(e => e !== 'load:?n=0');
  expect(seen('cr')).toEqual(seen('lead'));
  expect(seen('ff')).toEqual(seen('lead'));
  expect(await win.evaluate(() => window.folio.windowSync())).toMatchObject({ members: [{ issue: null }, { issue: null }, { issue: null }] });

  // Tiling: a 2×2 grid, the leader top left and the Chromium follower beside it; Firefox windows don't move on Linux.
  const area = await workArea(app);
  expect(await win.evaluate(() => window.folio.tileWindows())).toEqual({ moved: 2, missed: 1, why: 'unsupported' });
  const [w, h] = [Math.floor(area.width / 2), Math.floor(area.height / 2)];
  expect(await bounds(app, lead.id)).toEqual([area.x, area.y, w, h]);
  expect(await bounds(app, cr.id)).toEqual([area.x + w, area.y, w, h]);

  // Closing the leader ends the sync.
  await win.evaluate(id => window.folio.stopProfile(id), lead.id);
  await expect.poll(() => win.evaluate(() => window.folio.windowSync())).toBeNull();
  await app.close();
  await site.close();
});

test('window sync starts from the profile list, shows who leads, changes leader and stops; Free is offered an upgrade', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${acct.workspaceId}`;
  for (const n of ['Shop-A', 'Shop-B']) await acct.api.post(`${base}/profiles`, { data: chromiumProfile(n) });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.locator('tr[data-id]')).toHaveCount(2);
  await win.getByLabel('Select this page').check();
  await choose(win.getByTestId('bulk').getByRole('combobox', { name: 'More' }), 'Sync windows');
  const bar = win.getByRole('status', { name: 'Window sync' });
  // The first in the list (newest first) leads.
  await expect(bar).toContainText('Shop-B leads and 1 window follows.', { timeout: 120_000 });
  await expect(win.locator('tr[data-id]', { hasText: 'Shop-B' })).toContainText('Leader');
  await expect(win.locator('tr[data-id]', { hasText: 'Shop-A' })).toContainText('Sync');
  await expect(win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Window sync/ })).toContainText('On');

  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Window sync/ }).click();
  const now = win.getByRole('region', { name: 'Syncing now' });
  await now.locator('[data-sync="Shop-A"]').getByRole('button', { name: 'Make leader' }).click();
  await expect(now.locator('article.lead')).toHaveAttribute('data-sync', 'Shop-A');
  // Tiling side by side, the new leader on the left.
  await win.getByRole('button', { name: 'Tile windows' }).click();
  await expect(now.getByRole('status')).toHaveText('Arranged 2 windows in a grid.');
  const area = await workArea(app);
  const s = (await win.evaluate(() => window.folio.windowSync()))!;
  expect(await bounds(app, s.leader)).toEqual([area.x, area.y, Math.floor(area.width / 2), area.height]);
  expect(await bounds(app, s.members[1].id)).toEqual([area.x + Math.floor(area.width / 2), area.y, Math.floor(area.width / 2), area.height]);
  await win.getByRole('button', { name: 'Stop sync' }).click();
  await expect(win.getByRole('region', { name: 'Pick the windows' })).toBeVisible();
  await app.close();

  // Free: the page explains, and the bulk action is off.
  const free = await account();
  await free.api.post(`/workspaces/${free.workspaceId}/profiles`, { data: chromiumProfile('One') });
  await free.api.post(`/workspaces/${free.workspaceId}/profiles`, { data: chromiumProfile('Two') });
  const app2 = await launch(dataDir());
  const win2 = await logIn(app2, free.email);
  await expect(win2.locator('tr[data-id]')).toHaveCount(2);
  await win2.getByLabel('Select this page').check();
  // Window sync is not offered on the Free plan.
  await win2.getByTestId('bulk').getByRole('combobox', { name: 'More' }).click();
  await expect(win2.getByRole('listbox').getByRole('option', { name: 'Sync windows' })).toHaveCount(0);
  await win2.keyboard.press('Escape');
  await win2.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Window sync/ }).click();
  await expect(win2.getByText('Window sync comes with the Studio and Company plans.')).toBeVisible();
  await app2.close();
});

test('only the chosen operations repeat, each after the pause; the log counts them and the page shows the windows', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const site = await startSite();
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${acct.workspaceId}`;
  const dir = dataDir();
  const app = await launch(dir, ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  const lead = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Lead') })).json();
  const f = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Follower') })).json();
  for (const [p, who] of [[lead, 'lead'], [f, 'f']] as const){
    expect(await opened(win, p.id)).toMatchObject({ state: 'running' });
    await name(app, p.id, `${site.url}?n=0`, who);
  }
  // Scrolling left out, a pause of 1–1.2 s before each repeat.
  expect(await win.evaluate(() => window.folio.setSyncOptions({ scroll: false, delay: [1.2, 1] }))).toEqual({ click: true, typing: true, scroll: false, delay: [1, 1.2] });
  await win.evaluate(ids => window.folio.startWindowSync(ids), [lead.id, f.id]);
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Window sync/ }).click();
  const now = win.getByRole('region', { name: 'Syncing now' });
  await expect(now.getByRole('group', { name: 'Repeat' }).getByRole('button', { name: 'Scrolling' })).toHaveAttribute('aria-pressed', 'false');
  await expect(now.getByRole('group', { name: 'Repeat' }).getByRole('button', { name: 'Clicks' })).toHaveAttribute('aria-pressed', 'true');
  // A picture of each window, while the page is open.
  await expect(now.locator('img.thumb')).toHaveCount(2, { timeout: 20_000 });
  await expect(now.locator('img.thumb').first()).toHaveAttribute('src', /^data:image\/jpeg;base64,/);

  await inLeader(app, lead.id, 'click');
  await expect.poll(() => site.logs('f').at(-1), { timeout: 15_000 }).toBe('click:?n=0');
  expect(site.when('f', 'click:?n=0') - site.when('lead', 'click:?n=0')).toBeGreaterThanOrEqual(900);
  await inLeader(app, lead.id, 'scroll');
  await expect.poll(() => site.logs('lead').at(-1)).toMatch(/^scroll:/);
  await new Promise(r => setTimeout(r, 3000));
  expect(site.logs('f').filter(e => e.startsWith('scroll'))).toEqual([]);

  const log = await win.evaluate(() => window.folio.syncLog());
  expect(log.find(e => e.action.t === 'click')).toMatchObject({ action: { t: 'click', label: 'Go' }, of: 1, ok: 1, problems: [] });
  expect(log.some(e => e.action.t === 'scroll')).toBe(false);
  const row = now.getByRole('region', { name: 'Recent sync' }).locator('li[data-entry="click"]');
  await expect(row).toContainText('Clicked “Go”');
  await expect(row).toContainText('1 / 1');
  await win.evaluate(() => window.folio.stopWindowSync());
  await app.close();

  // The choice stays on this computer.
  const again = await launch(dir);
  expect(await (await again.firstWindow()).evaluate(() => window.folio.syncOptions())).toEqual({ click: true, typing: true, scroll: false, delay: [1, 1.2] });
  await again.close();
  await site.close();
});
