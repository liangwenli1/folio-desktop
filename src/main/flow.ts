// Runs a flow's steps on one page. Only Playwright's page API is used, so both engines run flows the same way;
// the one difference is that Camoufox runs scripts in an isolated world unless they start with `mw:`.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { errors, type Locator, type Page } from 'playwright-core';
import type { FlowError, FlowLog, FlowResult, Step } from '../shared/bridge';

type Test = Extract<Step, { type: 'if' }>['test'];
class StepError extends Error {
  constructor(public code: FlowError['code'], message: string){ super(message); }
}

interface Run {
  page: Page; firefox: boolean; signal: AbortSignal; log(e: FlowLog): void;
  vars: Record<string, string>; data: Record<string, string>;
  // Where screenshots go, and what their names start with.
  shots: { dir: string; prefix: string }; screenshots: string[];
}
export interface RunOptions { firefox: boolean; signal: AbortSignal; log(e: FlowLog): void; vars: Record<string, string>; shots: { dir: string; prefix: string } }

const ACTION_MS = 30_000, NAV_MS = 60_000, MAX_EACH = 1000;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

// What was extracted and the screenshots taken come back even when a step fails; the log names that step.
export async function runFlow(page: Page, steps: Step[], o: RunOptions): Promise<FlowResult> {
  page.setDefaultTimeout(ACTION_MS);
  page.setDefaultNavigationTimeout(NAV_MS);
  const r: Run = { page, firefox: o.firefox, signal: o.signal, log: o.log, vars: { ...o.vars }, data: {}, shots: o.shots, screenshots: [] };
  try {
    await block(r, steps, '', null);
    return { ok: true, data: r.data, screenshots: r.screenshots };
  } catch (e){
    return { ok: false, error: asError(e, r), data: r.data, screenshots: r.screenshots };
  }
}

async function block(r: Run, steps: Step[], prefix: string, item: Locator | null){
  for (const [i, s] of steps.entries()) await step(r, s, `${prefix}${i + 1}`, item);
}

async function step(r: Run, s: Step, path: string, item: Locator | null){
  if (r.signal.aborted) throw new StepError('stopped', '');
  const started = Date.now();
  const line = (target: string, value?: string, error?: FlowError) =>
    r.log({ path, type: s.type, target, ms: s.type === 'if' || s.type === 'loop' ? null : Date.now() - started, ...(value === undefined ? {} : { value: value.slice(0, 200) }), ...(error ? { error } : {}) });
  let target = '';
  try {
    target = describe(r, s);
    const value = await act(r, s, path, item);
    // Blocks log their decision before their steps run.
    if (s.type !== 'if' && s.type !== 'loop') line(target, value);
  } catch (e){
    const err = asError(e, r);
    if (!(e instanceof Nested)) line(target, undefined, err);
    throw e instanceof Nested ? e.inner : new StepError(err.code, err.message);
  }

  async function act(r: Run, s: Step, path: string, item: Locator | null): Promise<string | undefined> {
    const { page } = r;
    switch (s.type){
      case 'open': {
        const url = fill(r, s.url);
        await page.goto(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
        return;
      }
      case 'click': await find(r, s.selector, item).click(); return;
      case 'type': {
        const el = find(r, s.selector, item), text = fill(r, s.text);
        if (!s.slow){ await el.fill(text); return; }
        await el.click();
        for (const ch of text){ await page.keyboard.type(ch); await sleep(r, rand(50, 150)); }
        return;
      }
      case 'press': await page.keyboard.press(fill(r, s.key)); return;
      case 'wait':
        if (s.until === 'time') await sleep(r, rand(s.seconds, Math.max(s.seconds, s.maxSeconds ?? s.seconds)) * 1000);
        else await find(r, s.selector!, item).waitFor({ state: s.until, timeout: s.seconds * 1000 });
        return;
      case 'scroll':
        if (s.to === 'element') await find(r, s.selector!, item).scrollIntoViewIfNeeded();
        else if (s.to === 'pixels') await page.mouse.wheel(0, s.pixels!);
        else await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        return;
      case 'extract': {
        const el = find(r, s.selector, item);
        const value = s.attribute ? (await el.getAttribute(s.attribute)) ?? '' : (await el.innerText()).trim();
        r.vars[s.variable] = r.data[s.variable] = value;
        return value;
      }
      case 'set': r.vars[s.variable] = fill(r, s.value); return r.vars[s.variable];
      case 'screenshot': {
        await mkdir(r.shots.dir, { recursive: true });
        const file = join(r.shots.dir, `${r.shots.prefix}${path.replace(/\./g, '-')}-${Date.now()}.png`);
        if (s.selector) await find(r, s.selector, item).screenshot({ path: file });
        else await page.screenshot({ path: file, fullPage: true });
        r.screenshots.push(file);
        return file;
      }
      case 'script': {
        const code = fill(r, s.code), main = code.startsWith('mw:');
        const expr = `(async () => {\n${main ? code.slice(3) : code}\n})()`;
        let out: unknown;
        try { out = await page.evaluate(r.firefox && main ? `mw:${expr}` : expr); } catch (e){ throw new StepError('script', firstLine(e)); }
        const value = out === undefined || out === null ? '' : typeof out === 'string' ? out : JSON.stringify(out);
        if (s.variable) r.vars[s.variable] = r.data[s.variable] = value;
        return value;
      }
      case 'if': {
        const yes = await test(r, s.test, item);
        line(target, yes ? 'then' : 'else');
        await nested(() => block(r, yes ? s.then : s.else, `${path}.`, item));
        return;
      }
      case 'loop': {
        const before = r.vars['loop.index'];
        const all = s.mode === 'each' ? findAll(r, s.selector!, item) : null;
        const n = all ? Math.min(await all.count(), MAX_EACH) : s.times!;
        line(target, String(n));
        for (let i = 0; i < n; i++){
          r.vars['loop.index'] = String(i + 1);
          await nested(() => block(r, s.steps, `${path}.`, all ? all.nth(i) : item));
        }
        if (before === undefined) delete r.vars['loop.index']; else r.vars['loop.index'] = before;
        return;
      }
    }
  }
}

// A failure inside a block was logged by the step that failed; the block only passes it on.
class Nested extends Error { constructor(public inner: unknown){ super('nested'); } }
async function nested(fn: () => Promise<void>){
  try { await fn(); } catch (e){ throw new Nested(e); }
}

async function test(r: Run, t: Test, item: Locator | null){
  if (t.kind === 'equals') return (r.vars[t.variable] ?? '') === fill(r, t.value);
  const all = findAll(r, t.selector, item);
  if (!(await all.count())) return false;
  return t.kind === 'exists' || (await all.first().innerText()).includes(fill(r, t.text));
}

// `@item` is the element the surrounding loop is on; `@item >> a` looks inside it.
function findAll(r: Run, selector: string, item: Locator | null): Locator {
  const sel = fill(r, selector);
  if (sel === '@item' || sel.startsWith('@item ')){
    if (!item) throw new StepError('no_item', sel);
    const rest = sel.slice(5).trim().replace(/^>>\s*/, '');
    return rest ? item.locator(rest) : item;
  }
  return r.page.locator(sel);
}
const find = (r: Run, selector: string, item: Locator | null) => findAll(r, selector, item).first();

// {{name}} becomes the variable's value; one without a value fails the step rather than sending an empty string.
export function fill(r: { vars: Record<string, string> }, text: string){
  return text.replace(/\{\{\s*([A-Za-z_][\w.]*)\s*\}\}/g, (_m, name: string) => {
    if (!(name in r.vars)) throw new StepError('variable', name);
    return r.vars[name];
  });
}

function describe(r: Run, s: Step): string {
  const safe = (text: string) => { try { return fill(r, text); } catch { return text; } };
  switch (s.type){
    case 'open': return safe(s.url);
    case 'click': case 'type': case 'extract': return safe(s.selector);
    case 'press': return s.key;
    case 'wait': return s.until === 'time' ? `${s.seconds}${s.maxSeconds && s.maxSeconds > s.seconds ? `–${s.maxSeconds}` : ''} s` : safe(s.selector ?? '');
    case 'scroll': return s.to === 'element' ? safe(s.selector ?? '') : s.to === 'pixels' ? `${s.pixels} px` : '';
    case 'set': return s.variable;
    case 'screenshot': return s.selector ? safe(s.selector) : '';
    case 'script': return s.code.split('\n')[0].slice(0, 60);
    case 'if': return s.test.kind === 'equals' ? `${s.test.variable} = ${s.test.value}` : safe(s.test.selector);
    case 'loop': return s.mode === 'times' ? String(s.times) : safe(s.selector ?? '');
  }
}

async function sleep(r: Run, ms: number){
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => { r.signal.removeEventListener('abort', stop); resolve(); }, ms);
    const stop = () => { clearTimeout(t); reject(new StepError('stopped', '')); };
    r.signal.addEventListener('abort', stop, { once: true });
  });
}

const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split('\n')[0].replace(/^[\w.]+: /, '').slice(0, 300);

// Stopping closes the page, so whatever was under way fails: that reads as stopped.
function asError(e: unknown, r: Run): FlowError {
  if (e instanceof Nested) return asError(e.inner, r);
  if (r.signal.aborted) return { code: 'stopped', message: '' };
  if (e instanceof StepError) return { code: e.code, message: e.message };
  if (e instanceof errors.TimeoutError) return { code: 'timeout', message: firstLine(e) };
  const message = firstLine(e);
  if (r.page.isClosed() || /Target (page, context or browser )?(has been )?closed/i.test(message)) return { code: 'closed', message };
  if (/net::ERR_|NS_ERROR_|NS_BINDING/.test(message)) return { code: 'navigation', message };
  return { code: 'failed', message };
}
