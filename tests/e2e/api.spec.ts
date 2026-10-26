// The local API (P4 acceptance two): scripts open profiles with a token and take them over, Playwright over CDP for
// Chromium and Puppeteer over WebDriver BiDi for Firefox; Free and Studio are limited to 60 requests a minute.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, expect, test, type Page } from '@playwright/test';
import puppeteer from 'puppeteer-core';
import { ENGINE_ENV, account, chromiumProfile, dataDir, hasKernels, launch, logIn } from './helpers';

test.setTimeout(300_000);
const LOCAL = 'http://127.0.0.1:47210';
const local = (method: string, path: string, token?: string) =>
  fetch(LOCAL + path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

// A shop page that signs the visitor in with a cookie.
async function startSite(){
  const server = http.createServer((req, res) => {
    if (req.url!.startsWith('/login')) res.setHeader('set-cookie', 'sid=ada; Path=/; Max-Age=86400');
    res.setHeader('content-type', 'text/html');
    res.end(`<title>Shop</title><input id="q">`);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}/`, close: () => new Promise<void>(r => server.close(() => r())) };
}

// Turns the local API on and makes a token, the way a person does it.
async function apiToken(win: Page){
  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'API & scripts' }).click();
  const server = win.getByRole('region', { name: 'Local API' });
  await server.getByLabel('On').check();
  await expect(server.getByRole('status')).toContainText(`Listening on ${LOCAL}`);
  const tokens = win.getByRole('region', { name: 'Tokens' });
  await tokens.getByLabel('Name, e.g., order sync').fill('ci');
  await tokens.getByRole('button', { name: 'Create token' }).click();
  const token = await tokens.locator('.token-new code').textContent();
  await tokens.getByRole('button', { name: 'Done' }).click();
  await expect(tokens.locator('[data-token="ci"]')).toBeVisible();
  return token!;
}

test('scripts open profiles through the API and take them over: Playwright for Chromium, Puppeteer for Firefox', async () => {
  test.skip(!hasKernels, 'browser engines are not unpacked here');
  const site = await startSite();
  const acct = await account({ buy: { plan: 'studio', period: 'monthly' } });
  const base = `/workspaces/${acct.workspaceId}`;
  const app = await launch(dataDir(), ENGINE_ENV);
  const win = await logIn(app, acct.email);
  await expect(win.getByRole('navigation', { name: 'Main' })).toBeVisible();
  const shop = await (await acct.api.post(`${base}/profiles`, { data: chromiumProfile('Shop-01') })).json();
  const fp = await win.evaluate(() => window.folio.newFingerprint('firefox', 'linux'));
  const fox = await (await acct.api.post(`${base}/profiles`, { data: { name: 'Shop-02', kernel: 'firefox', os: 'linux', ...fp } })).json();
  const token = await apiToken(win);

  expect((await local('GET', '/api/v1/profiles')).status).toBe(401);
  expect((await local('GET', '/api/v1/profiles', 'folio_not-a-token')).status).toBe(401);
  const listed = await (await local('GET', '/api/v1/profiles', token)).json();
  expect(listed.profiles.map((p: { number: number; running: boolean }) => [p.number, p.running])).toEqual([[1, false], [2, false]]);

  // Chromium: a CDP address that Playwright connects to.
  const started = await (await local('POST', '/api/v1/profiles/0001/start', token)).json();
  expect(started).toMatchObject({ id: shop.id, running: true, protocol: 'cdp', wsEndpoint: expect.stringMatching(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//), debuggerAddress: expect.stringMatching(/^127\.0\.0\.1:\d+$/) });
  const cdp = await chromium.connectOverCDP(started.wsEndpoint);
  const page = cdp.contexts()[0].pages()[0] ?? await cdp.contexts()[0].newPage();
  await page.goto(`${site.url}login`);
  expect(await page.title()).toBe('Shop');
  expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
  await cdp.close();
  expect(await (await local('POST', '/api/v1/profiles/1/stop', token)).json()).toEqual({ id: shop.id, stopped: true });
  const saved = (await (await acct.api.get(`${base}/profiles`)).json()).profiles.find((p: { id: string }) => p.id === shop.id);
  expect(saved.data.cookies).toBeGreaterThanOrEqual(1);
  const opened = (await (await acct.api.get(`${base}/activity?profileId=${shop.id}&kind=open`)).json()).entries;
  expect(opened.at(-1)).toMatchObject({ action: 'profile.open', detail: { via: 'api' } });

  // Scripts get one blank tab, unless they ask for the tabs it was last closed with; asking also keeps them.
  const keep = await (await local('POST', '/api/v1/profiles/1/start?restoreTabs=1', token)).json();
  const kept = await chromium.connectOverCDP(keep.wsEndpoint);
  await kept.contexts()[0].pages()[0].goto(`${site.url}kept`);
  await kept.close();
  await local('POST', '/api/v1/profiles/1/stop', token);
  for (const [query, tabs] of [['', ['about:blank']], ['?restoreTabs=1', [`${site.url}kept`]]] as const){
    const again = await chromium.connectOverCDP((await (await local('POST', `/api/v1/profiles/1/start${query}`, token)).json()).wsEndpoint);
    await expect.poll(() => again.contexts()[0].pages().map(p => p.url())).toEqual(tabs);
    await again.close();
    await local('POST', '/api/v1/profiles/1/stop', token);
  }

  // Firefox: a WebDriver BiDi address that Puppeteer connects to.
  const ff = await (await local('POST', '/api/v1/profiles/%230002/start', token)).json();
  expect(ff).toMatchObject({ id: fox.id, protocol: 'webdriver-bidi', wsEndpoint: expect.stringMatching(/^ws:\/\/127\.0\.0\.1:\d+\/session$/) });
  const bidi = await puppeteer.connect({ browserWSEndpoint: ff.wsEndpoint, protocol: 'webDriverBiDi' });
  const [tab] = await bidi.pages();
  await tab.goto(site.url);
  await tab.type('#q', 'hello');
  expect(await tab.$eval('#q', e => (e as HTMLInputElement).value)).toBe('hello');
  await bidi.disconnect();

  // While a script drives the Firefox profile, a task leaves it alone.
  const flow = await (await acct.api.post(`${base}/flows`, { data: { name: 'Look', steps: [{ type: 'open', url: site.url }] } })).json();
  const task = await (await acct.api.post(`${base}/tasks`, { data: { name: 'Look around', flowId: flow.id, profileIds: [fox.id], concurrency: 1, retries: 0, timeoutMin: 5 } })).json();
  const { runId } = await (await local('POST', `/api/v1/tasks/${task.id}/run`, token)).json();
  await expect.poll(async () => (await (await local('GET', `/api/v1/runs/${runId}`, token)).json()).run.status, { timeout: 60_000 }).toBe('done');
  expect((await (await local('GET', `/api/v1/runs/${runId}`, token)).json()).items).toMatchObject([{ number: 2, status: 'skipped', error: { code: 'scripted' } }]);
  expect(await (await local('POST', '/api/v1/profiles/2/stop', token)).json()).toEqual({ id: fox.id, stopped: true });

  // A profile opened by hand has no debugging address; the API says so rather than handing over a blind one.
  await win.evaluate(id => window.folio.openProfile(id), shop.id);
  await expect.poll(async () => (await (await local('GET', '/api/v1/profiles/1', token)).json()).running, { timeout: 60_000 }).toBe(true);
  const refused = await local('POST', '/api/v1/profiles/1/start', token);
  expect(refused.status).toBe(409);
  expect((await refused.json()).error.code).toBe('running_without_api');
  expect((await local('GET', '/api/v1/profiles/1', token)).status).toBe(200);
  await local('POST', '/api/v1/profiles/1/stop', token);
  expect((await local('GET', '/api/v1/profiles/9999', token)).status).toBe(404);
  await app.close();
  await site.close();
});

test('Studio allows 60 requests a minute, Company is unthrottled, and a revoked token stops working', async () => {
  const studio = await account({ buy: { plan: 'studio', period: 'monthly' } });
  let app = await launch(dataDir());
  let win = await logIn(app, studio.email);
  let token = await apiToken(win);
  for (let i = 0; i < 60; i++) expect((await local('GET', '/api/v1/profiles', token)).status).toBe(200);
  const limited = await local('GET', '/api/v1/profiles', token);
  expect(limited.status).toBe(429);
  const retry = Number(limited.headers.get('retry-after'));
  expect(retry).toBeGreaterThanOrEqual(1);
  expect(retry).toBeLessThanOrEqual(60);
  expect((await limited.json()).error).toMatchObject({ code: 'rate_limited', retryAfter: retry });
  await win.getByRole('button', { name: 'Revoke ci' }).click();
  await expect(win.locator('[data-token="ci"]')).toHaveCount(0);
  expect((await local('GET', '/api/v1/profiles', token)).status).toBe(401);
  await app.close();

  const company = await account({ buy: { plan: 'company', period: 'monthly' } });
  app = await launch(dataDir());
  win = await logIn(app, company.email);
  token = await apiToken(win);
  for (let i = 0; i < 80; i++) expect((await local('GET', '/api/v1/profiles', token)).status).toBe(200);
  await app.close();
});
