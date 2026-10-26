import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MANAGE, can, folio, isApiError, type Extension, type Group, type Profile, type Workspace } from './api';
import { ENGINES, engineName, health, type Fix, type Health } from './checks';
import { kernelKey, type BatchAction, type BulkChange, type WorkspaceData } from './data';
import { startJob, type JobRun } from './jobRun';
import { errorText, type Dict, type Lang } from './i18n';
import { ProfileDetail, busyLabel, elsewhere } from './ProfileDetail';
import { dayLabel, time } from './Activity';
import { Act, Avatar, BulkBar, Empty, Icon, ListFailed, Modal, MoreMenu, percent, useNow, useToast, useView, ViewSwitch } from './ui';
import { Pager } from './Pager';
import { ReplaceProxyDialog } from './Proxies';
import { Select } from './Select';
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
  onNew(): void; onImport(): void; onEdit(id: string): void; onPalette(): void; onTrashPage(): void; onShowProxy?(id: string): void;
}

const number = (p: Profile) => String(p.number).padStart(4, '0');

export function ProfilesPage({ d, lang, ws, data, group, setGroup, only, setOnly, openId, onNew, onImport, onEdit, onPalette, onTrashPage, onShowProxy }: Props){
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
  // The job the tray's profiles open in, and when it is over.
  const batchJob = useRef<{ run: JobRun | null; done: Promise<unknown> } | null>(null);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // The profile whose proxy is being changed.
  const [replacing, setReplacing] = useState<Profile | null>(null);
  // Twenty a page unless chosen otherwise; a page past the end (after a filter or a delete) falls back to the last.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const all = useMemo(() => data.profiles ?? [], [data.profiles]);
  const proxies = useMemo(() => new Map(data.proxies.map(p => [p.id, p])), [data.proxies]);
  const extensions = useMemo(() => new Map(data.extensions.map(x => [x.id, x])), [data.extensions]);
  const groupName = useMemo(() => new Map(data.groups.map(g => [g.id, g.name])), [data.groups]);
  const healthOf = useMemo(() => new Map(all.map(p => [p.id, health(p, proxies, data.kernels)])), [all, proxies, data.kernels]);
  const riskList = useMemo(() => risks(all, id => proxies.get(id)?.name ?? ''), [all, proxies]);
  const riskOf = useMemo(() => byProfile(riskList), [riskList]);
  const risky = (id: string) => (riskOf.get(id) ?? []).some(r => r.level !== 'info');
  const now = useNow(Object.values(data.status).some(s => s.state === 'running'));
  const manager = can(data.role, MANAGE), canDelete = can(data.role, 'profiles.delete'), canExport = can(data.role, 'cookies.export');
  // Moving a profile to another proxy is editing it and binding the proxy.
  const canBind = can(data.role, 'profiles.edit') && can(data.role, 'proxies.bind');
  const email = useMemo(() => new Map(data.members.map(m => [m.userId, m.email])), [data.members]);
  const groupLabel = (p: Profile) => (p.groupId ? groupName.get(p.groupId) ?? d.groups.none : d.groups.none);
  const issue = (p: Profile) => healthOf.get(p.id)!.level !== 'ok' || risky(p.id);
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
  const pages = Math.max(1, Math.ceil(list.length / pageSize)), at = Math.min(page, pages);
  const pageList = list.slice((at - 1) * pageSize, at * pageSize);
  const pageSel = pageList.filter(p => sel.has(p.id)).length;
  // A picked profile's page shows in place of the list.
  const curProfile = (detail && all.find(p => p.id === cur)) || null;
  const filtered = group !== 'all' || engine !== 'all' || status !== 'all' || !!q || !!only;

  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  const why = (w: 'kernel_missing' | 'download_failed') => (w === 'kernel_missing' ? d.launch.kernel_missing : d.launch.download_failed);
  async function open(p: Profile){
    const w = await data.launch(p);
    if (w === 'kernel_missing'){ setCur(p.id); setDetail(true); toast(d.profiles.done.failed(p.name, why(w)), undefined, 'bad'); }
    else if (w) toast(why(w), undefined, 'bad');
    // The workspace may want a profile's page to show as it starts.
    else if (ws.settings.openDetailAfterLaunch) pick(p.id);
  }
  // Several at once: a job (the task center lists it), with their progress in the tray instead of toasts.
  async function openMany(targets: Profile[]){
    if (targets.length < 2){ targets.forEach(p => void open(p)); return; }
    setBatch(targets.map(p => p.id));
    const run = await startJob(ws.id, 'profile.open', targets.map(p => ({ targetId: p.id, name: p.name })));
    batchJob.current = { run, done: data.openMany(targets, run ?? undefined) };
    setBatchJobId(run?.id ?? null);
  }
  // A failed one again: once its job is over, by retrying that target of it.
  async function retry(p: Profile){
    const b = batchJob.current, seq = b?.run?.seq(p.id);
    if (!b?.run || !seq){ void data.launch(p); return; }
    await b.done;
    void data.rerun(b.run.id, [seq]);
  }
  const stop = (p: Profile) => folio.stopProfile(p.id);
  async function exportCookies(list: Profile[], format: 'json' | 'netscape'){
    const r = await folio.exportCookies(list.map(p => ({ id: p.id, name: p.name, number: p.number })), format);
    if (!r) return;
    if (r.saved) toast(d.detail.exported(r.saved, r.path));
    r.failed.forEach(f => toast(d.detail.exportFailed(f.name, errorText(d, f.code)), undefined, 'bad'));
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
  // The header box selects what this page shows, never more.
  const toggleAll = () => setSel(s => {
    const n = new Set(s);
    if (pageSel === pageList.length) pageList.forEach(p => n.delete(p.id)); else pageList.forEach(p => n.add(p.id));
    return n;
  });
  const reset = () => { setQ(''); setStatus('all'); setEngine('all'); setGroup('all'); setOnly(null); setPage(1); };
  // What the bulk bar's More menu does.
  function more(v: string){
    const [what, x] = v.split(':');
    if (what === 'sync') void startSync();
    else if (what === 'tag') setTagging(true);
    else if (what === 'trash') setConfirm(true);
    else if (what === 'proxy') void batchAction('set-proxy', { proxyId: x === 'none' ? null : x }, P.done.proxySet);
    else if (what === 'assign'){ const who = x === 'none' ? null : x; void batchAction('assign', { ownerId: who }, n => P.done.assigned(n, who ? email.get(who) ?? '' : P.unassigned)); }
    else if (what === 'ext-add' || what === 'ext-remove'){
      const ext = extensions.get(x)!;
      void batchAction(what === 'ext-add' ? 'add-extension' : 'remove-extension', { extensionId: x }, n => (what === 'ext-add' ? P.done.extAdded(n, ext.name, ids.length - n) : P.done.extRemoved(n, ext.name)));
    }
    else if (what === 'se') void batchAction('set-browser', { searchEngine: x }, n => d.browser.searchSet(n, d.browser.name(x as SearchEngine)));
    else if (what === 'tabs') void batchAction('set-browser', { restoreTabs: x === 'on' }, n => d.browser.tabsSet(n, x === 'on'));
    else if (what === 'cookies') void exportCookies(all.filter(p => sel.has(p.id)), x as 'json' | 'netscape');
  }
  const pick = (id: string) => { setCur(id); setDetail(true); };

  const shown = riskList.filter(r => r.level !== 'info');
  const names = (r: Risk) => r.ids.map(id => all.find(p => p.id === id)?.name).filter(Boolean).join(lang === 'zh' ? '、' : ', ');

  const item = (p: Profile): ItemProps => ({
    d, lang, p, h: healthOf.get(p.id)!, cur: p.id === curProfile?.id, checked: sel.has(p.id), risky: risky(p.id), canDelete, canBind, group: data.groups.find(g => g.id === p.groupId) ?? null,
    owner: p.ownerId ? email.get(p.ownerId) ?? null : null,
    sync: data.sync?.leader === p.id ? 'leader' : data.sync?.members.some(m => m.id === p.id) ? 'follower' : null,
    status: data.status[p.id], progress: data.progress[kernelKey(p.kernel, p.kernelVersion)], checking: !!p.proxyId && data.checking.has(p.proxyId),
    onToggle: () => toggle(p.id), onView: () => pick(p.id), onOpen: () => void open(p), onStop: () => void stop(p), onEnter: () => void folio.focusProfile(p.id), onStar: () => void star(p),
    onCheck: () => { if (p.proxyId) void data.check([p.proxyId]); }, onEdit: () => onEdit(p.id), onTrash: () => void trash([p.id]), onMove: () => setMoving(p),
    onReplace: () => setReplacing(p)
  });
  async function move(p: Profile, groupId: string | null){
    setMoving(null);
    try { await data.batch('move', [p.id], { groupId }); toast(P.done.moved(1, groupId ? groupName.get(groupId) ?? '' : d.groups.none)); } catch (e){ fail(e); }
  }
  const failed = data.loadFailed.has('profiles'), S = d.states;
  const empty = failed
    ? <ListFailed d={d} data={data} kind="profiles" />
    : data.profiles !== null && !list.length && (all.length
      ? <Empty icon="search" title={P.emptyMatch} text={<>{q && P.emptyFor(q)} {P.emptyHint(all.length)}</>}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>{S.clear}</button>
        </Empty>
      : <Empty icon="newFile" title={S.noProfiles} text={S.noProfilesText}>
          {can(data.role, 'profiles.create') && <button type="button" className="btn btn-primary btn-sm" onClick={onNew}><Icon name="plus" />{S.create}</button>}
        </Empty>);

  if (curProfile) return (<>
    <ProfileDetail
      d={d} lang={lang} ws={ws} data={data} p={curProfile} h={healthOf.get(curProfile.id)!} now={now} busy={busyFix}
      status={data.status[curProfile.id]} progress={data.progress[kernelKey(curProfile.kernel, curProfile.kernelVersion)]}
      size={data.kernels.find(k => k.kind === curProfile.kernel && k.version === curProfile.kernelVersion)?.size ?? null} failed={data.failed[curProfile.id]}
      risks={riskOf.get(curProfile.id) ?? []} others={all} onStar={() => void star(curProfile)}
      group={data.groups.find(g => g.id === curProfile.groupId) ?? null} owner={curProfile.ownerId ? email.get(curProfile.ownerId) ?? null : null}
      extensions={curProfile.extensionIds.map(id => extensions.get(id)).filter((x): x is Extension => !!x)}
      onBack={() => setDetail(false)} onOpen={() => void open(curProfile)} onStop={() => void stop(curProfile)}
      onEdit={() => onEdit(curProfile.id)} onTrash={() => void trash([curProfile.id])}
      canTakeOver={manager} canTrash={canDelete} onTakeover={() => void takeover(curProfile)}
      onExport={format => void exportCookies([curProfile], format)}
      onFix={f => void fix(curProfile, f)} onShowProxy={manager ? onShowProxy : undefined} onReplaceProxy={canBind ? () => setReplacing(curProfile) : undefined}
    />
    {replacing && <ReplaceProxyDialog d={d} data={data} profile={replacing} onClose={() => setReplacing(null)} onDone={() => setReplacing(null)} />}
  </>);

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{P.title}</h1><p className="sub">{P.lead}</p></div>
          <span className="sp" />
          {manager && <button className="btn btn-secondary" type="button" onClick={onImport}><Icon name="upload" />{P.import}</button>}
          {can(data.role, 'profiles.create') && <button className="btn btn-primary" type="button" onClick={onNew}><Icon name="plus" />{P.new}</button>}
        </header>

        <div className="tabs page-tabs" role="tablist" aria-label={P.filter.label}>
          {(['all', 'running', 'stopped'] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={status === t} onClick={() => { setStatus(t); setPage(1); }}>
              {P.tabs[t]}<small>{counts[t]}</small>
            </button>
          ))}
          {manager && <button type="button" role="tab" aria-selected={false} onClick={onTrashPage}>{P.tabs.trash}</button>}
        </div>

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

        {/* The delivery spec's order: keyword, group, engine, status, reset; how the list is laid out sits at the end. */}
        <div className="filters">
          <label className="search">
            <Icon name="search" /><span className="sr">{P.search}</span>
            <input type="search" placeholder={P.searchPh} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} autoComplete="off" />
            <button type="button" className="kbd-btn" title={P.palette} aria-label={P.palette} onClick={onPalette}><kbd>{mod} K</kbd></button>
          </label>
          <span className="grp-pick"><Select label={d.groups.title} value={group} onChange={v => { setGroup(v as GroupFilter); setPage(1); }}
            options={[{ value: 'all', label: d.groups.all }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const })), { value: 'none', label: d.groups.none }]} /></span>
          <span className="grp-pick"><Select label={P.filter.engine} value={engine} onChange={v => { setEngine(v as Engine); setPage(1); }}
            options={[{ value: 'all', label: P.filter.engines }, ...engines.map(e => { const [k, v] = e.split(':'); return { value: e, label: `${ENGINES[k as Profile['kernel']]} ${v}` }; })]} /></span>
          <span className="grp-pick"><Select label={P.filter.label} value={status === 'issues' || status === 'starred' ? status : 'all'} onChange={v => { setStatus(v as Status); setPage(1); }}
            options={(['all', 'issues', 'starred'] as const).map(x => ({ value: x, label: x === 'all' ? P.filter.states : P.filter[x], hint: String(counts[x]) }))} /></span>
          {filtered && <button type="button" className="btn btn-text" onClick={reset}>{P.reset}</button>}
          {only && <button type="button" className="chip" onClick={() => setOnly(null)}>{d.risks.clear} <span aria-hidden="true">×</span></button>}
          <span className="sp" />
          <span className="sort"><span id="pf-sort">{P.sort}</span>
            <Select variant="sm" labelledBy="pf-sort" value={sort} onChange={v => setSort(v as Sort)} options={(['recent', 'name', 'latency'] as const).map(x => ({ value: x, label: P.sorts[x] }))} />
          </span>
          <ViewSwitch label={P.views.label} value={view} onChange={setView} options={[['list', 'list', P.views.list], ['cards', 'grid', P.views.cards]]} />
        </div>

        {data.sync && <SyncBar d={d} data={data} names={new Map(all.map(p => [p.id, p.name]))} />}

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
                <button type="button" className="bb lead" onClick={() => openMany(all.filter(p => sel.has(p.id) && !data.status[p.id] && !elsewhere(p)))}><Icon name="play" />{P.bulk.open}</button>
                <button type="button" className="bb" onClick={() => ids.forEach(id => void folio.stopProfile(id))}><Icon name="stop" />{P.bulk.stop}</button>
                <Select variant="bar" action label={P.bulk.move} placeholder={P.bulk.move} value="" searchPh={d.form.searchPh}
                  options={[...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const })), { value: 'none', label: d.groups.none }]}
                  onChange={v => { const g = v === 'none' ? null : v; void batchAction('move', { groupId: g }, n => P.done.moved(n, g ? groupName.get(g) ?? '' : d.groups.none)); }} />
                <button type="button" className="bb" onClick={() => setEditing(true)}><Icon name="settings" />{P.bulk.edit}</button>
                <Select variant="bar" action label={P.bulk.more} placeholder={P.bulk.more} value=""
                  options={[
                    ...(ids.length > 1 && syncAllowed ? [{ value: 'sync', label: P.bulk.sync }] : []),
                    { value: 'tag', label: P.bulk.tag },
                    ...data.proxies.map(px => ({ value: `proxy:${px.id}`, label: px.name, group: P.bulk.proxy, hint: px.lastCheck?.geo?.city ?? undefined })),
                    { value: 'proxy:none', label: P.noProxy, group: P.bulk.proxy },
                    ...(manager ? [...data.members.map(m => ({ value: `assign:${m.userId}`, label: m.email, group: P.bulk.assign })), { value: 'assign:none', label: P.unassigned, group: P.bulk.assign }] : []),
                    ...(['add', 'remove'] as const).flatMap(how => data.extensions.map(x => ({ value: `ext-${how}:${x.id}`, label: `${x.name} · ${ENGINES[x.kernel]}`, group: how === 'add' ? P.bulk.install : P.bulk.uninstall }))),
                    ...SEARCH_IDS.map(id => ({ value: `se:${id}`, label: d.browser.name(id), group: d.browser.search, ...(id !== 'none' ? { img: SEARCH_LOGOS[id] } : {}) })),
                    ...(['on', 'off'] as const).map(v => ({ value: `tabs:${v}`, label: d.browser[v], group: d.browser.restore })),
                    ...(canExport ? [{ value: 'cookies:json', label: d.detail.json, group: P.bulk.cookies }, { value: 'cookies:netscape', label: d.detail.netscape, group: P.bulk.cookies }] : []),
                    ...(canDelete ? [{ value: 'trash', label: P.bulk.trash }] : [])
                  ]}
                  onChange={v => more(v)} />
              </>
            )}
          </BulkBar>
        )}

        {view === 'list' ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th className="cb" scope="col">
                    <input type="checkbox" aria-label={d.common.selectAll} checked={pageList.length > 0 && pageSel === pageList.length}
                      ref={el => { if (el) el.indeterminate = pageSel > 0 && pageSel < pageList.length; }} onChange={toggleAll} />
                  </th>
                  <th scope="col">{P.cols.profile}</th><th scope="col">{P.cols.group}</th><th scope="col">{P.cols.engine}</th><th scope="col">{P.cols.proxy}</th>
                  <th scope="col">{P.cols.status}</th><th scope="col" className="lastc">{P.cols.last}</th><th className="act" scope="col">{P.cols.actions}</th>
                </tr>
              </thead>
              <tbody>
                {data.profiles === null && !failed && Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="skel" aria-hidden="true"><td className="cb"><i /></td><td><i className="w2" /><i className="w3" /></td><td><i className="w3" /></td><td><i /><i className="w3" /></td><td><i /><i className="w3" /></td><td><i className="w3" /></td><td><i className="w3" /></td><td /></tr>
                ))}
                {empty && <tr className="empty"><td colSpan={8}>{empty}</td></tr>}
                {pageList.map(p => <Row key={p.id} {...item(p)} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {empty && <div className="cards-empty">{empty}</div>}
            <ul className="pgrid">{pageList.map(p => <Card key={p.id} {...item(p)} />)}</ul>
          </>
        )}
        {list.length > 0 && <Pager d={d} total={list.length} page={page} size={pageSize} onPage={setPage} onSize={n => { setPageSize(n); setPage(1); }} />}
        {data.proxies.some(p => p.lastCheck?.geo) && <p className="attrib page-attrib">{d.common.attribution}</p>}

        {confirm && ids.length > 0 && (
          <Modal kind="warn" title={P.bulk.confirm(ids.length)} closeLabel={d.common.close} onClose={() => setConfirm(false)} foot={<>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{d.common.cancel}</button>
            <Act className="btn btn-danger solid" run={() => trash(ids)}>{P.bulk.doTrash}</Act>
          </>}><p>{P.bulk.confirmNote}</p></Modal>
        )}
        {editing && ids.length > 0 && (
          <BulkEdit d={d} data={data} profiles={all.filter(p => sel.has(p.id))} onClose={() => setEditing(false)}
            onDone={n => { setEditing(false); toast(d.bulkEdit.done(n)); }} onFail={fail} />
        )}
        {replacing && <ReplaceProxyDialog d={d} data={data} profile={replacing} onClose={() => setReplacing(null)} onDone={() => setReplacing(null)} />}
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

      {batch && <Tray d={d} data={data} profiles={batch.map(id => all.find(p => p.id === id)).filter((p): p is Profile => !!p)}
        onRetry={p => void retry(p)} onClose={() => setBatch(null)} onTask={batchJobId ? () => data.showJob(batchJobId) : undefined} />}

    </div>
  );
}

interface ItemProps {
  d: Dict; lang: Lang; p: Profile; h: Health; cur: boolean; checked: boolean; sync: 'leader' | 'follower' | null; owner: string | null; canDelete: boolean; canBind: boolean;
  group: Group | null; status?: ProfileStatus; progress?: Progress; checking: boolean; risky: boolean;
  onToggle(): void; onView(): void; onOpen(): void; onStop(): void; onEnter(): void; onCheck(): void; onStar(): void; onEdit(): void; onTrash(): void; onMove(): void; onReplace(): void;
}

// What a profile is doing, as a dot's tone and a word: running (with or without a window), starting or saving, its
// engine downloading, open on another computer, its proxy down, or stopped.
export function stateOf(d: Dict, p: Profile, h: Health, status: ProfileStatus | undefined, progress: Progress | undefined): [string, string] {
  const P = d.profiles, away = elsewhere(p);
  return status?.state === 'running' ? ['run', status.noWindow ? P.st.noWindow : P.st.running]
    : status ? ['boot', status.state === 'saving' ? busyLabel(d, status.state) : status.state === 'restoring' ? P.stage.restore : status.stage === 'launch' ? P.stage.launch : P.stage.proxy]
    : progress && !progress.finished && !progress.error ? ['boot', P.downloading(percent(progress))]
    : away ? ['away', P.inUseOn(away.deviceName ?? away.email)]
    : h.checks[0]?.id === 'proxy-down' ? ['bad', P.st.proxyDown]
    : ['idle', P.st.idle];
}
function Status({ d, p, h, status, progress }: ItemProps){
  const [tone, text] = stateOf(d, p, h, status, progress);
  return <span className={`dot-st ${tone}`} title={elsewhere(p)?.email} role={tone === 'boot' ? 'status' : undefined}>{text}</span>;
}

// Everything to do with the profile, in its ⋯ menu.
function Actions({ d, p, h, checking, canDelete, canBind, onCheck, onEdit, onMove, onReplace, onTrash }: ItemProps){
  const P = d.profiles;
  return <MoreMenu label={P.actionsX(p.name)} items={[
    ...(h.checks[0]?.id === 'proxy-down' ? [{ label: P.checkProxy, onClick: onCheck, disabled: checking }] : []),
    { label: d.detail.edit, onClick: onEdit }, { label: P.move, onClick: onMove }, ...(canBind ? [{ label: d.proxies.replace.title, onClick: onReplace }] : []),
    ...(canDelete ? [{ label: d.detail.trash, onClick: onTrash, danger: true }] : [])
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
  const { d, lang, p, h, cur, checked, sync, onToggle, onView } = props;
  return (
    <tr className={cur ? 'cur' : ''} data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a,.menu')) onView(); }}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td className="prof"><Name {...props} /><span className="l2 mono">#{number(p)}</span></td>
      <td><GroupTag {...props} /></td>
      <td><span className="l1">{h.mismatch ? <span className="flag warn">{d.profiles.mismatch}</span> : engineName(p.kernel, p.kernelVersion)}</span><span className="l2">{d.os[p.os]}</span></td>
      <td><ProxyCell {...props} /></td>
      <td><Status {...props} />{sync && <span className="synctag">{sync === 'leader' ? d.windowSync.leaderTag : d.windowSync.followerTag}</span>}</td>
      <td className="lastc mono">{lastOpened(p.lastOpenedAt, d, lang)}</td>
      <td className="act"><span className="actin"><RowStart {...props} /><Actions {...props} /></span></td>
    </tr>
  );
}

// The one thing a row asks to be done: start it, or, while it runs, go to its window or stop it. Starting is the
// accent's outline, so a full list is not a wall of filled buttons.
function RowStart({ d, p, status, progress, onOpen, onStop, onEnter }: ItemProps){
  const P = d.profiles;
  if (status?.state === 'running') return <>
    <button type="button" className="btn btn-sm btn-secondary" onClick={onEnter}><Icon name="pointer" />{P.enter}</button>
    <button type="button" className="btn btn-sm btn-secondary" onClick={onStop}><Icon name="stop" />{P.stop}</button>
  </>;
  const busy = !!status || !!(progress && !progress.finished && !progress.error) || !!elsewhere(p);
  return <button type="button" className="btn btn-sm btn-start" disabled={busy} onClick={onOpen}><Icon name="play" />{P.open}</button>;
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
      <div className="pc-foot"><Status {...props} /><span className="actin"><RowStart {...props} /><Actions {...props} /></span></div>
    </li>
  );
}

// Profiles opened together: each one's progress, why it couldn't open, and a retry. Folds away; goes once they all opened.
function Tray({ d, data, profiles, onRetry, onClose, onTask }: { d: Dict; data: WorkspaceData; profiles: Profile[]; onRetry(p: Profile): void; onClose(): void; onTask?(): void }){
  const T = d.batchOpen, P = d.profiles;
  const [folded, setFolded] = useState(false);
  const rows = profiles.map(p => {
    const why = data.failed[p.id] ? d.launch[data.failed[p.id]] ?? d.launch.launch_failed : null;
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
        {onTask && <button type="button" className="linkish tray-task" onClick={onTask}>{d.states.viewTask}</button>}
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

// Several profiles changed at once. Each ticked field changes; running profiles are left alone unless asked, since
// they keep their settings until they close. The counts say how many it reaches and how many it skips.
function BulkEdit({ d, data, profiles, onClose, onDone, onFail }: {
  d: Dict; data: WorkspaceData; profiles: Profile[]; onClose(): void; onDone(n: number): void; onFail(e: unknown): void;
}){
  const B = d.bulkEdit;
  const [on, setOn] = useState({ group: false, proxy: false, engine: false, start: false });
  const [groupId, setGroupId] = useState('none');
  const [proxyId, setProxyId] = useState('none');
  const [engine, setEngine] = useState('');
  const [start, setStart] = useState('');
  const [stoppedOnly, setStoppedOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const runningIds = profiles.filter(p => data.status[p.id]).map(p => p.id);
  const targets = profiles.filter(p => !stoppedOnly || !data.status[p.id]);
  const versions = data.kernels.filter(k => k.installed || k.recommended).map(k => ({ value: `${k.kind}:${k.version}`, label: `${ENGINES[k.kind]} ${k.version}` }));
  const okStart = !on.start || !start.trim() || /^https?:\/\/\S+$/.test(start.trim());
  const nothing = !Object.values(on).some(Boolean);
  const lines = [
    on.group && `${B.group}: ${groupId === 'none' ? d.groups.none : data.groups.find(g => g.id === groupId)?.name ?? ''}`,
    on.proxy && `${B.proxy}: ${proxyId === 'none' ? d.profiles.noProxy : data.proxies.find(x => x.id === proxyId)?.name ?? ''}`,
    on.engine && engine && `${B.engine}: ${versions.find(v => v.value === engine)?.label ?? ''}`,
    on.start && `${B.start}: ${start.trim() || '—'}`
  ].filter(Boolean) as string[];

  // A job (the task center lists it): running profiles left alone are reported, so a retry reaches them once stopped.
  async function submit(){
    const [kind, version] = engine.split(':') as [Profile['kernel'], string];
    const change: BulkChange = {
      stoppedOnly, ...(on.group ? { groupId: groupId === 'none' ? null : groupId } : {}), ...(on.proxy ? { proxyId: proxyId === 'none' ? null : proxyId } : {}),
      ...(on.engine && engine ? { kernel: { kind, version } } : {}), ...(on.start ? { startUrl: start.trim() || null } : {})
    };
    setBusy(true);
    try {
      const error = await data.applyEdit(change, profiles);
      if (error) onFail({ code: error, status: 400, message: error }); else onDone(targets.length);
    } finally { setBusy(false); }
  }

  const row = (k: keyof typeof on, label: string, hint: string, field: ReactNode) => (
    <div className="be-row">
      <label className="check-row"><input type="checkbox" checked={on[k]} onChange={e => setOn(o => ({ ...o, [k]: e.target.checked }))} /><b>{label}</b></label>
      <div className="field">{on[k] ? field : <span className="sel" aria-disabled="true"><span className="sel-v ph">{B.keep}</span></span>}<span className="hint">{hint}</span></div>
    </div>
  );
  return (
    <Modal wide title={B.title} closeLabel={d.common.close} onClose={onClose} foot={<>
      <span className="hint">{B.counts(targets.length, profiles.length - targets.length)}</span>
      <label className="check-row"><input type="checkbox" checked={stoppedOnly} onChange={e => setStoppedOnly(e.target.checked)} />{B.stoppedOnly}</label>
      <span className="sp" />
      <button type="button" className="btn btn-secondary" onClick={onClose}>{d.common.cancel}</button>
      <button type="button" className="btn btn-primary" aria-busy={busy || undefined} disabled={busy || nothing || !targets.length || !okStart} onClick={() => void submit()}>{B.submit(targets.length)}</button>
    </>}>
      <div className="m-body be">
        <p className="hint">{B.lead(profiles.length)}</p>
        <div className="be-grid">
          <div className="be-fields">
            {row('group', B.group, B.groupHint, <Select label={B.group} value={groupId} onChange={setGroupId} searchPh={d.form.searchPh}
              options={[...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const })), { value: 'none', label: d.groups.none }]} />)}
            {row('proxy', B.proxy, B.proxyHint, <Select label={B.proxy} value={proxyId} onChange={setProxyId} searchPh={d.form.searchPh}
              options={[...data.proxies.map(x => ({ value: x.id, label: x.name })), { value: 'none', label: d.profiles.noProxy }]} />)}
            {row('engine', B.engine, B.engineHint, <Select label={B.engine} value={engine} placeholder={B.keep} onChange={setEngine} options={versions} />)}
            {row('start', B.start, B.startHint, <input aria-label={B.startHint} placeholder={B.startPh} value={start} aria-invalid={!okStart} onChange={e => setStart(e.target.value)} />)}
          </div>
          <aside className="be-side">
            <section className="sec">
              <h3>{B.changes}</h3>
              {lines.length ? <ul className="be-lines">{lines.map(l => <li key={l}>{l}</li>)}</ul> : <p className="hint">{B.none}</p>}
            </section>
            <section className="sec">
              <h3>{B.picked(profiles.length)}</h3>
              {runningIds.length > 0 && stoppedOnly && <p className="hint">{B.running(runningIds.length)}</p>}
              <ul className="be-list">
                {profiles.map(p => <li key={p.id}><span>{p.name}</span><span className={`dot-st${data.status[p.id] ? ' run' : ''}`}>{data.status[p.id] ? d.profiles.st.running : d.profiles.st.idle}</span></li>)}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </Modal>
  );
}
