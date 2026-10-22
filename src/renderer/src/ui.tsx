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
  team: 'M8.5 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM1.5 13c.5-2.5 2.3-3.8 4.5-3.8s4 1.3 4.5 3.8M10.5 3.3a2.3 2.3 0 0 1 0 4.4M12 9.6c1.3.5 2.2 1.6 2.5 3.4',
  activity: 'M1.5 8h3l2-4.5 3 9 2-4.5h3',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5'
};
export type IconName = keyof typeof PATHS;
export const Icon = ({ name }: { name: IconName }) => <svg className="i" viewBox="0 0 16 16" aria-hidden="true"><path d={PATHS[name]} /></svg>;

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

// A download bar for an engine, from the main process's progress events.
export function Progress({ done, total }: { done: number; total: number }){
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <span className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></span>;
}
export const percent = (p: { done: number; total: number }) => (p.total ? Math.round((p.done / p.total) * 100) : 0);
