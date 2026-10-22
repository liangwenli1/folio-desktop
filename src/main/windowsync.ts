// Window sync: what the person does in the leader's window happens in the followers' windows too. A small script
// in the leader's tabs reports clicks, mouse moves, scrolling, keys and typed text; it runs in an
// isolated world the page's own JavaScript can't see (Chromium: one made through CDP on every page load; Firefox:
// Camoufox keeps Playwright's scripts and bindings out of the page). Followers replay through Playwright's mouse
// and keyboard, which give trusted events in both engines. Tabs are matched by position; the tab the leader works
// in comes to the front in the followers (pages under Playwright always report themselves visible, so a tab switch
// shows only once something is done in the tab). Opening an address, going back or forward, and opening or
// closing a tab are seen in the browser itself and repeated too.
import type { BrowserContext, CDPSession, Frame, Page } from 'playwright-core';
import { browserOf, isRunning, open } from './launcher';
import type { WindowSync } from '../shared/bridge';

interface Member { id: string; kernel: 'chromium' | 'firefox'; ctx: BrowserContext; pages: Page[]; queue: Promise<void>; issue: WindowSync['members'][number]['issue']; off: (() => void)[] }
interface Session { leader: Member; followers: Member[]; lastInput: number; active: number }
type Event =
  | { t: 'click'; button: number; detail: number; x: number; y: number; sel: string | null; ox: number; oy: number }
  | { t: 'move'; x: number; y: number }
  | { t: 'scroll'; sel: string | null; rx: number; ry: number }
  | { t: 'key'; key: string }
  | { t: 'text'; data: string };

// A navigation this soon after a click or key came from it, and the followers' own click or key repeats it.
const INPUT_MS = 1500;

let session: Session | null = null;
let notify: (s: WindowSync | null) => void = () => {};
export const onWindowSync = (fn: typeof notify) => { notify = fn; };
export const windowSync = (): WindowSync | null => session && {
  leader: session.leader.id, members: [session.leader, ...session.followers].map(m => ({ id: m.id, issue: m.issue }))
};
const changed = () => notify(windowSync());

// The listener, run once per document in the isolated world. Positions are fractions of the window, so a
// follower of another size lands in the same place; clicks also name the element, which is tried first.
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
  const at = e => {
    const r = e.target instanceof Element ? e.target.getBoundingClientRect() : null;
    return { x: e.clientX / innerWidth, y: e.clientY / innerHeight, sel: selectorOf(e.target),
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
    const report = () => { scrolled = Date.now(); pending = null; send({ t: 'scroll', sel: el === document.scrollingElement ? null : selectorOf(el),
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

// Firefox pages keep their binding and script for their whole life; one dispatcher serves every session.
const watched = new WeakSet<Page>();
function dispatch(page: Page, raw: string){
  const s = session;
  const i = s ? s.leader.pages.indexOf(page) : -1;
  if (!s || i < 0) return;
  const e = JSON.parse(raw) as Event;
  if (e.t === 'click' || e.t === 'key' || e.t === 'text') s.lastInput = Date.now();
  if (i !== s.active){
    s.active = i;
    for (const f of s.followers) run(f, async () => { await f.pages[i]?.bringToFront(); });
  }
  for (const f of s.followers) replay(f, i, e);
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
      if (i >= 0 && /^https?:/.test(url)) for (const f of s.followers) run(f, async () => { const p = f.pages[i]; if (p && p.url() !== url) await p.goto(url); });
    };
    page.on('framenavigated', nav);
    m.off.push(() => page.off('framenavigated', nav));
  };
  const opened = (page: Page) => {
    void watch(page);
    if (Date.now() - s.lastInput >= INPUT_MS) for (const f of s.followers) run(f, async () => { await f.ctx.newPage(); });
  };
  const closed = (page: Page) => {
    const i = m.pages.indexOf(page);
    if (i >= 0) for (const f of s.followers) run(f, async () => { await f.pages[i]?.close(); });
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

// Each follower replays in order.
function run(f: Member, op: () => Promise<void>){
  f.queue = f.queue.then(op).catch(() => { if (f.issue !== 'failed'){ f.issue = 'failed'; changed(); } });
}
const size = (p: Page) => p.evaluate(() => [innerWidth, innerHeight] as [number, number]);

function replay(f: Member, i: number, e: Event){
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
    if (issue !== f.issue){ f.issue = issue; changed(); }
    const button = (['left', 'middle', 'right'] as const)[e.button] ?? 'left';
    if (e.detail >= 2){ await page.mouse.move(x, y); await page.mouse.down({ button, clickCount: e.detail }); await page.mouse.up({ button, clickCount: e.detail }); }
    else await page.mouse.click(x, y, { button });
  });
}

function member(id: string): Member | null {
  const b = browserOf(id);
  if (!b) return null;
  const m: Member = { id, kernel: b.kernel, ctx: b.ctx, pages: b.ctx.pages().filter(p => !p.isClosed()), queue: Promise.resolve(), issue: null, off: [] };
  // A closed tab leaves the list after the close has been mirrored, which needs its position.
  const drop = (p: Page) => p.once('close', () => queueMicrotask(() => { m.pages = m.pages.filter(x => x !== p); }));
  const add = (p: Page) => { m.pages.push(p); drop(p); };
  m.pages.forEach(drop);
  b.ctx.on('page', add);
  m.off.push(() => b.ctx.off('page', add));
  return m;
}

// Starts (or restarts) syncing these profiles, opening the ones not open yet. The first is the leader.
export async function startWindowSync(ids: string[], leader = ids[0]){
  stopWindowSync();
  const order = [leader, ...ids.filter(id => id !== leader)];
  for (const id of order) if (!isRunning(id)) await open(id);
  const members = order.map(member).filter((m): m is Member => !!m);
  if (members.length < 2 || members[0].id !== leader){ members.forEach(m => m.off.forEach(f => f())); return windowSync(); }
  session = { leader: members[0], followers: members.slice(1), lastInput: 0, active: 0 };
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
  for (const m of [session.leader, ...session.followers]) run(m, async () => { const p = m.pages[0] ?? await m.ctx.newPage(); await p.goto(u); });
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
