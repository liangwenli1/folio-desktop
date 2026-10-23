// Window sync: pick the profiles and the leader, then work in the leader's window while the others follow.
// Studio and Company; Free sees what it does and how to get it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WindowSync } from '@shared/bridge';
import { folio, type Profile, type Workspace } from './api';
import type { WorkspaceData } from './data';
import type { Dict, Lang } from './i18n';
import { Flag } from './Flag';
import { useToast } from './ui';

export function WindowSyncPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const W = d.windowSync;
  const toast = useToast();
  const profiles = data.profiles ?? [];
  const name = new Map(profiles.map(p => [p.id, p.name]));
  const [picked, setPicked] = useState<string[]>([]);
  const [leader, setLeader] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [tiled, setTiled] = useState<string | null>(null);
  const s = data.sync;
  const running = (id: string) => data.status[id]?.state === 'running';
  // Open ones first, the way they will most often be picked.
  const order = [...profiles].sort((a, b) => Number(running(b.id)) - Number(running(a.id)));

  async function start(){
    setBusy(true);
    const lead = leader && picked.includes(leader) ? leader : picked[0];
    const r = await folio.startWindowSync(picked, lead);
    setBusy(false);
    toast(r ? d.profiles.done.syncing(name.get(r.leader) ?? '', r.members.length - 1) : d.profiles.done.syncFailed);
  }
  async function tile(){
    setBusy(true);
    const r = await folio.tileWindows();
    setBusy(false);
    setTiled(r && [W.tiled(r.moved, r.moved + r.missed), r.why && W.tileMissed[r.why]].filter(Boolean).join(' '));
  }
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{W.title}</h1><p className="sub">{s ? W.summary(name.get(s.leader) ?? '', s.members.length - 1) : W.sub}</p></div>
        </header>
        {ws.subscription.plan === 'free' ? (
          <section className="api-card sync-card upsell" aria-label={W.title}>
            <h2>{W.upsell.title}</h2>
            <p className="hint">{W.upsell.lead}</p>
            <ul>{W.upsell.points.map(x => <li key={x}>{x}</li>)}</ul>
            <p className="hint">{W.upgrade}</p>
            {ws.role !== 'member'
              ? <button type="button" className="btn btn-primary" onClick={() => folio.openSite(`/${lang}/checkout/?ws=${ws.id}`)}>{d.plan.upgrade}</button>
              : <p className="hint">{W.upsell.ask}</p>}
          </section>
        ) : s ? (
          <section className="api-card sync-card" aria-label={W.current}>
            <div className="sec-row">
              <h2 className="sec-t">{W.current}</h2>
              <span className="d-actions tight">
                <button type="button" className="btn btn-xs btn-secondary" disabled={busy} onClick={() => void tile()}>{busy ? W.tiling : W.tile}</button>
                <button type="button" className="btn btn-xs btn-secondary" onClick={() => { setTiled(null); void folio.stopWindowSync(); }}>{W.stop}</button>
              </span>
            </div>
            <SyncDiagram d={d} sync={s} profiles={profiles} country={id => { const p = profiles.find(x => x.id === id); const px = p?.proxyId ? data.proxies.find(x => x.id === p.proxyId) : null; return px?.lastCheck?.ok ? px.lastCheck.geo?.country ?? null : null; }} />
            {tiled && <p className="hint" role="status">{tiled}</p>}
            <form className="sync-url wide" onSubmit={e => { e.preventDefault(); if (url.trim()) void folio.syncGoto(url.trim()); setUrl(''); }}>
              <input aria-label={W.address} placeholder={W.addressPh} value={url} onChange={e => setUrl(e.target.value)} spellCheck={false} />
              <button type="submit" className="btn btn-sm btn-secondary">{W.open}</button>
            </form>
            <p className="hint">{W.limits}</p>
          </section>
        ) : (
          <section className="api-card sync-card" aria-label={W.pick}>
            <h2 className="sec-t">{W.pick}</h2>
            <p className="hint">{W.pickHelp}</p>
            <ul className="plain-list">
              {order.map(p => (
                <li key={p.id}>
                  <label className="check-row"><input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.name}</span>{running(p.id) && <span className="d good" aria-label={W.running} />}</label>
                  <span className="sp" />
                  {picked.includes(p.id) && (
                    <label className="check-row"><input type="radio" name="leader" checked={(leader && picked.includes(leader) ? leader : picked[0]) === p.id} onChange={() => setLeader(p.id)} />{W.leaderTag}</label>
                  )}
                </li>
              ))}
            </ul>
            <div className="d-actions"><button type="button" className="btn btn-primary" disabled={picked.length < 2 || busy} onClick={() => void start()}>{busy ? W.starting : W.start(picked.length)}</button></div>
            <p className="hint">{W.limits}</p>
          </section>
        )}
      </main>
    </div>
  );
}

// The leader on the left, the followers on the right, a line to each; what the leader does travels down the lines
// as it is repeated. A follower with a problem turns red and says what happened.
function SyncDiagram({ d, sync, profiles, country }: { d: Dict; sync: WindowSync; profiles: Profile[]; country(id: string): string | null }){
  const W = d.windowSync;
  const box = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState<{ from: number; to: Record<string, number>; width: number }>({ from: 0, to: {}, width: 0 });
  const [pulses, setPulses] = useState<{ key: number; id: string }[]>([]);
  const seq = useRef(0);
  const leader = sync.members.find(m => m.id === sync.leader)!, followers = sync.members.filter(m => m.id !== sync.leader);
  const profile = (id: string) => profiles.find(p => p.id === id);

  // Where the lines start and end: the middle of each card, measured.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top, mid = (x: Element | null) => (x ? x.getBoundingClientRect().top - top + x.getBoundingClientRect().height / 2 : 0);
      const to: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>('.sync-node.follower').forEach(n => { to[n.dataset.id!] = mid(n); });
      setEnds({ from: mid(el.querySelector('.sync-node.leader')), to, width: el.querySelector('.sync-mid')!.getBoundingClientRect().width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);
  useEffect(() => folio.onSyncPulse(id => {
    const key = ++seq.current;
    setPulses(list => [...list.filter(p => p.id !== id).slice(-12), ...list.filter(p => p.id === id).slice(-2), { key, id }]);
    setTimeout(() => setPulses(list => list.filter(p => p.key !== key)), 900);
  }), []);
  const path = (id: string) => `M0 ${ends.from}C${ends.width * 0.5} ${ends.from} ${ends.width * 0.5} ${ends.to[id] ?? ends.from} ${ends.width} ${ends.to[id] ?? ends.from}`;
  const node = (m: WindowSync['members'][number], role: 'leader' | 'follower') => {
    const p = profile(m.id);
    return (
      <div key={m.id} className={`sync-node ${role}${m.issue ? ' bad' : ''}`} data-id={m.id} data-sync={p?.name}>
        {p && <Flag country={country(m.id)} kernel={p.kernel} />}
        <span className="sync-who"><b>{p?.name}</b><span className="synctag">{role === 'leader' ? W.leaderTag : W.followerTag}</span>
          {m.issue && <span className="hint">{W.issues[m.issue]}</span>}</span>
        {role === 'follower' && <button type="button" className="btn btn-xs btn-text" onClick={() => void folio.setSyncLeader(m.id)}>{W.makeLeader}</button>}
      </div>
    );
  };
  return (
    <div className="sync-diagram" ref={box}>
      <div className="sync-col">{node(leader, 'leader')}</div>
      <div className="sync-mid">
        <svg className="sync-lines" aria-hidden="true">
          {followers.map(f => <path key={f.id} className={f.issue ? 'bad' : ''} d={path(f.id)} />)}
          {pulses.map(p => ends.to[p.id] !== undefined && (
            <circle key={p.key} r={4} className="pulse"><animateMotion dur="0.8s" fill="freeze" path={path(p.id)} /></circle>
          ))}
        </svg>
      </div>
      <div className="sync-col followers">{followers.map(f => node(f, 'follower'))}</div>
    </div>
  );
}
