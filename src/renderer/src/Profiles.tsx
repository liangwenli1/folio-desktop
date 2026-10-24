import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { folio, isApiError, type Extension, type Profile, type Workspace } from './api';
import { ENGINES, engineName, health, type Fix, type Health } from './checks';
import { kernelKey, type BatchAction, type WorkspaceData } from './data';
import { ago, errorText, runTime, type Dict, type Lang } from './i18n';
import { ProfileDetail, busyLabel, elsewhere } from './ProfileDetail';
import { useActivity } from './Activity';
import { BulkBar, ExtIcon, Icon, Modal, ViewSwitch, percent, useNow, useToast, useView } from './ui';
import { Select } from './Select';
import { ExitMap, type Pin, type PinState } from './ExitMap';
import { Flag, SEARCH_LOGOS } from './Flag';
import { SEARCH_IDS, type SearchEngine } from '@shared/search';
import { mod } from './CommandPalette';
import { byProfile, risks, type Risk } from './risks';

export type GroupFilter = 'all' | 'none' | string;
type Status = 'all' | 'running' | 'issues' | 'starred';
type Sort = 'recent' | 'name' | 'latency';
type ProfileStatus = WorkspaceData['status'][string];
type Progress = WorkspaceData['progress'][string];

interface Props {
  d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; group: GroupFilter; setGroup(g: GroupFilter): void;
  onNew(): void; onImport(): void; onEdit(id: string): void; onAddProxy(): void; onPalette(): void;
}

const ONBOARDING_KEY = (ws: string) => `folio.onboarding.${ws}`;
const hidden = (ws: string) => { try { return localStorage.getItem(ONBOARDING_KEY(ws)) === 'hidden'; } catch { return false; } };
const number = (p: Profile) => String(p.number).padStart(4, '0');

export function ProfilesPage({ d, lang, ws, data, group, setGroup, onNew, onImport, onEdit, onAddProxy, onPalette }: Props){
  const toast = useToast();
  const P = d.profiles;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useView<'list' | 'cards'>('profiles', 'list');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [cur, setCur] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [tag, setTag] = useState('');
  const [busyFix, setBusyFix] = useState<string | null>(null);
  const [onboardingHidden, setOnboardingHidden] = useState(() => hidden(ws.id));
  // "Show these profiles" from a risk, and whether the risk list is open.
  const [only, setOnly] = useState<Set<string> | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);
  // Profiles opened together from the bulk actions, shown in the tray; why the ones that couldn't start didn't.
  const [batch, setBatch] = useState<string[] | null>(null);
  const [batchFail, setBatchFail] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const all = useMemo(() => data.profiles ?? [], [data.profiles]);
  const proxies = useMemo(() => new Map(data.proxies.map(p => [p.id, p])), [data.proxies]);
  const extensions = useMemo(() => new Map(data.extensions.map(x => [x.id, x])), [data.extensions]);
  const groupName = useMemo(() => new Map(data.groups.map(g => [g.id, g.name])), [data.groups]);
  const healthOf = useMemo(() => new Map(all.map(p => [p.id, health(p, proxies, data.kernels)])), [all, proxies, data.kernels]);
  const riskList = useMemo(() => risks(all, id => proxies.get(id)?.name ?? ''), [all, proxies]);
  const riskOf = useMemo(() => byProfile(riskList), [riskList]);
  const risky = (id: string) => (riskOf.get(id) ?? []).some(r => r.level !== 'info');
  const now = useNow(Object.values(data.status).some(s => s.state === 'running'));
  const manager = data.role !== 'member';
  const email = useMemo(() => new Map(data.members.map(m => [m.userId, m.email])), [data.members]);
  const groupLabel = (p: Profile) => (p.groupId ? groupName.get(p.groupId) ?? d.groups.none : d.groups.none);
  const issue = (p: Profile) => healthOf.get(p.id)!.level !== 'ok' || risky(p.id);
  const running = all.filter(p => data.status[p.id]?.state === 'running').length;
  const counts: Record<Status, number> = { all: all.length, running: all.filter(p => data.status[p.id]).length, issues: all.filter(issue).length, starred: all.filter(p => p.starred).length };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const h = (p: Profile) => healthOf.get(p.id)!;
    let out = all.filter(p => (group === 'all' || (group === 'none' ? !p.groupId : p.groupId === group)) && (!only || only.has(p.id)));
    if (status === 'running') out = out.filter(p => data.status[p.id]);
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
  }, [all, group, status, q, sort, healthOf, data.status, lang, groupName, d, only, riskOf]);

  const ids = [...sel].filter(id => all.some(p => p.id === id));
  const shownSel = list.filter(p => sel.has(p.id)).length;
  // The drawer shows only while a profile is picked.
  const curProfile = (drawer && all.find(p => p.id === cur)) || null;
  const recent = useActivity(ws.id, `&profileId=${cur ?? ''}`, data, 10, !!curProfile);
  const filtered = group !== 'all' || status !== 'all' || !!q || !!only;

  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  const why = (w: 'kernel_missing' | 'download_failed') => (w === 'kernel_missing' ? d.launch.kernel_missing : d.launch.download_failed);
  async function open(p: Profile){
    const w = await data.launch(p);
    if (w === 'kernel_missing'){ setCur(p.id); setDrawer(true); toast(d.profiles.done.failed(p.name, why(w)), undefined, 'bad'); }
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
      if (targets.includes(cur ?? '')){ setCur(null); setDrawer(false); }
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
  const pick = (id: string) => { setCur(id); setDrawer(true); };

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

  const showOnboarding = !onboardingHidden && data.profiles !== null && !(data.proxies.length && all.length && all.some(p => p.lastOpenedAt));
  const hideOnboarding = () => { setOnboardingHidden(true); try { localStorage.setItem(ONBOARDING_KEY(ws.id), 'hidden'); } catch { /* per-session only */ } };

  const item = (p: Profile): ItemProps => ({
    d, p, h: healthOf.get(p.id)!, group: groupLabel(p), now, cur: p.id === curProfile?.id, checked: sel.has(p.id), risky: risky(p.id),
    exts: p.extensionIds.map(id => extensions.get(id)).filter((x): x is Extension => !!x),
    sync: data.sync?.leader === p.id ? 'leader' : data.sync?.members.some(m => m.id === p.id) ? 'follower' : null,
    status: data.status[p.id], progress: data.progress[kernelKey(p.kernel, p.kernelVersion)], checking: !!p.proxyId && data.checking.has(p.proxyId),
    onToggle: () => toggle(p.id), onView: () => pick(p.id), onOpen: () => void open(p), onStop: () => void stop(p), onStar: () => void star(p),
    onCheck: () => { if (p.proxyId) void data.check([p.proxyId]); }
  });
  const empty = data.profiles !== null && !list.length && (all.length
    ? <><p><b>{P.emptyMatch}</b> {q && P.emptyFor(q)} {P.emptyHint(all.length)}</p>
      <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setQ(''); setStatus('all'); setGroup('all'); setOnly(null); }}>{P.clearFilters}</button></>
    : <p><b>{P.emptyNone}</b></p>);

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl">
            <h1>{P.title}</h1>
            <p className="sub" data-testid="profiles-sub">{filtered ? P.showing(list.length, all.length, running) : P.sub(all.length, running)}</p>
          </div>
          <label className="search">
            <Icon name="search" /><span className="sr">{P.search}</span>
            <input type="search" placeholder={P.searchPh} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
            <button type="button" className="kbd-btn" title={P.palette} aria-label={P.palette} onClick={onPalette}><kbd>{mod} K</kbd></button>
          </label>
          {manager && <button className="btn btn-secondary" type="button" onClick={onImport}>{P.import}</button>}
          <button className="btn btn-primary" type="button" onClick={onNew}><Icon name="plus" />{P.new}</button>
        </header>

        {showOnboarding && <Onboarding d={d} data={data} onAddProxy={onAddProxy} onNew={onNew} onOpen={open} onHide={hideOnboarding} />}

        <section className="cards" aria-label={P.title}>
          <button type="button" className="kc" onClick={() => setStatus('running')}>
            <span className="kic good"><Icon name="play" /></span><small>{P.sum.running}</small><b>{running}</b>
          </button>
          <button type="button" className="kc" onClick={() => setStatus('issues')} title={P.sum.proxyNote(down, slow) || P.sum.proxyOk}>
            <span className="kic bad"><Icon name="proxies" /></span><small>{P.sum.proxy}</small><b>{down + slow}</b>
          </button>
          <button type="button" className="kc" onClick={() => setRiskOpen(o => !o)} title={shown.length ? d.risks.title(shown.length) : P.sum.risksOk}>
            <span className="kic warn"><Icon name="alert" /></span><small>{P.sum.risks}</small><b>{shown.length}</b>
          </button>
          <section className="map-card" aria-label={P.map.label}>
            {pins.length > 0
              ? <ExitMap pins={pins} links={links} label={P.map.label} onPick={key => setQ(key)} />
              : (
                <div className="map-empty">
                  <b>{P.map.emptyTitle}</b>
                  <p className="hint">{P.map.emptyBody}</p>
                  {manager && (data.proxies.length
                    ? <button type="button" className="btn btn-xs btn-secondary" disabled={data.checking.size > 0} onClick={() => void data.check(data.proxies.map(p => p.id))}>{P.map.check}</button>
                    : <button type="button" className="btn btn-xs btn-secondary" onClick={onAddProxy}>{P.map.add}</button>)}
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
              <button type="button" className="btn btn-xs btn-text" aria-expanded={riskOpen} onClick={() => setRiskOpen(o => !o)}>{riskOpen ? d.risks.hide : d.risks.show}</button>
            </div>
            {riskOpen && (
              <ul className="risk-list">
                {shown.map((r, i) => (
                  <li key={i} className={r.level} data-risk={r.kind}>
                    <span className={`d ${r.level === 'bad' ? 'bad' : 'warn'}`} aria-hidden="true" />
                    <div><p><b>{d.risks.kinds[r.kind].t(r.ids.length, r.what)}</b></p><p className="hint">{names(r)} · {d.risks.kinds[r.kind].fix}</p></div>
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => setOnly(new Set(r.ids))}>{d.risks.only}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="filters">
          <div className="seg" role="group" aria-label={P.filter.label}>
            {(['all', 'running', 'issues', 'starred'] as const).map(s => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{P.filter[s]} <small>{counts[s]}</small></button>)}
          </div>
          {only && <button type="button" className="chip" onClick={() => setOnly(null)}>{d.risks.clear} <span aria-hidden="true">×</span></button>}
          {group !== 'all' && (
            <button type="button" className="chip" aria-label={P.clearGroup(group === 'none' ? d.groups.none : groupName.get(group) ?? '')} onClick={() => setGroup('all')}>
              {P.groupChip(group === 'none' ? d.groups.none : groupName.get(group) ?? '')} <span aria-hidden="true">×</span>
            </button>
          )}
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
                  <th scope="col">{P.cols.profile}</th><th scope="col">{P.cols.proxy}</th><th scope="col">{P.cols.fingerprint}</th><th scope="col">{P.cols.extensions}</th>
                  <th scope="col" className="lastc">{P.cols.last}</th><th className="act" scope="col">{P.cols.status}</th><th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {data.profiles === null && Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="skel" aria-hidden="true"><td className="cb"><i /></td><td><i className="w2" /><i /></td><td><i /><i className="w3" /></td><td><i /><i className="w3" /></td><td><i className="w3" /></td><td><i className="w3" /></td><td><i className="w2" /></td><td /></tr>
                ))}
                {empty && <tr className="empty"><td colSpan={8}>{empty}</td></tr>}
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
                <button type="button" className="bb" onClick={() => openMany(all.filter(p => sel.has(p.id) && !data.status[p.id] && !elsewhere(p)))}><Icon name="play" />{P.bulk.open}</button>
                <button type="button" className="bb" onClick={() => ids.forEach(id => void folio.stopProfile(id))}><Icon name="stop" />{P.bulk.stop}</button>
                <button type="button" className="bb" disabled={ids.length < 2 || !syncAllowed} title={!syncAllowed ? d.windowSync.upgrade : ids.length < 2 ? P.bulk.syncTwo : undefined} onClick={() => void startSync()}><Icon name="sync" />{P.bulk.sync}</button>
                <Select variant="bar" action label={P.bulk.move} placeholder={P.bulk.move} value="" searchPh={d.form.searchPh}
                  options={[...data.groups.map(g => ({ value: g.id, label: g.name })), { value: 'none', label: d.groups.none }]}
                  onChange={v => { const g = v === 'none' ? null : v; void batchAction('move', { groupId: g }, n => P.done.moved(n, g ? groupName.get(g) ?? '' : d.groups.none)); }} />
                <Select variant="bar" action label={P.bulk.proxy} placeholder={P.bulk.proxy} value="" searchPh={d.form.searchPh}
                  options={[...data.proxies.map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined })), { value: 'none', label: P.noProxy }]}
                  onChange={v => void batchAction('set-proxy', { proxyId: v === 'none' ? null : v }, P.done.proxySet)} />
                {manager && (
                  <Select variant="bar" action label={P.bulk.assign} placeholder={P.bulk.assign} value="" searchPh={d.form.searchPh}
                    options={[...data.members.map(m => ({ value: m.userId, label: m.email })), { value: 'none', label: P.unassigned }]}
                    onChange={v => { const who = v === 'none' ? null : v; void batchAction('assign', { ownerId: who }, n => P.done.assigned(n, who ? email.get(who) ?? '' : P.unassigned)); }} />
                )}
                {manager && data.departments.length > 0 && (
                  <Select variant="bar" action label={P.bulk.department} placeholder={P.bulk.department} value=""
                    options={[...data.departments.map(x => ({ value: x.id, label: x.name })), { value: 'none', label: P.bulk.noDepartment }]}
                    onChange={v => void batchAction('set-department', { departmentId: v === 'none' ? null : v }, P.done.departmentSet)} />
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
      </main>

      {batch && <Tray d={d} data={data} profiles={batch.map(id => all.find(p => p.id === id)).filter((p): p is Profile => !!p)} failed={batchFail}
        onRetry={launch} onClose={() => setBatch(null)} />}

      {curProfile && <>
        <div className="scrim drawer-scrim" onClick={() => setDrawer(false)} />
        <aside className="detail" aria-label={d.detail.profile}>
          <ProfileDetail
            d={d} lang={lang} p={curProfile} h={healthOf.get(curProfile.id)!} now={now} busy={busyFix}
            status={data.status[curProfile.id]} progress={data.progress[kernelKey(curProfile.kernel, curProfile.kernelVersion)]}
            size={data.kernels.find(k => k.kind === curProfile.kernel && k.version === curProfile.kernelVersion)?.size ?? null} failed={data.failed[curProfile.id]}
            risks={riskOf.get(curProfile.id) ?? []} others={all} onStar={() => void star(curProfile)}
            group={groupLabel(curProfile)} owner={curProfile.ownerId ? email.get(curProfile.ownerId) ?? null : null}
            extensions={curProfile.extensionIds.map(id => extensions.get(id)).filter((x): x is Extension => !!x)}
            activity={recent.entries ?? []}
            onClose={() => setDrawer(false)} onOpen={() => void open(curProfile)} onStop={() => void stop(curProfile)}
            onEdit={() => onEdit(curProfile.id)} onTrash={() => void trash([curProfile.id])}
            canTakeOver={manager} canTrash={manager} canExport={manager} onTakeover={() => void takeover(curProfile)}
            onExport={format => void exportCookies([curProfile], format)} onImport={text => void importCookies(curProfile, text)}
            onFix={f => void fix(curProfile, f)}
          />
        </aside>
      </>}
    </div>
  );
}

interface ItemProps {
  d: Dict; p: Profile; h: Health; group: string; now: number; cur: boolean; checked: boolean; sync: 'leader' | 'follower' | null; exts: Extension[];
  status?: ProfileStatus; progress?: Progress; checking: boolean; risky: boolean;
  onToggle(): void; onView(): void; onOpen(): void; onStop(): void; onCheck(): void; onStar(): void;
}

// What the profile is doing (a status label), and the one thing to do about it.
function state({ d, p, h, now, status, progress, checking, onOpen, onStop, onCheck }: ItemProps): [ReactNode, ReactNode] {
  const P = d.profiles;
  const away = elsewhere(p);
  const downloading = progress && !progress.finished && !progress.error;
  // Opening: engine, proxy, sign-ins, browser, in turn.
  const opening = (at: number, label: string) => (
    <span className="st boot" role="status"><span className="spin" aria-hidden="true" />{label}<span className="sub">{at + 1} / {P.stages.length}</span></span>
  );
  if (status?.state === 'running') return [
    <span className="st run"><Icon name="play" />{P.st.running}<span className="sub">{runTime(now - (status.startedAt ?? now))}</span></span>,
    <button type="button" className="btn btn-xs btn-secondary" aria-label={P.stopX(p.name)} onClick={onStop}><Icon name="stop" />{P.stop}</button>
  ];
  if (status?.state === 'saving') return [<span className="st boot"><span className="spin" aria-hidden="true" />{busyLabel(d, status.state)}</span>, null];
  if (status) return [status.state === 'restoring' ? opening(2, P.stage.restore) : status.stage === 'launch' ? opening(3, P.stage.launch) : opening(1, P.stage.proxy),
    <button type="button" className="btn btn-xs btn-secondary" disabled>{P.starting}</button>];
  if (downloading) return [opening(0, P.downloading(percent(progress))), null];
  if (away) return [<span className="st away" title={away.email}><Icon name="monitor" />{P.inUseOn(away.deviceName ?? away.email)}</span>, null];
  if (h.checks[0]?.id === 'proxy-down') return [
    <span className="st bad"><Icon name="alert" />{P.st.proxyDown}</span>,
    <button type="button" className="btn btn-xs btn-secondary" disabled={checking} onClick={onCheck}>{checking && <span className="spin" aria-hidden="true" />}{P.checkProxy}</button>
  ];
  return [
    <span className="st idle"><Icon name="pause" />{P.st.idle}</span>,
    <button type="button" className="btn btn-xs btn-primary" aria-label={P.openX(p.name)} onClick={onOpen}><Icon name="play" />{P.open}</button>
  ];
}

// The extensions installed in a profile: their icons, three at most.
function ExtIcons({ exts }: { exts: Extension[] }){
  if (!exts.length) return <span className="muted">—</span>;
  return (
    <span className="exts" title={exts.map(x => x.name).join(', ')}>
      {exts.slice(0, 3).map(x => <ExtIcon key={x.id} src={x.icon} />)}
      {exts.length > 3 && <em>+{exts.length - 3}</em>}
    </span>
  );
}

function Star({ d, p, onStar }: { d: Dict; p: Profile; onStar(): void }){
  const P = d.profiles;
  return <button type="button" className={`star${p.starred ? ' on' : ''}`} aria-pressed={p.starred} aria-label={p.starred ? P.unstar : P.star} title={p.starred ? P.unstar : P.star} onClick={onStar}><Icon name="star" /></button>;
}

function Row(props: ItemProps){
  const { d, p, h, group, now, cur, checked, sync, exts, status, risky, onToggle, onView, onStar } = props;
  const P = d.profiles;
  const geo = h.geo;
  const [st, act] = state(props);
  return (
    <tr className={cur ? 'cur' : ''} data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a')) onView(); }}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td className="prof">
        <span className="prof-cell"><Flag country={geo?.country ?? null} kernel={p.kernel} /><span>
          <span className="l1"><button type="button" className="rowlink" onClick={onView}>{p.name}</button><Star d={d} p={p} onStar={onStar} />
            {risky && <span className="risk-flag" title={d.risks.flag}><Icon name="alert" /><span className="sr">{d.risks.flag}</span></span>}
            {p.tags.map(t => <span key={t} className="tag">{t}</span>)}</span>
          <span className="l2"><span className="mono">#{number(p)}</span> · {group}</span>
        </span></span>
      </td>
      <td className="pxc">
        <span className="l1">{h.px ? h.px.name : P.noProxy}</span>
        <span className="l2">{h.px && <span className={`d ${h.proxy === 'ok' ? 'good' : h.proxy === 'slow' ? 'warn' : h.proxy === 'down' ? 'bad' : ''}`} aria-hidden="true" />}{geo ? geo.city ?? geo.countryName : h.px ? (h.proxy === 'down' ? P.noResponse : P.unchecked) : d.detail.directSub}</span>
      </td>
      <td className="fpc">
        <span className="os-cell"><Icon name={p.os} /><span>
          <span className="l1">{d.os[p.os]}</span>
          <span className="l2">{h.mismatch ? <span className="flag warn">{P.mismatch}</span> : engineName(p.kernel, p.kernelVersion)}</span>
        </span></span>
      </td>
      <td><ExtIcons exts={exts} /></td>
      <td className="lastc"><span className="who">{status || elsewhere(p) ? P.inUse : ago(p.lastOpenedAt, d, now)}</span></td>
      <td className="act">{st}{sync && <span className="synctag">{sync === 'leader' ? d.windowSync.leaderTag : d.windowSync.followerTag}</span>}</td>
      <td className="act go">{act}</td>
    </tr>
  );
}

function Card(props: ItemProps){
  const { d, p, h, cur, checked, exts, risky, onToggle, onView, onStar } = props;
  const P = d.profiles;
  const geo = h.geo;
  const [st, act] = state(props);
  return (
    <li className={`pcard${cur ? ' cur' : ''}`} data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a')) onView(); }}>
      <div className="pc-top">
        <Flag country={geo?.country ?? null} kernel={p.kernel} />
        <span>
          <span className="l1"><button type="button" className="rowlink" onClick={onView}>{p.name}</button><Star d={d} p={p} onStar={onStar} />
            {risky && <span className="risk-flag" title={d.risks.flag}><Icon name="alert" /><span className="sr">{d.risks.flag}</span></span>}</span>
          <span className="l2 mono">#{number(p)}</span>
        </span>
        <ExtIcons exts={exts} />
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} />
      </div>
      <div className="pc-city"><b>{geo ? geo.city ?? geo.countryName : h.px ? (h.proxy === 'down' ? d.detail.noExit : d.detail.notChecked) : d.detail.direct}</b><span>{h.px ? h.px.name : P.noProxy}</span></div>
      <p className="pc-fp"><Icon name={p.os} />{d.os[p.os]} · {h.mismatch ? <span className="flag warn">{P.mismatch}</span> : engineName(p.kernel, p.kernelVersion)}</p>
      <div className="pc-foot">{st}{act}</div>
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
        <button type="button" className="icon-btn bare sm" aria-label={folded ? T.unfold : T.fold} onClick={() => setFolded(f => !f)}><Icon name="chev" /></button>
        {settled === rows.length && <button type="button" className="icon-btn bare sm" aria-label={T.close} onClick={onClose}><Icon name="x" /></button>}
      </header>
      <ol>
        {rows.map(r => (
          <li key={r.p.id} className={r.tone}>
            <Flag country={null} kernel={r.p.kernel} />
            <div><b>{r.p.name}</b>{r.st}<span className="meter"><i style={{ width: `${r.pct}%` }} /></span></div>
            {r.tone === 'bad' && <button type="button" className="btn btn-xs btn-secondary" onClick={() => onRetry(r.p)}>{T.retry}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Onboarding({ d, data, onAddProxy, onNew, onOpen, onHide }: { d: Dict; data: WorkspaceData; onAddProxy(): void; onNew(): void; onOpen(p: Profile): void; onHide(): void }){
  const O = d.onboarding, profiles = data.profiles ?? [];
  const first = profiles[0];
  const steps = [
    { key: 'proxy', title: O.proxy, body: O.proxyD, done: data.proxies.length > 0, action: onAddProxy },
    { key: 'profile', title: O.profile, body: O.profileD, done: profiles.length > 0, action: onNew },
    { key: 'open', title: O.open, body: O.openD, done: profiles.some(p => p.lastOpenedAt), action: first ? () => onOpen(first) : undefined }
  ];
  const next = steps.find(s => !s.done);
  return (
    <section className="onboard" aria-label={O.title} data-testid="onboarding">
      <header className="sec-row"><h2>{O.title}</h2><button type="button" className="btn btn-xs btn-text" onClick={onHide}>{O.hide}</button></header>
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : s === next ? 'next' : ''} data-step={s.key}>
            <span className="num" aria-hidden="true">{s.done ? <Icon name="check" /> : i + 1}</span>
            <div><b>{s.title}</b><p className="muted">{s.done ? O.done : s.body}</p></div>
            {s === next && s.action && <button type="button" className="btn btn-primary btn-sm" onClick={s.action}>{s.title}</button>}
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
        <button type="submit" className="btn btn-xs btn-secondary">{W.open}</button>
      </form>
      <button type="button" className="btn btn-xs btn-secondary" onClick={() => void folio.stopWindowSync()}>{W.stop}</button>
    </div>
  );
}
