// The bar along the top of every page (v2's white 56 px bar): where you are on the left, as "workspace / page" (and
// on a record's own page that record), and on the right the search (the command palette), help and notifications. Its empty space still drags the window: on Windows and macOS it is the title bar.
import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Dict } from './i18n';
import { mod } from './CommandPalette';
import { Icon, useDismiss, type IconName } from './ui';

// A step of the trail: a name, and where it goes when there is somewhere to go back to.
export interface Crumb { label: string; go?(): void }
const TrailContext = createContext<(trail: Crumb[] | null) => void>(() => {});
export const TrailProvider = TrailContext.Provider;
// A page showing one record (a profile, a proxy) puts it after the page's name: [the list, to go back to; the record].
export function useTrail(trail: Crumb[], key: string){
  const set = useContext(TrailContext);
  useEffect(() => { set(trail); return () => set(null); }, [key]);
}

export function TopBar({ d, workspace, page, trail, onSearch, onHelp, children }: { d: Dict; workspace: string; page: string; trail: Crumb[] | null; onSearch(): void; onHelp(): void; children: ReactNode }){
  const steps = trail ?? [{ label: page }];
  return (
    <header className="top">
      <nav className="top-crumbs" aria-label={d.detail.crumbs}>
        <span>{workspace}</span>
        {steps.map((c, i) => (
          <Fragment key={i}>
            <span className="sep" aria-hidden="true">/</span>
            {c.go ? <button type="button" onClick={c.go}>{c.label}</button> : <span aria-current={i === steps.length - 1 ? 'page' : undefined}>{c.label}</span>}
          </Fragment>
        ))}
      </nav>
      <span className="sp" />
      <button type="button" className="top-search" onClick={onSearch}><Icon name="search" /><span>{d.top.search}</span><kbd>{mod} K</kbd></button>
      <button type="button" className="icon-btn bare" aria-label={d.nav.help} title={d.nav.help} onClick={onHelp}><Icon name="help" /></button>
      {children}
    </header>
  );
}

// Something that needs the person's attention: the plan ending, an invitation, a batch that partly failed. `id`
// changes when the thing does, so a new state counts as unseen.
export interface Notice { id: string; icon: IconName; tone?: 'warn' | 'bad'; text: string; when?: string; actions: { label: string; primary?: boolean; run(): void }[] }

// The bell: a dot while there is something not looked at yet; opening the list counts as looking (kept per
// workspace on this computer).
export function Bell({ d, wsId, notices }: { d: Dict; wsId: string; notices: Notice[] }){
  const key = `folio.bell.${wsId}`;
  const [seen, setSeen] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]); } catch { return new Set(); } });
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLElement>(null);
  useDismiss(!!at, [btn, pop], () => setAt(null));
  useEffect(() => { if (at) pop.current?.querySelector<HTMLElement>('button')?.focus(); }, [at]);
  const unseen = notices.some(n => !seen.has(n.id));
  function open(){
    const r = btn.current!.getBoundingClientRect();
    setAt({ top: r.bottom + 6, right: Math.max(8, innerWidth - r.right) });
    const ids = new Set(notices.map(n => n.id));
    setSeen(ids);
    try { localStorage.setItem(key, JSON.stringify([...ids])); } catch { /* seen for this session only */ }
  }
  return (
    <>
      <button ref={btn} type="button" className="icon-btn bare bell" aria-label={unseen ? d.top.bellNew : d.top.bell} title={d.top.bell} aria-haspopup="dialog" aria-expanded={!!at}
        onClick={() => (at ? setAt(null) : open())}><Icon name="bell" />{unseen && <span className="bell-dot" aria-hidden="true" />}</button>
      {at && createPortal(
        <section ref={pop} className="bell-pop" role="dialog" aria-label={d.top.bell} style={at} onKeyDown={e => { if (e.key === 'Escape'){ e.stopPropagation(); setAt(null); btn.current?.focus(); } }}>
          <h2>{d.top.bell}</h2>
          {notices.length ? (
            <ul>
              {notices.map(n => (
                <li key={n.id} className={n.tone}>
                  <Icon name={n.icon} />
                  <div>
                    <p>{n.text}</p>
                    {n.when && <small>{n.when}</small>}
                    {n.actions.length > 0 && <span className="bell-acts">{n.actions.map(a => (
                      <button key={a.label} type="button" className={`btn btn-sm ${a.primary ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setAt(null); a.run(); }}>{a.label}</button>
                    ))}</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="bell-none">{d.top.none}</p>}
        </section>, document.body)}
    </>
  );
}
