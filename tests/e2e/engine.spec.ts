// Launching real engines through a password-protected SOCKS5 proxy. Needs the engines unpacked under
// FOLIO_KERNELS_DIR (as <kind>-<version>/) and a folio-server with DEV_PRIVATE_GEO=seattle, since every
// address in the test network is private.
import { expect, test } from '@playwright/test';
import { startSocks5 } from '../fixtures/proxies';
import { ENGINE_ENV, account, dataDir, hasKernels, inBrowser, lastStatus, launch, logIn, opened, startProbe, statusOf } from './helpers';

test.skip(!hasKernels, 'browser engines are not unpacked here');
test.setTimeout(180_000);

let probe: Awaited<ReturnType<typeof startProbe>>;
test.beforeAll(async () => { probe = await startProbe(); });
test.afterAll(() => probe.close());

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
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
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

    const seen = await inBrowser(app, profile.id, probe.url);
    expect(seen).toMatchObject({ tz: 'America/Los_Angeles', lang: 'en-US', webdriver: false });
    if (kernel === 'chromium') expect(seen.rtc).toEqual([]);
    const cores = fingerprint.kind === 'chromium' ? fingerprint.hardwareConcurrency : fingerprint.config['navigator.hardwareConcurrency'];
    expect(seen.cores).toBe(cores);
    expect(socks.seen.some(d => d.endsWith(`:${probe.port}`))).toBe(true);

    const proxies = (await (await acct.api.get(`/workspaces/${acct.workspaceId}/proxies`)).json()).proxies;
    expect(proxies.find((p: { id: string }) => p.id === proxyId).lastCheck).toMatchObject({ ok: true, geo: { timezone: 'America/Los_Angeles' } });

    await win.evaluate(id => window.folio.stopProfile(id), profile.id);
    await expect.poll(async () => (await lastStatus(win, profile.id))?.state).toBe('stopped');
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
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
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
