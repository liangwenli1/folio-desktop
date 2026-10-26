import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { folio } from './api';
import type { Kind, WorkspaceData } from './data';
import type { Dict } from './i18n';

const PATHS = {
  profiles: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2zM3 8h18M7 6h.01M10 6h.01',
  proxies: 'M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M17 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M11 7l-5 9m7-9 5 9M7 18h10',
  engines: 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  team: 'M6 8a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5',
  activity: 'M7 3h10l3 3v15H4V3h3Zm1 6h8m-8 4h8m-8 4h5',
  jobs: 'M6 4h12a2 2 0 0 1 2 2v13a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-13a2 2 0 0 1 2 -2zM9 3h6v4H9zM8 13l2 2 5-5',
  search: 'M3.5 10.5a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M16 16l5 5',
  x: 'M6 6l12 12M18 6 6 18',
  chev: 'M6 9l6 6 6-6',
  copy: 'M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-9a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2zM16 8V3H3v13h5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  play: 'M8 4l12 8-12 8V4Z',
  stop: 'M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-12a1 1 0 0 1 1 -1z',
  refresh: 'M20 7a9 9 0 1 0 1 8M20 3v5h-5',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  plus: 'M12 4v16M4 12h16',
  edit: 'M15 4l5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  check: 'M4 12l5 5L20 6',
  info: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 11v6m0-10h.01',
  more: 'M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  chevR: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  up: 'M12 20V4m-6 6 6-6 6 6',
  down: 'M12 4v16m-6-6 6 6 6-6',
  sync: 'M5 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2zM9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4',
  tasks: 'M4.5 13a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0M12 9.5V13l2.5 1.5M4.5 4 2 6.5M19.5 4 22 6.5',
  clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 7v5l3 2',
  api: 'm9 7-5 5 5 5m6-10 5 5-5 5',
  flows: 'M4.5 3h4a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-3a1.5 1.5 0 0 1 1.5 -1.5zM15.5 15h4a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-3a1.5 1.5 0 0 1 1.5 -1.5zM6.5 9v4.5a3 3 0 0 0 3 3H14',
  extensions: 'M9 4.5a2.5 2.5 0 0 1 5 0V6h4a1 1 0 0 1 1 1v4h-1.5a2.5 2.5 0 0 0 0 5H19v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4h1.5a2.5 2.5 0 0 0 0-5H4V7a1 1 0 0 1 1-1h4z',
  alert: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 7v6.5M12 16.75h.01',
  alertTri: 'M10.27 4.2 2.4 17.9A2 2 0 0 0 4.13 21h15.74a2 2 0 0 0 1.73-3.1L13.73 4.2a2 2 0 0 0-3.46 0zM12 9.5v4.5M12 17.25h.01',
  xCircle: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9 9l6 6m0-6-6 6',
  checkCircle: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M8 12.5l2.75 2.75L16 10',
  windows: 'M5 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM14 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM5 13h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM14 13h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
  macos: 'M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9m0 0v6m0 0v2.5A2.5 2.5 0 1 1 6.5 15H9m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15m0 0v6m0 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15M9 9h6m-6 6h6',
  linux: 'M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2zM7.5 10l3 2-3 2M12.5 15.5H16',
  star: 'M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.66l5.9-.86z',
  pause: 'M9 5v14m6-14v14',
  logout: 'M9.5 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3.5M16 16l4-4-4-4m4 4H9.5',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  grid: 'M5 4h4.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1 -1 1h-4.5a1 1 0 0 1 -1 -1v-4.5a1 1 0 0 1 1 -1zM14.5 4h4.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1 -1 1h-4.5a1 1 0 0 1 -1 -1v-4.5a1 1 0 0 1 1 -1zM5 13.5h4.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1 -1 1h-4.5a1 1 0 0 1 -1 -1v-4.5a1 1 0 0 1 1 -1zM14.5 13.5h4.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1 -1 1h-4.5a1 1 0 0 1 -1 -1v-4.5a1 1 0 0 1 1 -1z',
  crown: 'M3.5 7.5 8 12l4-6.5 4 6.5 4.5-4.5L19 18H5zM5 21h14',
  key: 'M4 15.5a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M10.9 12.6 20 3.5m-3 3 2.5 2.5m-5-.5 2 2',
  mail: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2zM3.5 7l8.5 6 8.5-6',
  link: 'M10 14a4.5 4.5 0 0 0 6.36 0l3-3A4.5 4.5 0 0 0 13 4.64l-1 1M14 10a4.5 4.5 0 0 0-6.36 0l-3 3A4.5 4.5 0 0 0 11 19.36l1-1',
  unlink: 'M13.5 6.6 14.6 5.5a4.5 4.5 0 0 1 6.36 6.36L19.4 13.4M10.5 17.4l-1.1 1.1a4.5 4.5 0 0 1-6.36-6.36L4.6 10.6M8.5 2.5V5M2.5 8.5H5M15.5 21.5V19M21.5 15.5H19',
  server: 'M5.5 4h13a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-13a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2zM5.5 13h13a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-13a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2zM7.5 7.5h.01M7.5 16.5h.01M11 7.5h5.5M11 16.5h5.5',
  lang: 'M3.5 5.5h11M9 3v2.5m3 0c-.75 3.75-3.75 6.75-7.5 8.25m2.25-5.5c1.2 2.25 3 3.9 5.25 4.95M13.5 21l3.75-9L21 21m-6.3-3h5.1',
  pointer: 'M6 3.5 18 12l-5.4 1.35 3.15 6.3-2.4 1.2-3.15-6.3L6 18.5z',
  keyboard: 'M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2zM7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7.5 14h9',
  scrollV: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
  calendar: 'M5.5 5h13a2 2 0 0 1 2 2v11.5a2 2 0 0 1 -2 2h-13a2 2 0 0 1 -2 -2v-11.5a2 2 0 0 1 2 -2zM3.5 10h17M8 3v4m8-4v4',
  settings: 'M18.77 9.54L21.42 10.17L21.42 13.83L18.77 14.46L18.53 15.04L19.96 17.37L17.37 19.96L15.04 18.53L14.46 18.77L13.83 21.42L10.17 21.42L9.54 18.77L8.96 18.53L6.63 19.96L4.04 17.37L5.47 15.04L5.23 14.46L2.58 13.83L2.58 10.17L5.23 9.54L5.47 8.96L4.04 6.63L6.63 4.04L8.96 5.47L9.54 5.23L10.17 2.58L13.83 2.58L14.46 5.23L15.04 5.47L17.37 4.04L19.96 6.63L18.53 8.96ZM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  billing: 'M5 5.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2zM3 10h18M7 15h3',
  help: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9.6 9.4a2.5 2.5 0 1 1 3.4 2.35c-.6.25-1 .8-1 1.45v.55M12 16.9h.01',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 10 6 10 6a17.5 17.5 0 0 1-2.6 3.3M16.5 16.6A9.7 9.7 0 0 1 12 18c-6 0-10-6-10-6a17.5 17.5 0 0 1 4.5-4.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2zM8 11V7.5a4 4 0 0 1 8 0V11m-4 4v2',
  newFile: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5M9 13h6m-6 4h4',
  wifiOff: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 15.8a5 5 0 0 1 7 0M12 19.5h.01',
  cookie: 'M21 12.5A9 9 0 1 1 11.5 3a3 3 0 0 0 3.5 3.5 3 3 0 0 0 3.5 3.5 3 3 0 0 0 2.5 2.5zM8.5 9.5h.01M8.5 15h.01M13.5 14h.01M15 18h.01',
  minus: 'M6 12h12',
  // The mark inside a solid circle (a figure that failed, a toast that went wrong): taller than the outline icon's.
  bang: 'M12 5v9M12 18.5h.01'
};
export type IconName = keyof typeof PATHS;
// The design delivery's icon set (24×24, 1.75 stroke, round ends), and the icons it lacks drawn the same way.
export const Icon = ({ name }: { name: IconName }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>;
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
// `hideLabel`: the words are said next to it already (a table row), so only screen readers get them.
export function Switch({ label, checked, disabled, hideLabel, onChange }: { label: string; checked: boolean; disabled?: boolean; hideLabel?: boolean; onChange(on: boolean): void }){
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />{hideLabel ? <span className="sr">{label}</span> : label}
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

// `bad` for something that went wrong; anything else is news of something done. One action, or two (a partly failed
// batch: why, and running the failed ones again).
interface ToastAction { label: string; fn(): void }
interface ToastItem { id: number; msg: string; actions: ToastAction[]; tone?: 'bad' }
type Push = (msg: string, action?: ToastAction | ToastAction[], tone?: 'bad') => void;
const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);
// Something under way, shown above the toasts until it is replaced, or cleared with null.
const NoticeContext = createContext<(notice: ReactNode) => void>(() => {});
export const useNotice = () => useContext(NoticeContext);

export function Toasts({ children }: { children: ReactNode }){
  const [list, setList] = useState<ToastItem[]>([]);
  const [notice, setNotice] = useState<ReactNode>(null);
  const seq = useRef(0);
  const drop = (id: number) => setList(l => l.filter(t => t.id !== id));
  const push = useCallback<Push>((msg, action, tone) => {
    const id = ++seq.current, actions = action ? [action].flat() : [];
    setList(l => [...l.slice(-2), { id, msg, actions, tone }]);
    setTimeout(() => drop(id), actions.length ? 8000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      <NoticeContext.Provider value={setNotice}>
        {children}
        <div className="toasts" aria-live="polite">
          {notice}
          {list.map(t => (
            <div key={t.id} className={`toast${t.tone ? ` ${t.tone}` : ''}${t.actions.length > 1 ? ' two' : ''}`} role="status">
              <span className="t-ic" aria-hidden="true"><Icon name={t.tone ? 'bang' : 'check'} /></span>
              <span>{t.msg}</span>
              {t.actions.length > 0 && <span className="t-acts">{t.actions.map(a => (
                <button key={a.label} type="button" onClick={() => { drop(t.id); a.fn(); }}>{a.label}</button>
              ))}</span>}
            </div>
          ))}
        </div>
      </NoticeContext.Provider>
    </ToastContext.Provider>
  );
}

// A dialog. `kind` makes it a short one (a confirmation, a one-step install), as in the design: an icon for the kind of
// question beside the title, the content under the title, the buttons on the right; its content goes straight in.
// warn: a change that can be undone or is harmless; bad: one that can't be undone; good: a welcome one; info: a step.
// A long one (a form) brings its own .m-body; `wide` gives a big form room for a preview beside it.
const KIND_ICONS = { warn: 'alert', bad: 'alert', good: 'check', info: 'info' } as const;
export function Modal({ title, sub, closeLabel, onClose, foot, kind, wide, children }: { title: string; sub?: ReactNode; closeLabel: string; onClose(): void; foot?: ReactNode; kind?: keyof typeof KIND_ICONS; wide?: boolean; children: ReactNode }){
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim modal-scrim" onClick={onClose} />
      <div className={`modal${kind ? ' short' : wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        {kind ? <>
          <button className="icon-btn bare m-close" type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}><Icon name="x" /></button>
          <div className="m-body"><span className={`m-icon ${kind}`} aria-hidden="true"><Icon name={KIND_ICONS[kind]} /></span><h2 id={id}>{title}</h2>{children}</div>
        </> : <>
          <div className="m-head">
            {sub ? <div><h2 id={id}>{title}</h2><p className="m-sub">{sub}</p></div> : <h2 id={id}>{title}</h2>}
            <button className="icon-btn bare" type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}><Icon name="x" /></button>
          </div>
          {children}
        </>}
        {foot && <div className="m-foot">{foot}</div>}
      </div>
    </>
  );
}

// A button that sends a request when pressed (a confirmation's action, mostly): while it runs, a spinner takes the
// label's place, the width stays, and it takes no more clicks. Forms with a busy state of their own mark their submit
// button aria-busy for the same look.
export function Act({ run, className, disabled, children }: { run(): Promise<unknown>; className: string; disabled?: boolean; children: ReactNode }){
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={disabled || busy} aria-busy={busy || undefined}
      onClick={() => { setBusy(true); void run().finally(() => setBusy(false)); }}>{children}</button>
  );
}

// An extension's own icon (a jigsaw piece when it has none).
export const ExtIcon = ({ src }: { src?: string | null }) => <span className="ext-ic">{src ? <img src={src} alt="" /> : <Icon name="extensions" />}</span>;

// What a page shows instead of its rows (the design's ST01–ST06): nothing yet, nothing that matches, something that
// failed (a proxy that doesn't answer, a profile that didn't start, a list that didn't load), no access, no
// connection. An icon, a line, what it means, and what to do about it.
// Nothing created yet and no connection carry a small badge on their icon, as in the design.
const BADGES: Partial<Record<IconName, IconName>> = { newFile: 'plus', wifiOff: 'x' };
export function Empty({ icon, tone, title, text, children }: { icon: IconName; tone?: 'bad'; title: string; text?: ReactNode; children?: ReactNode }){
  const badge = BADGES[icon];
  return (
    <div className={`es${tone ? ` ${tone}` : ''}`} role={tone ? 'alert' : undefined}>
      <span className="es-ic" aria-hidden="true"><Icon name={icon} />{badge && <span className={`es-badge ${badge}`}><Icon name={badge} /></span>}</span>
      <b className="es-t">{title}</b>
      {text && <p>{text}</p>}
      {children && <div className="es-acts">{children}</div>}
    </div>
  );
}

// A list whose load failed: it says so where the rows would be and offers to load it again, so a failure never
// reads as "there is nothing here" (or as a skeleton that never settles). A list the role may not see says that
// instead, with whom to ask (`admin`) and an email to them. Goes in a table's empty row or in a .cards-empty box,
// whichever the page uses.
export const LoadFailed = ({ d, code, admin, onRetry }: { d: Dict; code?: string | null; admin?: string | null; onRetry(): void }) => (code === 'forbidden'
  ? <Empty icon="lock" title={d.states.noAccess} text={d.states.noAccessText(admin ?? null)}>
      {admin && <button type="button" className="btn btn-sm btn-secondary" onClick={() => void folio.mail(admin, d.states.askSubject)}>{d.states.contact}</button>}
    </Empty>
  : <Empty icon="alertTri" tone="bad" title={d.common.loadFailed} text={d.states.loadFailedText}>
      <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>{d.common.loadRetry}</button>
    </Empty>);
// One of the workspace's lists, when its last load failed.
export const ListFailed = ({ d, data, kind }: { d: Dict; data: WorkspaceData; kind: Kind }) => (
  <LoadFailed d={d} code={data.loadFailed.get(kind)} admin={data.admin} onRetry={() => data.refresh(kind)} />
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
