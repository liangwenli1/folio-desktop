import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Dict } from './i18n';

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
  upload: 'M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10',
  pause: 'M6 4.5v7M10 4.5v7',
  monitor: 'M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3',
  stop: 'M4.5 4.5h7v7h-7z',
  chevR: 'M6.5 5 9.5 8l-3 3',
  logout: 'M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10.5 11l3-3-3-3M13.5 8H6',
  list: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  grid: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  refresh: 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3',
  clock: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 4.5V8l2.5 1.5',
  crown: 'M2.5 5 5.5 8 8 4l2.5 4 3-3-1 7h-9zM3.5 13.5h9',
  key: 'M10 3a3 3 0 1 1-2.6 4.5L3 12v1.5h1.5V12H6v-1.5h1.5l1-1A3 3 0 0 1 10 3zM10.5 5.5h.01',
  mail: 'M2.5 4h11v8h-11zM2.5 4.5 8 9l5.5-4.5',
  link: 'M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1',
  lang: 'M2.5 3.5h7M6 2v1.5M8 3.5c-.5 2.5-2.5 4.5-5 5.5M4.5 5.5c.8 1.5 2 2.6 3.5 3.3M9 13.5l2.5-6 2.5 6M9.8 11.5h3.4',
  pointer: 'M4 2.5 12 8l-3.6.9 2.1 4.2-1.6.8-2.1-4.2L4 12.5z',
  keyboard: 'M2 4.5h12v7H2zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5 9.5h6',
  scrollV: 'M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3',
  back: 'M9.5 5 6.5 8l3 3',
  calendar: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
  copy: 'M5.5 5.5h7v8h-7zM3.5 10.5v-8h7',
  down: 'M8 3v9.5M4 8.5l4 4 4-4',
  eye: 'M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8zM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  settings: 'M2.5 4.5h5M10.5 4.5h3M2.5 11.5h3M8.5 11.5h5M9 2.8v3.4M7 9.8v3.4',
  billing: 'M2 4.5h12v7H2zM2 7h12M4.5 9.5h2.5',
  help: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM6.4 6.3a1.65 1.65 0 1 1 1.85 2.05v.9M8 11.4h.01',
  eyeOff: 'M2.5 2.5l11 11M6.6 4c.5-.3 1-.5 1.4-.5 4.1 0 6.5 4.5 6.5 4.5s-.6 1.1-1.7 2.3M11 11.6c-.9.6-1.9.9-3 .9-4.1 0-6.5-4.5-6.5-4.5s.8-1.5 2.3-2.8M6.6 6.6a2 2 0 0 0 2.8 2.8'
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

// The colours a group can have; new groups take them in turn, grey last.
export const GROUP_COLORS = ['red', 'blue', 'green', 'amber', 'purple', 'teal', 'gray'] as const;
export type GroupColor = typeof GROUP_COLORS[number];

// A round initial for a person or a profile, in one of six colours picked by the text.
const hue = (text: string) => [...text].reduce((n, c) => n + c.charCodeAt(0), 0) % 6;
export const Avatar = ({ text, small, title }: { text: string; small?: boolean; title?: string }) => (
  <span className={`pav c${hue(text)}${small ? ' xs' : ''}`} title={title} aria-hidden={title ? undefined : true}>{[...text.trim()][0]?.toUpperCase() ?? '?'}</span>
);

// The ⋯ button and its menu.
export function MoreMenu({ label, items }: { label: string; items: { label: string; onClick(): void; danger?: boolean; disabled?: boolean }[] }){
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="d-more" ref={ref}>
      <button type="button" className="icon-btn bare" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon name="more" /></button>
      {open && (
        <div className="menu" role="menu">
          {items.map(i => (
            <button key={i.label} className={`menu-item${i.danger ? ' danger' : ''}`} type="button" role="menuitem" disabled={i.disabled} onClick={() => { setOpen(false); i.onClick(); }}>{i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// A small button that copies a value, saying so in a toast.
export function CopyBtn({ text, label, done }: { text: string; label: string; done: string }){
  const toast = useToast();
  return <button type="button" className="icon-btn bare copy-btn" aria-label={label} title={label} onClick={() => void navigator.clipboard.writeText(text).then(() => toast(done))}><Icon name="copy" /></button>;
}

// A record's details in a centred dialog over the page. Escape closes it, unless a dialog opened from it is on top.
export function DetailDialog({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }){
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <>
    <div className="scrim" onClick={onClose} />
    <div className="detail" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
  </>;
}

// How a page shows its items (rows, cards, a calendar), remembered on this computer.
export function useView<T extends string>(page: string, initial: T){
  const key = `folio.view.${page}`;
  const [view, setView] = useState<T>(() => { try { return (localStorage.getItem(key) as T | null) ?? initial; } catch { return initial; } });
  const set = (v: T) => { setView(v); try { localStorage.setItem(key, v); } catch { /* this session only */ } };
  return [view, set] as const;
}
// The switch between those views, at the right of a page's filters: an icon per view.
export function ViewSwitch<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, IconName, string][]; onChange(v: T): void }){
  return (
    <span className="views" role="group" aria-label={label}>
      {options.map(([v, icon, name]) => <button key={v} type="button" aria-pressed={value === v} aria-label={name} title={name} onClick={() => onChange(v)}><Icon name={icon} /></button>)}
    </span>
  );
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

// `bad` for something that went wrong; anything else is news of something done.
interface ToastItem { id: number; msg: string; action?: { label: string; fn(): void }; tone?: 'bad' }
type Push = (msg: string, action?: ToastItem['action'], tone?: 'bad') => void;
const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);

export function Toasts({ children }: { children: ReactNode }){
  const [list, setList] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const drop = (id: number) => setList(l => l.filter(t => t.id !== id));
  const push = useCallback<Push>((msg, action, tone) => {
    const id = ++seq.current;
    setList(l => [...l.slice(-2), { id, msg, action, tone }]);
    setTimeout(() => drop(id), action ? 8000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className={`toast${t.tone ? ` ${t.tone}` : ''}`} role="status">
            <span className="t-ic" aria-hidden="true"><Icon name={t.tone ? 'alert' : 'check'} /></span>
            <span>{t.msg}</span>
            {t.action && <button type="button" onClick={() => { drop(t.id); t.action!.fn(); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// A dialog. `icon` makes it a short one (a confirmation, a one-step import): the icon on top, the title and the content
// centred, the buttons side by side; its content goes straight in. A long one (a form) brings its own .m-body; `wide`
// gives a big form room for a preview beside it.
export function Modal({ title, closeLabel, onClose, foot, icon, tone, wide, children }: { title: string; closeLabel: string; onClose(): void; foot?: ReactNode; icon?: IconName; tone?: 'bad' | 'good'; wide?: boolean; children: ReactNode }){
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim modal-scrim" onClick={onClose} />
      <div className={`modal${icon ? ' short' : wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        {icon ? <>
          <button className="icon-btn bare m-close" type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}><Icon name="x" /></button>
          <div className="m-body"><span className={`m-icon${tone ? ` ${tone}` : ''}`} aria-hidden="true"><Icon name={icon} /></span><h2 id={id}>{title}</h2>{children}</div>
        </> : <>
          <div className="m-head">
            <h2 id={id}>{title}</h2>
            <button className="icon-btn bare" type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}><Icon name="x" /></button>
          </div>
          {children}
        </>}
        {foot && <div className="m-foot">{foot}</div>}
      </div>
    </>
  );
}

// An extension's own icon (a jigsaw piece when it has none).
export const ExtIcon = ({ src }: { src?: string | null }) => <span className="ext-ic">{src ? <img src={src} alt="" /> : <Icon name="extensions" />}</span>;

// A list whose load failed: it says so where the rows would be and offers to load it again, so a failure never
// reads as "there is nothing here" (or as a skeleton that never settles). Goes in a table's empty row or in a
// .cards-empty box, whichever the page uses.
export const LoadFailed = ({ d, onRetry }: { d: Dict; onRetry(): void }) => (
  <>
    <p><b>{d.common.loadFailed}</b></p>
    <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>{d.common.loadRetry}</button>
  </>
);

// What to do with the rows ticked on a page: how many, the actions, and a cross that clears the selection.
export function BulkBar({ n, label, clearLabel, onClear, children }: { n: number; label: string; clearLabel: string; onClear(): void; children: ReactNode }){
  return (
    <div className="bulk" role="toolbar" aria-label={label} data-testid="bulk">
      <b><span className="count">{n}</span>{label}</b>
      {children}
      <button type="button" className="bb close" aria-label={clearLabel} title={clearLabel} onClick={onClear}><Icon name="x" /></button>
    </div>
  );
}

export const bytes = (n: number) => (n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${Math.round(n / 1024 ** 2)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`);

// A download bar for an engine, from the main process's progress events.
export function Progress({ done, total }: { done: number; total: number }){
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <span className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></span>;
}
export const percent = (p: { done: number; total: number }) => (p.total ? Math.round((p.done / p.total) * 100) : 0);
