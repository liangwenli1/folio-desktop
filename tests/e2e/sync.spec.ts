// Sign-in state follows a profile between computers, and only one computer has it open at a time.
// Two app instances with their own data folders play the two computers.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { startSocks5 } from '../fixtures/proxies';
import { ENGINE_ENV, account, closeWindows, dataDir, hasKernels, lastStatus, launch, logIn, opened } from './helpers';

test.skip(!hasKernels, 'browser engines are not unpacked here');
test.setTimeout(300_000);

// A site that signs in with a cookie and also remembers the user in local storage and IndexedDB.
async function startSite(){
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://site');
    res.setHeader('content-type', 'text/html');
    if (url.pathname === '/login'){
      const user = JSON.stringify(url.searchParams.get('user'));
      res.setHeader('set-cookie', `sid=${url.searchParams.get('user')}; Max-Age=86400; Path=/`);
      return res.end(`<!doctype html><script>
        localStorage.setItem('user', ${user});
        const r = indexedDB.open('app', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(${user}, 'user'); tx.oncomplete = () => { document.title = 'signed in'; }; };
      </script>`);
    }
    const sid = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';
    res.end(`<!doctype html><body data-cookie="${sid}"><script>
      document.body.dataset.local = localStorage.getItem('user') ?? '';
      const r = indexedDB.open('app', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('user'); q.onsuccess = () => { document.body.dataset.idb = q.result ?? ''; document.title = 'checked'; }; };
    </script>`);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>(r => server.close(() => r())) };
}

// Loads a page in a running profile's browser and returns what the page put on <body>.
const browse = (app: ElectronApplication, id: string, url: string, title: string) => app.evaluate(async (_e, { id, url, title }) => {
  const r = (globalThis as unknown as { __folioRunning: Map<string, { ctx: import('playwright-core').BrowserContext }> }).__folioRunning.get(id)!;
  const page = r.ctx.pages()[0] ?? await r.ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(t => document.title === t, title);
  return page.evaluate(() => ({ ...document.body.dataset }));
}, { id, url, title });


for (const kernel of ['chromium', 'firefox'] as const){
  test(`${kernel}: signed in on one computer, still signed in on the next; one computer at a time`, async () => {
    const socks = await startSocks5('alice', 's3cret');
    const site = await startSite();
    const acct = await account();
    const base = `/workspaces/${acct.workspaceId}`;
    const proxy = await (await acct.api.post(`${base}/proxies`, { data: { type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'alice', password: 's3cret' } })).json();

    const a = await launch(dataDir(), ENGINE_ENV);
    const winA = await logIn(a, acct.email);
    await expect(winA.getByRole('navigation', { name: 'Main' })).toBeVisible();
    const { fingerprint, kernelVersion } = await winA.evaluate(k => window.folio.newFingerprint(k, 'linux'), kernel);
    const p = await (await acct.api.post(`${base}/profiles`, { data: { name: 'Shop', kernel, kernelVersion, os: 'linux', fingerprint, proxyId: proxy.id } })).json();

    // Computer A signs in, then the person closes the browser.
    expect(await opened(winA, p.id)).toMatchObject({ state: 'running' });
    await browse(a, p.id, `${site.url}/login?user=alice`, 'signed in');
    await closeWindows(a, p.id);
    await expect.poll(async () => (await lastStatus(winA, p.id))?.state, { timeout: 60_000 }).toBe('stopped');
    const saved = (await (await acct.api.get(`${base}/profiles`)).json()).profiles[0];
    expect(saved).toMatchObject({ lock: null, data: { version: 1 } });
    expect(saved.data.cookies).toBeGreaterThan(0);

    // Computer B opens it signed in: cookie, local storage and IndexedDB.
    const b = await launch(dataDir(), ENGINE_ENV);
    const winB = await logIn(b, acct.email);
    await expect(winB.getByRole('navigation', { name: 'Main' })).toBeVisible();
    expect(await opened(winB, p.id)).toMatchObject({ state: 'running' });
    expect(await browse(b, p.id, `${site.url}/whoami`, 'checked')).toEqual({ cookie: 'alice', local: 'alice', idb: 'alice' });

    // A cannot open it while B has it. A's list says where it is open; the owner takes it over from the details,
    // which closes it on B without saving over the state, and opens it on A.
    expect(await opened(winA, p.id)).toMatchObject({ state: 'error', error: 'locked' });
    const row = winA.locator('tr[data-id]', { hasText: 'Shop' });
    await expect(row).toContainText('In use on');
    await row.getByRole('button', { name: 'Shop', exact: true }).click();
    const detail = winA.getByRole('dialog', { name: 'Profile', exact: true });
    await expect(detail.getByTestId('away')).toContainText(acct.email);
    await detail.getByRole('button', { name: 'Take over', exact: true }).click();
    await detail.getByRole('button', { name: 'Take over and open' }).click();
    await expect.poll(async () => (await lastStatus(winB, p.id))?.state, { timeout: 20_000 }).toBe('error');
    expect(await lastStatus(winB, p.id)).toMatchObject({ error: 'lock_lost' });
    await expect.poll(async () => (await lastStatus(winA, p.id))?.state, { timeout: 60_000 }).toBe('running');
    expect(await browse(a, p.id, `${site.url}/whoami`, 'checked')).toEqual({ cookie: 'alice', local: 'alice', idb: 'alice' });

    await Promise.all([a.close(), b.close()]);
    await socks.close(); await site.close();
  });
}
