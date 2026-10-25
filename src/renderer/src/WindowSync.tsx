// Window sync: pick the profiles and the leader, then work in the leader's window while the others follow. The
// windows show as a grid of live pictures (the leader outlined green, one with a problem red, saying what), with
// what is repeated and how fast above them and the recent sync log below. Studio and Company; Free sees what it
// does and how to get it.
import { useEffect, useState } from 'react';
import type { SyncAction, SyncLogEntry, SyncOptions, WindowSync } from '@shared/bridge';
import { folio, type Profile, type Workspace } from './api';
import type { WorkspaceData } from './data';
import type { Dict, Lang } from './i18n';
import { Flag } from './Flag';
import { Select } from './Select';
import { Icon, useToast } from './ui';

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
  const [opts, setOpts] = useState<SyncOptions | null>(null);
  useEffect(() => { void folio.syncOptions().then(setOpts); }, []);
  const s = data.sync;
  const running = (id: string) => data.status[id]?.state === 'running';
  // Open ones first, the way they will most often be picked.
  const order = [...profiles].sort((a, b) => Number(running(b.id)) - Number(running(a.id)));
  // The flag of where a profile's proxy last went out.
  const country = (id: string) => {
    const p = profiles.find(x => x.id === id), px = p?.proxyId ? data.proxies.find(x => x.id === p.proxyId) : null;
    return px?.lastCheck?.ok ? px.lastCheck.geo?.country ?? null : null;
  };

  async function start(){
    setBusy(true);
    const lead = leader && picked.includes(leader) ? leader : picked[0];
    const r = await folio.startWindowSync(picked, lead);
    setBusy(false);
    if (r) toast(d.profiles.done.syncing(name.get(r.leader) ?? '', r.members.length - 1)); else toast(d.profiles.done.syncFailed, undefined, 'bad');
  }
  async function tile(){
    setBusy(true);
    const r = await folio.tileWindows();
    setBusy(false);
    setTiled(r && [W.tiled(r.moved, r.moved + r.missed), r.why && W.tileMissed[r.why]].filter(Boolean).join(' '));
  }
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const change = (c: Partial<SyncOptions>) => void folio.setSyncOptions(c).then(setOpts);

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{W.title}</h1></div>
          {s && ws.subscription.plan !== 'free' && <>
            <span className="sp" />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void tile()}><Icon name="grid" />{busy ? W.tiling : W.tile}</button>
            <button type="button" className="btn btn-primary" onClick={() => { setTiled(null); void folio.stopWindowSync(); }}><Icon name="stop" />{W.stop}</button>
          </>}
        </header>
        {ws.subscription.plan === 'free' ? (
          <section className="sync-up" aria-label={W.title}>
            <h2>{W.upsell.title}</h2>
            <p className="hint">{W.upsell.lead}</p>
            <ul>{W.upsell.points.map(x => <li key={x}><Icon name="check" />{x}</li>)}</ul>
            <p className="hint">{W.upgrade}</p>
            {ws.role !== 'member'
              ? <button type="button" className="btn btn-primary" onClick={() => folio.openSite(`/${lang}/checkout/?ws=${ws.id}`)}>{d.plan.upgrade}</button>
              : <p className="hint">{W.upsell.ask}</p>}
          </section>
        ) : s ? (
          <section className="sync-on" aria-label={W.current}>
            <div className="wbar">
              <span className="wlab" id="ws-leader">{W.leaderTag}</span>
              <Select variant="sm" labelledBy="ws-leader" value={s.leader} onChange={id => void folio.setSyncLeader(id)}
                options={s.members.map(m => ({ value: m.id, label: name.get(m.id) ?? '' }))} />
              <span className="vsep" aria-hidden="true" />
              {opts && <Options d={d} opts={opts} onChange={change} />}
              <span className="sp" />
              <span className="hint">{W.synced(s.members.length - 1, s.members.filter(m => m.issue).length)}</span>
            </div>
            {tiled && <p className="hint" role="status">{tiled}</p>}
            <form className="sync-url" onSubmit={e => { e.preventDefault(); if (url.trim()) void folio.syncGoto(url.trim()); setUrl(''); }}>
              <input aria-label={W.address} placeholder={W.addressPh} value={url} onChange={e => setUrl(e.target.value)} spellCheck={false} />
              <button type="submit" className="btn btn-sm btn-secondary">{W.open}</button>
            </form>
            <Windows d={d} sync={s} profiles={profiles} country={country} />
            <Log d={d} lang={lang} sync={s} name={id => name.get(id) ?? ''} />
          </section>
        ) : (
          <section className="sync-pick" aria-label={W.pick}>
            <h2>{W.pick}</h2>
            <ul>
              {order.map(p => (
                <li key={p.id} className={picked.includes(p.id) ? 'on' : ''}>
                  <label className="check-row"><input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                    <Flag country={country(p.id)} kernel={p.kernel} /><span>{p.name}</span>{running(p.id) && <span className="d good" aria-label={W.running} />}</label>
                  <span className="sp" />
                  {picked.includes(p.id) && (
                    <label className="check-row"><input type="radio" name="leader" checked={(leader && picked.includes(leader) ? leader : picked[0]) === p.id} onChange={() => setLeader(p.id)} />{W.leaderTag}</label>
                  )}
                </li>
              ))}
            </ul>
            {opts && <div className="wbar plain"><Options d={d} opts={opts} onChange={change} /></div>}
            <div className="d-actions"><button type="button" className="btn btn-primary" disabled={picked.length < 2 || busy} onClick={() => void start()}>{busy ? W.starting : W.start(picked.length)}</button></div>
          </section>
        )}
      </main>
    </div>
  );
}

// What the followers repeat, and the random pause before each repeat.
function Options({ d, opts, onChange }: { d: Dict; opts: SyncOptions; onChange(c: Partial<SyncOptions>): void }){
  const W = d.windowSync;
  const [min, max] = opts.delay;
  const delay = (i: 0 | 1, v: string) => { const next: [number, number] = [min, max]; next[i] = Number(v); onChange({ delay: next }); };
  return <>
    <span className="wlab">{W.ops.label}</span>
    <span className="sopts" role="group" aria-label={W.ops.label}>
      {(['click', 'typing', 'scroll'] as const).map(k => (
        <button key={k} type="button" className="so" aria-pressed={opts[k]} onClick={() => onChange({ [k]: !opts[k] })}>
          <Icon name={k === 'click' ? 'pointer' : k === 'typing' ? 'keyboard' : 'scrollV'} />{W.ops[k]}
        </button>
      ))}
    </span>
    <span className="so-delay">{W.delay}
      <input key={`a${min}`} type="number" min={0} max={5} step={0.1} defaultValue={min} aria-label={W.delayMin} onBlur={e => delay(0, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />–
      <input key={`b${max}`} type="number" min={0} max={5} step={0.1} defaultValue={max} aria-label={W.delayMax} onBlur={e => delay(1, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />{W.seconds}
    </span>
  </>;
}

// The synced windows as live pictures: the leader first, outlined green; a window with a problem outlined red, saying what.
function Windows({ d, sync, profiles, country }: { d: Dict; sync: WindowSync; profiles: Profile[]; country(id: string): string | null }){
  const W = d.windowSync;
  const [shots, setShots] = useState<Record<string, string>>({});
  useEffect(() => {
    void folio.watchSyncThumbs(true);
    const off = folio.onSyncThumbs(t => setShots(old => ({ ...old, ...t })));
    return () => { off(); void folio.watchSyncThumbs(false); };
  }, []);
  return (
    <div className="wgrid">
      {sync.members.map(m => {
        const p = profiles.find(x => x.id === m.id), lead = m.id === sync.leader;
        return (
          <article key={m.id} className={`win${lead ? ' lead' : ''}${m.issue ? ' bad' : ''}`} data-id={m.id} data-sync={p?.name} aria-label={p?.name}>
            <header className="win-h">
              {p && <Flag country={country(m.id)} kernel={p.kernel} />}
              <b>{p?.name}</b>
              {lead && <span className="lead-tag">{W.leaderTag}</span>}
              <span className="sp" />
              {lead ? <span className="hint">{W.workHere}</span>
                : m.issue ? <span className="st bad"><Icon name="alert" />{m.issue === 'coords' ? W.notFound(null) : W.failed}</span>
                : <span className="st run"><Icon name="check" />{W.inSync}</span>}
              {!lead && <button type="button" className="btn btn-xs btn-text" onClick={() => void folio.setSyncLeader(m.id)}>{W.makeLeader}</button>}
            </header>
            <div className="win-shot">
              {shots[m.id] ? <img className="thumb" src={shots[m.id]} alt="" /> : <span className="hint">{W.shotWait}</span>}
              {m.issue && <p className="win-bad"><Icon name="alert" />{W.issues[m.issue](m.label ?? null)}</p>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// What the leader did and how many followers repeated it, newest first.
function Log({ d, lang, sync, name }: { d: Dict; lang: Lang; sync: WindowSync; name(id: string): string }){
  const W = d.windowSync;
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  useEffect(() => { void folio.syncLog().then(setLog); return folio.onSyncLog(setLog); }, []);
  const time = (at: number) => new Date(at).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const short = (url: string) => { const s = url.replace(/^https?:\/\//, ''); return s.length > 60 ? `${s.slice(0, 59)}…` : s; };
  const said = (a: SyncAction) => (a.t === 'click' ? W.did.click(a.label) : a.t === 'text' ? W.did.text(a.text.length > 40 ? `${a.text.slice(0, 39)}…` : a.text)
    : a.t === 'key' ? W.did.key(a.key) : a.t === 'scroll' ? W.did.scroll(a.px) : a.t === 'goto' ? W.did.goto(short(a.url)) : W.did.tab[a.tab](a.n));
  return (
    <section className="sync-log" aria-label={W.log}>
      <header className="sec-row"><h2>{W.log}</h2></header>
      {log.length ? (
        <ol>
          {log.map(e => (
            <li key={e.id} data-entry={e.action.t}>
              <time>{time(e.at)}</time>
              <div>{said(e.action)}{e.problems.map(x => <small key={x.id}>{name(x.id)} {x.issue === 'coords' ? W.notFound(x.label) : W.failed}</small>)}</div>
              <span className={`n${e.problems.length ? ' bad' : ''}`}>{e.ok} / {e.of}</span>
            </li>
          ))}
        </ol>
      ) : <p className="hint">{W.logEmpty}</p>}
    </section>
  );
}
