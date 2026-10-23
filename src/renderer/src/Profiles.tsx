import { useEffect, useMemo, useState } from 'react';
import { folio, isApiError, type Profile, type Workspace } from './api';
import { engineName, health, type Fix, type Health } from './checks';
import { kernelKey, type BatchAction, type WorkspaceData } from './data';
import { ago, errorText, runTime, type Dict, type Lang } from './i18n';
import { ProfileDetail, busyLabel, elsewhere } from './ProfileDetail';
import { useActivity } from './Activity';
import { Icon, Num, percent, useNow, useToast } from './ui';
import { Select } from './Select';
import { ExitMap, type Pin, type PinState } from './ExitMap';
import { Flag } from './Flag';
import { mod } from './CommandPalette';
import { Rosette } from './Rosette';

export type GroupFilter = 'all' | 'none' | string;
type Status = 'all' | 'running' | 'issues';
type Sort = 'recent' | 'name' | 'latency';

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
  // The detail column (or drawer) shows only while a profile is picked.
  const curProfile = (drawer && all.find(p => p.id === cur)) || null;
  const recent = useActivity(ws.id, `&profileId=${cur ?? ''}`, data, 5, !!curProfile);
  const filtered = group !== 'all' || status !== 'all' || !!q;

  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'));
  async function open(p: Profile){
    const why = await data.launch(p);
    if (why === 'kernel_missing'){ setCur(p.id); setDrawer(true); toast(d.profiles.done.failed(p.name, d.launch.kernel_missing)); }
    else if (why) toast(d.launch.download_failed);
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

  // Window sync is a Studio and Company feature; the selected profiles sync in list order, the first one leading.
  const syncAllowed = ws.subscription.plan !== 'free';
  async function startSync(){
    const s = await folio.startWindowSync(list.filter(p => sel.has(p.id)).map(p => p.id));
    toast(s ? P.done.syncing(all.find(p => p.id === s.leader)?.name ?? '', s.members.length - 1) : P.done.syncFailed);
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

  // The summary beside the map.
  const h = [...healthOf.values()];
  const down = h.filter(x => x.proxy === 'down').length, slow = h.filter(x => x.proxy === 'slow').length;
  const mism = h.filter(x => x.mismatch).length;
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
  const countries = new Set(h.map(x => x.geo?.country).filter(Boolean)).size;

  const showOnboarding = !onboardingHidden && data.profiles !== null && !(data.proxies.length && all.length && all.some(p => p.lastOpenedAt));
  const hideOnboarding = () => { setOnboardingHidden(true); try { localStorage.setItem(ONBOARDING_KEY(ws.id), 'hidden'); } catch { /* per-session only */ } };

  return (
    <div className="page with-detail">
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

        <div className="hero">
          <section className="map-card" aria-label={P.map.title}>
            <header className="map-h">
              <b>{P.map.title}</b>
              <span className="legend"><span><span className="d good" />{P.map.legend.run}</span><span><span className="d boot" />{P.map.legend.boot}</span><span><span className="d bad" />{P.map.legend.bad}</span></span>
              {pins.length > 0 && <span className="map-n">{P.map.count(pins.length, countries)}</span>}
            </header>
            {pins.length > 0
              ? <ExitMap pins={pins} label={P.map.label} onPick={key => setQ(key)} />
              : (
                <div className="map-empty">
                  <b>{P.map.emptyTitle}</b>
                  <p className="hint">{P.map.emptyBody}</p>
                  {manager && (data.proxies.length
                    ? <button type="button" className="btn btn-sm btn-secondary" disabled={data.checking.size > 0} onClick={() => void data.check(data.proxies.map(p => p.id))}>{P.map.check}</button>
                    : <button type="button" className="btn btn-sm btn-secondary" onClick={onAddProxy}>{P.map.add}</button>)}
                </div>
              )}
          </section>
          <section className="stack" aria-label={P.sum.usage}>
            <button type="button" className="sum" onClick={() => setStatus('running')}>
              <span className="k"><span className={`d${running ? ' good pulse' : ''}`} aria-hidden="true" />{P.sum.running}</span>
              <span className="n"><Num value={running} /><small>{P.sum.of(all.length)}</small></span>
            </button>
            <button type="button" className="sum" onClick={() => setStatus('issues')} title={P.sum.proxyNote(down, slow) || P.sum.proxyOk}>
              <span className="k"><span className={`d${down ? ' bad' : slow ? ' warn' : ' good'}`} aria-hidden="true" />{P.sum.proxy}</span>
              <span className="n"><Num value={down + slow} /></span>
            </button>
            <button type="button" className="sum" onClick={() => setStatus('issues')} title={mism ? P.sum.fpNote(mism) : P.sum.fpOk}>
              <span className="k"><span className={`d${mism ? ' warn' : ' good'}`} aria-hidden="true" />{P.sum.fp}</span>
              <span className="n"><Num value={mism} /></span>
            </button>
            <div className="sum">
              <span className="k"><span className="d" aria-hidden="true" />{P.sum.usage}</span>
              <span className="n"><Num value={all.length} /><small>{P.sum.usageOf(limit)}</small></span>
              <span className="meter"><i style={{ width: `${Math.min(100, (all.length / limit) * 100)}%` }} /></span>
            </div>
          </section>
        </div>

        <div className="filters">
          <div className="seg" role="group" aria-label={P.filter.label}>
            {(['all', 'running', 'issues'] as const).map(s => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{P.filter[s]}</button>)}
          </div>
          {group !== 'all' && (
            <button type="button" className="chip" aria-label={P.clearGroup(group === 'none' ? d.groups.none : groupName.get(group) ?? '')} onClick={() => setGroup('all')}>
              {P.groupChip(group === 'none' ? d.groups.none : groupName.get(group) ?? '')} <span aria-hidden="true">×</span>
            </button>
          )}
          <span className="sort"><span id="pf-sort">{P.sort}</span>
            <Select variant="sm" labelledBy="pf-sort" value={sort} onChange={v => setSort(v as Sort)} options={(['recent', 'name', 'latency'] as const).map(s => ({ value: s, label: P.sorts[s] }))} />
          </span>
        </div>

        {data.sync && <SyncBar d={d} data={data} names={new Map(all.map(p => [p.id, p.name]))} />}
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
                <button type="button" className="bb" disabled={ids.length < 2 || !syncAllowed} title={!syncAllowed ? d.windowSync.upgrade : ids.length < 2 ? P.bulk.syncTwo : undefined} onClick={() => void startSync()}>{P.bulk.sync}</button>
                <Select variant="bar" action label={P.bulk.move} placeholder={P.bulk.move} value="" searchPh={d.form.searchPh}
                  options={[...data.groups.map(g => ({ value: g.id, label: g.name })), { value: 'none', label: d.groups.none }]}
                  onChange={v => { const g = v === 'none' ? null : v; void batch('move', { groupId: g }, n => P.done.moved(n, g ? groupName.get(g) ?? '' : d.groups.none)); }} />
                <Select variant="bar" action label={P.bulk.proxy} placeholder={P.bulk.proxy} value="" searchPh={d.form.searchPh}
                  options={[...data.proxies.map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined })), { value: 'none', label: P.noProxy }]}
                  onChange={v => void batch('set-proxy', { proxyId: v === 'none' ? null : v }, P.done.proxySet)} />
                {manager && (
                  <Select variant="bar" action label={P.bulk.assign} placeholder={P.bulk.assign} value="" searchPh={d.form.searchPh}
                    options={[...data.members.map(m => ({ value: m.userId, label: m.email })), { value: 'none', label: P.unassigned }]}
                    onChange={v => { const who = v === 'none' ? null : v; void batch('assign', { ownerId: who }, n => P.done.assigned(n, who ? email.get(who) ?? '' : P.unassigned)); }} />
                )}
                {manager && data.departments.length > 0 && (
                  <Select variant="bar" action label={P.bulk.department} placeholder={P.bulk.department} value=""
                    options={[...data.departments.map(x => ({ value: x.id, label: x.name })), { value: 'none', label: P.bulk.noDepartment }]}
                    onChange={v => void batch('set-department', { departmentId: v === 'none' ? null : v }, P.done.departmentSet)} />
                )}
                {data.extensions.length > 0 && (
                  <Select variant="bar" action label={P.bulk.extensions} placeholder={P.bulk.extensions} value="" searchPh={d.form.searchPh}
                    options={(['add', 'remove'] as const).flatMap(how => data.extensions.map(x => ({ value: `${how}:${x.id}`, label: `${x.name} · ${x.kernel === 'chromium' ? 'Chromium' : 'Firefox'}`, group: how === 'add' ? P.bulk.install : P.bulk.uninstall })))}
                    onChange={v => {
                      const [how, id] = v.split(':');
                      const x = data.extensions.find(e => e.id === id)!;
                      void batch(how === 'add' ? 'add-extension' : 'remove-extension', { extensionId: id }, n => (how === 'add' ? P.done.extAdded(n, x.name, ids.length - n) : P.done.extRemoved(n, x.name)));
                    }} />
                )}
                <button type="button" className="bb" onClick={() => setTagging(true)}>{P.bulk.tag}</button>
                {manager && (
                  <Select variant="bar" action label={P.bulk.cookies} placeholder={P.bulk.cookies} value=""
                    options={[{ value: 'json', label: d.detail.json }, { value: 'netscape', label: d.detail.netscape }]}
                    onChange={v => void exportCookies(all.filter(p => sel.has(p.id)), v as 'json' | 'netscape')} />
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
              {data.profiles === null && Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="skel" aria-hidden="true"><td className="cb"><i /></td><td><i className="w2" /><i /></td><td><i /><i className="w3" /></td><td><i /><i className="w3" /></td><td><i className="w3" /></td><td><i className="w2" /></td></tr>
              ))}
              {data.profiles !== null && !list.length && (
                <tr className="empty"><td colSpan={6}>
                  {all.length
                    ? <><p><b>{P.emptyMatch}</b> {q && P.emptyFor(q)} {P.emptyHint(all.length)}</p>
                      <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setQ(''); setStatus('all'); setGroup('all'); }}>{P.clearFilters}</button></>
                    : <><Rosette size={200} /><p><b>{P.emptyNone}</b></p></>}
                </td></tr>
              )}
              {list.map(p => (
                <Row key={p.id} d={d} p={p} h={healthOf.get(p.id)!} group={groupLabel(p)} now={now} cur={p.id === curProfile?.id} checked={sel.has(p.id)}
                  sync={data.sync?.leader === p.id ? 'leader' : data.sync?.members.some(m => m.id === p.id) ? 'follower' : null}
                  status={data.status[p.id]} progress={data.progress[kernelKey(p.kernel, p.kernelVersion)]} checking={!!p.proxyId && data.checking.has(p.proxyId)}
                  onToggle={() => toggle(p.id)} onView={() => view(p.id)} onOpen={() => void open(p)} onStop={() => void stop(p)} onCheck={() => p.proxyId && void data.check([p.proxyId])} />
              ))}
            </tbody>
          </table>
        </div>
        {data.proxies.some(p => p.lastCheck?.geo) && <p className="attrib page-attrib">{d.common.attribution}</p>}
      </main>

      {curProfile && <>
        <aside className="detail" aria-label={d.detail.profile}>
          <ProfileDetail
            d={d} lang={lang} p={curProfile} h={healthOf.get(curProfile.id)!} now={now} busy={busyFix}
            status={data.status[curProfile.id]} progress={data.progress[kernelKey(curProfile.kernel, curProfile.kernelVersion)]}
            size={data.kernels.find(k => k.kind === curProfile.kernel && k.version === curProfile.kernelVersion)?.size ?? null} failed={data.failed[curProfile.id]}
            group={groupLabel(curProfile)} owner={curProfile.ownerId ? email.get(curProfile.ownerId) ?? null : null}
            activity={recent.entries ?? []}
            onClose={() => setDrawer(false)} onOpen={() => void open(curProfile)} onStop={() => void stop(curProfile)}
            onEdit={() => onEdit(curProfile.id)} onTrash={() => void trash([curProfile.id])}
            canTakeOver={manager} canTrash={manager} canExport={manager} onTakeover={() => void takeover(curProfile)}
            onExport={format => void exportCookies([curProfile], format)} onImport={text => void importCookies(curProfile, text)}
            onFix={f => void fix(curProfile, f)}
          />
        </aside>
        <div className="scrim drawer-scrim" onClick={() => setDrawer(false)} />
      </>}
    </div>
  );
}

interface RowProps {
  d: Dict; p: Profile; h: Health; group: string; now: number; cur: boolean; checked: boolean; sync: 'leader' | 'follower' | null;
  status?: WorkspaceData['status'][string]; progress?: WorkspaceData['progress'][string]; checking: boolean;
  onToggle(): void; onView(): void; onOpen(): void; onStop(): void; onCheck(): void;
}

// The status column: what the profile is doing, and the one thing to do about it.
function Row({ d, p, h, group, now, cur, checked, sync, status, progress, checking, onToggle, onView, onOpen, onStop, onCheck }: RowProps){
  const P = d.profiles;
  const geo = h.geo, ms = h.px?.lastCheck?.ms;
  const latency = { none: null, unchecked: <span className="lat">{P.unchecked}</span>, down: <span className="lat down">{P.noResponse}</span>,
    ok: <span className="lat ok">{P.ms(ms ?? 0)}</span>, slow: <span className="lat slow">{P.ms(ms ?? 0)}</span> }[h.proxy];
  const downloading = progress && !progress.finished && !progress.error;
  const away = elsewhere(p);
  // Opening: proxy, engine, sign-ins, browser, lit in turn.
  const boarding = (at: number, label: string) => (
    <span className="boarding" role="status"><span className="steps" aria-hidden="true">{P.stages.map((s, i) => <i key={s} className={i < at ? 'done' : i === at ? 'now' : ''} />)}</span>{label}</span>
  );
  let st, act = null;
  if (status?.state === 'running'){
    st = <span className="st run"><span className="d" aria-hidden="true" />{P.st.running} · <span className="mono">{runTime(now - (status.startedAt ?? now))}</span></span>;
    act = <button type="button" className="btn btn-xs btn-secondary" aria-label={P.stopX(p.name)} onClick={onStop}>{P.stop}</button>;
  }
  else if (status?.state === 'saving') st = <span className="st boot"><span className="spin" aria-hidden="true" />{busyLabel(d, status.state)}</span>;
  else if (status) st = status.state === 'restoring' ? boarding(2, P.stage.restore) : status.stage === 'launch' ? boarding(3, P.stage.launch) : boarding(0, P.stage.proxy);
  else if (downloading) st = boarding(1, P.downloading(percent(progress)));
  else if (away) st = <span className="st away" title={away.email}><span className="d" aria-hidden="true" />{P.inUseOn(away.deviceName ?? away.email)}</span>;
  else if (h.checks[0]?.id === 'proxy-down'){
    st = <span className="st bad"><span className="d" aria-hidden="true" />{P.st.proxyDown}</span>;
    act = <button type="button" className="btn btn-xs btn-secondary" disabled={checking} onClick={onCheck}>{checking && <span className="spin" aria-hidden="true" />}{P.checkProxy}</button>;
  }
  else {
    st = <span className="st idle"><span className="d" aria-hidden="true" />{P.st.idle}</span>;
    act = <button type="button" className="btn btn-xs btn-secondary" aria-label={P.openX(p.name)} onClick={onOpen}><Icon name="play" />{P.open}</button>;
  }

  return (
    <tr className={cur ? 'cur' : ''} data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a')) onView(); }}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td className="prof">
        <span className="prof-cell"><Flag country={geo?.country ?? null} kernel={p.kernel} /><span>
          <button type="button" className="rowlink" onClick={onView}>{p.name}</button>
          {p.tags.map(t => <span key={t} className="tag">{t}</span>)}
          <span className="l2"><span className="mono">#{number(p)}</span> · {group}</span>
        </span></span>
      </td>
      <td className="pxc">
        <span className="l1">{h.px && <span className={`d ${h.proxy === 'ok' ? 'good' : h.proxy === 'slow' ? 'warn' : h.proxy === 'down' ? 'bad' : ''}`} aria-hidden="true" />}{geo ? geo.city ?? geo.countryName : h.px ? h.px.name : P.noProxy}</span>
        {h.px && <span className="l2">{latency} · {h.px.type.toUpperCase()}</span>}
      </td>
      <td className="fpc">
        <span className="os-cell"><Icon name={p.os} /><span>
          <span className="l1">{d.os[p.os]}</span>
          <span className="l2">{h.mismatch ? <span className="flag warn">{P.mismatch}</span> : engineName(p.kernel, p.kernelVersion)}</span>
        </span></span>
      </td>
      <td className="lastc"><span className="who">{status || away ? P.inUse : ago(p.lastOpenedAt, d, now)}</span></td>
      <td className="act"><span className="actin">{st}{sync && <span className="synctag">{sync === 'leader' ? d.windowSync.leaderTag : d.windowSync.followerTag}</span>}{act}</span></td>
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
