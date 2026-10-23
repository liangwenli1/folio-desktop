import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

const PATHS = {
  x: 'M4 4l8 8M12 4l-8 8',
  chev: 'M5 6.5 8 9.5l3-3',
  search: 'M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-1 3.5 3.5 3.5',
  profiles: 'M3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3zM2 6h12',
  proxies: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM2 8h12M8 2c2.2 2.2 2.2 9.8 0 12M8 2c-2.2 2.2-2.2 9.8 0 12',
  sync: 'M2.5 5h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM6.5 5V3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H9.5',
  tasks: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 5v3l2 1.5',
  api: 'M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4',
  flows: 'M2.5 2.5h4v3h-4zM9.5 10.5h4v3h-4zM4.5 5.5v6.5h5M11.5 10.5V7.5h-4',
  extensions: 'M3 5.5h3V4a1.5 1.5 0 0 1 3 0v1.5h3v3h-1.5a1.5 1.5 0 0 0 0 3H12v3H3v-3h1.5a1.5 1.5 0 0 0 0-3H3z',
  team: 'M8.5 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM1.5 13c.5-2.5 2.3-3.8 4.5-3.8s4 1.3 4.5 3.8M10.5 3.3a2.3 2.3 0 0 1 0 4.4M12 9.6c1.3.5 2.2 1.6 2.5 3.4',
  activity: 'M1.5 8h3l2-4.5 3 9 2-4.5h3',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
  check: 'M3.5 8.5 6.5 11.5l6-7',
  alert: 'M8 4.5v4.5M8 11.5v.01',
  download: 'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10',
  plus: 'M8 3.5v9M3.5 8h9',
  play: 'M5.5 3.8v8.4L12 8z',
  // Systems, as plain glyphs: a tiled window, the command key, a terminal.
  windows: 'M2.5 2.5h5v5h-5zM8.5 2.5h5v5h-5zM2.5 8.5h5v5h-5zM8.5 8.5h5v5h-5z',
  macos: 'M6 6V4.75A1.75 1.75 0 1 0 4.25 6.5H6m0-.5v4m0 0v1.25a1.75 1.75 0 1 1-1.75-1.75H6m4-4V4.75a1.75 1.75 0 1 1 1.75 1.75H10m0-.5v4m0 0v1.25a1.75 1.75 0 1 0 1.75-1.75H10M6 6h4M6 10h4',
  linux: 'M2.5 3.5h11v9h-11zM5 6.5l2 1.5-2 1.5M8.5 10H11',
  engines: 'M4.5 4.5h7v7h-7zM6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14',
  up: 'M8 13V3.5M4 7.5l4-4 4 4',
  star: 'M8 2.2l1.75 3.6 3.95.55-2.86 2.78.68 3.92L8 11.2l-3.52 1.85.68-3.92L2.3 6.35l3.95-.55z',
  upload: 'M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10'
};
export type IconName = keyof typeof PATHS;
export const Icon = ({ name }: { name: IconName }) => <svg className="i" viewBox="0 0 16 16" aria-hidden="true"><path d={PATHS[name]} /></svg>;
// The Folio mark: a stack of profile cards, the front one solid with a photo and a line cut out, in the stamp colour
// (via .seal).
export const Mark = () => (
  <svg className="seal" viewBox="0 0 64 64" aria-hidden="true">
    <g transform="translate(32 32) scale(0.107) translate(-500.6 -483.8)">
      <path d="M316 312H688A44 44 0 0 1 732 356V588A44 44 0 0 1 688 632H316A44 44 0 0 1 272 588V356A44 44 0 0 1 316 312Z" fill="none" stroke="currentColor" strokeWidth="40" opacity="0.55" transform="rotate(-9 502 472)" />
      <path d="M346 392H718A44 44 0 0 1 762 436V668A44 44 0 0 1 718 712H346A44 44 0 0 1 302 668V436A44 44 0 0 1 346 392ZM350 520A56 56 0 1 0 462 520A56 56 0 1 0 350 520ZM510 500H670A20 20 0 0 1 690 520V520A20 20 0 0 1 670 540H510A20 20 0 0 1 490 520V520A20 20 0 0 1 510 500Z" fill="currentColor" fillRule="evenodd" transform="rotate(2 532 552)" />
    </g>
  </svg>
);

// An on/off setting. The checkbox covers the whole control, so clicking anywhere on it toggles.
export function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange(on: boolean): void }){
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />{label}
    </label>
  );
}

export function useOutsideClose(open: boolean, close: () => void){
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

// A count that rolls to its new value instead of jumping (straight to it when motion is reduced).
export function Num({ value }: { value: number }){
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || matchMedia('(prefers-reduced-motion: reduce)').matches){ from.current = value; setShown(value); return; }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(t){
      const k = Math.min(1, (t - t0) / 450), eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    });
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <>{shown}</>;
}

// The current time, ticking every second while `on` (for run timers).
export function useNow(on: boolean){
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

interface ToastItem { id: number; msg: string; action?: { label: string; fn(): void } }
type Push = (msg: string, action?: ToastItem['action']) => void;
const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);

export function Toasts({ children }: { children: ReactNode }){
  const [list, setList] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const drop = (id: number) => setList(l => l.filter(t => t.id !== id));
  const push = useCallback<Push>((msg, action) => {
    const id = ++seq.current;
    setList(l => [...l.slice(-2), { id, msg, action }]);
    setTimeout(() => drop(id), action ? 8000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className="toast" role="status">
            <span>{t.msg}</span>
            {t.action && <button type="button" onClick={() => { drop(t.id); t.action!.fn(); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Modal({ title, closeLabel, onClose, foot, children }: { title: string; closeLabel: string; onClose(): void; foot?: ReactNode; children: ReactNode }){
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim modal-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="m-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" type="button" aria-label={closeLabel} onClick={onClose}><Icon name="x" /></button>
        </div>
        {children}
        {foot && <div className="m-foot">{foot}</div>}
      </div>
    </>
  );
}

// A proxy's recent checks as a line of latencies, failures as red marks along the top.
export function Spark({ history }: { history: { ok: boolean; ms: number | null }[] }){
  if (!history.length) return null;
  const W = 84, H = 22, top = Math.max(300, ...history.map(h => h.ms ?? 0));
  const x = (i: number) => (history.length === 1 ? W / 2 : (i / (history.length - 1)) * (W - 4) + 2);
  const y = (ms: number) => H - 3 - (ms / top) * (H - 8);
  const ok = history.map((h, i) => (h.ok && h.ms !== null ? [x(i), y(h.ms)] : null));
  const line = ok.filter(Boolean).map(p => p!.join(',')).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {line && <polyline points={line} />}
      {history.map((h, i) => !h.ok && <circle key={i} className="miss" cx={x(i)} cy={3} r={1.8} />)}
      {ok.at(-1) && <circle className="last" cx={ok.at(-1)![0]} cy={ok.at(-1)![1]} r={2.2} />}
    </svg>
  );
}

// A download as a ring that fills, with the percentage inside.
export function Ring({ pct, label }: { pct: number; label: string }){
  const c = 2 * Math.PI * 11;
  return (
    <span className="ring" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" /><circle cx="14" cy="14" r="11" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} /></svg>
      <b>{pct}</b>
    </span>
  );
}
export const bytes = (n: number) => (n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${Math.round(n / 1024 ** 2)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`);

// A download bar for an engine, from the main process's progress events.
export function Progress({ done, total }: { done: number; total: number }){
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <span className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></span>;
}
export const percent = (p: { done: number; total: number }) => (p.total ? Math.round((p.done / p.total) * 100) : 0);
