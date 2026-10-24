// Records the product demo (PLAN 6.15, part four): the real workbench, driven through the storyboard against a local
// server with demo data and the real engines, one picture per step for each language and colour scheme, and what the
// player needs to animate between them: what each step is about (the player's camera moves in on it), where the pointer
// clicks, where the opening cards land, the restored browser.
// Writes src/renderer/src/demo/, which the website copies to public/demo/.
//   npm run build && npx playwright test -c demo
// Needs what the end-to-end tests need (folio-server with DEV_TOOLS and MOCK_PAYMENTS, Mailpit, the engines in
// FOLIO_KERNELS_DIR), API_URL pointing at the server, and the demo proxies' host names (<exit>.proxy.example, see
// world.ts) pointing at this machine. Each run gives the demo accounts a new workspace.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, request, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { dicts, type Lang } from '../src/renderer/src/i18n';
import { API, ENGINE_ENV, PASSWORD, SITE, closeWindows, dataDir, lastMail, lastStatus, opened } from '../tests/e2e/helpers';
import { EXITS, SITES, hostOf, startExits, type ExitKey } from './world';

test.setTimeout(900_000);
const OUT = 'src/renderer/src/demo', W = 1280, H = 800, SCALE = 1.5, QUALITY = 0.8, PORT = 24100;

const PEOPLE = {
  en: { owner: 'ava@larkspur.example', mate: 'jordan@larkspur.example', device: 'Jordan’s MacBook Pro', workspace: 'Larkspur Trading', groups: ['US stores', 'EU shops', 'Social'] },
  zh: { owner: 'lin.yue@yunfan.example', mate: 'zhou.hang@yunfan.example', device: '周航的 MacBook Pro', workspace: '云帆贸易', groups: ['美区店铺', '欧洲店铺', '社媒'] }
};
// Name, engine, system, exit, group (index into PEOPLE's groups).
const PROFILES: [string, 'chromium' | 'firefox', 'windows' | 'macos', ExitKey, number][] = [
  ['US-Store-01', 'chromium', 'windows', 'us-west', 0], ['US-Store-02', 'chromium', 'macos', 'us-east', 0], ['UK-Shop-01', 'firefox', 'windows', 'uk', 1],
  ['JP-Social-01', 'chromium', 'macos', 'jp', 2], ['DE-Shop-01', 'chromium', 'windows', 'de', 1], ['SG-Ads-01', 'chromium', 'windows', 'sg', 2],
  ['US-Store-03', 'chromium', 'windows', 'down', 0]
];
const PROXY_NAMES: Record<ExitKey, string> = { 'us-west': 'US-West-ISP', 'us-east': 'US-East-Resi', uk: 'UK-ISP-02', jp: 'JP-ISP-01', de: 'DE-Resi-01', sg: 'SG-DC-01', down: 'MY-Resi-02' };
const TABS = ['shop.example', 'mail.example', 'ads.example'];

type Running = { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> };

// A demo person's web session: registered the first time, signed in after that.
async function person(email: string, locale: Lang){
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: SITE } });
  if ((await api.post('/auth/register', { data: { email, password: PASSWORD, locale } })).ok()){
    await api.post('/auth/verify-email', { data: { code: (await lastMail(email)).Text.match(/\b\d{6}\b/)![0] } });
  } else expect((await api.post('/auth/login', { data: { email, password: PASSWORD } })).ok()).toBe(true);
  return api;
}

// A small square icon with a letter, for the demo extensions.
const ICON = (win: Page, letter: string, color: string) => win.evaluate(async ({ letter, color }) => {
  const c = new OffscreenCanvas(96, 96), g = c.getContext('2d')!;
  g.fillStyle = color; g.beginPath(); g.roundRect(0, 0, 96, 96, 22); g.fill();
  g.fillStyle = '#fff'; g.font = '700 54px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 48, 52);
  const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  return Array.from(bytes);
}, { letter, color }).then(a => Uint8Array.from(a));

const launchApp = (userData: string, scale = 1) => electron.launch({
  args: ['out/main/index.js', '--no-sandbox', `--force-device-scale-factor=${scale}`],
  env: { ...process.env, ...ENGINE_ENV, FOLIO_PROXY_LOOPBACK: '', FOLIO_API_URL: API, FOLIO_SITE_URL: SITE, FOLIO_PASSWORD_STORE: 'basic', FOLIO_USER_DATA: userData }
});
// Signs in to the demo workspace (kept for the workbench to open first).
async function signIn(app: ElectronApplication, email: string, ws: string){
  const win = await app.firstWindow();
  await win.evaluate(id => localStorage.setItem('folio.workspace', id), ws);
  await win.fill('#email', email);
  await win.fill('#password', PASSWORD);
  await win.click('button[type="submit"]');
  await expect(win.getByTestId('plan-name')).toBeVisible();
  return win;
}

let exits: Awaited<ReturnType<typeof startExits>>;
test.beforeAll(async () => { exits = await startExits(PORT); });
test.afterAll(async () => { await exits?.close(); });

for (const lang of ['en', 'zh'] as const){
  test(`demo ${lang}`, async () => {
    const d = dicts[lang], who = PEOPLE[lang];

    // ---------- the demo workspace ----------
    const owner = await person(who.owner, lang);
    const ws = (await (await owner.post('/workspaces', { data: { name: who.workspace } })).json()).id as string;
    const { checkoutId } = await (await owner.post(`/workspaces/${ws}/billing/checkout`, { data: { plan: 'studio', period: 'monthly', addonPacks: 0 } })).json();
    await owner.post(`/billing/checkouts/${checkoutId}/pay`, { data: { card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' } } });
    const mate = await person(who.mate, lang);
    const invite = await (await owner.post(`/workspaces/${ws}/invitations`, { data: { email: who.mate, role: 'admin' } })).json();
    expect((await mate.post(`/invitations/${invite.invitation.id}/accept`)).ok()).toBe(true);

    const groups = [];
    for (const name of who.groups) groups.push((await (await owner.post(`/workspaces/${ws}/groups`, { data: { name } })).json()).id as string);
    const proxy = {} as Record<ExitKey, string>;
    for (const [i, x] of EXITS.entries()){
      proxy[x.key] = (await (await owner.post(`/workspaces/${ws}/proxies`, { data: { name: PROXY_NAMES[x.key], type: 'http', host: hostOf(x.key), port: PORT + i } })).json()).id;
      // Earlier checks, for the latency bars: the dead line used to answer.
      for (let k = 0; k < 18; k++){
        const ok = x.key === 'down' ? k < 12 : k % 9 !== 4;
        await owner.post(`/proxies/${proxy[x.key]}/check`, { data: ok
          ? { ok: true, ms: Math.round((x.ms || 240) * (0.75 + ((k * 37) % 10) / 16)), ip: x.ip || '192.0.2.200', geo: x.geo ?? EXITS[5].geo, error: null }
          : { ok: false, ms: null, ip: null, geo: null, error: 'timeout' } });
      }
    }

    // ---------- another computer: UK-Shop-01 was used there, with three tabs open ----------
    const prep = await launchApp(dataDir());
    const prepWin = await signIn(prep, who.owner, ws);
    const ids: Record<string, string> = {};
    for (const [name, kernel, os, exit, group] of PROFILES){
      const { fingerprint, kernelVersion } = await prepWin.evaluate(({ kernel, os }) => window.folio.newFingerprint(kernel, os), { kernel, os });
      ids[name] = (await (await owner.post(`/workspaces/${ws}/profiles`, { data: { name, kernel, kernelVersion, os, fingerprint, proxyId: proxy[exit], groupId: groups[group] } })).json()).id;
    }
    const ext = async (kernel: 'chromium' | 'firefox', name: string, version: string, letter: string, color: string) => {
      const manifest = kernel === 'chromium'
        ? { manifest_version: 3, name, version, icons: { 48: 'icon.png' } }
        : { manifest_version: 2, name, version, icons: { 48: 'icon.png' }, browser_specific_settings: { gecko: { id: `${letter.toLowerCase()}@demo.example` } } };
      const pkg = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'icon.png': await ICON(prepWin, letter, color) }));
      await owner.post(`/workspaces/${ws}/extensions?kernel=${kernel}`, { headers: { 'content-type': 'application/octet-stream' }, data: pkg });
    };
    await ext('chromium', 'Order Helper', '2.4.1', 'O', '#2563eb');
    await ext('chromium', 'Tab Notes', '1.2.0', 'T', '#0f766e');
    await ext('firefox', 'Price Watch', '1.0.3', 'P', '#c2410c');
    expect(await opened(prepWin, ids['UK-Shop-01'])).toMatchObject({ state: 'running' });
    await prep.evaluate(async (_e, { id, urls }) => {
      const ctx = (globalThis as unknown as Running).__folioRunning.get(id)!.ctx;
      for (const [i, u] of urls.entries()) await (i === 0 ? ctx.pages()[0] : await ctx.newPage()).goto(u);
    }, { id: ids['UK-Shop-01'], urls: TABS.map(h => `http://${h}/`) });
    await closeWindows(prep, ids['UK-Shop-01']);
    await expect.poll(async () => (await lastStatus(prepWin, ids['UK-Shop-01']))?.state, { timeout: 90_000 }).toBe('stopped');
    await prep.close();

    // ---------- this computer, recorded ----------
    const app = await launchApp(dataDir(), SCALE);
    const win = await signIn(app, who.owner, ws);
    // Sized as a window (sizing the page would undo the scale).
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [W, H]);
    expect(await opened(win, ids['US-Store-01'])).toMatchObject({ state: 'running' });
    const nav = (name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}`) });
    const row = (name: string) => win.locator('tr[data-id]', { hasText: name });
    const drawer = win.getByRole('complementary', { name: d.detail.profile });

    const frames: { file: string; clicks: [number, number][]; focus?: number[]; browser?: true }[] = [];
    const pictures: { file: string; light: Buffer; dark: Buffer }[] = [];
    const at = async (l: Locator): Promise<[number, number]> => {
      const b = (await l.boundingBox())!;
      return [+((b.x + b.width / 2) / W).toFixed(4), +((b.y + b.height / 2) / H).toFixed(4)];
    };
    // Left, top, width, height as fractions of the window: of one element, or of several together.
    const box = async (...ls: Locator[]) => {
      const bs = await Promise.all(ls.map(async l => (await l.boundingBox())!));
      const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
      const r = Math.max(...bs.map(b => b.x + b.width)), btm = Math.max(...bs.map(b => b.y + b.height));
      return [x / W, y / H, (r - x) / W, (btm - y) / H].map(v => +Math.max(0, v).toFixed(4));
    };
    // The picture of this moment, light and dark (after their colour transitions), and what it is about.
    async function snap(file: string, { focus, browser }: { focus?: Locator[]; browser?: true } = {}){
      const extra = { ...(focus ? { focus: await box(...focus) } : {}), ...(browser ? { browser } : {}) };
      await win.mouse.move(W / 2, 3);
      await win.waitForTimeout(500);
      const light = await win.screenshot();
      await win.emulateMedia({ colorScheme: 'dark' });
      await win.waitForTimeout(450);
      const dark = await win.screenshot();
      await win.emulateMedia({ colorScheme: 'light' });
      await win.waitForTimeout(300);
      pictures.push({ file, light, dark });
      frames.push({ file, clicks: [], ...extra });
    }
    // The pointer clicks it in the demo, then the recording does.
    async function click(l: Locator){
      frames.at(-1)!.clicks.push(await at(l));
      await l.click();
    }

    // 1. The list; the three opening cards land on their rows.
    await expect(row('US-Store-01').locator('.st.run')).toBeVisible();
    const cards = [await box(row('US-Store-01')), await box(row('UK-Shop-01')), await box(row('JP-Social-01'))];
    await snap('list');
    // 2. Proxies, checked all at once.
    await click(nav(d.nav.proxies));
    await expect(win.locator('li.pxc[data-id]')).toHaveCount(EXITS.length);
    await snap('proxies');
    await click(win.getByRole('button', { name: d.proxies.checkAll }));
    await expect(win.getByRole('button', { name: d.proxies.checkAll }).locator('.spin')).toHaveCount(0, { timeout: 30_000 });
    await snap('proxies-checked', { focus: [win.locator('li.pxc[data-id]').first()] });
    // 3. Opening UK-Shop-01: proxy, its sign-ins from the other computer, the browser.
    await click(nav(d.nav.profiles));
    await snap('profiles');
    await click(row('UK-Shop-01').getByRole('button', { name: 'UK-Shop-01', exact: true }));
    await snap('drawer');
    await click(drawer.getByRole('button', { name: d.detail.openProfile }));
    await expect(drawer.locator('.opening .step-r').nth(2)).toHaveClass(/now/, { timeout: 60_000 });
    await snap('opening', { focus: [drawer.locator('.opening')] });
    // 4. Its three tabs come back.
    await expect(row('UK-Shop-01').locator('.st.run')).toBeVisible({ timeout: 90_000 });
    await drawer.getByRole('button', { name: d.detail.close }).click();
    await expect.poll(() => app.evaluate((_e, id) => (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages().length, ids['UK-Shop-01'])).toBe(3);
    const browser = await app.evaluate(async (_e, id) => {
      const page = (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages()[0];
      await page.setViewportSize({ width: 1000, height: 640 });
      await page.waitForLoadState();
      return Array.from(await page.screenshot());
    }, ids['UK-Shop-01']);
    await snap('restored', { browser: true });
    // 5. US-Store-02's health check.
    await click(row('US-Store-02').getByRole('button', { name: 'US-Store-02', exact: true }));
    await snap('drawer-check');
    await click(drawer.getByRole('button', { name: d.checkup.run, exact: true }));
    const report = win.getByRole('dialog', { name: d.checkup.title('US-Store-02') });
    await expect(report).toBeVisible({ timeout: 120_000 });
    await snap('checkup', { focus: [report] });
    await click(report.locator('.m-foot').getByRole('button', { name: d.common.close }));
    await drawer.getByRole('button', { name: d.detail.close }).click();
    // 6. An extension goes into three profiles.
    await click(nav(d.nav.extensions));
    await snap('extensions');
    await click(win.locator('[data-extension="Order Helper"]').getByRole('button', { name: d.extensions.install }));
    const install = win.getByRole('dialog', { name: d.extensions.installTitle('Order Helper') });
    for (const n of ['US-Store-03', 'DE-Shop-01', 'SG-Ads-01']) await install.getByRole('checkbox', { name: new RegExp(n) }).check();
    await snap('install', { focus: [install] });
    await click(install.getByRole('button', { name: d.extensions.installDo(3) }));
    await snap('installed', { focus: [win.locator('[data-extension="Order Helper"]')] });
    // 7. Three profiles opened together; the one whose line is down can be retried.
    await click(nav(d.nav.profiles));
    await snap('profiles-again');
    for (const n of ['US-Store-03', 'DE-Shop-01', 'SG-Ads-01']){
      const cb = win.getByRole('checkbox', { name: d.common.select(n) });
      frames.at(-1)!.clicks.push(await at(cb));
      await cb.check();
    }
    await snap('selected', { focus: [win.getByTestId('bulk')] });
    await click(win.getByTestId('bulk').getByRole('button', { name: d.profiles.bulk.open }));
    const tray = win.locator('section.tray');
    await expect(tray.locator('li.run')).not.toHaveCount(0, { timeout: 60_000 });
    await snap('batch', { focus: [tray] });
    await expect(tray.locator('li.bad')).toHaveCount(1, { timeout: 60_000 });
    await expect(tray.locator('li.boot, li.idle')).toHaveCount(0, { timeout: 60_000 });
    await snap('batch-done', { focus: [tray] });
    // 8. Window sync: a click in the leader's window happens in the others.
    const synced = [ids['US-Store-01'], ids['DE-Shop-01'], ids['SG-Ads-01']];
    await app.evaluate(async (_e, ids) => {
      for (const id of ids) await (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages()[0].goto('http://shop.example/');
    }, synced);
    await win.evaluate(ids => window.folio.startWindowSync(ids), synced);
    await click(nav(d.nav.sync));
    await app.evaluate(async (_e, id) => { await (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages()[0].click('#add2'); }, synced[0]);
    await win.waitForTimeout(4500);
    await snap('sync', { focus: [win.locator('article.win').nth(0), win.locator('article.win').nth(1)] });
    await win.evaluate(() => window.folio.stopWindowSync());
    // 9. A teammate opens JP-Social-01 on their computer.
    await click(nav(d.nav.profiles));
    const mateDesk = await request.newContext({ baseURL: API });
    const { token } = await (await mateDesk.post('/auth/login', { data: { email: who.mate, password: PASSWORD, client: 'desktop', deviceName: who.device } })).json();
    expect((await mateDesk.post(`/profiles/${ids['JP-Social-01']}/lock`, { headers: { authorization: `Bearer ${token}` } })).ok()).toBe(true);
    await expect(row('JP-Social-01')).toContainText(who.device, { timeout: 30_000 });
    await row('JP-Social-01').scrollIntoViewIfNeeded();
    await snap('team', { focus: [row('JP-Social-01').locator('.st.away')] });

    await mateDesk.delete(`/profiles/${ids['JP-Social-01']}/lock`, { headers: { authorization: `Bearer ${token}` } });

    // ---------- pictures ----------
    const webp = (png: Buffer | Uint8Array) => win.evaluate(async ({ b64, q }) => {
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: q })).arrayBuffer());
      let s = '';
      for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return btoa(s);
    }, { b64: Buffer.from(png).toString('base64'), q: QUALITY }).then(b => Buffer.from(b, 'base64'));
    const browserPic = await webp(Uint8Array.from(browser));
    for (const scheme of ['light', 'dark'] as const){
      const dir = join(OUT, `${lang}-${scheme}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      for (const p of pictures) writeFileSync(join(dir, `${p.file}.webp`), await webp(p[scheme]));
      writeFileSync(join(dir, 'browser.webp'), browserPic);
    }
    writeFileSync(join(OUT, `${lang}.json`), JSON.stringify({
      width: W, height: H, frames, cards,
      browser: { tabs: TABS.map(h => ({ host: h, title: SITES[h].title })) }
    }, null, 1));
    await app.close();
  });
}
