// A profile's search engine, the page it opens with, and the tabs it comes back with (PLAN 6.14), with the real engines.
// No site is reachable from the test machine, so the search engines' home pages are seen in what the proxy forwarded.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { startSocks5 } from '../fixtures/proxies';
import { ENGINE_ENV, account, closeWindows, dataDir, hasKernels, lastStatus, launch, logIn, opened, startProbe } from './helpers';

test.skip(!hasKernels, 'browser engines are not unpacked here');
test.setTimeout(300_000);

type Running = Map<string, { ctx: import('playwright-core').BrowserContext }>;
const tabsOf = (app: ElectronApplication, id: string) =>
  app.evaluate((_e, id) => (globalThis as unknown as { __folioRunning: Running }).__folioRunning.get(id)?.ctx.pages().map(p => p.url()) ?? null, id);
const goTo = (app: ElectronApplication, id: string, urls: string[]) => app.evaluate(async (_e, { id, urls }) => {
  const r = (globalThis as unknown as { __folioRunning: Running }).__folioRunning.get(id)!;
  for (const [i, u] of urls.entries()) await (i === 0 ? r.ctx.pages()[0] : await r.ctx.newPage()).goto(u);
}, { id, urls });
// Chromium's settings page names the address bar's engine just before its "Change" button.
const chromiumEngine = (app: ElectronApplication, id: string) => app.evaluate(async (_e, id) => {
  const r = (globalThis as unknown as { __folioRunning: Running }).__folioRunning.get(id)!;
  const page = await r.ctx.newPage();
  await page.goto('chrome://settings/search');
  const name = await page.waitForFunction(() => {
    const t: string[] = [];
    const walk = (n: Node) => { if (n.nodeType === 3 && n.textContent!.trim()) t.push(n.textContent!.trim()); if ((n as Element).shadowRoot) walk((n as Element).shadowRoot!); n.childNodes.forEach(walk); };
    walk(document.body);
    const i = t.indexOf('Change');
    return i > 0 ? t[i - 1] : null;
  });
  const v = await name.jsonValue();
  await page.close();
  return v;
}, id);
// Firefox keeps its search settings in search.json.mozlz4: "mozLz40\0", the size, then one LZ4 block.
function firefoxSearch(dir: string){
  const file = join(dir, 'search.json.mozlz4');
  if (!existsSync(file)) return null;
  const buf = readFileSync(file), size = buf.readUInt32LE(8), src = buf.subarray(12), out = Buffer.alloc(size);
  let i = 0, o = 0;
  while (i < src.length){
    const tok = src[i++];
    let lit = tok >> 4;
    if (lit === 15){ let b; do { b = src[i++]; lit += b; } while (b === 255); }
    src.copy(out, o, i, i + lit); i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2;
    let m = tok & 15;
    if (m === 15){ let b; do { b = src[i++]; m += b; } while (b === 255); }
    for (let k = 0, n = m + 4; k < n; k++, o++) out[o] = out[o - off];
  }
  const j = JSON.parse(out.subarray(0, o).toString('utf8')) as { engines: { _name: string; _metaData?: { hidden?: boolean } }[]; metaData: { appDefaultEngineId?: string } };
  return { shown: j.engines.filter(e => !e._metaData?.hidden).map(e => e._name), default: j.metaData.appDefaultEngineId };
}

async function setup(){
  const upstream = await startSocks5('alice', 's3cret');
  const probe = await startProbe();
  const acct = await account();
  const base = `/workspaces/${acct.workspaceId}`;
  const proxy = await (await acct.api.post(`${base}/proxies`, { data: { type: 'socks5', host: '127.0.0.1', port: upstream.port, username: 'alice', password: 's3cret' } })).json();
  const userData = dataDir();
  const app = await launch(userData, ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  const userId = (await (await acct.api.get('/me')).json()).user.id as string;
  const folder = (id: string) => join(userData, 'profiles', userId, id);
  const create = async (name: string, kernel: 'chromium' | 'firefox', extra: Record<string, unknown>) => {
    const { fingerprint, kernelVersion } = await win.evaluate(k => window.folio.newFingerprint(k, 'linux'), kernel);
    return (await (await acct.api.post(`${base}/profiles`, { data: { name, kernel, kernelVersion, os: 'linux', fingerprint, proxyId: proxy.id, ...extra } })).json()) as { id: string; version: number };
  };
  const close = async (id: string) => {
    await closeWindows(app, id);
    await expect.poll(async () => (await lastStatus(win, id))?.state, { timeout: 60_000 }).toBe('stopped');
  };
  const edit = async (id: string, patch: object) => {
    const p = (await (await acct.api.get(`${base}/profiles`)).json()).profiles.find((x: { id: string }) => x.id === id);
    expect((await acct.api.patch(`/profiles/${id}`, { data: { version: p.version, ...patch } })).ok()).toBe(true);
  };
  const connects = (host: string) => upstream.seen.filter(s => s === `${host}:443`).length;
  const settings = async (s: object) => expect((await acct.api.patch(base, { data: { settings: s } })).ok()).toBe(true);
  return { upstream, probe, app, win, folder, create, close, edit, connects, settings, done: async () => { await app.close(); await upstream.close(); await probe.close(); } };
}

// The page a profile starts on, and a window of its own size, in both engines. (A maximised window needs a window
// manager to maximise it, which this test machine has none of; that one is checked on Windows and macOS.)
for (const kernel of ['chromium', 'firefox'] as const){
  test(`${kernel}: a profile opens on its start page, in a window of its own size`, async () => {
    const t = await setup();
    const p = await t.create(`Start-${kernel}`, kernel, { startUrl: t.probe.url, windowMode: 'custom', windowWidth: 1000, windowHeight: 700 });
    expect(await opened(t.win, p.id)).toMatchObject({ state: 'running' });
    await expect.poll(() => tabsOf(t.app, p.id), { timeout: 30_000 }).toEqual([t.probe.url]);
    const size = await t.app.evaluate(async (_e, id) => {
      const r = (globalThis as unknown as { __folioRunning: Running }).__folioRunning.get(id)!;
      return r.ctx.pages()[0].evaluate(() => [window.outerWidth, window.outerHeight]);
    }, p.id);
    expect(size).toEqual([1000, 700]);
    await t.close(p.id);
    await t.done();
  });
}

// Closing the last window stops a profile (the tests above), unless the workspace keeps it running: then the engine
// stays up without a window, Go to window opens the tabs it was closed with again, and Stop ends it.
for (const kernel of ['chromium', 'firefox'] as const){
  test(`${kernel}: kept running after its last window closes, it opens a window again from the list`, async () => {
    const t = await setup();
    await t.settings({ stopOnWindowClose: false });
    const p = await t.create(`Keep-${kernel}`, kernel, { startUrl: t.probe.url });
    expect(await opened(t.win, p.id)).toMatchObject({ state: 'running' });
    await expect.poll(() => tabsOf(t.app, p.id), { timeout: 30_000 }).toEqual([t.probe.url]);
    await closeWindows(t.app, p.id);
    await expect.poll(() => lastStatus(t.win, p.id)).toMatchObject({ state: 'running', noWindow: true });
    expect(await tabsOf(t.app, p.id)).toEqual([]);
    const row = t.win.locator(`tr[data-id="${p.id}"]`);
    await expect(row).toContainText('Running · window closed');
    await row.getByRole('button', { name: 'Go to window' }).click();
    await expect.poll(() => tabsOf(t.app, p.id), { timeout: 30_000 }).toEqual([t.probe.url]);
    await expect(row).not.toContainText('window closed');
    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect.poll(async () => (await lastStatus(t.win, p.id))?.state, { timeout: 60_000 }).toBe('stopped');
    await t.done();
  });
}

test('chromium: a used profile changed to Baidu searches with it and opens its home page, then the tabs it was closed with', async () => {
  const t = await setup();
  const p = await t.create('Search-01', 'chromium', {});
  // No search engine: as the engine ships, on a blank page.
  expect(await opened(t.win, p.id)).toMatchObject({ state: 'running' });
  expect(await tabsOf(t.app, p.id)).toEqual(['about:blank']);
  expect(await chromiumEngine(t.app, p.id)).toBe('No Search');
  await t.close(p.id);

  // Changed afterwards (Chromium keeps the choice itself, signed on Windows and macOS): its home page, straight away.
  await t.edit(p.id, { searchEngine: 'baidu' });
  expect(await opened(t.win, p.id)).toMatchObject({ state: 'running' });
  await expect.poll(() => t.connects('www.baidu.com')).toBeGreaterThan(0);
  expect(await chromiumEngine(t.app, p.id)).toBe('Baidu');

  // Two tabs open when the browser is closed come back, in order, the next time.
  const a = `${t.probe.url}a`, b = `${t.probe.url}b`;
  await goTo(t.app, p.id, [a, b]);
  await t.close(p.id);
  const homes = t.connects('www.baidu.com');
  expect(await opened(t.win, p.id)).toMatchObject({ state: 'running' });
  await expect.poll(() => tabsOf(t.app, p.id)).toEqual([a, b]);
  expect(t.connects('www.baidu.com')).toBe(homes);
  expect(await chromiumEngine(t.app, p.id)).toBe('Baidu');

  // Restoring turned off: the home page again, and the tabs are still kept for later.
  await t.close(p.id);
  await t.edit(p.id, { restoreTabs: false });
  expect(await opened(t.win, p.id)).toMatchObject({ state: 'running' });
  await expect.poll(() => t.connects('www.baidu.com')).toBeGreaterThan(homes);

  // Back to none: No Search again, on a blank page.
  await t.close(p.id);
  await t.edit(p.id, { searchEngine: 'none' });
  const before = t.connects('www.baidu.com');
  expect(await opened(t.win, p.id)).toMatchObject({ state: 'running' });
  expect(await tabsOf(t.app, p.id)).toEqual(['about:blank']);
  expect(await chromiumEngine(t.app, p.id)).toBe('No Search');
  expect(t.connects('www.baidu.com')).toBe(before);
  await t.done();
});

test('firefox: two profiles open together each get their own search engine; tabs come back', async () => {
  const t = await setup();
  const a = await t.create('Fox-Baidu', 'firefox', { searchEngine: 'baidu' });
  const b = await t.create('Fox-Bing', 'firefox', { searchEngine: 'bing' });
  const [sa, sb] = await Promise.all([opened(t.win, a.id), opened(t.win, b.id)]);
  expect([sa.state, sb.state]).toEqual(['running', 'running']);
  await expect.poll(() => [t.connects('www.baidu.com') > 0, t.connects('www.bing.com') > 0], { timeout: 30_000 }).toEqual([true, true]);
  await expect.poll(() => firefoxSearch(t.folder(a.id)), { timeout: 90_000 }).toEqual({ shown: ['Baidu'], default: 'policy-Baidu' });
  await expect.poll(() => firefoxSearch(t.folder(b.id)), { timeout: 90_000 }).toEqual({ shown: ['Bing'], default: 'policy-Bing' });

  const page = `${t.probe.url}fox`;
  await goTo(t.app, a.id, [page]);
  await Promise.all([t.close(a.id), t.close(b.id)]);
  expect(await opened(t.win, a.id)).toMatchObject({ state: 'running' });
  await expect.poll(() => tabsOf(t.app, a.id)).toEqual([page]);
  expect(firefoxSearch(t.folder(a.id))).toEqual({ shown: ['Baidu'], default: 'policy-Baidu' });
  await t.done();
});
