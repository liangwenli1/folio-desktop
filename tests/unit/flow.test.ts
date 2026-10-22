// The flow runner against a local page, in both engines. Needs the engines unpacked (see tests/e2e/helpers.ts).
import { existsSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, firefox, type Browser } from 'playwright-core';
import { runFlow } from '../../src/main/flow';
import type { FlowLog, Step } from '../../src/shared/bridge';

const KERNELS = process.env.FOLIO_KERNELS_DIR ?? '/kernels';
const ENGINES = { chromium: join(KERNELS, 'chromium-150.0.7871.186', 'chrome'), firefox: join(KERNELS, 'firefox-156.0.1-beta.36', 'camoufox-bin') };
// Engines read proxy settings from the environment; the test page is local.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/_proxy$/i.test(k))) as Record<string, string>;

const SHOP = `<!doctype html><title>Shop</title>
<input id="email"><button id="go" onclick="document.getElementById('out').textContent = 'Hello ' + document.getElementById('email').value">Sign in</button>
<p id="out"></p><button id="late" hidden>late</button>
<ul>${[1, 2, 3].map(i => `<li class="order"><a href="/o/${i}">Order ${i}</a> <span class="amt">$${i}0</span></li>`).join('')}</ul>
<div style="height:3000px"></div><footer id="end">end</footer>
<script>
  window.secret = 42;
  addEventListener('keydown', e => { if (e.key === 'Enter') document.body.dataset.enter = 'yes'; });
  setTimeout(() => { document.getElementById('late').hidden = false; }, 300);
</script>`;

let server: http.Server, base = '';
beforeAll(async () => {
  server = http.createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(SHOP); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const FLOW: Step[] = [
  { type: 'open', url: '{{base}}/shop' },
  { type: 'type', selector: '#email', text: '{{email}}', slow: true },
  { type: 'click', selector: 'text=Sign in' },
  { type: 'wait', until: 'visible', seconds: 5, maxSeconds: null, selector: '#late' },
  { type: 'extract', selector: '#out', attribute: null, variable: 'greeting' },
  { type: 'press', key: 'Enter' },
  { type: 'script', code: 'return document.body.dataset.enter', variable: 'entered' },
  { type: 'if', test: { kind: 'contains', selector: '#out', text: 'Hello' }, then: [{ type: 'set', variable: 'flag', value: 'yes' }], else: [{ type: 'set', variable: 'flag', value: 'no' }] },
  { type: 'set', variable: 'list', value: '' },
  { type: 'loop', mode: 'each', times: null, selector: '.order', steps: [
    { type: 'set', variable: 'list', value: '{{list}}{{loop.index}};' },
    { type: 'extract', selector: '@item >> a', attribute: 'href', variable: 'lastHref' }
  ] },
  { type: 'loop', mode: 'times', times: 2, selector: null, steps: [{ type: 'scroll', to: 'pixels', selector: null, pixels: 100 }] },
  { type: 'scroll', to: 'bottom', selector: null, pixels: null },
  { type: 'scroll', to: 'element', selector: '#end', pixels: null },
  { type: 'screenshot', selector: null },
  { type: 'screenshot', selector: '#out' },
  // The page's own variables: Firefox needs mw: for them, Chromium sees them either way.
  { type: 'script', code: 'mw:return String(window.secret)', variable: 'secret' },
  { type: 'script', code: 'return String(window.secret)', variable: 'isolated' },
  { type: 'script', code: 'return "{{flag}}|{{list}}"', variable: 'summary' },
  { type: 'wait', until: 'time', seconds: 0.05, maxSeconds: 0.1, selector: null }
];

for (const kernel of ['chromium', 'firefox'] as const){
  describe.skipIf(!existsSync(ENGINES[kernel]))(`flows on ${kernel}`, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = kernel === 'chromium'
        ? await chromium.launch({ executablePath: ENGINES.chromium, headless: true, args: ['--no-sandbox'], env })
        // What Camoufox({ main_world_eval: true }) sets, as the launcher does.
        : await firefox.launch({ executablePath: ENGINES.firefox, headless: true, env: { ...env, CAMOU_CONFIG_1: JSON.stringify({ allowMainWorld: true }) } });
    }, 60_000);
    afterAll(() => browser?.close());

    async function run(steps: Step[], vars: Record<string, string> = {}, signal = new AbortController().signal){
      const page = await browser.newPage();
      const log: FlowLog[] = [];
      const dir = mkdtempSync(join(tmpdir(), 'folio-shots-'));
      const result = await runFlow(page, steps, { firefox: kernel === 'firefox', signal, vars: { base, ...vars }, log: l => log.push(l), shots: { dir, prefix: 'p-' } });
      await page.close();
      return { result, log, dir };
    }

    it('runs every kind of step and keeps what it extracted', async () => {
      const { result, log, dir } = await run(FLOW, { email: 'me@example.com' });
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({
        greeting: 'Hello me@example.com', entered: 'yes', lastHref: '/o/3', secret: '42',
        isolated: kernel === 'firefox' ? 'undefined' : '42', summary: 'yes|1;2;3;'
      });
      expect(result.screenshots).toHaveLength(2);
      for (const f of result.screenshots){ expect(f.startsWith(join(dir, 'p-'))).toBe(true); expect(existsSync(f)).toBe(true); }
      expect(log.map(l => l.path)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '8.1', '9', '10', '10.1', '10.2', '10.1', '10.2', '10.1', '10.2',
        '11', '11.1', '11.1', '12', '13', '14', '15', '16', '17', '18', '19']);
      expect(log.find(l => l.path === '8')).toMatchObject({ type: 'if', value: 'then', ms: null });
      expect(log.find(l => l.path === '10')).toMatchObject({ type: 'loop', target: '.order', value: '3' });
      expect(log[0]).toMatchObject({ type: 'open', target: `${base}/shop` });
      expect(log.every(l => !l.error)).toBe(true);
    }, 60_000);

    it('names the step that failed and why, keeping what came before', async () => {
      const missing = await run([FLOW[0], FLOW[4], { type: 'wait', until: 'visible', seconds: 1, maxSeconds: null, selector: '#never' }, FLOW[2]]);
      expect(missing.result).toMatchObject({ ok: false, error: { code: 'timeout' }, data: { greeting: '' } });
      expect(missing.log.map(l => [l.path, l.error?.code ?? null])).toEqual([['1', null], ['2', null], ['3', 'timeout']]);

      const unset = await run([FLOW[0], { type: 'type', selector: '#email', text: '{{nobody}}', slow: false }]);
      expect(unset.result.error).toEqual({ code: 'variable', message: 'nobody' });
      const nested = await run([FLOW[0], { type: 'if', test: { kind: 'exists', selector: '#go' }, then: [{ type: 'click', selector: '@item' }], else: [] }]);
      expect(nested.result.error).toMatchObject({ code: 'no_item' });
      expect(nested.log.map(l => [l.path, l.error?.code ?? null])).toEqual([['1', null], ['2', null], ['2.1', 'no_item']]);
      const broken = await run([FLOW[0], { type: 'script', code: 'throw new Error("boom")', variable: null }]);
      expect(broken.result.error).toMatchObject({ code: 'script' });
      expect(broken.result.error!.message).toContain('boom');
    }, 60_000);

    it('checks sign-in by an element that shows up, or one that does not', async () => {
      const check = (mode: 'present' | 'absent', selector: string) => run([{ type: 'signedIn', url: '{{base}}/account', mode, selector, seconds: 1 }]);
      expect((await check('present', '#go')).result).toMatchObject({ ok: true });
      expect((await check('present', '#avatar')).result.error).toEqual({ code: 'signed_out', message: '' });
      expect((await check('absent', '#avatar')).result).toMatchObject({ ok: true });
      const out = await check('absent', 'text=Sign in');
      expect(out.result.error).toMatchObject({ code: 'signed_out' });
      expect(out.log).toMatchObject([{ path: '1', type: 'signedIn', target: `${base}/account`, error: { code: 'signed_out' } }]);
    }, 60_000);

    it('stops between steps and during waits', async () => {
      const abort = new AbortController();
      setTimeout(() => abort.abort(), 300);
      const t = Date.now();
      const { result } = await run([FLOW[0], { type: 'wait', until: 'time', seconds: 20, maxSeconds: null, selector: null }, FLOW[2]], {}, abort.signal);
      expect(result.error).toMatchObject({ code: 'stopped' });
      expect(Date.now() - t).toBeLessThan(10_000);
    }, 30_000);
  });
}
