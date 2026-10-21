import { useEffect, useRef, useState } from 'react';
import { folio, type Me, type Workspace } from './api';
import type { Dict, Lang } from './i18n';
import { isPaid, planStatus } from './plan';

interface Props {
  d: Dict; lang: Lang; me: Me; ws: Workspace;
  onSwitch(id: string): void; onLang(l: Lang): Promise<void>; onLogout(): Promise<void>;
}

const NAV = ['proxies', 'sync', 'tasks', 'api', 'team', 'activity', 'trash'] as const;

function useOutsideClose(open: boolean, close: () => void){
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

export function Workbench({ d, lang, me, ws, onSwitch, onLang, onLogout }: Props){
  const s = ws.subscription;
  const site = `/${lang}`;
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const wsRef = useOutsideClose(wsOpen, () => setWsOpen(false));
  const userRef = useOutsideClose(userOpen, () => setUserOpen(false));
  const manager = ws.role !== 'member';
  const limit = s.entitlements.profiles;
  const initials = me.user.email.slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <aside className="side" aria-label={d.ws.current}>
        <div className="brand"><span className="seal" aria-hidden="true">F</span><span className="brand-word">Folio</span></div>

        <div className="ws-wrap" ref={wsRef}>
          <button className="ws" type="button" aria-haspopup="listbox" aria-expanded={wsOpen} onClick={() => setWsOpen(o => !o)} title={d.ws.switch}>
            <span><b data-testid="ws-name">{ws.name}</b><small data-testid="ws-plan">{d.plans[s.plan]}</small></span>
            <svg className="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6.5 8 9.5l3-3" /></svg>
          </button>
          {wsOpen && (
            <ul className="menu" role="listbox" aria-label={d.ws.switch}>
              {me.workspaces.map(w => (
                <li key={w.id} role="option" aria-selected={w.id === ws.id}>
                  <button type="button" onClick={() => { setWsOpen(false); onSwitch(w.id); }}>
                    <span>{w.name}</span><small>{d.plans[w.plan]} · {d.roles[w.role]}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="nav" aria-label="Main">
          <button className="nav-i active" type="button" aria-current="page">{d.nav.profiles}<span className="cnt">{ws.usage.profiles}</span></button>
          {NAV.map(k => (
            <button key={k} className="nav-i" type="button" disabled title={d.nav.soonHint}>{d.nav[k]}<span className="soon">{d.nav.soon}</span></button>
          ))}
        </nav>

        <section className="plan" aria-label={d.plans[s.plan]}>
          <p><b data-testid="plan-name">{d.plans[s.plan]}</b></p>
          {planStatus(s, d, lang) && <p className="muted" data-testid="plan-status">{planStatus(s, d, lang)}</p>}
          <p data-testid="plan-usage">{d.plan.usage(ws.usage.profiles, limit)}</p>
          <span className="meter"><i style={{ width: `${Math.min(100, (ws.usage.profiles / limit) * 100)}%` }} /></span>
          {manager && (
            <div className="plan-actions">
              <button className="linkish" type="button" data-testid="plan-buy" onClick={() => folio.openSite(`${site}/checkout/?ws=${ws.id}`)}>
                {isPaid(s) ? d.plan.addProfiles : d.plan.upgrade}
              </button>
              <button className="linkish muted" type="button" onClick={() => folio.openSite(`${site}/account/?ws=${ws.id}`)}>{d.plan.manage}</button>
            </div>
          )}
        </section>

        <div className="me-wrap" ref={userRef}>
          <button className="me" type="button" aria-haspopup="menu" aria-expanded={userOpen} onClick={() => setUserOpen(o => !o)}>
            <span className="av" aria-hidden="true">{initials}</span>
            <span className="me-text"><b>{me.user.email}</b><small>{d.roles[ws.role]}</small></span>
          </button>
          {userOpen && (
            <div className="menu up" role="menu">
              <div className="menu-row">
                <span>{d.user.language}</span>
                <div className="seg">
                  {(['en', 'zh'] as const).map(l => (
                    <button key={l} type="button" aria-pressed={lang === l} onClick={() => { setUserOpen(false); void onLang(l); }}>{l === 'en' ? 'EN' : '中文'}</button>
                  ))}
                </div>
              </div>
              <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); void onLogout(); }}>{d.user.logout}</button>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{d.profiles.title}</h1><p className="muted">{d.profiles.sub(ws.usage.profiles, d.plans[s.plan])}</p></div>
        </header>
        <section className="empty">
          <article className="idcard" aria-label={d.profiles.emptyTitle}>
            <header className="id-head"><span>FOLIO · {ws.name.toUpperCase()}</span><span>No. <b>0000</b></span></header>
            <h2>{d.profiles.emptyTitle}</h2>
            <p className="muted">{d.profiles.emptyBody(limit)}</p>
            <div className="mrz" aria-hidden="true"><span>{`FOLIO<${s.plan.toUpperCase()}<<${String(limit).padStart(4, '0')}<<<<<<<<<<<<<<<<`.slice(0, 32)}</span></div>
            <div className="stamp" aria-hidden="true"><span className="s-top">FOLIO</span><span className="s-main">{d.profiles.stamp}</span></div>
          </article>
        </section>
      </main>
    </div>
  );
}
