import { useEffect, useMemo, useState } from 'react';
import { MANAGE, can, folio, isApiError, type Extension, type Group, type Profile, type Workspace } from './api';
import { ENGINES, engineName, health, type Fix, type Health } from './checks';
import { kernelKey, type BatchAction, type WorkspaceData } from './data';
import { errorText, type Dict, type Lang } from './i18n';
import { ProfileDetail, busyLabel, elsewhere } from './ProfileDetail';
import { dayLabel, time, useActivity } from './Activity';
import { Avatar, BulkBar, DetailDialog, Icon, LoadFailed, Modal, MoreMenu, ViewSwitch, percent, useNow, useToast, useView } from './ui';
import { Select } from './Select';
import { ExitMap, type Pin, type PinState } from './ExitMap';
import { Flag, SEARCH_LOGOS } from './Flag';
import { SEARCH_IDS, type SearchEngine } from '@shared/search';
import { mod } from './CommandPalette';
import { byProfile, risks, type Risk } from './risks';

export type GroupFilter = 'all' | 'none' | string;
type Status = 'all' | 'running' | 'stopped' | 'issues' | 'starred';
// An engine and its major version ('chromium:150'), or every one.
type Engine = 'all' | `${Profile['kernel']}:${string}`;
const engineOf = (p: Profile): Engine => `${p.kernel}:${p.kernelVersion.split('.')[0]}`;
type Sort = 'recent' | 'name' | 'latency';
type ProfileStatus = WorkspaceData['status'][string];
type Progress = WorkspaceData['progress'][string];

interface Props {
  d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; group: GroupFilter; setGroup(g: GroupFilter): void;
  // Only these profiles (picked from a risk or a proxy), and the one whose details open first.
  only: Set<string> | null; setOnly(s: Set<string> | null): void; openId: string | null;
  onNew(): void; onImport(): void; onEdit(id: string): void; onAddProxy(): void; onPalette(): void;
}

const number = (p: Profile) => String(p.number).padStart(4, '0');

export function ProfilesPage({ d, lang, ws, data, group, setGroup, only, setOnly, openId, onNew, onImport, onEdit, onAddProxy, onPalette }: Props){
  const toast = useToast();
  const P = d.profiles;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [engine, setEngine] = useState<Engine>('all');
  // The profile whose group is being picked from its ⋯ menu.
  const [moving, setMoving] = useState<Profile | null>(null);
  const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useView<'list' | 'cards'>('profiles', 'list');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [cur, setCur] = useState(openId);
  const [detail, setDetail] = useState(!!openId);
  const [confirm, setConfirm] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [tag, setTag] = useState('');
  const [busyFix, setBusyFix] = useState<string | null>(null);
  // Whether the risk list is open.
  const [riskOpen, setRiskOpen] = useState(false);
  // Profiles opened together from the bulk actions, shown in the tray; why the ones that couldn't start didn't.
  const [batch, setBatch] = useState<string[] | null>(null);
  const [batchFail, setBatchFail] = useState<Record<string, string>>({});

  const all = useMemo(() => data.profiles ?? [], [data.profiles]);
  const proxies = useMemo(() => new Map(data.proxies.map(p => [p.id, p])), [data.proxies]);
  const extensions = useMemo(() => new Map(data.extensions.map(x => [x.id, x])), [data.extensions]);
  const groupName = useMemo(() => new Map(data.groups.map(g => [g.id, g.name])), [data.groups]);
  const healthOf = useMemo(() => new Map(all.map(p => [p.id, health(p, proxies, data.kernels)])), [all, proxies, data.kernels]);
  const riskList = useMemo(() => risks(all, id => proxies.get(id)?.name ?? ''), [all, proxies]);
  const riskOf = useMemo(() => byProfile(riskList), [riskList]);
  const risky = (id: string) => (riskOf.get(id) ?? []).some(r => r.level !== 'info');
  const now = useNow(Object.values(data.status).some(s => s.state === 'running'));
  const manager = can(data.role, MANAGE);
  const email = useMemo(() => new Map(data.members.map(m => [m.userId, m.email])), [data.members]);
  const groupLabel = (p: Profile) => (p.groupId ? groupName.get(p.groupId) ?? d.groups.none : d.groups.none);
  const issue = (p: Profile) => healthOf.get(p.id)!.level !== 'ok' || risky(p.id);
  const running = all.filter(p => data.status[p.id]?.state === 'running').length;
  const counts: Record<Status, number> = {
    all: all.length, running: all.filter(p => data.status[p.id]).length, stopped: all.filter(p => !data.status[p.id]).length,
    issues: all.filter(issue).length, starred: all.filter(p => p.starred).length
  };
  const engines = [...new Set(all.map(engineOf))].sort();

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const h = (p: Profile) => healthOf.get(p.id)!;
    let out = all.filter(p => (group === 'all' || (group === 'none' ? !p.groupId : p.groupId === group)) && (!only || only.has(p.id)) && (engine === 'all' || engineOf(p) === engine));
    if (status === 'running') out = out.filter(p => data.status[p.id]);
    if (status === 'stopped') out = out.filter(p => !data.status[p.id]);
    if (status === 'issues') out = out.filter(issue);
    if (status === 'starred') out = out.filter(p => p.starred);
    if (needle) out = out.filter(p => {
      const g = h(p).geo;
      return [p.name, `#${number(p)}`, g?.city, g?.country, g?.countryName, groupLabel(p), d.os[p.os], ...p.tags].join(' ').toLowerCase().includes(needle);
    });
    const recent = (p: Profile) => (data.status[p.id] ? 1e15 + (data.status[p.id].startedAt ?? 0) : Date.parse(p.lastOpenedAt ?? p.createdAt));
    const latency = (p: Profile) => {
      const s = h(p).proxy, ms = h(p).px?.lastCheck?.ms ?? 0;
      return s === 'down' ? 1e9 : s === 'ok' || s === 'slow' ? ms : 1e8;
    };
    const by: Record<Sort, (a: Profile, b: Profile) => number> = {
      recent: (a, b) => recent(b) - recent(a),
      name: (a, b) => a.name.localeCompare(b.name, lang, { numeric: true }),
      latency: (a, b) => latency(a) - latency(b)
    };
    // Favourites first, then the chosen order.
    return out.sort((a, b) => Number(b.starred) - Number(a.starred) || by[sort](a, b));
  }, [all, group, engine, status, q, sort, healthOf, data.status, lang, groupName, d, only, riskOf]);

  const ids = [...sel].filter(id => all.some(p => p.id === id));
  const shownSel = list.filter(p => sel.has(p.id)).length;
  // The details dialog shows only while a profile is picked.
  const curProfile = (detail && all.find(p => p.id === cur)) || null;
  const recent = useActivity(ws.id, `&profileId=${cur ?? ''}`, data, 10, !!curProfile);
  const filtered = group !== 'all' || engine !== 'all' || status !== 'all' || !!q || !!only;

  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  const why = (w: 'kernel_missing' | 'download_failed') => (w === 'kernel_missing' ? d.launch.kernel_missing : d.launch.download_failed);
  async function open(p: Profile){
    const w = await data.launch(p);
    if (w === 'kernel_missing'){ setCur(p.id); setDetail(true); toast(d.profiles.done.failed(p.name, why(w)), undefined, 'bad'); }
    else if (w) toast(why(w), undefined, 'bad');
  }
  // Several at once: their progress goes to the tray instead of toasts.
  function launch(p: Profile){
    setBatchFail(m => { const n = { ...m }; delete n[p.id]; return n; });
    void data.launch(p).then(w => { if (w) setBatchFail(m => ({ ...m, [p.id]: why(w) })); });
  }
  function openMany(targets: Profile[]){
    if (targets.length < 2){ targets.forEach(p => void open(p)); return; }
    setBatch(targets.map(p => p.id));
    targets.forEach(launch);
  }
  const stop = (p: Profile) => folio.stopProfile(p.id);
  async function exportCookies(list: Profile[], format: 'json' | 'netscape'){
    const r = await folio.exportCookies(list.map(p => ({ id: p.id, name: p.name, number: p.number })), format);
    if (!r) return;
    if (r.saved) toast(d.detail.exported(r.saved, r.path));
    r.failed.forEach(f => toast(d.detail.exportFailed(f.name, errorText(d, f.code)), undefined, 'bad'));
  }
  async function importCookies(p: Profile, text: string){
    try { toast(d.detail.imported((await folio.importCookies(p.id, text)).count)); } catch (e){ fail(e); }
  }

  // Frees the profile from the other computer (its browser closes there) and opens it here.
  async function takeover(p: Profile){
    try {
      await folio.api('POST', `/profiles/${p.id}/lock/takeover`);
      await open(p);
    } catch (e){ fail(e); }
  }

  // Window sync is a Studio and Company feature; the selected profiles sync in list order, the first one leading.
  const syncAllowed = ws.subscription.plan !== 'free';
  async function startSync(){
    const s = await folio.startWindowSync(list.filter(p => sel.has(p.id)).map(p => p.id));
    if (s) toast(P.done.syncing(all.find(p => p.id === s.leader)?.name ?? '', s.members.length - 1)); else toast(P.done.syncFailed, undefined, 'bad');
  }
  async function batchAction(action: BatchAction, extra: Parameters<WorkspaceData['batch']>[2], done: (n: number) => string){
    try { toast(done(await data.batch(action, ids, extra))); } catch (e){ fail(e); }
  }
  async function trash(targets: string[]){
    setConfirm(false);
    await Promise.all(targets.filter(id => data.status[id]).map(id => folio.stopProfile(id)));
    try {
      const n = await data.batch('trash', targets);
      setSel(new Set());
      if (targets.includes(cur ?? '')){ setCur(null); setDetail(false); }
      toast(P.done.trashed(n), { label: d.common.undo, fn: () => { data.batch('restore', targets).catch(fail); } });
    } catch (e){ fail(e); }
  }

  async function fix(p: Profile, f: Fix){
    const key = `${f.kind}:${'proxyId' in f ? f.proxyId : 'version' in f ? f.version : ''}`;
    setBusyFix(key);
    try {
      let ok = true;
      if (f.kind === 'check') await data.check([f.proxyId]);
      else if (f.kind === 'backup') ok = await data.patch(p, { proxyId: f.proxyId });
      else if (f.kind === 'follow-tz') ok = await data.patch(p, { timezoneOverride: null });
      else if (f.kind === 'follow-lang') ok = await data.patch(p, { localeOverride: null });
      else if (f.kind === 'use-engine') ok = await data.patch(p, { kernelVersion: f.version });
      else if (f.kind === 'download'){ if (!(await data.install(p.kernel, f.version))) toast(d.launch.download_failed, undefined, 'bad'); }
      else onEdit(p.id);
      if (!ok) toast(P.done.stale, undefined, 'bad');
    } catch (e){ fail(e); } finally { setBusyFix(null); }
  }

  async function star(p: Profile){
    try { await folio.api(p.starred ? 'DELETE' : 'PUT', `/profiles/${p.id}/star`); } catch (e){ fail(e); }
    data.refresh('profiles');
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(s => {
    const n = new Set(s);
    if (shownSel === list.length) list.forEach(p => n.delete(p.id)); else list.forEach(p => n.add(p.id));
    return n;
  });
  const pick = (id: string) => { setCur(id); setDetail(true); };

  const h = [...healthOf.values()];
  const down = h.filter(x => x.proxy === 'down').length, slow = h.filter(x => x.proxy === 'slow').length;
  // A pin per exit, showing the busiest state of the profiles that go out there.
  const pins = useMemo(() => {
    const rank: PinState[] = ['run', 'boot', 'bad', 'warn', 'idle'];
    const at = new Map<string, Pin>();
    for (const p of all){
      const x = healthOf.get(p.id)!, g = x.geo;
      if (!g) continue;
      const key = g.city ?? g.countryName;
      const s = data.status[p.id];
      const st: PinState = s?.state === 'running' ? 'run' : s ? 'boot' : x.level === 'bad' ? 'bad' : x.level === 'warn' ? 'warn' : 'idle';
      const pin = at.get(key) ?? { key, lat: g.lat, lon: g.lon, state: 'idle' as PinState, title: [g.city, g.countryName].filter(Boolean).join(', '), lines: [] };
      if (rank.indexOf(st) < rank.indexOf(pin.state)) pin.state = st;
      pin.lines.push(st === 'run' ? `${p.name} · ${P.st.running}` : p.name);
      at.set(key, pin);
    }
    return [...at.values()];
  }, [all, healthOf, data.status, P]);
  // Where profiles moved from, as lines on the map.
  const links = riskList.filter(r => r.from && r.to).map(r => ({ from: r.from!, to: r.to!, level: r.level === 'bad' ? 'bad' as const : 'warn' as const }));
  const shown = riskList.filter(r => r.level !== 'info');
  const names = (r: Risk) => r.ids.map(id => all.find(p => p.id === id)?.name).filter(Boolean).join(lang === 'zh' ? '、' : ', ');

  const item = (p: Profile): ItemProps => ({
    d, lang, p, h: healthOf.get(p.id)!, cur: p.id === curProfile?.id, checked: sel.has(p.id), risky: risky(p.id), manager, group: data.groups.find(g => g.id === p.groupId) ?? null,
    owner: p.ownerId ? email.get(p.ownerId) ?? null : null,
    sync: data.sync?.leader === p.id ? 'leader' : data.sync?.members.some(m => m.id === p.id) ? 'follower' : null,
    status: data.status[p.id], progress: data.progress[kernelKey(p.kernel, p.kernelVersion)], checking: !!p.proxyId && data.checking.has(p.proxyId),
    onToggle: () => toggle(p.id), onView: () => pick(p.id), onOpen: () => void open(p), onStop: () => void stop(p), onStar: () => void star(p),
    onCheck: () => { if (p.proxyId) void data.check([p.proxyId]); }, onEdit: () => onEdit(p.id), onTrash: () => void trash([p.id]), onMove: () => setMoving(p)
  });
  async function move(p: Profile, groupId: string | null){
    setMoving(null);
    try { await data.batch('move', [p.id], { groupId }); toast(P.done.moved(1, groupId ? groupName.get(groupId) ?? '' : d.groups.none)); } catch (e){ fail(e); }
  }
  const failed = data.loadFailed.has('profiles');
  const empty = failed
    ? <LoadFailed d={d} onRetry={() => data.refresh('profiles')} />
    : data.profiles !== null && !list.length && (all.length
      ? <><p><b>{P.emptyMatch}</b> {q && P.emptyFor(q)} {P.emptyHint(all.length)}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setStatus('all'); setEngine('all'); setGroup('all'); setOnly(null); }}>{P.clearFilters}</button></>
      : <p><b>{P.emptyNone}</b></p>);

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{P.title}</h1><p className="sub">{P.lead}</p></div>
          <label className="search">
            <Icon name="search" /><span className="sr">{P.search}</span>
            <input type="search" placeholder={P.searchPh} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
            <button type="button" className="kbd-btn" title={P.palette} aria-label={P.palette} onClick={onPalette}><kbd>{mod} K</kbd></button>
          </label>
          {manager && <button className="btn btn-secondary" type="button" onClick={onImport}>{P.import}</button>}
          <button className="btn btn-primary" type="button" onClick={onNew}><Icon name="plus" />{P.new}</button>
        </header>

        <section className="cards" aria-label={P.title}>
          <button type="button" className="kc" onClick={() => setStatus('running')}>
            <span className="kc-h"><span className="kic good"><Icon name="play" /></span><small>{P.sum.running}</small></span><b>{running}</b>
          </button>
          <button type="button" className="kc" onClick={() => setStatus('issues')} title={P.sum.proxyNote(down, slow) || P.sum.proxyOk}>
            <span className="kc-h"><span className="kic bad"><Icon name="proxies" /></span><small>{P.sum.proxy}</small></span><b>{down + slow}</b>
          </button>
          <button type="button" className="kc" onClick={() => setRiskOpen(o => !o)} title={shown.length ? d.risks.title(shown.length) : P.sum.risksOk}>
            <span className="kc-h"><span className="kic warn"><Icon name="alert" /></span><small>{P.sum.risks}</small></span><b>{shown.length}</b>
          </button>
          <section className="map-card" aria-label={P.map.label}>
            <ExitMap pins={pins} links={links} label={P.map.label} onPick={key => setQ(key)} />
            {!pins.length && manager && (
              <div className="map-empty">
                {data.proxies.length
                  ? <button type="button" className="btn btn-sm btn-secondary" disabled={data.checking.size > 0} onClick={() => void data.check(data.proxies.map(p => p.id))}>{P.map.check}</button>
                  : <button type="button" className="btn btn-sm btn-secondary" onClick={onAddProxy}>{P.map.add}</button>}
              </div>
            )}
          </section>
        </section>

        {shown.length > 0 && (
          <section className={`risk-bar${shown.some(r => r.level === 'bad') ? ' bad' : ''}`} aria-label={d.risks.title(shown.length)} data-testid="risks">
            <div className="risk-h">
              <Icon name="alert" /><b>{d.risks.title(shown.length)}</b>
              {!riskOpen && <span className="risk-first">{d.risks.kinds[shown[0].kind].t(shown[0].ids.length, shown[0].what)}</span>}
              <span className="sp" />
              <button type="button" className="btn btn-sm btn-text" aria-expanded={riskOpen} onClick={() => setRiskOpen(o => !o)}>{riskOpen ? d.risks.hide : d.risks.show}</button>
            </div>
            {riskOpen && (
              <ul className="risk-list">
                {shown.map((r, i) => (
                  <li key={i} className={r.level} data-risk={r.kind}>
                    <span className={`d ${r.level === 'bad' ? 'bad' : 'warn'}`} aria-hidden="true" />
                    <div><p><b>{d.risks.kinds[r.kind].t(r.ids.length, r.what)}</b></p><p className="hint">{names(r)} · {d.risks.kinds[r.kind].fix}</p></div>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOnly(new Set(r.ids))}>{d.risks.only}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="filters">
          <span className="grp-pick"><Select label={d.groups.title} value={group} onChange={v => setGroup(v as GroupFilter)}
            options={[{ value: 'all', label: d.groups.all }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const })), { value: 'none', label: d.groups.none }]} /></span>
          <span className="grp-pick"><Select label={P.filter.engine} value={engine} onChange={v => setEngine(v as Engine)}
            options={[{ value: 'all', label: P.filter.engines }, ...engines.map(e => { const [k, v] = e.split(':'); return { value: e, label: `${ENGINES[k as Profile['kernel']]} ${v}` }; })]} /></span>
          <span className="grp-pick"><Select label={P.filter.label} value={status} onChange={v => setStatus(v as Status)}
            options={(['all', 'running', 'stopped', 'issues', 'starred'] as const).map(s => ({ value: s, label: s === 'all' ? P.filter.states : P.filter[s], hint: String(counts[s]) }))} /></span>
          {only && <button type="button" className="chip" onClick={() => setOnly(null)}>{d.risks.clear} <span aria-hidden="true">×</span></button>}
          <span className="sort"><span id="pf-sort">{P.sort}</span>
            <Select variant="sm" labelledBy="pf-sort" value={sort} onChange={v => setSort(v as Sort)} options={(['recent', 'name', 'latency'] as const).map(s => ({ value: s, label: P.sorts[s] }))} />
          </span>
          <ViewSwitch label={P.views.label} value={view} onChange={setView} options={[['list', 'list', P.views.list], ['cards', 'grid', P.views.cards]]} />
        </div>

        {data.sync && <SyncBar d={d} data={data} names={new Map(all.map(p => [p.id, p.name]))} />}

        {view === 'list' ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th className="cb" scope="col">
                    <input type="checkbox" aria-label={d.common.selectAll} checked={list.length > 0 && shownSel === list.length}
                      ref={el => { if (el) el.indeterminate = shownSel > 0 && shownSel < list.length; }} onChange={toggleAll} />
                  </th>
                  <th scope="col">{P.cols.profile}</th><th scope="col">{P.cols.group}</th><th scope="col">{P.cols.fingerprint}</th><th scope="col">{P.cols.proxy}</th>
                  <th scope="col" className="lastc">{P.cols.last}</th><th scope="col">{P.cols.member}</th><th scope="col">{P.cols.status}</th><th className="act" scope="col">{P.cols.actions}</th>
                </tr>
              </thead>
              <tbody>
                {data.profiles === null && !failed && Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="skel" aria-hidden="true"><td className="cb"><i /></td><td><i className="w2" /></td><td><i className="w3" /></td><td><i /><i className="w3" /></td><td><i /><i className="w3" /></td><td><i className="w3" /></td><td><i className="w3" /></td><td><i className="w2" /></td><td /></tr>
                ))}
                {empty && <tr className="empty"><td colSpan={9}>{empty}</td></tr>}
                {list.map(p => <Row key={p.id} {...item(p)} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {empty && <div className="cards-empty">{empty}</div>}
            <ul className="pgrid">{list.map(p => <Card key={p.id} {...item(p)} />)}</ul>
          </>
        )}
        {data.proxies.some(p => p.lastCheck?.geo) && <p className="attrib page-attrib">{d.common.attribution}</p>}

        {ids.length > 0 && (
          <BulkBar n={ids.length} label={d.common.selected(ids.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
            {tagging ? (
              <>
                <input className="bb-in" aria-label={P.bulk.tagPh} placeholder={P.bulk.tagPh} value={tag} onChange={e => setTag(e.target.value)} maxLength={24} autoFocus />
                <button type="button" className="bb" disabled={!tag.trim()} onClick={() => { void batchAction('tag', { tag: tag.trim() }, n => P.done.tagged(n, tag.trim())); setTagging(false); setTag(''); }}>{P.bulk.addTag}</button>
                <button type="button" className="bb" disabled={!tag.trim()} onClick={() => { void batchAction('untag', { tag: tag.trim() }, n => P.done.untagged(n, tag.trim())); setTagging(false); setTag(''); }}>{P.bulk.removeTag}</button>
                <button type="button" className="bb" onClick={() => setTagging(false)}>{d.common.cancel}</button>
              </>
            ) : (
              <>
                <Select variant="bar" action label={P.bulk.move} placeholder={P.bulk.move} value="" searchPh={d.form.searchPh}
                  options={[...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const })), { value: 'none', label: d.groups.none }]}
                  onChange={v => { const g = v === 'none' ? null : v; void batchAction('move', { groupId: g }, n => P.done.moved(n, g ? groupName.get(g) ?? '' : d.groups.none)); }} />
                <button type="button" className="bb" onClick={() => openMany(all.filter(p => sel.has(p.id) && !data.status[p.id] && !elsewhere(p)))}><Icon name="play" />{P.bulk.open}</button>
                <button type="button" className="bb" onClick={() => ids.forEach(id => void folio.stopProfile(id))}><Icon name="stop" />{P.bulk.stop}</button>
                <button type="button" className="bb" disabled={ids.length < 2 || !syncAllowed} title={!syncAllowed ? d.windowSync.upgrade : ids.length < 2 ? P.bulk.syncTwo : undefined} onClick={() => void startSync()}><Icon name="sync" />{P.bulk.sync}</button>
                <Select variant="bar" action label={P.bulk.proxy} placeholder={P.bulk.proxy} value="" searchPh={d.form.searchPh}
                  options={[...data.proxies.map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined })), { value: 'none', label: P.noProxy }]}
                  onChange={v => void batchAction('set-proxy', { proxyId: v === 'none' ? null : v }, P.done.proxySet)} />
                {manager && (
                  <Select variant="bar" action label={P.bulk.assign} placeholder={P.bulk.assign} value="" searchPh={d.form.searchPh}
                    options={[...data.members.map(m => ({ value: m.userId, label: m.email })), { value: 'none', label: P.unassigned }]}
                    onChange={v => { const who = v === 'none' ? null : v; void batchAction('assign', { ownerId: who }, n => P.done.assigned(n, who ? email.get(who) ?? '' : P.unassigned)); }} />
                )}
                {data.extensions.length > 0 && (
                  <Select variant="bar" action label={P.bulk.extensions} placeholder={P.bulk.extensions} value="" searchPh={d.form.searchPh}
                    options={(['add', 'remove'] as const).flatMap(how => data.extensions.map(x => ({ value: `${how}:${x.id}`, label: `${x.name} · ${ENGINES[x.kernel]}`, group: how === 'add' ? P.bulk.install : P.bulk.uninstall })))}
                    onChange={v => {
                      const [how, id] = v.split(':');
                      const x = extensions.get(id)!;
                      void batchAction(how === 'add' ? 'add-extension' : 'remove-extension', { extensionId: id }, n => (how === 'add' ? P.done.extAdded(n, x.name, ids.length - n) : P.done.extRemoved(n, x.name)));
                    }} />
                )}
                <Select variant="bar" action label={d.browser.bulk} placeholder={d.browser.bulk} value=""
                  options={[
                    ...SEARCH_IDS.map(id => ({ value: `se:${id}`, label: d.browser.name(id), group: d.browser.search, ...(id !== 'none' ? { img: SEARCH_LOGOS[id] } : {}) })),
                    ...(['on', 'off'] as const).map(v => ({ value: `tabs:${v}`, label: d.browser[v], group: d.browser.restore }))
                  ]}
                  onChange={v => {
                    const [what, x] = v.split(':');
                    if (what === 'se') void batchAction('set-browser', { searchEngine: x }, n => d.browser.searchSet(n, d.browser.name(x as SearchEngine)));
                    else void batchAction('set-browser', { restoreTabs: x === 'on' }, n => d.browser.tabsSet(n, x === 'on'));
                  }} />
                <button type="button" className="bb" onClick={() => setTagging(true)}>{P.bulk.tag}</button>
                {manager && (
                  <Select variant="bar" action label={P.bulk.cookies} placeholder={P.bulk.cookies} value=""
                    options={[{ value: 'json', label: d.detail.json }, { value: 'netscape', label: d.detail.netscape }]}
                    onChange={v => void exportCookies(all.filter(p => sel.has(p.id)), v as 'json' | 'netscape')} />
                )}
                {manager && <button type="button" className="bb danger" onClick={() => setConfirm(true)}><Icon name="trash" />{P.bulk.trash}</button>}
              </>
            )}
          </BulkBar>
        )}
        {confirm && ids.length > 0 && (
          <Modal icon="trash" tone="bad" title={P.bulk.confirm(ids.length)} closeLabel={d.common.close} onClose={() => setConfirm(false)} foot={<>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{d.common.cancel}</button>
            <button type="button" className="btn btn-danger solid" onClick={() => void trash(ids)}>{P.bulk.doTrash}</button>
          </>}><p>{P.bulk.confirmNote}</p></Modal>
        )}
        {moving && (
          <Modal title={P.moveTitle(moving.name)} closeLabel={d.common.close} onClose={() => setMoving(null)}>
            <ul className="m-body move-list">
              {[...data.groups.map(g => ({ id: g.id as string | null, name: g.name, color: g.color })), { id: null, name: d.groups.none, color: null }].map(g => (
                <li key={g.id ?? 'none'}>
                  <button type="button" className="move-to" aria-current={moving.groupId === g.id} onClick={() => void move(moving, g.id)}>
                    <span className={g.color ? `sq gc-${g.color}` : 'sq'} aria-hidden="true" />{g.name}{moving.groupId === g.id && <Icon name="check" />}
                  </button>
                </li>
              ))}
            </ul>
          </Modal>
        )}
      </main>

      {batch && <Tray d={d} data={data} profiles={batch.map(id => all.find(p => p.id === id)).filter((p): p is Profile => !!p)} failed={batchFail}
        onRetry={launch} onClose={() => setBatch(null)} />}

      {curProfile && (
        <DetailDialog label={d.detail.profile} onClose={() => setDetail(false)}>
          <ProfileDetail
            d={d} lang={lang} p={curProfile} h={healthOf.get(curProfile.id)!} now={now} busy={busyFix}
            status={data.status[curProfile.id]} progress={data.progress[kernelKey(curProfile.kernel, curProfile.kernelVersion)]}
            size={data.kernels.find(k => k.kind === curProfile.kernel && k.version === curProfile.kernelVersion)?.size ?? null} failed={data.failed[curProfile.id]}
            risks={riskOf.get(curProfile.id) ?? []} others={all} onStar={() => void star(curProfile)}
            group={data.groups.find(g => g.id === curProfile.groupId) ?? null} owner={curProfile.ownerId ? email.get(curProfile.ownerId) ?? null : null}
            extensions={curProfile.extensionIds.map(id => extensions.get(id)).filter((x): x is Extension => !!x)}
            activity={recent.entries ?? []}
            onClose={() => setDetail(false)} onOpen={() => void open(curProfile)} onStop={() => void stop(curProfile)}
            onEdit={() => onEdit(curProfile.id)} onTrash={() => void trash([curProfile.id])}
            canTakeOver={manager} canTrash={manager} canExport={manager} onTakeover={() => void takeover(curProfile)}
            onExport={format => void exportCookies([curProfile], format)} onImport={text => void importCookies(curProfile, text)}
            onFix={f => void fix(curProfile, f)}
          />
        </DetailDialog>
      )}
    </div>
  );
}

interface ItemProps {
  d: Dict; lang: Lang; p: Profile; h: Health; cur: boolean; checked: boolean; sync: 'leader' | 'follower' | null; owner: string | null; manager: boolean;
  group: Group | null; status?: ProfileStatus; progress?: Progress; checking: boolean; risky: boolean;
  onToggle(): void; onView(): void; onOpen(): void; onStop(): void; onCheck(): void; onStar(): void; onEdit(): void; onTrash(): void; onMove(): void;
}

// What the profile is doing: a coloured dot and a word.
function Status({ d, p, h, status, progress }: ItemProps){
  const P = d.profiles, away = elsewhere(p);
  const downloading = progress && !progress.finished && !progress.error;
  const [tone, text] = status?.state === 'running' ? ['run', P.st.running]
    : status ? ['boot', status.state === 'saving' ? busyLabel(d, status.state) : status.state === 'restoring' ? P.stage.restore : status.stage === 'launch' ? P.stage.launch : P.stage.proxy]
    : downloading ? ['boot', P.downloading(percent(progress))]
    : away ? ['away', P.inUseOn(away.deviceName ?? away.email)]
    : h.checks[0]?.id === 'proxy-down' ? ['bad', P.st.proxyDown]
    : ['idle', P.st.idle];
  return <span className={`dot-st ${tone}`} title={away?.email} role={tone === 'boot' ? 'status' : undefined}>{text}</span>;
}

// Everything to do with the profile, in its ⋯ menu.
function Actions({ d, p, h, status, progress, checking, manager, onOpen, onStop, onCheck, onEdit, onMove, onTrash }: ItemProps){
  const P = d.profiles, busy = !!status && status.state !== 'running';
  return <MoreMenu label={P.actionsX(p.name)} items={[
    status?.state === 'running' ? { label: P.stop, onClick: onStop } : { label: P.open, onClick: onOpen, disabled: busy || !!(progress && !progress.finished && !progress.error) || !!elsewhere(p) },
    ...(h.checks[0]?.id === 'proxy-down' ? [{ label: P.checkProxy, onClick: onCheck, disabled: checking }] : []),
    { label: d.detail.edit, onClick: onEdit }, { label: P.move, onClick: onMove },
    ...(manager ? [{ label: d.detail.trash, onClick: onTrash, danger: true }] : [])
  ]} />;
}

// Its proxy: where it exits (country and IP, once checked) and the line's type; or none.
function ProxyCell({ d, h }: ItemProps){
  if (!h.px) return <span className="l1 muted">{d.profiles.noProxy}</span>;
  const ip = h.px.lastCheck?.ip, cc = h.geo?.country;
  return <>
    <span className="l1 px-exit"><Flag country={cc ?? null} size="xs" />{ip ? `${cc ?? ''} ${ip}`.trim() : h.px.name}</span>
    <span className="l2">{h.px.type.toUpperCase()}</span>
  </>;
}

// When it was last opened: the time today or yesterday, else the date.
function lastOpened(iso: string | null, d: Dict, lang: Lang){
  if (!iso) return '—';
  const label = dayLabel(iso, d, lang);
  return label === d.activity.today || label === d.activity.yesterday ? `${label} ${time(iso, lang)}` : new Date(iso).toLocaleDateString('sv-SE');
}

function Name({ d, p, risky, onView, onStar }: ItemProps){
  return (
    <span className="prof-cell"><span className="l1"><button type="button" className="rowlink" onClick={onView}>{p.name}</button><Star d={d} p={p} onStar={onStar} />
      {risky && <span className="risk-flag" title={d.risks.flag}><Icon name="alert" /><span className="sr">{d.risks.flag}</span></span>}
      {p.tags.map(t => <span key={t} className="tag">{t}</span>)}</span></span>
  );
}

// Its group as a tag in the group's colour.
const GroupTag = ({ group }: ItemProps) => (group ? <span className={`gtag gc-${group.color}`}>{group.name}</span> : <span className="muted">—</span>);

function Star({ d, p, onStar }: { d: Dict; p: Profile; onStar(): void }){
  const P = d.profiles;
  return <button type="button" className={`star${p.starred ? ' on' : ''}`} aria-pressed={p.starred} aria-label={p.starred ? P.unstar : P.star} title={p.starred ? P.unstar : P.star} onClick={onStar}><Icon name="star" /></button>;
}

function Row(props: ItemProps){
  const { d, lang, p, h, cur, checked, sync, owner, onToggle, onView } = props;
  return (
    <tr className={cur ? 'cur' : ''} data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a,.menu')) onView(); }}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td className="prof"><Name {...props} /></td>
      <td><GroupTag {...props} /></td>
      <td><span className="l1">{d.os[p.os]}</span><span className="l2">{h.mismatch ? <span className="flag warn">{d.profiles.mismatch}</span> : engineName(p.kernel, p.kernelVersion)}</span></td>
      <td><ProxyCell {...props} /></td>
      <td className="lastc mono">{lastOpened(p.lastOpenedAt, d, lang)}</td>
      <td>{owner ? <Avatar text={owner} small title={owner} /> : <span className="muted">—</span>}</td>
      <td><Status {...props} />{sync && <span className="synctag">{sync === 'leader' ? d.windowSync.leaderTag : d.windowSync.followerTag}</span>}</td>
      <td className="act"><Actions {...props} /></td>
    </tr>
  );
}

function Card(props: ItemProps){
  const { d, p, h, cur, checked, onToggle, onView } = props;
  return (
    <li className={`pcard${cur ? ' cur' : ''}`} data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a,.menu')) onView(); }}>
      <div className="pc-top">
        <Name {...props} />
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} />
      </div>
      {props.group && <div><GroupTag {...props} /></div>}
      <div className="pc-px"><ProxyCell {...props} /></div>
      <p className="pc-fp">{d.os[p.os]} · {h.mismatch ? <span className="flag warn">{d.profiles.mismatch}</span> : engineName(p.kernel, p.kernelVersion)}</p>
      <div className="pc-foot"><Status {...props} /><Actions {...props} /></div>
    </li>
  );
}

// Profiles opened together: each one's progress, why it couldn't open, and a retry. Folds away; goes once they all opened.
function Tray({ d, data, profiles, failed, onRetry, onClose }: { d: Dict; data: WorkspaceData; profiles: Profile[]; failed: Record<string, string>; onRetry(p: Profile): void; onClose(): void }){
  const T = d.batchOpen, P = d.profiles;
  const [folded, setFolded] = useState(false);
  const rows = profiles.map(p => {
    const why = failed[p.id] ?? (data.failed[p.id] ? d.launch[data.failed[p.id]] ?? d.launch.launch_failed : null);
    const s = data.status[p.id], pr = data.progress[kernelKey(p.kernel, p.kernelVersion)];
    if (why) return { p, tone: 'bad', st: <span className="st bad"><Icon name="alert" />{why}</span>, pct: 100 };
    if (s?.state === 'running') return { p, tone: 'run', st: <span className="st run"><Icon name="check" />{T.opened}</span>, pct: 100 };
    if (s){
      const at = s.state === 'restoring' ? 2 : s.stage === 'launch' ? 3 : 1;
      return { p, tone: 'boot', st: <span className="st boot"><span className="spin" />{[P.stage.proxy, P.stage.proxy, P.stage.restore, P.stage.launch][at]}<span className="sub">{at + 1} / {P.stages.length}</span></span>, pct: (at + 1) * 25 };
    }
    if (pr && !pr.finished && !pr.error) return { p, tone: 'boot', st: <span className="st boot"><span className="spin" />{P.downloading(percent(pr))}<span className="sub">1 / {P.stages.length}</span></span>, pct: percent(pr) / 4 };
    return { p, tone: 'idle', st: <span className="st idle"><Icon name="pause" />{T.waiting}</span>, pct: 0 };
  });
  const settled = rows.filter(r => r.tone === 'run' || r.tone === 'bad').length;
  const allOpen = rows.every(r => r.tone === 'run');
  // Everything opened: the tray goes away by itself after a moment.
  useEffect(() => {
    if (!allOpen) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [allOpen]);
  return (
    <section className={`tray${folded ? ' folded' : ''}`} aria-label={T.title(rows.length)} role="status">
      <header className="tray-h">
        <b>{T.title(rows.length)}</b><small>{T.done(settled, rows.length)}</small>
        <button type="button" className="icon-btn bare" aria-label={folded ? T.unfold : T.fold} title={folded ? T.unfold : T.fold} onClick={() => setFolded(f => !f)}><Icon name="chev" /></button>
        {settled === rows.length && <button type="button" className="icon-btn bare" aria-label={T.close} title={T.close} onClick={onClose}><Icon name="x" /></button>}
      </header>
      <ol>
        {rows.map(r => (
          <li key={r.p.id} className={r.tone}>
            <Flag country={null} kernel={r.p.kernel} />
            <div><b>{r.p.name}</b>{r.st}<span className="meter"><i style={{ width: `${r.pct}%` }} /></span></div>
            {r.tone === 'bad' && <button type="button" className="btn btn-sm btn-secondary" onClick={() => onRetry(r.p)}>{T.retry}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}

// Above the list while windows sync: who leads, how many follow, an address for all of them, and Stop.
function SyncBar({ d, data, names }: { d: Dict; data: WorkspaceData; names: Map<string, string> }){
  const W = d.windowSync;
  const [url, setUrl] = useState('');
  const s = data.sync!;
  return (
    <div className="syncbar" role="status" aria-label={W.title}>
      <span className="d good pulse" aria-hidden="true" />
      <span><b>{W.on}</b> {W.summary(names.get(s.leader) ?? '', s.members.length - 1)}</span>
      <form className="sync-url" onSubmit={e => { e.preventDefault(); if (url.trim()) void folio.syncGoto(url.trim()); setUrl(''); }}>
        <input aria-label={W.address} placeholder={W.addressPh} value={url} onChange={e => setUrl(e.target.value)} spellCheck={false} />
        <button type="submit" className="btn btn-sm btn-secondary">{W.open}</button>
      </form>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => void folio.stopWindowSync()}>{W.stop}</button>
    </div>
  );
}
