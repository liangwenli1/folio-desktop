// Launching real engines through a password-protected SOCKS5 proxy. Needs the engines unpacked under
// FOLIO_KERNELS_DIR (as <kind>-<version>/) and a folio-server with DEV_PRIVATE_GEO=seattle, since every
// address in the test network is private.
import { existsSync } from 'node:fs';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { startSocks5 } from '../fixtures/proxies';
import { account, dataDir, launch, logIn } from './helpers';

const KERNELS = process.env.FOLIO_KERNELS_DIR ?? '/kernels';
const ENGINE_ENV = { FOLIO_KERNELS_DIR: KERNELS, FOLIO_PROXY_LOOPBACK: '1', FOLIO_KERNEL_NO_SANDBOX: '1', FOLIO_TEST_HOOKS: '1' };
test.skip(!existsSync(KERNELS), 'browser engines are not unpacked here');
test.setTimeout(180_000);

let probe: Server, probeUrl = '';
test.beforeAll(async () => {
  probe = http.createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>probe</title>'); });
  await new Promise<void>(r => probe.listen(0, '127.0.0.1', () => r()));
  probeUrl = `http://localhost:${(probe.address() as AddressInfo).port}/`;
});
test.afterAll(() => new Promise<void>(r => probe.close(() => r())));

type Status = { id: string; state: string; error?: string; usedBackup?: boolean; exitGeo?: { city: string | null } | null };
const statusOf = (win: Page, id: string) => win.evaluate(async pid => (await window.folio.statuses()).find(s => s.id === pid) ?? null, id);

// Waits until the profile is running, or for its error.
async function opened(win: Page, id: string){
  await win.evaluate(pid => {
    const w = window as unknown as { last: Record<string, unknown> };
    w.last ??= {};
    window.folio.onStatus(s => { w.last[s.id] = s; });
    return window.folio.openProfile(pid);
  }, id);
  await expect.poll(() => win.evaluate(pid => ((window as unknown as { last: Record<string, { state: string }> }).last[pid]?.state), id), { timeout: 120_000 })
    .toMatch(/running|error/);
  return win.evaluate(pid => (window as unknown as { last: Record<string, Status> }).last[pid], id);
}

// What the launched browser reports, read through the test hook in the main process.
function inBrowser(app: ElectronApplication, id: string){
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
  }, { id, url: probeUrl });
}

async function setupProfile(kernel: 'chromium' | 'firefox', proxyPass = 's3cret', withBackup = false){
  const socks = await startSocks5('alice', 's3cret');
  const acct = await account();
  const mkProxy = async (password: string) => (await (await acct.api.post(`/workspaces/${acct.workspaceId}/proxies`, {
    data: { type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'alice', password }
  })).json()).id as string;
  const backupId = withBackup ? await mkProxy('s3cret') : null;
  const proxyId = await mkProxy(proxyPass);
  if (backupId) await acct.api.patch(`/proxies/${proxyId}`, { data: { backupId } });
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByTestId('plan-name')).toBeVisible();
  const { fingerprint, kernelVersion } = await win.evaluate(k => window.folio.newFingerprint(k, 'linux')
    .catch(e => { throw new Error(JSON.stringify(e)); }), kernel);
  const profile = await (await acct.api.post(`/workspaces/${acct.workspaceId}/profiles`, {
    data: { name: `${kernel} test`, kernel, kernelVersion, os: 'linux', fingerprint, proxyId }
  })).json();
  return { socks, acct, app, win, profile, proxyId, fingerprint };
}

for (const kernel of ['chromium', 'firefox'] as const){
  test(`${kernel}: opens through a SOCKS5 proxy with a password, with time zone and language from the exit`, async () => {
    const { socks, acct, app, win, profile, proxyId, fingerprint } = await setupProfile(kernel);
    const s = await opened(win, profile.id);
    expect(s).toMatchObject({ state: 'running', usedBackup: false, exitGeo: { city: 'Seattle' } });

    const seen = await inBrowser(app, profile.id);
    expect(seen).toMatchObject({ tz: 'America/Los_Angeles', lang: 'en-US', webdriver: false });
    if (kernel === 'chromium') expect(seen.rtc).toEqual([]);
    const cores = fingerprint.kind === 'chromium' ? fingerprint.hardwareConcurrency : fingerprint.config['navigator.hardwareConcurrency'];
    expect(seen.cores).toBe(cores);
    expect(socks.seen.some(d => d.endsWith(`:${new URL(probeUrl).port}`))).toBe(true);

    const proxies = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/proxies`)).json()).proxies;
    expect(proxies.find((p: { id: string }) => p.id === proxyId).lastCheck).toMatchObject({ ok: true, geo: { timezone: 'America/Los_Angeles' } });

    await win.evaluate(id => window.folio.stopProfile(id), profile.id);
    await expect.poll(() => win.evaluate(id => (window as unknown as { last: Record<string, { state: string }> }).last[id].state, profile.id)).toBe('stopped');
    await app.close(); await socks.close();
  });
}

test('a proxy that refuses the password falls back to its backup line, or stops the launch', async () => {
  const withBackup = await setupProfile('chromium', 'wrong', true);
  expect(await opened(withBackup.win, withBackup.profile.id)).toMatchObject({ state: 'running', usedBackup: true });
  await withBackup.app.close(); await withBackup.socks.close();

  const noBackup = await setupProfile('chromium', 'wrong', false);
  expect(await opened(noBackup.win, noBackup.profile.id)).toMatchObject({ state: 'error', error: 'proxy_down' });
  expect(await statusOf(noBackup.win, noBackup.profile.id)).toBeNull();
  await noBackup.app.close(); await noBackup.socks.close();
});

test('changes made elsewhere arrive as live events', async () => {
  const acct = await account();
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByTestId('plan-name')).toBeVisible();
  await win.evaluate(ws => {
    const w = window as unknown as { changes: unknown[] };
    w.changes = [];
    window.folio.onChange(c => w.changes.push(c));
    return window.folio.watch(ws);
  }, acct.workspaceId);
  await win.waitForTimeout(1000);
  await win.evaluate(() => { (window as unknown as { changes: unknown[] }).changes.length = 0; });
  await acct.api.post(`/workspaces/${acct.workspaceId}/groups`, { data: { name: 'EU stores' } });
  await expect.poll(() => win.evaluate(() => (window as unknown as { changes: { kind: string }[] }).changes.map(c => c.kind))).toContain('groups');
  await app.close();
});
