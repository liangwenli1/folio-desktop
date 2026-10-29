// The bar along the top of every page (v2's white 56 px bar). On the left the page's name, its title (H2, the user,
// 10-29: pages have no big title of their own); on a record's page a back button, the list (also back) and the record.
// On the right the search (the command palette), light or dark, help, notifications and the workspace. Its empty space
// still drags the window: on Windows and macOS it is the title bar.
import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { folio, type Me, type Workspace } from './api';
import type { Dict } from './i18n';
import { mod } from './CommandPalette';
import { Avatar, Icon, menuKeys, useDismiss, useMedia, type IconName } from './ui';

// A step of the trail: a name, and where it goes when there is somewhere to go back to.
export interface Crumb { label: string; go?(): void }
const TrailContext = createContext<(trail: Crumb[] | null) => void>(() => {});
export const TrailProvider = TrailContext.Provider;
// A page showing one record (a profile, a proxy, a task, a flow) puts it after the page's name: [the list, to go back
// to; the record].
export function useTrail(trail: Crumb[], key: string){
  const set = useContext(TrailContext);
  useEffect(() => { set(trail); return () => set(null); }, [key]);
}

export function TopBar({ d, page, trail, onSearch, onHelp, children }: { d: Dict; page: string; trail: Crumb[] | null; onSearch(): void; onHelp(): void; children: ReactNode }){
  const steps = trail ?? [{ label: page }];
  const up = steps.at(-2)?.go;
  return (
    <header className="top">
      <div className="top-title">
        {up && <button type="button" className="top-back" aria-label={d.top.back} title={d.top.back} onClick={up}><Icon name="back" /></button>}
        {steps.slice(0, -1).map((c, i) => (
          <Fragment key={i}>
            <button type="button" className="top-up" onClick={c.go}>{c.label}</button>
            <span className="sep" aria-hidden="true">/</span>
          </Fragment>
        ))}
        <h1 data-testid="page-title">{steps.at(-1)!.label}</h1>
      </div>
      <span className="sp" />
      <button type="button" className="top-search" onClick={onSearch}><Icon name="search" /><span>{d.top.search}</span><kbd>{mod} K</kbd></button>
      <ThemeButton d={d} />
      <button type="button" className="icon-btn bare" aria-label={d.nav.help} title={d.nav.help} onClick={onHelp}><Icon name="help" /></button>
      {children}
    </header>
  );
}

// The workspace at the top right (the user, 10-29: its initial on a coloured square, no plan beside it), and under it the
// person's menu (M1, the user, 10-29): the login email at the top; the workspaces, each with its plan, the current one
// ticked, a click switches; a new one; invitations waiting (asked for again each time it opens), which lead to
// Account's My workspaces, where they are answered; then Account and Log out.
export function WorkspaceMenu({ d, me, ws, invites, onOpen, onSwitch, onNew, onInvites, onAccount, onLogout }: {
  d: Dict; me: Me; ws: Workspace; invites: number; onOpen(): void; onSwitch(id: string): void; onNew(): void; onInvites(): void; onAccount(): void; onLogout(): void;
}){
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const close = (focus = false) => { setAt(null); if (focus) btn.current?.focus(); };
  useDismiss(!!at, [btn, menu], () => close());
  useEffect(() => { if (at) menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(); }, [at]);
  const open = () => { const r = btn.current!.getBoundingClientRect(); setAt({ top: r.bottom + 6, right: innerWidth - r.right }); onOpen(); };
  return (
    <>
      <button ref={btn} type="button" className="ws-top" aria-haspopup="menu" aria-expanded={!!at} title={d.ws.menu} onClick={() => (at ? close() : open())}>
        <Avatar text={ws.name} /><span className="ws-top-n" data-testid="ws-name">{ws.name}</span>
        {invites > 0 && <span className="dot" aria-label={d.team.invites} />}
        <Icon name="chev" />
      </button>
      {at && createPortal(
        <div ref={menu} className="menu pop-menu ws-pop" role="menu" aria-label={d.ws.menu} style={at} onKeyDown={e => menuKeys(menu.current!, e, close)}>
          <p className="ws-me"><Avatar text={me.user.email} /><b>{me.user.email}</b></p>
          <div role="separator" className="ws-pop-sep" />
          <p className="ws-pop-h">{d.ws.switch}</p>
          {me.workspaces.map(w => (
            <button key={w.id} type="button" role="menuitemradio" aria-checked={w.id === ws.id} tabIndex={-1} className="menu-item ws-row" onClick={() => { close(); if (w.id !== ws.id) onSwitch(w.id); }}>
              <Avatar text={w.name} /><span className="ws-row-n">{w.name}</span><small>{d.plans[w.plan]}</small>
              {w.id === ws.id ? <Icon name="check" /> : <span className="i" aria-hidden="true" />}
            </button>
          ))}
          <button type="button" role="menuitem" tabIndex={-1} className="menu-item ws-act ws-new" onClick={() => { close(); onNew(); }}><Icon name="plus" />{d.ws.create}</button>
          {invites > 0 && <>
            <div role="separator" className="ws-pop-sep" />
            <button type="button" role="menuitem" tabIndex={-1} className="menu-item ws-inv" onClick={() => { close(); onInvites(); }}>
              {d.ws.invites}<span className="ws-inv-n">{invites}</span><span className="ws-inv-go">{d.ws.view}</span>
            </button>
          </>}
          <div role="separator" className="ws-pop-sep" />
          <button type="button" role="menuitem" tabIndex={-1} className="menu-item ws-act" onClick={() => { close(); onAccount(); }}><Icon name="user" />{d.account.title}</button>
          <button type="button" role="menuitem" tabIndex={-1} className="menu-item ws-act" onClick={() => { close(); onLogout(); }}><Icon name="logout" />{d.account.menu.logout}</button>
        </div>, document.body)}
    </>
  );
}

// Light or dark at a click, nothing to save (the user, 10-29); the icon is the theme it switches to. Platform settings
// also offer the system's.
function ThemeButton({ d }: { d: Dict }){
  const dark = useMedia('(prefers-color-scheme: dark)');
  const label = dark ? d.top.toLight : d.top.toDark;
  return <button type="button" className="icon-btn bare" aria-label={label} title={label} onClick={() => void folio.setTheme(dark ? 'light' : 'dark')}><Icon name={dark ? 'sun' : 'moon'} /></button>;
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
