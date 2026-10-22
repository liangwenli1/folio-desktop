import { useEffect, useMemo, useState } from 'react';
import { folio, isApiError, type Profile, type Workspace } from './api';
import { engineName, health, type Fix, type Health } from './checks';
import { kernelKey, type BatchAction, type WorkspaceData } from './data';
import { ago, errorText, runTime, type Dict, type Lang } from './i18n';
import { ProfileDetail, busyLabel, elsewhere } from './ProfileDetail';
import { useActivity } from './Activity';
import { Icon, percent, useNow, useToast } from './ui';

export type GroupFilter = 'all' | 'none' | string;
type Status = 'all' | 'running' | 'issues';
type Sort = 'recent' | 'name' | 'latency';

interface Props {
  d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; group: GroupFilter; setGroup(g: GroupFilter): void;
  onNew(): void; onImport(): void; onEdit(id: string): void; onAddProxy(): void;
}

const ONBOARDING_KEY = (ws: string) => `folio.onboarding.${ws}`;
const hidden = (ws: string) => { try { return localStorage.getItem(ONBOARDING_KEY(ws)) === 'hidden'; } catch { return false; } };
const number = (p: Profile) => String(p.number).padStart(4, '0');

export function ProfilesPage({ d, lang, ws, data, group, setGroup, onNew, onImport, onEdit, onAddProxy }: Props){
  const toast = useToast();
  const P = d.profiles;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [cur, setCur] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [tag, setTag] = useState('');
  const [busyFix, setBusyFix] = useState<string | null>(null);
  const [onboardingHidden, setOnboardingHidden] = useState(() => hidden(ws.id));

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const all = useMemo(() => data.profiles ?? [], [data.profiles]);
  const proxies = useMemo(() => new Map(data.proxies.map(p => [p.id, p])), [data.proxies]);
  const groupName = useMemo(() => new Map(data.groups.map(g => [g.id, g.name])), [data.groups]);
  const healthOf = useMemo(() => new Map(all.map(p => [p.id, health(p, proxies, data.kernels)])), [all, proxies, data.kernels]);
  const now = useNow(Object.values(data.status).some(s => s.state === 'running'));
  const running = all.filter(p => data.status[p.id]?.state === 'running').length;
  const limit = ws.subscription.entitlements.profiles;
  const manager = data.role !== 'member';
  const email = useMemo(() => new Map(data.members.map(m => [m.userId, m.email])), [data.members]);
  const groupLabel = (p: Profile) => (p.groupId ? groupName.get(p.groupId) ?? d.groups.none : d.groups.none);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const h = (p: Profile) => healthOf.get(p.id)!;
    let out = all.filter(p => group === 'all' || (group === 'none' ? !p.groupId : p.groupId === group));
    if (status === 'running') out = out.filter(p => data.status[p.id]);
    if (status === 'issues') out = out.filter(p => h(p).level !== 'ok');
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
    return out.sort(by[sort]);
  }, [all, group, status, q, sort, healthOf, data.status, lang, groupName, d]);

  const ids = [...sel].filter(id => all.some(p => p.id === id));
  const shownSel = list.filter(p => sel.has(p.id)).length;
  const curProfile = all.find(p => p.id === cur) ?? null;
  const recent = useActivity(ws.id, `&profileId=${cur ?? ''}`, data, 5, !!cur);
  const filtered = group !== 'all' || status !== 'all' || !!q;

  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'));
  async function open(p: Profile){
    const k = data.kernels.find(k => k.kind === p.kernel && k.version === p.kernelVersion);
    if (data.kernels.length && !k){ setCur(p.id); setDrawer(true); toast(d.profiles.done.failed(p.name, d.launch.kernel_missing)); return; }
    if (k && !k.installed && !(await data.install(p.kernel, p.kernelVersion))){ toast(d.launch.download_failed); return; }
    await folio.openProfile(p.id);
  }
  const stop = (p: Profile) => folio.stopProfile(p.id);
  async function exportCookies(list: Profile[], format: 'json' | 'netscape'){
    const r = await folio.exportCookies(list.map(p => ({ id: p.id, name: p.name, number: p.number })), format);
    if (!r) return;
    if (r.saved) toast(d.detail.exported(r.saved, r.path));
    r.failed.forEach(f => toast(d.detail.exportFailed(f.name, errorText(d, f.code))));
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

  async function batch(action: BatchAction, extra: Parameters<WorkspaceData['batch']>[2], done: (n: number) => string){
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
      else if (f.kind === 'download'){ if (!(await data.install(p.kernel, f.version))) toast(d.launch.download_failed); }
      else onEdit(p.id);
      if (!ok) toast(P.done.stale);
    } catch (e){ fail(e); } finally { setBusyFix(null); }
  }

  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(s => {
    const n = new Set(s);
    if (shownSel === list.length) list.forEach(p => n.delete(p.id)); else list.forEach(p => n.add(p.id));
    return n;
  });
  const view = (id: string) => { setCur(id); setDrawer(true); };

  // Summary strip
  const h = [...healthOf.values()];
  const down = h.filter(x => x.proxy === 'down').length, slow = h.filter(x => x.proxy === 'slow').length;
  const mism = h.filter(x => x.mismatch).length;

  const showOnboarding = !onboardingHidden && data.profiles !== null && !(data.proxies.length && all.length && all.some(p => p.lastOpenedAt));
  const hideOnboarding = () => { setOnboardingHidden(true); try { localStorage.setItem(ONBOARDING_KEY(ws.id), 'hidden'); } catch { /* per-session only */ } };

  return (
    <div className={`page with-detail${drawer ? ' detail-open' : ''}`}>
      <main className="main">
        <header className="bar">
          <div className="ttl">
            <h1>{P.title}</h1>
            <p className="sub" data-testid="profiles-sub">{filtered ? P.showing(list.length, all.length, running) : P.sub(all.length, running)}</p>
          </div>
          <label className="search">
            <Icon name="search" /><span className="sr">{P.search}</span>
            <input type="search" placeholder={P.searchPh} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          {manager && <button className="btn btn-ghost" type="button" onClick={onImport}>{P.import}</button>}
          <button className="btn btn-stamp" type="button" onClick={onNew}>{P.new}</button>
        </header>

        {showOnboarding && <Onboarding d={d} data={data} onAddProxy={onAddProxy} onNew={onNew} onOpen={open} onHide={hideOnboarding} />}

        <section className="summary" aria-label={P.sum.usage}>
          <button type="button" className="sum" onClick={() => setStatus('running')}>
            <span className="k"><span className={`d${running ? ' good pulse' : ''}`} aria-hidden="true" />{P.sum.running}</span>
            <span className="n">{running}<small>{P.sum.of(all.length)}</small></span><span className="s">{P.sum.runningSub}</span>
          </button>
          <button type="button" className="sum" onClick={() => setStatus('issues')}>
            <span className="k"><span className={`d${down ? ' bad' : slow ? ' warn' : ''}`} aria-hidden="true" />{P.sum.proxy}</span>
            <span className="n">{down + slow}</span><span className="s">{P.sum.proxyNote(down, slow) || P.sum.proxyOk}</span>
          </button>
          <button type="button" className="sum" onClick={() => setStatus('issues')}>
            <span className="k"><span className={`d${mism ? ' warn' : ''}`} aria-hidden="true" />{P.sum.fp}</span>
            <span className="n">{mism}</span><span className="s">{mism ? P.sum.fpNote(mism) : P.sum.fpOk}</span>
          </button>
          <div className="sum">
            <span className="k">{P.sum.usage}</span>
            <span className="n">{all.length}<small>{P.sum.usageOf(limit)}</small></span>
            <span className="meter"><i style={{ width: `${Math.min(100, (all.length / limit) * 100)}%` }} /></span>
          </div>
        </section>

        <div className="filters">
          <div className="seg" role="group" aria-label={P.filter.label}>
            {(['all', 'running', 'issues'] as const).map(s => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{P.filter[s]}</button>)}
          </div>
          {group !== 'all' && (
            <button type="button" className="chip" aria-label={P.clearGroup(group === 'none' ? d.groups.none : groupName.get(group) ?? '')} onClick={() => setGroup('all')}>
              {P.groupChip(group === 'none' ? d.groups.none : groupName.get(group) ?? '')} <span aria-hidden="true">×</span>
            </button>
          )}
          <label className="sort">{P.sort}
            <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
              {(['recent', 'name', 'latency'] as const).map(s => <option key={s} value={s}>{P.sorts[s]}</option>)}
            </select>
          </label>
        </div>

        {ids.length > 0 && (
          <div className="bulk" data-testid="bulk">
            {confirm ? (
              <>
                <b>{P.bulk.confirm(ids.length)}</b><span className="note">{P.bulk.confirmNote}</span><span className="sp" />
                <button type="button" className="bb" onClick={() => setConfirm(false)}>{d.common.cancel}</button>
                <button type="button" className="bb danger" onClick={() => void trash(ids)}>{P.bulk.doTrash}</button>
              </>
            ) : tagging ? (
              <>
                <b>{d.common.selected(ids.length)}</b>
                <input className="bb-in" aria-label={P.bulk.tagPh} placeholder={P.bulk.tagPh} value={tag} onChange={e => setTag(e.target.value)} maxLength={24} autoFocus />
                <button type="button" className="bb" disabled={!tag.trim()} onClick={() => { void batch('tag', { tag: tag.trim() }, n => P.done.tagged(n, tag.trim())); setTagging(false); setTag(''); }}>{P.bulk.addTag}</button>
                <button type="button" className="bb" disabled={!tag.trim()} onClick={() => { void batch('untag', { tag: tag.trim() }, n => P.done.untagged(n, tag.trim())); setTagging(false); setTag(''); }}>{P.bulk.removeTag}</button>
                <span className="sp" />
                <button type="button" className="bb plain" onClick={() => setTagging(false)}>{d.common.cancel}</button>
              </>
            ) : (
              <>
                <b>{d.common.selected(ids.length)}</b>
                <button type="button" className="bb" onClick={() => all.filter(p => sel.has(p.id) && !data.status[p.id] && !elsewhere(p)).forEach(p => void open(p))}>{P.bulk.open}</button>
                <button type="button" className="bb" onClick={() => ids.forEach(id => void folio.stopProfile(id))}>{P.bulk.stop}</button>
                <select className="bb" aria-label={P.bulk.move} value="" onChange={e => {
                  const g = e.target.value === 'none' ? null : e.target.value;
                  void batch('move', { groupId: g }, n => P.done.moved(n, g ? groupName.get(g) ?? '' : d.groups.none));
                }}>
                  <option value="" disabled>{P.bulk.move}</option>
                  {data.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  <option value="none">{d.groups.none}</option>
                </select>
                <select className="bb" aria-label={P.bulk.proxy} value="" onChange={e => {
                  const px = e.target.value === 'none' ? null : e.target.value;
                  void batch('set-proxy', { proxyId: px }, P.done.proxySet);
                }}>
                  <option value="" disabled>{P.bulk.proxy}</option>
                  {data.proxies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="none">{P.noProxy}</option>
                </select>
                {manager && (
                  <select className="bb" aria-label={P.bulk.assign} value="" onChange={e => {
                    const who = e.target.value === 'none' ? null : e.target.value;
                    void batch('assign', { ownerId: who }, n => P.done.assigned(n, who ? email.get(who) ?? '' : P.unassigned));
                  }}>
                    <option value="" disabled>{P.bulk.assign}</option>
                    {data.members.map(m => <option key={m.userId} value={m.userId}>{m.email}</option>)}
                    <option value="none">{P.unassigned}</option>
                  </select>
                )}
                {manager && data.departments.length > 0 && (
                  <select className="bb" aria-label={P.bulk.department} value="" onChange={e => {
                    void batch('set-department', { departmentId: e.target.value === 'none' ? null : e.target.value }, P.done.departmentSet);
                  }}>
                    <option value="" disabled>{P.bulk.department}</option>
                    {data.departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    <option value="none">{P.bulk.noDepartment}</option>
                  </select>
                )}
                {data.extensions.length > 0 && (
                  <select className="bb" aria-label={P.bulk.extensions} value="" onChange={e => {
                    const [how, id] = e.target.value.split(':');
                    const x = data.extensions.find(v => v.id === id)!;
                    void batch(how === 'add' ? 'add-extension' : 'remove-extension', { extensionId: id }, n => (how === 'add' ? P.done.extAdded(n, x.name, ids.length - n) : P.done.extRemoved(n, x.name)));
                  }}>
                    <option value="" disabled>{P.bulk.extensions}</option>
                    <optgroup label={P.bulk.install}>{data.extensions.map(x => <option key={x.id} value={`add:${x.id}`}>{x.name} · {x.kernel === 'chromium' ? 'Chromium' : 'Firefox'}</option>)}</optgroup>
                    <optgroup label={P.bulk.uninstall}>{data.extensions.map(x => <option key={x.id} value={`remove:${x.id}`}>{x.name} · {x.kernel === 'chromium' ? 'Chromium' : 'Firefox'}</option>)}</optgroup>
                  </select>
                )}
                <button type="button" className="bb" onClick={() => setTagging(true)}>{P.bulk.tag}</button>
                {manager && (
                  <select className="bb" aria-label={P.bulk.cookies} value="" onChange={e => void exportCookies(all.filter(p => sel.has(p.id)), e.target.value as 'json' | 'netscape')}>
                    <option value="" disabled>{P.bulk.cookies}</option>
                    <option value="json">{d.detail.json}</option><option value="netscape">{d.detail.netscape}</option>
                  </select>
                )}
                {manager && <button type="button" className="bb danger" onClick={() => setConfirm(true)}>{P.bulk.trash}</button>}
                <span className="sp" />
                <button type="button" className="bb plain" onClick={() => setSel(new Set())}>{d.common.clearSelection}</button>
              </>
            )}
          </div>
        )}

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th className="cb" scope="col">
                  <input type="checkbox" aria-label={d.common.selectAll} checked={list.length > 0 && shownSel === list.length}
                    ref={el => { if (el) el.indeterminate = shownSel > 0 && shownSel < list.length; }} onChange={toggleAll} />
                </th>
                <th scope="col">{P.cols.profile}</th><th scope="col">{P.cols.proxy}</th><th scope="col">{P.cols.fingerprint}</th>
                <th scope="col">{P.cols.last}</th><th className="act" scope="col">{P.cols.status}</th>
              </tr>
            </thead>
            <tbody>
              {data.profiles === null && <tr className="empty"><td colSpan={6}>{d.loading}</td></tr>}
              {data.profiles !== null && !list.length && (
                <tr className="empty"><td colSpan={6}>
                  {all.length
                    ? <><p><b>{P.emptyMatch}</b> {q && P.emptyFor(q)} {P.emptyHint(all.length)}</p>
                      <button type="button" className="btn btn-line btn-xs" onClick={() => { setQ(''); setStatus('all'); setGroup('all'); }}>{P.clearFilters}</button></>
                    : <p><b>{P.emptyNone}</b></p>}
                </td></tr>
              )}
              {list.map(p => (
                <Row key={p.id} d={d} p={p} h={healthOf.get(p.id)!} group={groupLabel(p)} now={now} cur={p.id === cur} checked={sel.has(p.id)}
                  status={data.status[p.id]} progress={data.progress[kernelKey(p.kernel, p.kernelVersion)]}
                  onToggle={() => toggle(p.id)} onView={() => view(p.id)} onOpen={() => void open(p)} onStop={() => void stop(p)} />
              ))}
            </tbody>
          </table>
        </div>
        {data.proxies.some(p => p.lastCheck?.geo) && <p className="attrib page-attrib">{d.common.attribution}</p>}
      </main>

      <aside className="detail" aria-label={d.detail.profile}>
        <ProfileDetail
          d={d} lang={lang} p={curProfile} h={curProfile ? healthOf.get(curProfile.id)! : null} now={now} busy={busyFix}
          status={curProfile ? data.status[curProfile.id] : undefined}
          progress={curProfile ? data.progress[kernelKey(curProfile.kernel, curProfile.kernelVersion)] : undefined}
          group={curProfile ? groupLabel(curProfile) : ''}
          owner={curProfile?.ownerId ? email.get(curProfile.ownerId) ?? null : null}
          activity={recent.entries ?? []}
          onClose={() => setDrawer(false)} onOpen={() => curProfile && void open(curProfile)} onStop={() => curProfile && void stop(curProfile)}
          onEdit={() => curProfile && onEdit(curProfile.id)} onTrash={() => curProfile && void trash([curProfile.id])}
          canTakeOver={manager} canTrash={manager} canExport={manager} onTakeover={() => curProfile && void takeover(curProfile)}
          onExport={format => curProfile && void exportCookies([curProfile], format)} onImport={text => curProfile && void importCookies(curProfile, text)}
          onFix={f => curProfile && void fix(curProfile, f)}
        />
      </aside>
      {drawer && <div className="scrim drawer-scrim" onClick={() => setDrawer(false)} />}
    </div>
  );
}

interface RowProps {
  d: Dict; p: Profile; h: Health; group: string; now: number; cur: boolean; checked: boolean;
  status?: WorkspaceData['status'][string]; progress?: WorkspaceData['progress'][string];
  onToggle(): void; onView(): void; onOpen(): void; onStop(): void;
}

function Row({ d, p, h, group, now, cur, checked, status, progress, onToggle, onView, onOpen, onStop }: RowProps){
  const P = d.profiles;
  const geo = h.geo, ms = h.px?.lastCheck?.ms;
  const latency = { none: null, unchecked: <span className="lat">{P.unchecked}</span>, down: <span className="lat down">{P.noResponse}</span>,
    ok: <span className="lat ok">{P.ms(ms ?? 0)}</span>, slow: <span className="lat slow">{P.ms(ms ?? 0)}</span> }[h.proxy];
  const downloading = progress && !progress.finished && !progress.error;
  const away = elsewhere(p);
  let act;
  if (status?.state === 'running') act = <>
    <span className="run"><span className="d" aria-hidden="true" /><span className="sr">{P.runningFor}</span><span>{runTime(now - (status.startedAt ?? now))}</span></span>
    <button type="button" className="btn btn-xs btn-line" aria-label={P.stopX(p.name)} onClick={onStop}>{P.stop}</button>
  </>;
  else if (status) act = <span className="starting"><span className="spin" aria-hidden="true" />{busyLabel(d, status.state)}</span>;
  else if (downloading) act = <span className="starting"><span className="spin" aria-hidden="true" />{P.downloading(percent(progress))}</span>;
  else if (away) act = <span className="away" title={away.email}>{P.inUseOn(away.deviceName ?? away.email)}</span>;
  else act = <button type="button" className="btn btn-xs btn-open" aria-label={P.openX(p.name)} onClick={onOpen}>{P.open}</button>;

  return (
    <tr className={cur ? 'cur' : ''} data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a')) onView(); }}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td className="prof">
        <button type="button" className="rowlink" onClick={onView}>{p.name}</button>
        {p.tags.map(t => <span key={t} className="tag">{t}</span>)}
        <span className="l2"><span className="mono">#{number(p)}</span> · {group}</span>
      </td>
      <td className="pxc">
        <span className="l1">{geo ? <><span className="cc">{geo.country}</span>{geo.city ?? geo.countryName}</> : h.px ? h.px.name : P.noProxy}</span>
        {h.px && <span className="l2">{latency} · {h.px.type.toUpperCase()}</span>}
      </td>
      <td className="fpc">
        <span className="l1">{d.os[p.os]}</span>
        <span className="l2">{h.mismatch ? <span className="flag warn">{P.mismatch}</span> : engineName(p.kernel, p.kernelVersion)}</span>
      </td>
      <td className="lastc"><span className="who">{status || away ? P.inUse : ago(p.lastOpenedAt, d, now)}</span></td>
      <td className="act"><span className="actin">{act}</span></td>
    </tr>
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
      <header className="id-head"><span>{O.head}</span><button type="button" className="linkish" onClick={onHide}>{O.hide}</button></header>
      <h2>{O.title}</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : s === next ? 'next' : ''} data-step={s.key}>
            <span className="num" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
            <div><b>{s.title}</b><p className="muted">{s.done ? O.done : s.body}</p></div>
            {s === next && s.action && <button type="button" className="btn btn-stamp btn-sm" onClick={s.action}>{s.title}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
