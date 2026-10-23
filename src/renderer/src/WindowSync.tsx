// Window sync: pick the profiles and the leader, then work in the leader's window while the others follow.
// Studio and Company; Free sees what it does and how to get it.
import { useState } from 'react';
import { folio, type Workspace } from './api';
import type { WorkspaceData } from './data';
import type { Dict, Lang } from './i18n';
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
            <ul className="plain-list">
              {s.members.map(m => (
                <li key={m.id} data-sync={name.get(m.id)}>
                  <span><b>{name.get(m.id)}</b> <span className="synctag">{m.id === s.leader ? W.leaderTag : W.followerTag}</span>
                    {m.issue && <><br /><span className="hint warn-text">{W.issues[m.issue]}</span></>}</span>
                  <span className="sp" />
                  {m.id !== s.leader && <button type="button" className="btn btn-xs btn-text" onClick={() => void folio.setSyncLeader(m.id)}>{W.makeLeader}</button>}
                </li>
              ))}
            </ul>
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
