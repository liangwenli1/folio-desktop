// Records pictures of the real workbench (PLAN 6.21, 1.1 and 1.2): the workbench against a local server with demo data
// and the real engines, each picture in the light and the dark colour scheme for each language. Whole-window stills for
// the website's pages (features, solutions, the help guides, the first screens), and four pieces of the workbench for
// the home page's cards: a profile card, a proxy card, the group tree and the members with their roles.
// Writes demo/stills/{lang}-{scheme}/ (the website copies it to public/shots/).
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
import { ECHO, EXITS, hostOf, startExits, type ExitKey } from './world';

test.setTimeout(900_000);
const STILLS = 'demo/stills', W = 1280, H = 800, SCALE = 1.5, QUALITY = 0.8, PORT = 24100;

// The workspace's owner, an admin and a member, by the names colleagues see them by.
const PEOPLE = {
  en: { workspace: 'Larkspur Trading', groups: ['US stores', 'EU shops', 'Social'],
    owner: ['ava@larkspur.example', 'Ava Brooks'], mate: ['jordan@larkspur.example', 'Jordan Lee'], member: ['riley@larkspur.example', 'Riley Chen'] },
  zh: { workspace: '云帆贸易', groups: ['美区店铺', '欧洲店铺', '社媒'],
    owner: ['lin.yue@yunfan.example', '林悦'], mate: ['zhou.hang@yunfan.example', '周航'], member: ['he.lan@yunfan.example', '何岚'] }
};
// Name, engine, system, exit, group (index into PEOPLE's groups).
const PROFILES: [string, 'chromium' | 'firefox', 'windows' | 'macos', ExitKey, number][] = [
  ['US-Store-01', 'chromium', 'windows', 'us-west', 0], ['US-Store-02', 'chromium', 'macos', 'us-east', 0], ['UK-Shop-01', 'firefox', 'windows', 'uk', 1],
  ['JP-Social-01', 'chromium', 'macos', 'jp', 2], ['DE-Shop-01', 'chromium', 'windows', 'de', 1], ['SG-Ads-01', 'chromium', 'windows', 'sg', 2],
  ['US-Store-03', 'chromium', 'windows', 'down', 0]
];
const PROXY_NAMES: Record<ExitKey, string> = { 'us-west': 'US-West-ISP', 'us-east': 'US-East-Resi', uk: 'UK-ISP-02', jp: 'JP-ISP-01', de: 'DE-Resi-01', sg: 'SG-DC-01', down: 'MY-Resi-02' };
// The tabs UK-Shop-01 had open on the other computer; it signed in to these sites there.
const TABS = ['shop.example', 'mail.example', 'ads.example'];
// Where the line that is down now used to come out.
const WAS = { country: 'MY', countryName: 'Malaysia', region: 'Kuala Lumpur', city: 'Kuala Lumpur', lat: 3.14, lon: 101.69, timezone: 'Asia/Kuala_Lumpur', locale: 'ms-MY' };

// Chromium extensions, with icons drawn like an extension's (none is a real product's logo), and the profiles they are
// in: one has four (three shown and +1), two have none.
type Ext = 'write' | 'pass' | 'translate' | 'price' | 'block' | 'wallet' | 'privacy';
const EXTENSIONS: Record<Lang, Record<Ext, string>> = {
  en: { write: 'Writing Assistant', pass: 'Password Keeper', translate: 'Page Translator', price: 'Price Compare', block: 'Ad Blocker', wallet: 'Crypto Wallet', privacy: 'Privacy Guard' },
  zh: { write: '写作助手', pass: '密码管家', translate: '网页翻译', price: '比价助手', block: '广告拦截', wallet: '加密钱包', privacy: '隐私卫士' }
};
const INSTALLED: Record<string, Ext[]> = {
  'US-Store-01': ['write', 'pass', 'translate', 'price'], 'US-Store-02': ['price', 'wallet'], 'JP-Social-01': ['translate', 'privacy'],
  'DE-Shop-01': ['block'], 'SG-Ads-01': ['block', 'price', 'write']
};

type Running = { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> };
type Box = { x: number; y: number; width: number; height: number };

// A demo person's web session: registered the first time, signed in after that; the name colleagues see is set each time.
async function person([email, name]: string[], locale: Lang){
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: SITE } });
  if ((await api.post('/auth/signup-code', { data: { email, locale } })).ok()){
    await api.post('/auth/register', { data: { email, code: (await lastMail(email)).Text.match(/\b\d{6}\b/)![0], password: PASSWORD, locale } });
  } else expect((await api.post('/auth/login', { data: { email, password: PASSWORD } })).ok()).toBe(true);
  expect((await api.patch('/me', { data: { displayName: name } })).ok()).toBe(true);
  return api;
}

// An extension's icon, drawn in the app's window (where the fonts are): 96px, as a PNG.
const ICON = (win: Page, kind: Ext, lang: Lang) => win.evaluate(async ({ kind, lang }) => {
  await document.fonts.load('800 60px "Inter Variable"');
  await document.fonts.load('700 36px "Noto Sans SC Variable"', '文A');
  const S = 96, c = new OffscreenCanvas(S, S), g = c.getContext('2d')!;
  const F = '"Inter Variable", system-ui, sans-serif', CJK = '"Noto Sans SC Variable", system-ui, sans-serif';
  const tile = (fill: string) => { g.fillStyle = fill; g.beginPath(); g.roundRect(0, 0, S, S, 22); g.fill(); };
  const disc = (fill: string) => { g.fillStyle = fill; g.beginPath(); g.arc(48, 48, 48, 0, Math.PI * 2); g.fill(); };
  const text = (t: string, font: string, color = '#fff', y = 51) => { g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 48, y); };
  const shield = (fill: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = fill; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w, y + h * 0.16); g.lineTo(x + w, y + h * 0.5);
    g.bezierCurveTo(x + w, y + h * 0.78, x + w * 0.72, y + h * 0.92, x + w / 2, y + h); g.bezierCurveTo(x + w * 0.28, y + h * 0.92, x, y + h * 0.78, x, y + h * 0.5);
    g.lineTo(x, y + h * 0.16); g.closePath(); g.fill();
  };
  const polygon = (n: number, r: number, turn: number, fill: string | null, stroke: string | null, lw = 0) => {
    g.beginPath();
    for (let i = 0; i < n; i++){ const a = turn + Math.PI * 2 / n * i; const x = 48 + r * Math.cos(a), y = 48 + r * Math.sin(a); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); if (fill){ g.fillStyle = fill; g.fill(); } if (stroke){ g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  };
  if (kind === 'write'){
    // A pen, slanted, on a green disc.
    disc('#15C39A');
    g.save(); g.translate(50, 46); g.rotate(Math.PI / 4); g.fillStyle = '#fff';
    g.beginPath(); g.roundRect(-8, -32, 16, 42, 4); g.fill();
    g.beginPath(); g.moveTo(-8, 13); g.lineTo(8, 13); g.lineTo(0, 30); g.closePath(); g.fill();
    g.restore();
  }
  if (kind === 'pass'){
    // A shield with a keyhole.
    tile('#175DDC'); shield('#fff', 26, 16, 44, 62);
    g.fillStyle = '#175DDC'; g.beginPath(); g.arc(48, 42, 7, 0, Math.PI * 2); g.fill(); g.beginPath(); g.roundRect(44.5, 44, 7, 16, 3); g.fill();
  }
  if (kind === 'translate'){ tile('#1A73E8'); text('文A', `700 36px ${CJK}`); }
  if (kind === 'price'){ tile('#FF6A00'); text(lang === 'zh' ? '¥' : '$', `800 58px ${F}`); }
  if (kind === 'block'){
    // A stop sign with a bar.
    polygon(8, 47, Math.PI / 8, '#D92D20', null);
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(22, 40, 52, 16, 4); g.fill();
  }
  if (kind === 'wallet'){ tile('#111827'); polygon(6, 30, -Math.PI / 2, null, '#fff', 8); polygon(6, 12, -Math.PI / 2, '#F6851B', null); }
  if (kind === 'privacy'){
    // An eye, crossed out.
    disc('#EEF2F6');
    g.strokeStyle = '#344054'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(18, 48); g.quadraticCurveTo(48, 18, 78, 48); g.quadraticCurveTo(48, 78, 18, 48); g.stroke();
    g.fillStyle = '#344054'; g.beginPath(); g.arc(48, 48, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#EEF2F6'; g.lineWidth = 15; g.beginPath(); g.moveTo(25, 73); g.lineTo(71, 23); g.stroke();
    g.strokeStyle = '#344054'; g.lineWidth = 7; g.beginPath(); g.moveTo(25, 73); g.lineTo(71, 23); g.stroke();
  }
  return Array.from(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
}, { kind, lang }).then(a => Uint8Array.from(a));

const launchApp = (userData: string, scale = 1) => electron.launch({
  args: ['out/main/index.js', '--no-sandbox', `--force-device-scale-factor=${scale}`],
  env: { ...process.env, ...ENGINE_ENV, FOLIO_PROXY_LOOPBACK: '', FOLIO_API_URL: API, FOLIO_SITE_URL: SITE, FOLIO_ECHO_URLS: `http://${ECHO}/`, FOLIO_PASSWORD_STORE: 'basic', FOLIO_USER_DATA: userData }
});
// Signs in to the demo workspace (kept for the workbench to open first).
async function signIn(app: ElectronApplication, email: string, ws: string){
  const win = await app.firstWindow();
  await win.evaluate(id => localStorage.setItem('folio.workspace', id), ws);
  await win.fill('#email', email);
  await win.fill('#password', PASSWORD);
  await win.click('button[type="submit"]');
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  return win;
}

let exits: Awaited<ReturnType<typeof startExits>>;
test.beforeAll(async () => { exits = await startExits(PORT); });
test.afterAll(async () => { await exits?.close(); });

for (const lang of ['en', 'zh'] as const){
  test(`stills ${lang}`, async () => {
    const d = dicts[lang], who = PEOPLE[lang];

    // ---------- the demo workspace ----------
    const owner = await person(who.owner, lang);
    const ws = (await (await owner.post('/workspaces', { data: { name: who.workspace } })).json()).id as string;
    const { checkoutId } = await (await owner.post(`/workspaces/${ws}/billing/checkout`, { data: { plan: 'studio', period: 'monthly', addonPacks: 0 } })).json();
    await owner.post(`/billing/checkouts/${checkoutId}/pay`, { data: { card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' } } });
    const roles = (await (await owner.get(`/workspaces/${ws}/roles`)).json()).roles as { id: string; key: string | null }[];
    for (const [who_, role] of [[who.mate, 'admin'], [who.member, 'member']] as const){
      const them = await person(who_, lang);
      const invite = await (await owner.post(`/workspaces/${ws}/invitations`, { data: { email: who_[0], roleId: roles.find(r => r.key === role)!.id, notify: false } })).json();
      expect((await them.post(`/invitations/${invite.invitation.id}/accept`)).ok()).toBe(true);
    }

    const groups = [];
    for (const [i, name] of who.groups.entries()) groups.push((await (await owner.post(`/workspaces/${ws}/groups`, { data: { name, color: (['blue', 'teal', 'purple'] as const)[i] } })).json()).id as string);
    const proxy = {} as Record<ExitKey, string>;
    for (const [i, x] of EXITS.entries()){
      proxy[x.key] = (await (await owner.post(`/workspaces/${ws}/proxies`, { data: { name: PROXY_NAMES[x.key], type: 'http', host: hostOf(x.key), port: PORT + i } })).json()).id;
      // Earlier checks, for the latency bars: the dead line used to answer.
      for (let k = 0; k < 18; k++){
        const ok = x.key === 'down' ? k < 12 : k % 9 !== 4;
        await owner.post(`/proxies/${proxy[x.key]}/check`, { data: ok
          ? { ok: true, ms: Math.round((x.ms || 240) * (0.75 + ((k * 37) % 10) / 16)), ip: x.ip || '192.0.2.200', geo: x.geo ?? WAS, error: null }
          : { ok: false, ms: null, ip: null, geo: null, error: 'timeout' } });
      }
    }

    // ---------- another computer: UK-Shop-01 was used there, with three tabs open ----------
    const prep = await launchApp(dataDir());
    const prepWin = await signIn(prep, who.owner[0], ws);
    const ids: Record<string, string> = {};
    for (const [name, kernel, os, exit, group] of PROFILES){
      const { fingerprint, kernelVersion } = await prepWin.evaluate(({ kernel, os }) => window.folio.newFingerprint(kernel, os), { kernel, os });
      ids[name] = (await (await owner.post(`/workspaces/${ws}/profiles`, { data: { name, kernel, kernelVersion, os, fingerprint, proxyId: proxy[exit], groupId: groups[group] } })).json()).id;
    }
    const ext = {} as Record<Ext, string>;
    for (const [i, kind] of (Object.keys(EXTENSIONS[lang]) as Ext[]).entries()){
      const manifest = { manifest_version: 3, name: EXTENSIONS[lang][kind], version: `1.${i}.0`, icons: { 48: 'icon.png' } };
      const pkg = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'icon.png': await ICON(prepWin, kind, lang) }));
      ext[kind] = (await (await owner.post(`/workspaces/${ws}/extensions?kernel=chromium`, { headers: { 'content-type': 'application/octet-stream' }, data: pkg })).json()).id;
    }
    for (const [name, kinds] of Object.entries(INSTALLED)) for (const kind of kinds)
      expect((await owner.post(`/workspaces/${ws}/profiles/batch`, { data: { action: 'add-extension', ids: [ids[name]], extensionId: ext[kind] } })).ok()).toBe(true);
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
    const win = await signIn(app, who.owner[0], ws);
    // Sized as a window (sizing the page would undo the scale). Toasts would linger into the next pictures.
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [W, H]);
    await win.addStyleTag({ content: '.toasts{display:none!important}' });
    expect(await opened(win, ids['US-Store-01'])).toMatchObject({ state: 'running' });
    const nav = (name: string) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}`) });
    const row = (name: string) => win.locator('tr[data-id]', { hasText: name });
    const page = win.getByRole('main', { name: d.detail.profile, exact: true });
    // The way back from a profile's page is in the top bar.
    const back = () => win.locator('.top').getByRole('button', { name: d.top.back }).click();

    // A picture of this moment, light and dark (after their colour transitions): the whole window, or the part `clip`
    // gives (in the window's coordinates).
    const stills: { file: string; light: Buffer; dark: Buffer }[] = [];
    async function still(file: string, clip?: () => Promise<Box>){
      await win.mouse.move(W / 2, 3);
      await win.waitForTimeout(500);
      const at = clip && await clip();
      const light = await win.screenshot(at ? { clip: at } : {});
      await win.emulateMedia({ colorScheme: 'dark' });
      await win.waitForTimeout(450);
      const dark = await win.screenshot(at ? { clip: at } : {});
      await win.emulateMedia({ colorScheme: 'light' });
      await win.waitForTimeout(300);
      stills.push({ file, light, dark });
    }
    const box = async (l: Locator) => (await l.boundingBox())!;

    // The profile list, US-Store-01 open.
    await expect(row('US-Store-01').locator('.dot-st.run')).toBeVisible();
    await still('list');
    // Proxies, all checked.
    await nav(d.nav.proxies).click();
    await expect(win.locator('tr[data-id]')).toHaveCount(EXITS.length);
    await win.getByRole('button', { name: d.proxies.checkAll }).click();
    const checking = win.locator('tr[data-id] .dot-st.boot');
    await expect(checking).not.toHaveCount(0);
    await expect(checking).toHaveCount(0, { timeout: 60_000 });
    await still('proxies');
    // Opening UK-Shop-01: its proxy, then the sign-ins and tabs from the other computer.
    await nav(d.nav.profiles).click();
    await row('UK-Shop-01').getByRole('button', { name: 'UK-Shop-01', exact: true }).click();
    await page.getByRole('button', { name: d.detail.openProfile }).click();
    await expect(page.locator('.opening .step-r').nth(2)).toHaveClass(/now/, { timeout: 60_000 });
    await still('opening');
    await expect(page.locator('.dot-st.run')).toBeVisible({ timeout: 90_000 });
    // Its cookies, from the sites it was signed in to there.
    await page.getByRole('tab', { name: d.detail.tabs.cookies }).click();
    await expect(page.locator('tr[data-cookie]').first()).toBeVisible({ timeout: 30_000 });
    await still('cookies');
    await back();
    // US-Store-02's fingerprint, the health check at hand.
    await row('US-Store-02').getByRole('button', { name: 'US-Store-02', exact: true }).click();
    await page.getByRole('tab', { name: d.detail.tabs.fingerprint }).click();
    await page.getByRole('button', { name: d.checkup.run, exact: true }).scrollIntoViewIfNeeded();
    await still('drawer-check');
    await back();
    // Window sync: a click in the leader's window happens in the others.
    const synced = [ids['US-Store-01'], ids['DE-Shop-01'], ids['SG-Ads-01']];
    for (const id of synced.slice(1)) expect(await opened(win, id)).toMatchObject({ state: 'running' });
    await app.evaluate(async (_e, ids) => {
      for (const id of ids) await (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages()[0].goto('http://shop.example/');
    }, synced);
    await win.evaluate(ids => window.folio.startWindowSync(ids), synced);
    await nav(d.nav.sync).click();
    await app.evaluate(async (_e, id) => { await (globalThis as unknown as Running).__folioRunning.get(id)!.ctx.pages()[0].click('#add2'); }, synced[0]);
    await win.waitForTimeout(4500);
    await still('sync');
    await win.evaluate(() => window.folio.stopWindowSync());
    // A new profile: its basics, then how it opens.
    await nav(d.nav.profiles).click();
    await win.getByRole('button', { name: d.profiles.new }).click();
    const form = win.getByRole('dialog', { name: d.form.newTitle });
    await form.getByRole('textbox', { name: d.form.name, exact: true }).fill('US-Store-04');
    await still('new');
    await form.getByRole('navigation', { name: d.form.sectionsLabel }).getByRole('button', { name: new RegExp(d.form.sections.launch) }).click();
    await win.waitForTimeout(600);
    await still('new-opening');
    await form.getByRole('button', { name: d.common.cancel }).click();
    await win.getByRole('button', { name: d.common.discard }).click().catch(() => {});
    // Engines, a group, the team.
    await nav(d.nav.engines).click();
    await expect(win.locator('tr[data-engine]').first()).toBeVisible();
    await still('engines');
    await nav(d.nav.groups).click();
    const tree = win.getByRole('tree');
    await tree.getByRole('button', { name: new RegExp(`^${who.groups[0]}`) }).click();
    await expect(win.locator('tr[data-id]').first()).toBeVisible();
    await still('groups');
    await nav(d.nav.team).click();
    const members = win.locator('tr[data-member]');
    await expect(members).toHaveCount(3);
    await still('members');

    // ---------- the home page's cards: a piece of the workbench each ----------
    // The members and their roles: the table's head and rows, as far as the role column.
    const table = win.locator('table', { has: members.first() });
    await still('card-team', async () => {
      const t = await box(table), role = await box(table.locator('thead th').nth(1)), last = await box(members.last());
      return { x: t.x, y: t.y, width: role.x + role.width - t.x, height: last.y + last.height - t.y };
    });
    // The group tree, a group picked; as tall as its groups for the card (on the page it fills the window beside the list).
    await nav(d.nav.groups).click();
    await tree.getByRole('button', { name: new RegExp(`^${who.groups[0]}`) }).click();
    await expect(win.locator('tr[data-id]').first()).toBeVisible();
    const natural = await win.addStyleTag({ content: '.gp > .gp-tree{align-self:start}' });
    await still('card-groups', () => box(win.locator('section.gp-tree')));
    await natural.evaluate(el => (el as Element).remove());
    // A proxy and a profile, as cards (the card view is chosen last: the choice stays). The proxy cards at the width
    // they have on a wider window, where three fit in a row, so the picture reads at the home page's size.
    await nav(d.nav.proxies).click();
    await win.getByRole('group', { name: d.profiles.views.label }).getByRole('button', { name: d.profiles.views.cards }).click();
    await win.addStyleTag({ content: '.pxg{grid-template-columns:repeat(auto-fill,340px)!important}' });
    const proxyCard = win.locator('li.pxc', { hasText: PROXY_NAMES['us-west'] });
    await proxyCard.scrollIntoViewIfNeeded();
    await still('card-proxies', () => box(proxyCard));
    await nav(d.nav.profiles).click();
    await win.getByRole('group', { name: d.profiles.views.label }).getByRole('button', { name: d.profiles.views.cards }).click();
    const profileCard = win.locator('li.pcard', { hasText: 'US-Store-01' });
    await profileCard.scrollIntoViewIfNeeded();
    await still('card-profiles', () => box(profileCard));

    // ---------- pictures ----------
    const webp = (png: Buffer) => win.evaluate(async ({ b64, q }) => {
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: q })).arrayBuffer());
      let s = '';
      for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return btoa(s);
    }, { b64: png.toString('base64'), q: QUALITY }).then(b => Buffer.from(b, 'base64'));
    for (const scheme of ['light', 'dark'] as const){
      const dir = join(STILLS, `${lang}-${scheme}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      for (const p of stills) writeFileSync(join(dir, `${p.file}.webp`), await webp(p[scheme]));
    }
    await app.close();
  });
}
