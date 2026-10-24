// The product demo (PLAN 6.15, part four). The same file plays on the workbench's sign-in page (src/renderer/src/demo/
// player.ts) and on the website (src/scripts/demo-player.ts): pictures of the real workbench recorded by
// demo/capture.spec.ts, one after another, with a pointer that goes to what is clicked next, and the restored browser
// window drawn over the list. A camera keeps the text readable: it moves in on what each step is about, close to the
// workbench's real size, and goes to what is clicked when that is out of view. Given the sign-in page's profile cards,
// each round starts with them floating in and landing on their rows in the whole window. It pauses with its button,
// while out of view and while the page is hidden; with reduced motion it shows the profile list and nothing moves.

export interface DemoManifest {
  width: number; height: number;
  // `focus`: what the step is about (left, top, width, height, as fractions of the picture).
  frames: { file: string; clicks: [number, number][]; focus?: number[]; browser?: true }[];
  // Where the cards land in the first picture: left, top, width, height, as fractions of it.
  cards: number[][];
  browser: { tabs: { host: string; title: string }[] };
}
export interface DemoOptions {
  manifest: DemoManifest;
  // The address of a picture: a frame's file, or 'browser'.
  src(file: string): string;
  // The cards, laid out over the player; they float in at the start of each round.
  intro?: HTMLElement;
  labels: { pause: string; play: string };
}

// The page places the player (it must be positioned, for the pause button).
const CSS = `
.fd-stage{position:relative;overflow:hidden;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(29,28,43,.1),0 40px 80px -30px rgba(40,10,30,.55);transition:opacity .5s ease,transform .5s ease}
@property --fd-z{syntax:'<number>';inherits:true;initial-value:1}
.fd-world{position:absolute;inset:0;transform-origin:0 0;transition:transform .7s cubic-bezier(.45,0,.2,1),--fd-z .7s cubic-bezier(.45,0,.2,1)}
.fd-world>img.fd-f{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .3s ease}
.fd-world>img.fd-f.on{opacity:1}
.fd-ptr{position:absolute;left:0;top:0;width:22px;height:22px;margin:-2px 0 0 -3px;pointer-events:none;opacity:0;scale:calc(1 / var(--fd-z));transform-origin:3px 2px;transition:left .55s cubic-bezier(.4,0,.2,1),top .55s cubic-bezier(.4,0,.2,1),opacity .3s ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
.fd-ptr.on{opacity:1}
.fd-tap{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(210,68,94,.35);pointer-events:none;opacity:0;scale:calc(1 / var(--fd-z))}
.fd-tap.go{animation:fd-tap .45s ease-out}
@keyframes fd-tap{from{opacity:1;transform:scale(.3)}to{opacity:0;transform:scale(1.4)}}
.fd-win{position:absolute;right:4%;bottom:5%;width:52%;border-radius:10px;overflow:hidden;background:#f1f1f4;box-shadow:0 0 0 1px rgba(29,28,43,.12),0 30px 60px -20px rgba(20,10,30,.55);opacity:0;transform:translateY(18px) scale(.96);transition:opacity .4s ease,transform .4s ease;pointer-events:none}
.fd-win.on{opacity:1;transform:none}
.fd-tabs{display:flex;gap:4px;padding:7px 8px 0 46px;position:relative;font:500 10.5px/1 system-ui,sans-serif;color:#3b3a4c}
.fd-tabs::before{content:'';position:absolute;left:10px;top:12px;width:7px;height:7px;border-radius:50%;background:#ff5f57;box-shadow:11px 0 #febc2e,22px 0 #28c840}
.fd-tab{flex:1;min-width:0;padding:7px 9px;border-radius:7px 7px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:translateY(4px);transition:opacity .3s ease,transform .3s ease}
.fd-tab.on{opacity:1;transform:none}
.fd-tab:first-child{background:#fff}
.fd-bar{padding:5px 8px;background:#fff;border-bottom:1px solid #e6e6ec}
.fd-bar span{display:block;padding:4px 10px;border-radius:99px;background:#f1f1f4;font:10.5px/1.2 system-ui,sans-serif;color:#55546a}
.fd-win img{display:block;width:100%}
.fd-btn{position:absolute;right:10px;bottom:10px;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:50%;background:rgba(29,28,43,.62);color:#fff;cursor:pointer;opacity:.75;transition:opacity .2s ease}
.fd-btn:hover,.fd-btn:focus-visible{opacity:1}
.fd-btn svg{width:12px;height:12px}
.fd[data-state="still"] .fd-btn{display:none}
@media (prefers-color-scheme: dark){
  .fd-stage{background:#1c1b23;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 40px 80px -30px rgba(0,0,0,.7)}
  .fd-win{background:#26252f}.fd-tabs{color:#d8d7e3}.fd-tab:first-child,.fd-bar{background:#1c1b23;border-color:#33323d}.fd-bar span{background:#26252f;color:#a9a8b8}
}`;
const POINTER = '<svg viewBox="0 0 22 22"><path d="M4 2.5 18 13l-6.2 1.1 3.6 6.4-2.6 1.4-3.6-6.4L4.6 20z" fill="#fff" stroke="#1d1c2b" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const PAUSE = '<svg viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1.5" width="2.8" height="9" rx="1"/><rect x="7.2" y="1.5" width="2.8" height="9" rx="1"/></svg>';
const PLAY = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5z"/></svg>';

// How long things take, in milliseconds.
const T = { camera: 700, hold: 450, still: 1300, move: 550, tap: 250, browser: 2600, intro: 2200, land: 900, out: 600 };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''){
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function mountDemo(root: HTMLElement, o: DemoOptions): () => void {
  if (!document.getElementById('fd-style')) document.head.append(Object.assign(document.createElement('style'), { id: 'fd-style', textContent: CSS }));
  const m = o.manifest;
  root.classList.add('fd');
  const stage = el('div', 'fd-stage');
  stage.style.aspectRatio = `${m.width} / ${m.height}`;
  const layers = [el('img', 'fd-f'), el('img', 'fd-f')] as HTMLImageElement[];
  layers.forEach(i => { i.alt = ''; i.decoding = 'async'; });
  const win = el('div', 'fd-win');
  const tabs = el('div', 'fd-tabs');
  m.browser.tabs.forEach(t => tabs.append(Object.assign(el('span', 'fd-tab'), { textContent: t.title })));
  const shot = el('img', '') as HTMLImageElement;
  shot.alt = '';
  win.append(tabs, Object.assign(el('div', 'fd-bar', '<span></span>')), shot);
  (win.querySelector('.fd-bar span') as HTMLElement).textContent = `http://${m.browser.tabs[0]?.host ?? ''}/`;
  const ptr = el('div', 'fd-ptr', POINTER), tap = el('span', 'fd-tap');
  const world = el('div', 'fd-world');
  world.append(...layers, ptr, tap);
  stage.append(world, win);
  const btn = el('button', 'fd-btn') as HTMLButtonElement;
  btn.type = 'button';
  root.append(stage, btn);

  // ---- pausing ----
  // `gen` counts the runs: a restarted or stopped one ends at its next wait.
  let byUser = false, hidden = document.hidden, offscreen = false, gen = 0;
  const paused = () => byUser || hidden || offscreen;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const show = () => {
    root.dataset.state = still.matches ? 'still' : paused() ? 'paused' : 'playing';
    btn.innerHTML = byUser ? PLAY : PAUSE;
    btn.setAttribute('aria-label', byUser ? o.labels.play : o.labels.pause);
    btn.setAttribute('aria-pressed', String(byUser));
    root.getAnimations?.({ subtree: true }).forEach(a => (paused() ? a.pause() : a.play()));
  };
  btn.addEventListener('click', () => { byUser = !byUser; show(); });
  const onVisibility = () => { hidden = document.hidden; show(); };
  document.addEventListener('visibilitychange', onVisibility);
  const seen = new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; show(); });
  seen.observe(root);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // Waits this long while playing; time stands still while paused.
  const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
    let left = ms, last = performance.now();
    const g = gen;
    const tick = () => {
      timers.delete(id);
      if (g !== gen) return reject(new Error('stopped'));
      const now = performance.now();
      if (!paused()) left -= now - last;
      last = now;
      if (left <= 0) resolve(); else id = setTimeout(tick, Math.min(left, 120)), timers.add(id);
    };
    let id = setTimeout(tick, 0);
    timers.add(id);
  });

  // ---- pictures ----
  const cache = new Map<string, Promise<void>>();
  const load = (file: string) => {
    if (!cache.has(file)){
      const img = new Image();
      img.src = o.src(file);
      cache.set(file, img.decode().catch(() => {}));
    }
    return cache.get(file)!;
  };
  let front = 0;
  async function frame(file: string){
    await load(file);
    const next = layers[1 - front];
    next.src = o.src(file);
    await next.decode().catch(() => {});
    next.classList.add('on');
    layers[front].classList.remove('on');
    front = 1 - front;
  }
  const place = (x: number, y: number) => { ptr.style.left = tap.style.left = `${x * 100}%`; ptr.style.top = tap.style.top = `${y * 100}%`; };

  // ---- the camera ----
  // Close-ups show the workbench at 90% of its real size, at most twice the whole picture. `x`, `y`: the point of the
  // picture it centres on (as near as the picture's edges allow); `view`: what is in sight.
  let cam = { z: 1, x: 0.5, y: 0.5 }, view = { left: 0, top: 0, size: 1 };
  const closeUp = () => Math.min(2, Math.max(1, (0.9 * m.width) / (stage.clientWidth || m.width)));
  function aim(c: typeof cam){
    cam = c;
    const w = stage.clientWidth, h = stage.clientHeight, clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const tx = clamp(w / 2 - c.x * w * c.z, w - w * c.z, 0), ty = clamp(h / 2 - c.y * h * c.z, h - h * c.z, 0);
    view = { left: -tx / (w * c.z), top: -ty / (h * c.z), size: 1 / c.z };
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${c.z})`;
    world.style.setProperty('--fd-z', String(c.z));
    root.dataset.zoom = c.z.toFixed(2);
  }
  // Framing a box with some room above and below; the whole picture without one. A box too wide to fit is followed to
  // the point where it is clicked.
  function framing(b?: number[], click?: [number, number]){
    if (!b) return { z: 1, x: 0.5, y: 0.5 };
    const z = Math.max(1, Math.min(closeUp(), 1 / (b[3] * 1.2))), half = 0.5 / z;
    const x = b[2] * 1.2 <= 1 / z || !click ? b[0] + b[2] / 2 : Math.min(b[0] + b[2] - half, Math.max(b[0] + half, click[0]));
    return { z, x, y: b[1] + b[3] / 2 };
  }
  const inView = (x: number, y: number) => {
    const edge = view.size * 0.08;
    return x > view.left + edge && x < view.left + view.size - edge && y > view.top + edge && y < view.top + view.size - edge;
  };
  // The same at once: at the start of a round, and when the player changes size.
  function jump(c: typeof cam){ world.style.transition = 'none'; aim(c); void world.offsetWidth; world.style.transition = ''; }
  const sized = new ResizeObserver(() => jump(cam));
  sized.observe(stage);

  // ---- the opening cards ----
  const cards = o.intro ? [...o.intro.children] as HTMLElement[] : [];
  async function floatIn(){
    cards.forEach((c, i) => c.animate([{ opacity: 0, translate: '0 60px' }, { opacity: 1, translate: '0 0' }], { duration: 700, delay: i * 180, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }));
    await sleep(T.intro);
  }
  // Each card shrinks onto its row as the workbench appears behind it.
  async function land(){
    const s = stage.getBoundingClientRect();
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect(), [x, y, w, h] = m.cards[i] ?? [0.2, 0.4, 0.7, 0.08];
      const dx = s.left + (x + w / 2) * s.width - (r.left + r.width / 2), dy = s.top + (y + h / 2) * s.height - (r.top + r.height / 2);
      c.animate([{ translate: '0 0', scale: '1', opacity: 1 }, { translate: `${dx}px ${dy}px`, scale: `${(w * s.width) / r.width} ${(h * s.height) / r.height}`, opacity: 0 }],
        { duration: T.land, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'both' });
    });
    stage.style.opacity = '1';
    stage.style.transform = 'none';
    await sleep(T.land);
  }

  async function round(){
    if (cards.length){
      stage.style.opacity = '0';
      stage.style.transform = 'scale(.97)';
      jump(framing());
      await frame(m.frames[0].file);
      await floatIn();
      await land();
    }
    ptr.classList.add('on');
    for (const [i, f] of m.frames.entries()){
      // What the step is about: its subject, else where it is clicked first; the restored browser shows over the whole list.
      const [cx, cy] = f.clicks[0] ?? [0.5, 0.5];
      aim(f.browser ? framing() : framing(f.focus ?? (f.clicks.length ? [cx - 0.15, cy - 0.15, 0.3, 0.3] : undefined), f.clicks[0]));
      if (i > 0 || !cards.length) await frame(f.file);
      root.dataset.frame = String(i);
      void load(m.frames[i + 1]?.file ?? m.frames[0].file);
      await sleep(T.camera);
      if (f.browser){
        shot.src = o.src('browser');
        win.classList.add('on');
        for (const t of tabs.children){ await sleep(380); t.classList.add('on'); }
        await sleep(T.browser);
        win.classList.remove('on');
        [...tabs.children].forEach(t => t.classList.remove('on'));
      }
      await sleep(f.clicks.length ? T.hold : T.still);
      for (const [x, y] of f.clicks){
        if (!inView(x, y)){ aim({ ...cam, x, y }); await sleep(T.camera); }
        place(x, y);
        await sleep(T.move);
        tap.classList.remove('go'); void tap.offsetWidth; tap.classList.add('go');
        await sleep(T.tap);
      }
    }
    ptr.classList.remove('on');
    if (cards.length){
      stage.style.opacity = '0';
      await sleep(T.out);
    }
  }

  async function run(){
    root.dataset.frame = '0';
    jump(framing());
    if (still.matches){
      await frame(m.frames[0].file);
      stage.style.opacity = '1';
      stage.style.transform = 'none';
      cards.forEach(c => c.getAnimations().forEach(a => a.cancel()));
      cards.forEach(c => { c.style.opacity = '0'; });
      return;
    }
    cards.forEach(c => { c.style.opacity = ''; });
    place(0.5, 0.55);
    for (;;) await round();
  }
  const restart = () => { gen++; timers.forEach(clearTimeout); timers.clear(); show(); void run().catch(() => {}); };
  still.addEventListener('change', restart);
  show();
  void run().catch(() => {});

  return () => {
    gen++;
    timers.forEach(clearTimeout);
    still.removeEventListener('change', restart);
    document.removeEventListener('visibilitychange', onVisibility);
    seen.disconnect();
    sized.disconnect();
    root.replaceChildren();
  };
}
