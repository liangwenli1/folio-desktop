// Window sync: what the person does in the leader's window happens in the followers' windows too. A small script
// in the leader's tabs reports clicks, mouse moves, scrolling, keys and typed text; it runs in an
// isolated world the page's own JavaScript can't see (Chromium: one made through CDP on every page load; Firefox:
// Camoufox keeps Playwright's scripts and bindings out of the page). Followers replay through Playwright's mouse
// and keyboard, which give trusted events in both engines, each after a short random pause. Tabs are matched by
// position; the tab the leader works in comes to the front in the followers (pages under Playwright always report
// themselves visible, so a tab switch shows only once something is done in the tab). Opening an address, going back
// or forward, and opening or closing a tab are seen in the browser itself and repeated too. Clicks, typing and
// scrolling can each be left out; what was repeated, and where it went wrong, goes into a log of the last 50.
import { app, nativeImage } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, CDPSession, Frame, Page } from 'playwright-core';
import { browserOf, isRunning, open } from './launcher';
import type { SyncAction, SyncIssue, SyncLogEntry, SyncOptions, WindowSync } from '../shared/bridge';

interface Member { id: string; kernel: 'chromium' | 'firefox'; ctx: BrowserContext; pages: Page[]; queue: Promise<void>; issue: WindowSync['members'][number]['issue']; label: string | null; off: (() => void)[] }
interface Session { leader: Member; followers: Member[]; lastInput: number; active: number }
type Event =
  | { t: 'click'; button: number; detail: number; x: number; y: number; sel: string | null; ox: number; oy: number; label: string | null }
  | { t: 'move'; x: number; y: number }
  | { t: 'scroll'; sel: string | null; rx: number; ry: number; top: number }
  | { t: 'key'; key: string }
  | { t: 'text'; data: string };
// How a follower did with one log entry: cleanly, or the problem it had (the worst one, when the entry merges several).
type Result = 'ok' | SyncIssue;
interface Entry extends SyncLogEntry { results: Map<string, { result: Result; label: string | null }> }

// A navigation this soon after a click or key came from it, and the followers' own click or key repeats it.
const INPUT_MS = 1500;
// Typing or scrolling this soon after the last of it goes into the same log entry.
const MERGE_MS = 2000;
const LOG = 50, THUMB_MS = 2000, THUMB_WIDTH = 480;

let session: Session | null = null;
let notify: (s: WindowSync | null) => void = () => {};
export const onWindowSync = (fn: typeof notify) => { notify = fn; };
export const windowSync = (): WindowSync | null => session && {
  leader: session.leader.id, members: [session.leader, ...session.followers].map(m => ({ id: m.id, issue: m.issue, label: m.label }))
};
const changed = () => notify(windowSync());

// What is repeated, and how long a follower waits before it repeats something.
const DEFAULTS: SyncOptions = { click: true, typing: true, scroll: true, delay: [0.1, 0.5] };
let options: SyncOptions = DEFAULTS;
const optionsFile = () => join(app.getPath('userData'), 'window-sync.json');
const clean = (o: SyncOptions): SyncOptions => {
  const [a, b] = o.delay.map(n => Math.min(5, Math.max(0, Math.round(Number(n) * 10) / 10 || 0)));
  return { click: !!o.click, typing: !!o.typing, scroll: !!o.scroll, delay: [Math.min(a, b), Math.max(a, b)] };
};
export async function loadSyncOptions(){
  options = clean({ ...DEFAULTS, ...JSON.parse(await readFile(optionsFile(), 'utf8').catch(() => '{}')) });
}
export const syncOptions = () => options;
export async function setSyncOptions(change: Partial<SyncOptions>){
  options = clean({ ...options, ...change });
  await writeFile(optionsFile(), JSON.stringify(options, null, 2));
  return options;
}
const pause = () => {
  const [a, b] = options.delay;
  return new Promise(r => setTimeout(r, (a + Math.random() * (b - a)) * 1000));
};

// The log, newest first; the page hears of changes (a burst of them at most every 150 ms).
let log: Entry[] = [];
let seq = 0, pushing: NodeJS.Timeout | null = null;
let heard: (log: SyncLogEntry[]) => void = () => {};
export const onSyncLog = (fn: typeof heard) => { heard = fn; };
export const syncLog = (): SyncLogEntry[] => log.map(({ results: _r, ...e }) => e);
const push = () => { pushing ??= setTimeout(() => { pushing = null; heard(syncLog()); }, 150); };
function record(action: SyncAction, of: number){
  const last = log[0], now = Date.now();
  if (last && now - last.at < MERGE_MS && last.of === of && ((last.action.t === 'text' && action.t === 'text') || (last.action.t === 'scroll' && action.t === 'scroll'))){
    if (last.action.t === 'text' && action.t === 'text') last.action.text += action.text;
    else last.action = action;
    last.at = now;
    push();
    return last;
  }
  const entry: Entry = { id: ++seq, at: now, action, of, ok: 0, problems: [], results: new Map() };
  log = [entry, ...log].slice(0, LOG);
  push();
  return entry;
}
const WORSE: Result[] = ['ok', 'coords', 'failed'];
function settle(entry: Entry, m: Member, result: Result){
  const was = entry.results.get(m.id);
  if (!was || WORSE.indexOf(result) > WORSE.indexOf(was.result)) entry.results.set(m.id, { result, label: result === 'coords' ? m.label : null });
  const all = [...entry.results];
  entry.ok = all.filter(([, r]) => r.result === 'ok').length;
  entry.problems = all.flatMap(([id, r]) => (r.result === 'ok' ? [] : [{ id, issue: r.result, label: r.label }]));
  push();
}

// The listener, run once per document in the isolated world. Positions are fractions of the window, so a
// follower of another size lands in the same place; clicks also name the element, which is tried first, and say
// what it reads (for the log).
const SCRIPT = `(() => {
  if (globalThis.__folioSync) return;
  globalThis.__folioSync = true;
  const send = e => { try { folioSync(JSON.stringify(e)); } catch {} };
  const unique = s => { try { return document.querySelectorAll(s).length === 1 ? s : null; } catch { return null; } };
  const selectorOf = el => {
    if (!(el instanceof Element)) return null;
    if (el.id && unique('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id);
    for (const a of ['data-testid', 'name', 'aria-label']){
      const v = el.getAttribute(a);
      const s = v && unique(el.localName + '[' + a + '="' + CSS.escape(v) + '"]');
      if (s) return s;
    }
    const path = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement){
      if (n.id && unique('#' + CSS.escape(n.id))){ path.unshift('#' + CSS.escape(n.id)); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter(c => c.localName === n.localName) : [n];
      path.unshift(same.length > 1 ? n.localName + ':nth-of-type(' + (same.indexOf(n) + 1) + ')' : n.localName);
    }
    return unique(path.join(' > '));
  };
  const labelOf = t => {
    const el = t instanceof Element ? t.closest('button,a,[role=button],input,textarea,select,label') || t : null;
    const s = el && (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el.localName === 'input' ? el.value : '') || el.textContent || '').replace(/\\s+/g, ' ').trim();
    return s ? s.slice(0, 40) : null;
  };
  const at = e => {
    const r = e.target instanceof Element ? e.target.getBoundingClientRect() : null;
    return { x: e.clientX / innerWidth, y: e.clientY / innerHeight, sel: selectorOf(e.target), label: labelOf(e.target),
      ox: r && r.width ? (e.clientX - r.left) / r.width : 0.5, oy: r && r.height ? (e.clientY - r.top) / r.height : 0.5 };
  };
  addEventListener('click', e => { if (e.isTrusted) send({ t: 'click', button: 0, detail: e.detail, ...at(e) }); }, true);
  addEventListener('auxclick', e => { if (e.isTrusted && e.button === 1) send({ t: 'click', button: 1, detail: 1, ...at(e) }); }, true);
  addEventListener('contextmenu', e => { if (e.isTrusted) send({ t: 'click', button: 2, detail: 1, ...at(e) }); }, true);
  let moved = 0;
  addEventListener('mousemove', e => { const now = Date.now(); if (e.isTrusted && now - moved > 50){ moved = now; send({ t: 'move', x: e.clientX / innerWidth, y: e.clientY / innerHeight }); } }, true);
  let scrolled = 0, pending = null;
  addEventListener('scroll', e => {
    const el = e.target === document ? document.scrollingElement : e.target;
    if (!(el instanceof Element)) return;
    const report = () => { scrolled = Date.now(); pending = null; send({ t: 'scroll', sel: el === document.scrollingElement ? null : selectorOf(el), top: Math.round(el.scrollTop),
      rx: el.scrollWidth > el.clientWidth ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0, ry: el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0 }); };
    clearTimeout(pending);
    if (Date.now() - scrolled > 100) report(); else pending = setTimeout(report, 100);
  }, true);
  const named = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
  addEventListener('keydown', e => {
    if (!e.isTrusted || e.isComposing || e.key === 'Process') return;
    const mods = [e.ctrlKey && 'Control', e.metaKey && 'Meta', e.altKey && 'Alt', e.shiftKey && named.has(e.key) && 'Shift'].filter(Boolean);
    if (named.has(e.key) || (mods.length && e.key.length === 1)) send({ t: 'key', key: [...mods, e.key.length === 1 ? e.key.toLowerCase() : e.key].join('+') });
  }, true);
  addEventListener('input', e => { if (e.isTrusted && e.inputType === 'insertText' && e.data) send({ t: 'text', data: e.data }); }, true);
  addEventListener('compositionend', e => { if (e.data) send({ t: 'text', data: e.data }); }, true);
})();`;

// Which option turns each kind of event off (mouse moves go with clicks).
const KIND = { click: 'click', move: 'click', key: 'typing', text: 'typing', scroll: 'scroll' } as const;
const action = (e: Exclude<Event, { t: 'move' }>): SyncAction =>
  e.t === 'click' ? { t: 'click', label: e.label } : e.t === 'scroll' ? { t: 'scroll', px: e.top } : e.t === 'key' ? { t: 'key', key: e.key } : { t: 'text', text: e.data };

// Firefox pages keep their binding and script for their whole life; one dispatcher serves every session.
const watched = new WeakSet<Page>();
function dispatch(page: Page, raw: string){
  const s = session;
  const i = s ? s.leader.pages.indexOf(page) : -1;
  if (!s || i < 0) return;
  const e = JSON.parse(raw) as Event;
  // Left out: not repeated; an address it leads to is then repeated as one.
  if (!options[KIND[e.t]]) return;
  if (e.t === 'click' || e.t === 'key' || e.t === 'text') s.lastInput = Date.now();
  if (i !== s.active){
    s.active = i;
    const entry = record({ t: 'tab', tab: 'switch', n: i + 1 }, s.followers.length);
    for (const f of s.followers) run(f, async () => { await f.pages[i]?.bringToFront(); }, entry);
  }
  const entry = e.t === 'move' ? undefined : record(action(e), s.followers.length);
  for (const f of s.followers) replay(f, i, e, entry);
}

async function capture(m: Member, page: Page){
  if (m.kernel === 'firefox'){
    if (!watched.has(page)){
      watched.add(page);
      await page.exposeBinding('folioSync', (_src, raw: string) => dispatch(page, raw));
      await page.addInitScript(SCRIPT);
    }
    await page.evaluate(SCRIPT).catch(() => {});
    return;
  }
  const cdp: CDPSession = await page.context().newCDPSession(page);
  cdp.on('Runtime.bindingCalled', e => { if (e.name === 'folioSync') dispatch(page, e.payload); });
  const inject = async () => {
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'folio-sync' });
    await cdp.send('Runtime.addBinding', { name: 'folioSync', executionContextId });
    await cdp.send('Runtime.evaluate', { contextId: executionContextId, expression: SCRIPT });
  };
  const loaded = () => { void inject().catch(() => {}); };
  page.on('domcontentloaded', loaded);
  m.off.push(() => { page.off('domcontentloaded', loaded); void cdp.detach().catch(() => {}); });
  await inject().catch(() => {});
}

// The leader's tabs: captured, their address changes repeated, and opening and closing tabs mirrored.
async function lead(s: Session){
  const m = s.leader;
  const watch = async (page: Page) => {
    await capture(m, page);
    const nav = (frame: Frame) => {
      if (frame !== page.mainFrame() || Date.now() - s.lastInput < INPUT_MS) return;
      const i = m.pages.indexOf(page), url = frame.url();
      if (i < 0 || !/^https?:/.test(url)) return;
      const entry = record({ t: 'goto', url }, s.followers.length);
      for (const f of s.followers) run(f, async () => { const p = f.pages[i]; if (p && p.url() !== url) await p.goto(url); }, entry);
    };
    page.on('framenavigated', nav);
    m.off.push(() => page.off('framenavigated', nav));
  };
  const opened = (page: Page) => {
    void watch(page);
    if (Date.now() - s.lastInput < INPUT_MS) return;
    const entry = record({ t: 'tab', tab: 'open', n: m.pages.length }, s.followers.length);
    for (const f of s.followers) run(f, async () => { await f.ctx.newPage(); }, entry);
  };
  const closed = (page: Page) => {
    const i = m.pages.indexOf(page);
    if (i < 0) return;
    const entry = record({ t: 'tab', tab: 'close', n: i + 1 }, s.followers.length);
    for (const f of s.followers) run(f, async () => { await f.pages[i]?.close(); }, entry);
  };
  m.ctx.on('page', opened);
  m.off.push(() => m.ctx.off('page', opened));
  for (const page of m.pages){
    await watch(page);
    page.on('close', closed);
    m.off.push(() => page.off('close', closed));
  }
  const closeLater = (page: Page) => { page.on('close', closed); m.off.push(() => page.off('close', closed)); };
  m.ctx.on('page', closeLater);
  m.off.push(() => m.ctx.off('page', closeLater));
}

// Each follower replays in order, each logged action after the random pause. Mouse moves are too many to log or wait for.
function run(f: Member, op: () => Promise<Result | void>, entry?: Entry){
  f.queue = f.queue.then(async () => {
    if (entry) await pause();
    const r = await op();
    if (entry) settle(entry, f, r ?? 'ok');
  }).catch(() => {
    if (f.issue !== 'failed'){ f.issue = 'failed'; changed(); }
    if (entry) settle(entry, f, 'failed');
  });
}
const size = (p: Page) => p.evaluate(() => [innerWidth, innerHeight] as [number, number]);

function replay(f: Member, i: number, e: Event, entry?: Entry){
  run(f, async () => {
    const page = f.pages[i];
    if (!page) return;
    if (e.t === 'text') return void await page.keyboard.insertText(e.data);
    if (e.t === 'key') return void await page.keyboard.press(e.key);
    if (e.t === 'scroll'){
      return void await page.evaluate(({ sel, rx, ry }) => {
        const el = sel ? document.querySelector(sel) : document.scrollingElement;
        if (el) el.scrollTo(rx * (el.scrollWidth - el.clientWidth), ry * (el.scrollHeight - el.clientHeight));
      }, e);
    }
    const [w, h] = await size(page);
    if (e.t === 'move') return void await page.mouse.move(e.x * w, e.y * h);
    // The same element where there is one; otherwise the same place in the window.
    let x = e.x * w, y = e.y * h, matched = false;
    if (e.sel){
      const box = await page.locator(e.sel).first().boundingBox({ timeout: 500 }).catch(() => null);
      if (box && box.width){ x = box.x + e.ox * box.width; y = box.y + e.oy * box.height; matched = x >= 0 && y >= 0 && x <= w && y <= h; }
      if (!matched){ x = e.x * w; y = e.y * h; }
    }
    const issue = matched || !e.sel ? f.issue === 'coords' ? null : f.issue : 'coords';
    if (issue !== f.issue || (issue === 'coords' && f.label !== e.label)){ f.issue = issue; f.label = issue === 'coords' ? e.label : null; changed(); }
    const button = (['left', 'middle', 'right'] as const)[e.button] ?? 'left';
    if (e.detail >= 2){ await page.mouse.move(x, y); await page.mouse.down({ button, clickCount: e.detail }); await page.mouse.up({ button, clickCount: e.detail }); }
    else await page.mouse.click(x, y, { button });
    return matched || !e.sel ? 'ok' : 'coords';
  }, entry);
}

function member(id: string): Member | null {
  const b = browserOf(id);
  if (!b) return null;
  const m: Member = { id, kernel: b.kernel, ctx: b.ctx, pages: b.ctx.pages().filter(p => !p.isClosed()), queue: Promise.resolve(), issue: null, label: null, off: [] };
  // A closed tab leaves the list after the close has been mirrored, which needs its position.
  const drop = (p: Page) => p.once('close', () => queueMicrotask(() => { m.pages = m.pages.filter(x => x !== p); }));
  const add = (p: Page) => { m.pages.push(p); drop(p); };
  m.pages.forEach(drop);
  b.ctx.on('page', add);
  m.off.push(() => b.ctx.off('page', add));
  return m;
}

// Starts (or restarts) syncing these profiles, opening the ones not open yet. The first is the leader. A new sync
// starts a new log.
export async function startWindowSync(ids: string[], leader = ids[0]){
  stopWindowSync();
  const order = [leader, ...ids.filter(id => id !== leader)];
  for (const id of order) if (!isRunning(id)) await open(id);
  const members = order.map(member).filter((m): m is Member => !!m);
  if (members.length < 2 || members[0].id !== leader){ members.forEach(m => m.off.forEach(f => f())); return windowSync(); }
  session = { leader: members[0], followers: members.slice(1), lastInput: 0, active: 0 };
  log = [];
  push();
  await lead(session);
  changed();
  return windowSync();
}

export function stopWindowSync(){
  if (!session) return;
  [session.leader, ...session.followers].forEach(m => m.off.forEach(f => f()));
  session = null;
  changed();
}

export async function setLeader(id: string){
  if (!session || session.leader.id === id) return windowSync();
  return startWindowSync([session.leader.id, ...session.followers.map(f => f.id)], id);
}

// Every window opens the address.
export function syncGoto(url: string){
  if (!session) return;
  const u = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  const all = [session.leader, ...session.followers], entry = record({ t: 'goto', url: u }, all.length);
  for (const m of all) run(m, async () => { const p = m.pages[0] ?? await m.ctx.newPage(); await p.goto(u); }, entry);
}

// A profile that stopped leaves the sync; the sync ends with its leader or its last follower.
export function leftWindowSync(id: string){
  const s = session;
  if (!s) return;
  if (s.leader.id === id || (s.followers.length === 1 && s.followers[0].id === id)) return stopWindowSync();
  const f = s.followers.find(x => x.id === id);
  if (!f) return;
  f.off.forEach(off => off());
  s.followers = s.followers.filter(x => x !== f);
  changed();
}

// Pictures of the synced windows (the tab the leader works in), small, while the page asks for them.
let thumbs: (t: Record<string, string>) => void = () => {};
export const onSyncThumbs = (fn: typeof thumbs) => { thumbs = fn; };
let shooting: NodeJS.Timeout | null = null, busy = false;
async function shoot(){
  const s = session;
  if (!s || busy) return;
  busy = true;
  const out: Record<string, string> = {};
  await Promise.all([s.leader, ...s.followers].map(async m => {
    const page = m.pages[s.active] ?? m.pages[0];
    // caret: 'initial' leaves the page alone (no style injected to hide the text cursor while someone types).
    const shot = page && !page.isClosed() ? await page.screenshot({ type: 'jpeg', quality: 70, caret: 'initial', timeout: 1500 }).catch(() => null) : null;
    if (shot) out[m.id] = `data:image/jpeg;base64,${nativeImage.createFromBuffer(shot).resize({ width: THUMB_WIDTH, quality: 'good' }).toJPEG(70).toString('base64')}`;
  }));
  busy = false;
  if (Object.keys(out).length) thumbs(out);
}
export function watchThumbs(on: boolean){
  if (shooting) clearInterval(shooting);
  shooting = on ? setInterval(() => void shoot(), THUMB_MS) : null;
  if (on) void shoot();
}
