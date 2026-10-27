import { existsSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, request, type APIRequestContext, type ElectronApplication, type Locator, type Page } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:47110';
export const SITE = 'http://localhost:47120';
export const PASSWORD = 'correct horse battery';
let n = 0;

// The server sends real mail; in tests it goes to the local Mailpit inbox.
const MAILPIT = process.env.MAILPIT_URL ?? 'http://folio-mailpit:8025';
export async function lastMail(email: string){
  for (let i = 0; i < 50; i++){
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?limit=1&query=${encodeURIComponent(`to:${email}`)}`)).json() as { messages: { ID: string }[] };
    if (messages.length) return await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Subject: string; Text: string; HTML: string };
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`No email for ${email}`);
}

// Real browser engines, unpacked as <kind>-<version>/. Tests that open profiles are skipped without them.
export const KERNELS = process.env.FOLIO_KERNELS_DIR ?? '/kernels';
export const hasKernels = existsSync(KERNELS);
export const ENGINE_ENV = { FOLIO_KERNELS_DIR: KERNELS, FOLIO_PROXY_LOOPBACK: '1', FOLIO_KERNEL_NO_SANDBOX: '1', FOLIO_TEST_HOOKS: '1' };

export const chromiumProfile = (name: string, extra: Record<string, unknown> = {}) => ({
  name, kernel: 'chromium', kernelVersion: '150.0.7871.186', os: 'windows', fingerprint: { kind: 'chromium', seed: 1000 + n++, hardwareConcurrency: 8 }, ...extra
});

// A page for the launched browsers to load, so the test can read what they report.
export async function startProbe(){
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>probe</title>'); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://localhost:${port}/`, port, close: () => new Promise<void>(r => server.close(() => r())) };
}

// What a running profile's browser reports on the probe page, read through the main process's test hook.
export function inBrowser(app: ElectronApplication, id: string, url: string){
  return app.evaluate(async (_e, { id, url }) => {
    const r = (globalThis as unknown as { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> }).__folioRunning.get(id)!;
    const page = r.ctx.pages()[0] ?? await r.ctx.newPage();
    await page.goto(url);
    return page.evaluate(async () => ({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language, webdriver: navigator.webdriver,
      cores: navigator.hardwareConcurrency, ua: navigator.userAgent,
      rtc: await new Promise<string[]>(done => {
        const found: string[] = [], pc = new RTCPeerConnection({ iceServers: [] });
        pc.onicecandidate = e => { if (e.candidate) found.push(e.candidate.candidate); else done(found); };
        pc.createDataChannel('x');
        void pc.createOffer().then(o => pc.setLocalDescription(o));
        setTimeout(() => done(found), 2500);
      })
    }));
  }, { id, url });
}

// What a person does: close every window of the browser.
export const closeWindows = (app: ElectronApplication, id: string) => app.evaluate(async (_e, id) => {
  const r = (globalThis as unknown as { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> }).__folioRunning.get(id)!;
  await Promise.all(r.ctx.pages().map(p => p.close()));
}, id);

// Creates an account the way the website does: a code to the address, then the account, and optionally a plan.
export async function account({ locale = 'en', buy }: { locale?: 'en' | 'zh'; buy?: { plan: string; period: string } } = {}){
  const email = `desk${Date.now().toString(36)}${n++}@example.com`;
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: SITE } });
  await api.post('/auth/signup-code', { data: { email, locale } });
  await api.post('/auth/register', { data: { email, code: (await lastMail(email)).Text.match(/\b\d{6}\b/)![0], password: PASSWORD, locale } });
  const me = await (await api.get('/me')).json();
  const workspaceId = me.workspaces[0].id as string;
  if (buy){
    const { checkoutId } = await (await api.post(`/workspaces/${workspaceId}/billing/checkout`, { data: { ...buy, addonPacks: 0 } })).json();
    await api.post(`/billing/checkouts/${checkoutId}/pay`, { data: { card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' } } });
  }
  return { email, workspaceId, api };
}

// Invitations and role changes name a role by id; every workspace starts with the same four.
export async function roleId(api: APIRequestContext, workspaceId: string, key: 'admin' | 'member' | 'viewer'){
  const { roles } = await (await api.get(`/workspaces/${workspaceId}/roles`)).json() as { roles: { id: string; key: string }[] };
  return roles.find(r => r.key === key)!.id;
}

export const dataDir = () => mkdtempSync(join(tmpdir(), 'folio-'));

export function launch(userData: string, env: Record<string, string> = {}){
  return electron.launch({
    args: ['out/main/index.js', '--no-sandbox'],
    // Proxy checks ask the server's stand-in for the public echo, which the fixture proxies can reach.
    env: { ...process.env, FOLIO_API_URL: API, FOLIO_SITE_URL: SITE, FOLIO_ECHO_URLS: `${API}/dev/echo`, FOLIO_PASSWORD_STORE: 'basic', FOLIO_USER_DATA: userData, ...env }
  });
}

export async function logIn(app: ElectronApplication, email: string){
  const win = await app.firstWindow();
  await win.fill('#email', email);
  await win.fill('#password', PASSWORD);
  await win.click('button[type="submit"]');
  return win;
}

export type Status = { id: string; state: string; error?: string; usedBackup?: boolean; exitGeo?: { city: string | null } | null };
export const statusOf = (win: Page, id: string) => win.evaluate(async pid => (await window.folio.statuses()).find(s => s.id === pid) ?? null, id);
// The latest status the main process reported for a profile, recorded by opened().
export const lastStatus = (win: Page, id: string) => win.evaluate(pid => (window as unknown as { last?: Record<string, Status> }).last?.[pid] ?? null, id);

// Opens a profile and waits until it runs, or for its error.
// A profile's page, and the way back from it to the list.
export const detail = (win: Page) => win.getByRole('main', { name: 'Profile', exact: true });
export const backToList = (win: Page) => win.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Profiles' }).click();

export async function opened(win: Page, id: string){
  await win.evaluate(pid => {
    const w = window as unknown as { last: Record<string, unknown>; listening?: boolean };
    w.last ??= {};
    if (!w.listening){ w.listening = true; window.folio.onStatus(s => { w.last[s.id] = s; }); }
    delete w.last[pid];
    return window.folio.openProfile(pid);
  }, id);
  await expect.poll(async () => (await lastStatus(win, id))?.state, { timeout: 120_000 }).toMatch(/running|error/);
  return (await lastStatus(win, id))!;
}

// Picks an option in one of the app's dropdowns (they are not native selects): by its name (the first one with it,
// as a native select would), or by position.
export async function choose(combo: Locator, option: string | RegExp | { index: number }){
  await combo.click();
  const list = combo.page().getByRole('listbox');
  await (typeof option === 'string' ? list.getByRole('option', { name: option, exact: true }).first()
    : option instanceof RegExp ? list.getByRole('option', { name: option }).first() : list.getByRole('option').nth(option.index)).click();
}
