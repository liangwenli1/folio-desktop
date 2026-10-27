// The proxy library: the lines as a table (or cards) with where they exit and how they answer, filtered by protocol,
// region and status, twenty a page; a quick look at one beside the list, and its own page (how it connects, the profiles
// on it, its checks); adding and editing (checked before saving), importing lists after a line-by-line preview, checking
// (through this computer, results shared with the team), backup lines, and changing the proxy a profile goes out through.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { CheckResult } from '@shared/bridge';
import { folio, isApiError, type ImportLine, type Profile, type Proxy, type ProxyImport } from './api';
import { SLOW_MS, VERY_SLOW_MS, latencyTone, proxyState } from './checks';
import type { WorkspaceData } from './data';
import { ago, checkWhy, errorText, type Dict, type Lang } from './i18n';
import { dayLabel, time } from './Activity';
import { Act, BulkBar, Cancel, CopyBtn, Empty, Flt, Icon, ListFailed, Loading, Modal, MoreMenu, PanelEdge, PartialFailed, Switch, Tabs, ViewSwitch, useChanged, useToast, useView } from './ui';
import { Flag } from './Flag';
import { Pager } from './Pager';
import { Select, SelectField } from './Select';
import { useTrail } from './TopBar';
import { elsewhere } from './ProfileDetail';

type ProxyType = Proxy['type'];
const TYPES: ProxyType[] = ['socks5', 'http', 'https'];
const HOST = /^[A-Za-z0-9.:_-]+$/;

type Status = 'all' | 'ok' | 'issues' | 'unchecked' | 'unbound';
const STATUSES: Status[] = ['all', 'ok', 'issues', 'unchecked', 'unbound'];
const matches = (p: Proxy, s: Status) => {
  const st = proxyState(p);
  return s === 'all' || (s === 'issues' ? st === 'slow' || st === 'down' : s === 'unbound' ? !p.profiles : st === s);
};
// Where it comes out: the last check that got through.
const exitOf = (p: Proxy) => (p.lastCheck?.ok ? { geo: p.lastCheck.geo, ip: p.lastCheck.ip } : p.lastExit ? { geo: p.lastExit.geo, ip: p.lastExit.ip } : null);
const uptime = (p: Proxy) => (p.history.length ? Math.round((p.history.filter(h => h.ok).length / p.history.length) * 100) : null);
const place = (g: { city?: string | null; countryName: string }) => [g.city, g.countryName].filter(Boolean).join(', ');
type Tab = 'overview' | 'bound' | 'checks';

// `openId`: a proxy whose page shows first (from a profile's page).
export function ProxiesPage({ d, lang, data, openId, onAdd, onEdit, onImport, onShowProfiles }: {
  d: Dict; lang: Lang; data: WorkspaceData; openId: string | null; onAdd(): void; onEdit(id: string): void; onImport(): void; onShowProfiles(ids: string[], open?: string): void;
}){
  const toast = useToast();
  const X = d.proxies;
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | ProxyType>('all');
  const [region, setRegion] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const [view, setView] = useView<'cards' | 'table'>('proxies', 'table');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [unbinding, setUnbinding] = useState<string[] | null>(null);
  // The one looked at beside the list, and the one whose own page shows in place of the list (on which tab).
  const [cur, setCur] = useState<string | null>(null);
  const [open, setOpen] = useState<[string, Tab] | null>(openId ? [openId, 'overview'] : null);
  const [replacing, setReplacing] = useState<Profile | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const byId = useMemo(() => new Map(data.proxies.map(p => [p.id, p])), [data.proxies]);
  // The countries the lines exit in, for the region filter.
  const regions = useMemo(() => {
    const at = new Map<string, string>();
    for (const p of data.proxies){ const g = exitOf(p)?.geo; if (g) at.set(g.country, g.countryName); }
    return [...at].sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [data.proxies, lang]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.proxies.filter(p => {
      const ex = exitOf(p);
      if ((type !== 'all' && p.type !== type) || (region !== 'all' && ex?.geo?.country !== region) || !matches(p, status)) return false;
      return !needle || [p.name, p.host, p.username, p.notes, ex?.ip, ex?.geo?.city, ex?.geo?.country, ex?.geo?.countryName].join(' ').toLowerCase().includes(needle);
    });
  }, [data.proxies, q, type, region, status]);
  const pages = Math.max(1, Math.ceil(list.length / size)), at = Math.min(page, pages);
  const rows = list.slice((at - 1) * size, at * size);
  const ids = [...sel].filter(id => byId.has(id));
  const shownSel = rows.filter(p => sel.has(p.id)).length;
  const on = (id: string) => data.profiles.filter(p => p.proxyId === id);
  const curProxy = cur ? byId.get(cur) ?? null : null;
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');

  // Several at once are a job (a long one shows its progress meanwhile). When some don't answer, the task center says
  // why, and the failed ones can run again.
  async function check(targets: string[]){
    const r = await data.check(targets);
    checked(r.job, targets.length - r.failed, r.failed);
  }
  function checked(job: string | null, ok: number, failed: number){
    if (!failed || !job) return toast(X.checked(ok + failed));
    toast(d.states.partly(d.jobs.kinds['proxy.check'], ok, failed), [
      { label: d.states.view, fn: () => data.showJob(job) },
      { label: d.common.retry, fn: () => void data.rerun(job).then(j => checked(job, j.ok, j.failed), fail) }
    ], 'bad');
  }
  async function remove(targets: string[]){
    setConfirm(null);
    try {
      await Promise.all(targets.map(id => folio.api('DELETE', `/proxies/${id}`)));
      setSel(new Set());
      if (cur && targets.includes(cur)) setCur(null);
      if (open && targets.includes(open[0])) setOpen(null);
      toast(X.deleted(targets.length));
    } catch (e){ fail(e); }
    data.refresh('proxies', 'profiles');
  }
  // The profiles on these lines go without a proxy until another is chosen.
  async function unbind(targets: string[]){
    setUnbinding(null);
    const bound = data.profiles.filter(p => p.proxyId && targets.includes(p.proxyId)).map(p => p.id);
    try { toast(X.bulk.unbound(await data.batch('set-proxy', bound, { proxyId: null }))); setSel(new Set()); } catch (e){ fail(e); }
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const item = (p: Proxy): ProxyItem => ({
    d, p, busy: data.checking.has(p.id), backup: p.backupId ? byId.get(p.backupId)?.name ?? null : null, checked: sel.has(p.id), cur: p.id === cur,
    onToggle: () => toggle(p.id), onView: () => setCur(p.id), onCheck: () => void data.check([p.id]), onEdit: () => onEdit(p.id),
    onDelete: () => setConfirm([p.id]), onShow: () => onShowProfiles(on(p.id).map(x => x.id))
  });
  const reset = () => setPage(1);
  const filtered = !!q || type !== 'all' || region !== 'all' || status !== 'all';
  const count = (s: Status) => data.proxies.filter(p => matches(p, s)).length;
  const dialogs = <>
    {confirm && (
      <Modal kind="bad" title={X.confirmDelete(confirm.length)} onClose={() => setConfirm(null)} foot={<>
        <Cancel />
        <Act className="btn btn-danger solid" run={() => remove(confirm)}>{X.bulkDelete}</Act>
      </>}><p>{X.confirmNote}</p></Modal>
    )}
    {replacing && <ReplaceProxyDialog d={d} data={data} profile={replacing} onClose={() => setReplacing(null)} onDone={() => setReplacing(null)} />}
  </>;

  const pageProxy = open ? byId.get(open[0]) ?? null : null;
  if (pageProxy) return <>
    <ProxyPage key={pageProxy.id} {...item(pageProxy)} lang={lang} data={data} tab={open![1]} profiles={on(pageProxy.id)} onBack={() => setOpen(null)}
      onOpenProfile={id => onShowProfiles(on(pageProxy.id).map(x => x.id), id)} onReplace={setReplacing} />
    {dialogs}
  </>;

  const bound = data.profiles.filter(p => p.proxyId && ids.includes(p.proxyId)).length;
  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          {/* What the lines are doing, in a line under the title (v2 07). */}
          <div className="ttl"><h1>{X.title}</h1></div>
          <span className="sp" />
          <button className="btn btn-secondary" type="button" disabled={!data.proxies.length || data.checking.size > 0} title={data.checking.size ? d.common.checking : undefined} onClick={() => void check(data.proxies.map(p => p.id))}>
            {data.checking.size ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{X.checkAll}
          </button>
          <button className="btn btn-primary" type="button" onClick={onAdd}><Icon name="plus" />{X.add}</button>
        </header>
        <Tabs className="page-tabs" label={X.title} value="all" tabs={['all']} name={() => X.allTab} count={() => data.proxies.length} onChange={() => {}}
          after={<button type="button" className="tab-link" onClick={onImport}>{X.importTab}</button>} />

        <div className={`side-wrap${curProxy ? ' with-panel' : ''}`}>
          <section className="side-main list-card" aria-label={X.title}>
            <div className="filters">
              <Flt label={X.filterLabels.keyword} grow>
                <label className="search">
                  <Icon name="search" /><span className="sr">{X.search}</span>
                  <input type="search" placeholder={X.searchPh} value={q} onChange={e => { setQ(e.target.value); reset(); }} autoComplete="off" />
                </label>
              </Flt>
              <Flt label={X.filterLabels.type}><span className="grp-pick"><Select label={X.filter.type} value={type} onChange={v => { setType(v as 'all' | ProxyType); reset(); }}
                options={[{ value: 'all', label: X.filter.types }, ...TYPES.map(t => ({ value: t, label: t.toUpperCase() }))]} /></span></Flt>
              <Flt label={X.filterLabels.region}><span className="grp-pick"><Select label={X.filter.region} value={region} onChange={v => { setRegion(v); reset(); }}
                options={[{ value: 'all', label: X.filter.regions }, ...regions.map(([c, n]) => ({ value: c, label: n }))]} /></span></Flt>
              <Flt label={X.filterLabels.status}><span className="grp-pick"><Select label={X.filter.state} value={status} onChange={v => { setStatus(v as Status); reset(); }}
                options={STATUSES.map(s => ({ value: s, label: s === 'all' ? X.filter.states : X.states[s], ...(s === 'all' ? {} : { count: count(s) }) }))} /></span></Flt>
              <button type="button" className="btn btn-secondary flt-reset" disabled={!filtered} onClick={() => { setQ(''); setType('all'); setRegion('all'); setStatus('all'); reset(); }}>{d.profiles.reset}</button>
              <ViewSwitch label={d.profiles.views.label} value={view} onChange={setView} options={[['table', 'list', d.profiles.views.list], ['cards', 'grid', d.profiles.views.cards]]} />
            </div>

            {ids.length > 0 && (
              <BulkBar n={ids.length} label={d.common.picked.proxies(ids.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
                <button type="button" className="bb lead" onClick={() => void check(ids)}><Icon name="refresh" />{X.bulkCheck}</button>
                <button type="button" className="bb" disabled={!bound} title={bound ? undefined : X.bulk.unbindNone} onClick={() => setUnbinding(ids)}><Icon name="link" />{X.bulk.unbind}</button>
                <button type="button" className="bb danger" onClick={() => setConfirm(ids)}><Icon name="trash" />{X.bulkDelete}</button>
              </BulkBar>
            )}

            {data.loaded.has('proxies') && <PartialFailed d={d} data={data} kinds={['profiles']} />}
            {data.loadFailed.has('proxies')
              ? <div className="cards-empty"><ListFailed d={d} data={data} kind="proxies" /></div>
              : !data.loaded.has('proxies') ? <Loading cards={view === 'cards'} cols={8} />
              : !list.length && <div className="cards-empty">{data.proxies.length
                ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setType('all'); setRegion('all'); setStatus('all'); reset(); }}>{d.states.clear}</button>
                  </Empty>
                : <Empty icon="proxies" title={X.emptyTitle} text={X.empty}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}><Icon name="plus" />{X.addFirst}</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onImport}><Icon name="upload" />{X.importList}</button>
                  </Empty>}</div>}
            {list.length > 0 && (view === 'cards'
              ? <ul className="pxg">{rows.map(p => <ProxyCard key={p.id} {...item(p)} />)}</ul>
              : (
                <div className="tw px-t">
                  <table>
                    <thead>
                      <tr>
                        <th className="cb" scope="col">
                          <input type="checkbox" aria-label={d.common.selectAll} checked={rows.length > 0 && shownSel === rows.length}
                            ref={el => { if (el) el.indeterminate = shownSel > 0 && shownSel < rows.length; }}
                            onChange={() => setSel(s => { const n = new Set(s); rows.forEach(p => (shownSel === rows.length ? n.delete(p.id) : n.add(p.id))); return n; })} />
                        </th>
                        <th scope="col">{X.cols.name}</th><th className="mid" scope="col">{X.cols.type}</th><th className="c-addr" scope="col">{X.cols.address}</th><th className="ic" scope="col">{X.cols.exit}</th>
                        <th className="mid" scope="col">{X.cols.status}</th><th className="mid" scope="col">{X.cols.latency}</th><th className="mid" scope="col">{X.cols.profiles}</th><th className="act" scope="col">{X.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th>
                      </tr>
                    </thead>
                    <tbody>{rows.map(p => <ProxyRow key={p.id} {...item(p)} />)}</tbody>
                  </table>
                </div>
              ))}
            {list.length > 0 && <Pager d={d} total={list.length} page={page} size={size} onPage={setPage} onSize={n => { setSize(n); setPage(1); }} />}
          </section>
          {curProxy && <ProxyPanel {...item(curProxy)} lang={lang} data={data} profiles={on(curProxy.id)} onClose={() => setCur(null)}
            onPage={t => setOpen([curProxy.id, t])} onOpenProfile={id => onShowProfiles(on(curProxy.id).map(x => x.id), id)} />}
        </div>
        {data.proxies.some(p => p.lastCheck?.geo) && <p className="attrib page-attrib">{d.common.attribution}</p>}

        {unbinding && (
          <Modal kind="warn" title={X.bulk.unbindTitle(unbinding.length, bound)} onClose={() => setUnbinding(null)} foot={<>
            <Cancel />
            <Act className="btn btn-primary" run={() => unbind(unbinding)}>{X.bulk.unbind}</Act>
          </>}><p>{X.bulk.unbindNote}</p></Modal>
        )}
        {dialogs}
      </main>
    </div>
  );
}

interface ProxyItem {
  d: Dict; p: Proxy; busy: boolean; backup: string | null; checked: boolean; cur: boolean;
  onToggle(): void; onView(): void; onCheck(): void; onEdit(): void; onDelete(): void; onShow(): void;
}

// What a proxy is doing now: a coloured dot and a word.
function ProxyState({ d, p, busy }: { d: Dict; p: Proxy; busy: boolean }){
  const X = d.proxies, s = proxyState(p);
  const [tone, text] = busy ? ['boot', d.common.checking] : s === 'ok' ? ['run', X.states.ok] : s === 'slow' ? ['warn', X.states.slow] : s === 'down' ? ['bad', X.states.down] : ['idle', X.states.unchecked];
  const why = s === 'down' && !busy ? checkWhy(d, p.lastCheck?.error ?? null) : null;
  return <span className={`dot-st ${tone}`} title={why ?? undefined}>{text}</span>;
}
// How long a line that is down has been: failures in a row at the end, and when it last answered.
function downNote(d: Dict, p: Proxy){
  let n = 0;
  for (let i = p.history.length - 1; i >= 0 && !p.history[i].ok; i--) n++;
  const lastOk = [...p.history].reverse().find(h => h.ok);
  return d.proxies.downNote(n, lastOk ? ago(lastOk.at, d) : null);
}
const latency = (d: Dict, p: Proxy) => (p.lastCheck?.ok ? d.profiles.ms(p.lastCheck.ms ?? 0) : '—');
// The colour of its latency; none before its first check.
const tone = (p: Proxy) => (p.lastCheck ? latencyTone(p.lastCheck.ok ? p.lastCheck.ms : null) : '');
// The profiles on it: a number that opens them in the profile list.
const Count = ({ p, onShow }: ProxyItem) => (p.profiles ? <button type="button" className="count-link" onClick={onShow}>{p.profiles}</button> : <span className="muted">0</span>);
// Where it exits: its flag and region, with the IP on hover (the panel and the page show it).
const Exit = ({ p }: { p: Proxy }) => {
  const ex = exitOf(p);
  return ex?.geo ? <span className="px-exit" title={ex.ip ?? undefined}><Flag country={ex.geo.country} size="xs" />{ex.geo.city ?? ex.geo.countryName}</span> : <span className="muted hang">—</span>;
};

function Actions({ d, p, busy, onCheck, onDelete }: ProxyItem){
  return <MoreMenu vertical label={d.proxies.actionsX(p.name)} items={[
    { label: d.common.check, onClick: onCheck, disabled: busy }, { label: d.proxies.bulkDelete, onClick: onDelete, danger: true }
  ]} />;
}

function ProxyCard(props: ProxyItem){
  const { d, p, busy, backup, checked, cur, onToggle, onView, onEdit } = props;
  const X = d.proxies, ex = exitOf(p), s = proxyState(p), up = uptime(p);
  return (
    <li className={`pxc${s === 'down' ? ' bad' : ''}${cur ? ' cur' : ''}`} data-id={p.id}>
      <div className="pxc-h">
        <Flag country={ex?.geo?.country ?? null} />
        <span><b>{ex?.geo ? ex.geo.city ?? ex.geo.countryName : s === 'unchecked' ? X.never : X.noExit}</b><small className="mono">{ex?.ip ?? '—'}</small></span>
        <ProxyState d={d} p={p} busy={busy} />
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} />
      </div>
      <p className="pxc-n"><button type="button" className="rowlink" onClick={onView}>{p.name}</button><span className="cc">{p.type.toUpperCase()}</span></p>
      <p className="l2 mono">{[`${p.host}:${p.port}`, p.username].filter(Boolean).join(' · ')}{backup && ` · ${X.backupOf(backup)}`}</p>
      <div className="pxc-bars" title={X.history(p.history.length)}><Bars history={p.history} /></div>
      {s === 'down' && <p className="pxc-down"><Icon name="alert" />{downNote(d, p)}</p>}
      <div className="pxc-f">
        <span><small>{X.labels.latency}</small><b className={`lat ${tone(p)}`}>{latency(d, p)}</b></span>
        <span><small>{X.labels.uptime}</small><b className="mono">{up === null ? '—' : `${up}%`}</b></span>
        <span><small>{X.labels.profiles}</small><b><Count {...props} /></b></span>
        <span className="sp" />
        <button type="button" className="btn btn-sm btn-text" onClick={onEdit}>{d.common.edit}</button>
        <Actions {...props} />
      </div>
    </li>
  );
}

function ProxyRow(props: ProxyItem){
  const { d, p, busy, backup, checked, cur, onToggle, onView, onEdit } = props;
  const X = d.proxies;
  return (
    <tr data-id={p.id} className={[cur && 'cur', checked && 'on'].filter(Boolean).join(' ')} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a,.menu,td.cb')) onView(); }}>
      <td className="cb" onClick={e => { if (e.target === e.currentTarget) onToggle(); }}><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td><span className="l1"><button type="button" className="rowlink" onClick={onView}>{p.name}</button></span>{backup && <span className="l2">{X.backupOf(backup)}</span>}</td>
      <td className="mono mid">{p.type.toUpperCase()}</td>
      <td className="c-addr"><span className="addr mono">{p.host}:{p.port}<CopyBtn text={`${p.host}:${p.port}`} label={d.common.copy} done={d.common.copied} /></span></td>
      <td><Exit p={p} /></td>
      <td className="mid" data-testid="proxy-check"><ProxyState d={d} p={p} busy={busy} /></td>
      <td className="mid"><b className={`lat ${tone(p)}`}>{latency(d, p)}</b></td>
      <td className="mid"><Count {...props} /></td>
      <td className="act"><button type="button" className="btn btn-sm btn-text" onClick={onEdit}>{d.common.edit}</button></td>
      <td className="more"><Actions {...props} /></td>
    </tr>
  );
}

// A proxy's last 20 checks as bars, oldest first: the taller, the slower; a failure is a short red mark; checks not made
// yet are grey stubs.
function Bars({ history }: { history: Proxy['history'] }){
  const top = Math.max(300, ...history.map(h => h.ms ?? 0));
  const slots = [...Array<null>(Math.max(0, 20 - history.length)).fill(null), ...history.slice(-20)];
  return (
    <span className="bars" aria-hidden="true">
      {slots.map((h, i) => <i key={i} className={!h ? 'none' : !h.ok ? 'miss' : (h.ms ?? 0) > VERY_SLOW_MS ? 'vslow' : (h.ms ?? 0) > SLOW_MS ? 'slow' : 'ok'} style={h?.ok ? { height: `${35 + (65 * (h.ms ?? 0)) / top}%` } : undefined} />)}
    </span>
  );
}

// Its latest checks, newest first, each with when it was.
function CheckLog({ d, lang, p, n }: { d: Dict; lang: Lang; p: Proxy; n: number }){
  const D = d.proxies.detail;
  if (!p.history.length) return <p className="hint">{D.noHistory}</p>;
  return (
    <ol className="ck-log" data-testid="check-log">
      {[...p.history].reverse().slice(0, n).map(h => (
        <li key={h.at}><time>{dayLabel(h.at, d, lang)} {time(h.at, lang)}</time><span className={`dot-st ${({ good: 'run', warn: 'warn', bad: 'bad' })[latencyTone(h.ok ? h.ms : null)]}`}>{h.ok ? D.ok(h.ms ?? 0) : D.failed}</span></li>
      ))}
    </ol>
  );
}

// The profiles on a line: which group each is in and whether it runs; open one, or move it to another proxy.
function BoundTable({ d, data, profiles, onOpenProfile, onReplace }: { d: Dict; data: WorkspaceData; profiles: Profile[]; onOpenProfile(id: string): void; onReplace?(p: Profile): void }){
  const D = d.proxies.detail;
  const groups = new Map(data.groups.map(g => [g.id, g]));
  if (!profiles.length) return <p className="hint">{D.none}</p>;
  return (
    <div className="tw bound-t dense">
      <table>
        <thead><tr><th scope="col">{d.form.name}</th><th className="mid" scope="col">{d.profiles.cols.group}</th><th className="mid" scope="col">{d.profiles.cols.status}</th><th className="act" scope="col">{d.profiles.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th></tr></thead>
        <tbody>
          {profiles.map(x => {
            const run = data.status[x.id]?.state === 'running', g = x.groupId ? groups.get(x.groupId) : null;
            return (
              <tr key={x.id} data-profile={x.name}>
                <td><button type="button" className="rowlink" onClick={() => onOpenProfile(x.id)}>{x.name}</button></td>
                <td className="mid">{g ? <span className={`gtag gc-${g.color}`}>{g.name}</span> : <span className="muted">{d.groups.none}</span>}</td>
                <td className="mid"><span className={`dot-st ${run ? 'run' : 'idle'}`}>{run ? d.profiles.st.running : d.profiles.tabs.stopped}</span></td>
                <td className="act"><button type="button" className="btn btn-sm btn-text" onClick={() => onOpenProfile(x.id)}>{D.viewProfile}</button></td>
                <td className="more">{onReplace && <MoreMenu label={d.profiles.actionsX(x.name)} items={[{ label: d.proxies.replace.title, onClick: () => onReplace(x) }]} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// A quick look beside the list: how it connects, its latest checks and the profiles on it, with the way to its page.
function ProxyPanel(props: ProxyItem & { lang: Lang; data: WorkspaceData; profiles: Profile[]; onClose(): void; onPage(t: Tab): void; onOpenProfile(id: string): void }){
  const { d, lang, data, p, busy, profiles, onClose, onPage, onOpenProfile } = props;
  const X = d.proxies, D = X.detail, ex = exitOf(p);
  const when = (iso: string) => `${dayLabel(iso, d, lang)} ${time(iso, lang)}`;
  const groups = new Map(data.groups.map(g => [g.id, g]));
  return (
    <aside className="sec side-panel" aria-label={D.label}><PanelEdge />
      <div className="sec-row"><h3>{D.label}</h3><button type="button" className="icon-btn bare" aria-label={d.common.close} title={d.common.close} onClick={onClose}><Icon name="x" /></button></div>
      <div className="side-h"><b>{p.name}</b><ProxyState d={d} p={p} busy={busy} /></div>
      <dl className="kvl">
        <dt>{X.type}</dt><dd className="mono">{p.type.toUpperCase()}</dd>
        <dt>{X.host}</dt><dd className="mono">{p.host}:{p.port}<CopyBtn text={`${p.host}:${p.port}`} label={d.common.copy} done={d.common.copied} /></dd>
        <dt>{D.region}</dt><dd>{ex?.geo ? <><Flag country={ex.geo.country} size="xs" />{place(ex.geo)}</> : '—'}</dd>
        <dt>{D.exitIp}</dt><dd className="mono">{ex?.ip ?? '—'}</dd>
        <dt>{D.created}</dt><dd>{when(p.createdAt)}</dd>
        <dt>{D.lastChecked}</dt><dd>{p.lastCheck ? when(p.lastCheck.checkedAt) : X.never}</dd>
        {p.lastCheck && !p.lastCheck.ok && <><dt>{D.failure}</dt><dd className="bad-t">{checkWhy(d, p.lastCheck.error) ?? X.states.down}</dd></>}
      </dl>
      <div className="sec-row"><h4>{D.history}</h4>{p.history.length > 0 && <button type="button" className="linkish act-link" onClick={() => onPage('checks')}>{D.viewAll}</button>}</div>
      <CheckLog d={d} lang={lang} p={p} n={5} />
      <div className="sec-row"><h4>{D.bound(profiles.length)}</h4>{profiles.length > 0 && <button type="button" className="linkish act-link" onClick={() => onPage('bound')}>{D.manage}</button>}</div>
      {profiles.length
        ? <ul className="bound">{profiles.slice(0, 5).map(x => {
            const g = x.groupId ? groups.get(x.groupId) : null;
            return <li key={x.id}><button type="button" className="rowlink" onClick={() => onOpenProfile(x.id)}>{x.name}</button>{g && <span className={`gtag gc-${g.color}`}>{g.name}</span>}</li>;
          })}</ul>
        : <p className="hint">{D.none}</p>}
      <div><button type="button" className="btn btn-sm btn-secondary" onClick={() => onPage('overview')}>{D.details}</button></div>
    </aside>
  );
}

// A proxy's own page: how it connects and how it has answered, the profiles on it, and its checks.
function ProxyPage(props: ProxyItem & { lang: Lang; data: WorkspaceData; tab: Tab; profiles: Profile[]; onBack(): void; onOpenProfile(id: string): void; onReplace(p: Profile): void }){
  const { d, lang, data, p, busy, backup, profiles, onBack, onCheck, onEdit, onDelete, onOpenProfile, onReplace } = props;
  const X = d.proxies, D = X.detail, ex = exitOf(p), s = proxyState(p), up = uptime(p);
  const [tab, setTab] = useState<Tab>(props.tab);
  const when = (iso: string) => `${dayLabel(iso, d, lang)} ${time(iso, lang)}`;
  const running = profiles.some(x => data.status[x.id]);
  // Escape goes back to the list, unless a dialog is open or a field has the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal') && !(e.target as HTMLElement).closest?.('input,textarea,[role="combobox"]')) onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);
  useTrail([{ label: X.title, go: onBack }, { label: p.name }], `${p.id}:${p.name}`);
  return (
    <div className="page">
      <main className="main pd" aria-label={D.label}>
        <header className="pd-head">
          <div className="pd-t">
            <div className="pd-n"><h1 data-testid="proxy-name">{p.name}</h1><ProxyState d={d} p={p} busy={busy} /><span className="cc">{p.type.toUpperCase()}</span></div>
            <p className="pd-sub"><span>{D.createdOn(when(p.createdAt))}</span>{p.lastCheck && <><span className="sep" aria-hidden="true" /><span>{D.checkedOn(when(p.lastCheck.checkedAt))}</span></>}
              {p.lastCheck && !p.lastCheck.ok && <><span className="sep" aria-hidden="true" /><span className="bad-t">{checkWhy(d, p.lastCheck.error) ?? X.states.down}</span></>}</p>
          </div>
          <span className="sp" />
          <button type="button" className="btn btn-secondary" onClick={onEdit}><Icon name="edit" />{X.formEdit}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onCheck}>{busy ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{X.test}</button>
          <MoreMenu vertical label={X.actionsX(p.name)} items={[{ label: X.bulkDelete, onClick: onDelete, danger: true }]} />
        </header>
        <Tabs className="page-tabs" label={D.label} value={tab} tabs={['overview', 'bound', 'checks']} name={t => D.tabs[t]} count={t => t === 'bound' && profiles.length} onChange={setTab} />
        <div className="pd-body">
          {tab === 'overview' && <>
            <dl className="dstats">
              <div><dt>{D.exitIp}</dt><dd className="mono">{ex?.ip ?? '—'}{ex?.ip && <CopyBtn text={ex.ip} label={d.common.copy} done={d.common.copied} />}</dd></div>
              <div><dt>{D.region}</dt><dd title={ex?.geo ? place(ex.geo) : undefined}>{ex?.geo ? <><Flag country={ex.geo.country} size="xs" />{ex.geo.city ?? ex.geo.countryName}</> : '—'}</dd></div>
              <div><dt>{D.latency}</dt><dd className={`lat ${tone(p)}`}>{p.lastCheck?.ok ? latency(d, p) : s === 'down' ? X.states.down : '—'}</dd></div>
              <div><dt>{D.profiles}</dt><dd>{profiles.length}</dd></div>
            </dl>
            {ex?.geo && <p className="attrib">{d.common.attribution}</p>}
            {s === 'down' && (
              <Empty icon="alertTri" tone="bad" title={d.states.proxyDown} text={d.states.proxyDownText(`${p.host}:${p.port}`)}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onCheck}>{d.states.checkAgain}</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>{d.states.editProxy}</button>
              </Empty>
            )}
            <div className="pd-grid px-grid">
              <div className="pd-col">
                <section className="sec" aria-label={D.config}>
                  <h3>{D.config}</h3>
                  <dl className="kvl two">
                    <dt>{X.name}</dt><dd>{p.name}</dd>
                    <dt>{X.type}</dt><dd className="mono">{p.type.toUpperCase()}</dd>
                    <dt>{X.host}</dt><dd className="mono">{p.host}<CopyBtn text={p.host} label={d.common.copy} done={d.common.copied} /></dd>
                    <dt>{X.port}</dt><dd className="mono">{p.port}</dd>
                    <dt>{X.auth}</dt><dd>{p.username || p.hasPassword ? D.authOn : D.authOff}</dd>
                    {p.username && <><dt>{X.user}</dt><dd className="mono">{p.username}</dd></>}
                    {p.username !== null || p.hasPassword ? <><dt>{X.pass}</dt><dd>{p.hasPassword ? D.passSet : D.passNone}</dd></> : null}
                    <dt>{X.backup}</dt><dd>{backup ?? X.backupNone}</dd>
                    <dt>{D.uptime}</dt><dd>{up === null ? '—' : D.uptimeOf(up, p.history.length)}</dd>
                    {p.notes && <><dt>{X.notes}</dt><dd className="notes wide">{p.notes}</dd></>}
                  </dl>
                </section>
                <section className="sec" aria-label={D.bound(profiles.length)}>
                  <h3>{D.bound(profiles.length)}</h3>
                  <BoundTable d={d} data={data} profiles={profiles} onOpenProfile={onOpenProfile} onReplace={onReplace} />
                </section>
              </div>
              <section className="sec" aria-label={D.history}>
                <div className="sec-row"><h3>{D.history}</h3>{p.history.length > 0 && <button type="button" className="linkish act-link" onClick={() => setTab('checks')}>{D.viewAll}</button>}</div>
                {p.history.length > 0 && <Bars history={p.history} />}
                <CheckLog d={d} lang={lang} p={p} n={8} />
                {running && <p className="notice warn">{D.runningWarn}</p>}
              </section>
            </div>
          </>}
          {tab === 'bound' && <section className="sec" aria-label={D.bound(profiles.length)}><BoundTable d={d} data={data} profiles={profiles} onOpenProfile={onOpenProfile} onReplace={onReplace} /></section>}
          {tab === 'checks' && (
            <section className="sec" aria-label={D.history}>
              {p.history.length > 0 && <Bars history={p.history} />}
              <CheckLog d={d} lang={lang} p={p} n={20} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

// What a check made from a form found: the exit, its location and the time it took, or why it couldn't connect.
export function CheckCard({ d, r }: { d: Dict; r: CheckResult }){
  const X = d.proxies;
  return (
    <div className={`px-result ${r.ok ? 'ok' : 'bad'}`} role="status" data-testid="proxy-test">
      <p><Icon name={r.ok ? 'check' : 'alert'} /><b>{r.ok ? X.testOk : X.testBad}</b>{!r.ok && r.error && <span>{checkWhy(d, r.error) ?? errorText(d, r.error)}</span>}</p>
      {!r.ok && r.error && X.fix[r.error] && <p className="hint">{X.fix[r.error]}</p>}
      {r.ok && (
        <dl>
          <div><dt>{X.detail.exitIp}</dt><dd className="mono">{r.ip}</dd></div>
          <div><dt>{X.detail.region}</dt><dd>{r.geo ? <><Flag country={r.geo.country} size="xs" />{place(r.geo)}</> : '—'}</dd></div>
          <div><dt>{X.detail.latency}</dt><dd className={`mono lat ${latencyTone(r.ms)}`}>{d.profiles.ms(r.ms ?? 0)}</dd></div>
        </dl>
      )}
    </div>
  );
}

// A new proxy's toast offers its page (`onShow`).
export function ProxyForm({ d, wsId, data, proxy, onClose, onShow }: { d: Dict; wsId: string; data: WorkspaceData; proxy?: Proxy; onClose(): void; onShow(id: string): void }){
  const X = d.proxies;
  const toast = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(proxy?.name ?? '');
  const [type, setType] = useState<ProxyType>(proxy?.type ?? 'socks5');
  const [host, setHost] = useState(proxy?.host ?? '');
  const [port, setPort] = useState(proxy ? String(proxy.port) : '');
  const [auth, setAuth] = useState(!!(proxy?.username || proxy?.hasPassword));
  const [username, setUsername] = useState(proxy?.username ?? '');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [backupId, setBackupId] = useState(proxy?.backupId ?? '');
  const [notes, setNotes] = useState(proxy?.notes ?? '');
  const [another, setAnother] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState<CheckResult | 'checking' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const portN = Number(port), portOk = Number.isInteger(portN) && portN >= 1 && portN <= 65535, hostOk = HOST.test(host.trim());
  const nameErr = tried && !name.trim() ? X.nameErr : null;
  const hostErr = tried && !hostOk ? X.hostErr : null;
  const portErr = tried && !portOk ? X.portErr : null;
  // The first field in error takes the focus (v2 41); checking the connection needs only the address and port.
  const firstBad = (withName: boolean) => (withName && !name.trim() ? 'px-name' : !hostOk ? 'px-host' : !portOk ? 'px-port' : null);
  // The saved password stays unless another is typed or authentication is turned off.
  const keep = auth && !password && !!proxy?.hasPassword;
  const user = auth ? username.trim() || null : null;
  // A changed detail makes the last check's result stale.
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setResult(null); };
  const req = <span className="req" aria-hidden="true">*</span>, opt = <small className="opt">{d.form.optional}</small>;
  const dirty = useChanged({ name, type, host, port, auth, username, password, backupId, notes });
  // Reached another way (v2 27): its old checks no longer count, and profiles running on this computer stop first (they
  // took the old details when they started); ones running elsewhere take the new details when they start next.
  const moved = !!proxy && (type !== proxy.type || host.trim() !== proxy.host || portN !== proxy.port || user !== proxy.username || !!password || (!auth && proxy.hasPassword));
  const bound = proxy ? data.profiles.filter(x => x.proxyId === proxy.id) : [];
  const here = bound.filter(x => data.status[x.id]), there = bound.filter(x => !data.status[x.id] && elsewhere(x));
  const stopFirst = moved && here.length > 0;

  async function test(){
    setTried(true);
    const bad = firstBad(false);
    if (bad) return document.getElementById(bad)?.focus();
    setResult('checking');
    setResult(await folio.tryProxy({ type, host: host.trim(), port: portN, username: user, password: auth ? password || null : null, ...(keep ? { passwordOf: proxy!.id } : {}) }));
  }

  async function submit(e: FormEvent){
    e.preventDefault();
    setTried(true);
    const bad = firstBad(true);
    if (bad) return document.getElementById(bad)?.focus();
    setBusy(true); setError(null);
    if (stopFirst) await Promise.all(here.map(x => folio.stopProfile(x.id)));
    const body = {
      name: name.trim(), type, host: host.trim(), port: portN, username: user, backupId: backupId || null, notes: notes.trim() || null,
      ...(keep ? {} : { password: auth ? password || null : null })
    };
    try {
      const saved = proxy
        ? await folio.api<Proxy>('PATCH', `/proxies/${proxy.id}`, body)
        : await folio.api<Proxy>('POST', `/workspaces/${wsId}/proxies`, body);
      data.refresh('proxies');
      if (proxy) toast(d.profiles.done.saved);
      else toast(X.added(saved.name), { label: d.states.view, fn: () => onShow(saved.id) });
      // New and moved proxies have no check yet.
      if (!saved.lastCheck) void data.check([saved.id]);
      if (!another || proxy) return onClose();
      setName(''); setHost(''); setPort(''); setUsername(''); setPassword(''); setNotes(''); setResult(null); setTried(false);
      nameRef.current?.focus();
    } catch (err){
      setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }

  return (
    <Modal title={proxy ? X.formEdit : X.formAdd} onClose={onClose} busy={busy} dirty={dirty} foot={<>
      {!proxy && <label className="check-row"><input type="checkbox" checked={another} onChange={e => setAnother(e.target.checked)} />{X.addMore}</label>}
      <span className="sp" />
      <Cancel />
      <button className="btn btn-primary" type="submit" form="proxy-form" disabled={busy} aria-busy={busy || undefined}>{stopFirst ? X.stopSave : X.save}</button>
    </>}>
      <form className="m-body" id="proxy-form" onSubmit={submit} noValidate>
        {error && <p className="notice error" role="alert">{error}</p>}
        {here.length + there.length > 0 && (
          <p className="notice warn" data-testid="proxy-bound">{X.bound(bound.length, here.length + there.length)}{stopFirst && ` ${X.boundHere}`}{moved && there.length > 0 && ` ${X.boundThere(there.length)}`}</p>
        )}
        <div className="field">
          <label htmlFor="px-name">{X.name}{req}</label>
          <input id="px-name" ref={nameRef} placeholder={X.namePh} value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus required
            aria-invalid={!!nameErr} aria-describedby={nameErr ? 'px-name-err' : undefined} />
          {nameErr && <p className="err" id="px-name-err">{nameErr}</p>}
        </div>
        <div className="field">
          <span className="label" id="px-type">{X.type}{req}</span>
          <div className="seg fill" role="group" aria-labelledby="px-type">
            {TYPES.map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => change(setType)(t)}>{t.toUpperCase()}</button>)}
          </div>
        </div>
        <div className="row2 host-port">
          <div className="field">
            <label htmlFor="px-host">{X.host}{req}</label>
            <input id="px-host" className="mono-in" value={host} onChange={e => change(setHost)(e.target.value)} spellCheck={false} autoComplete="off" required aria-invalid={!!hostErr} aria-describedby={hostErr ? 'px-host-err' : undefined} />
            {hostErr && <p className="err" id="px-host-err">{hostErr}</p>}
          </div>
          <div className="field">
            <label htmlFor="px-port">{X.port}{req}</label>
            <input id="px-port" className="mono-in" inputMode="numeric" value={port} onChange={e => change(setPort)(e.target.value.replace(/\D/g, ''))} required aria-invalid={!!portErr} aria-describedby={portErr ? 'px-port-err' : undefined} />
            {portErr && <p className="err" id="px-port-err">{portErr}</p>}
          </div>
        </div>
        <div className="px-auth">
          <Switch label={X.auth} checked={auth} onChange={change(setAuth)} />
          <p className="hint">{X.authHint}</p>
        </div>
        {auth && (
          <div className="row2">
            <div className="field">
              <label htmlFor="px-user">{X.user}{opt}</label>
              <input id="px-user" value={username} onChange={e => change(setUsername)(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <div className="field">
              <label htmlFor="px-pass">{X.pass}{opt}</label>
              <span className="pass-in">
                <input id="px-pass" type={reveal ? 'text' : 'password'} value={password} onChange={e => change(setPassword)(e.target.value)} autoComplete="new-password" placeholder={proxy?.hasPassword ? X.passKeep : ''} />
                <button type="button" className="icon-btn bare" aria-label={reveal ? X.conceal : X.reveal} title={reveal ? X.conceal : X.reveal} onClick={() => setReveal(r => !r)}><Icon name={reveal ? 'eyeOff' : 'eye'} /></button>
              </span>
            </div>
          </div>
        )}
        <SelectField label={X.backup} optional value={backupId} onChange={setBackupId} hint={X.backupHint} search searchPh={d.form.searchPh}
          options={[{ value: '', label: X.backupNone }, ...data.proxies.filter(p => p.id !== proxy?.id).map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined }))]} />
        <div className="field">
          <label htmlFor="px-notes">{X.notes}{opt}</label>
          <input id="px-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />
        </div>
        <div className="px-test">
          <button type="button" className="btn btn-secondary btn-sm" disabled={result === 'checking'} onClick={() => void test()}>
            {result === 'checking' ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{X.test}
          </button>
          {result && result !== 'checking' && <span className="hint">{X.lastTest(X.justNow)}</span>}
        </div>
        {moved && !result && <p className="notice info">{X.recheck}</p>}
        {result && result !== 'checking' && <CheckCard d={d} r={result} />}
      </form>
    </Modal>
  );
}

// The list as typed, one line per row with its number, and the lines that can't be read marked, so a line the preview
// flags is easy to find. The marks sit behind the text and scroll with it.
function ListEditor({ id, value, bad, placeholder, onChange }: { id: string; value: string; bad: Set<number>; placeholder: string; onChange(v: string): void }){
  const [at, setAt] = useState({ top: 0, left: 0 });
  const rows = value.split('\n');
  return (
    <div className="pi-edit">
      <div className="pi-gut" aria-hidden="true">
        <div style={{ transform: `translateY(${-at.top}px)` }}>{rows.map((_, i) => <span key={i} className={bad.has(i + 1) ? 'bad' : undefined}>{i + 1}</span>)}</div>
      </div>
      <div className="pi-text">
        <div className="pi-marks" aria-hidden="true" style={{ transform: `translate(${-at.left}px, ${-at.top}px)` }}>
          {rows.map((r, i) => <span key={i} className={bad.has(i + 1) ? 'bad' : undefined}>{r || ' '}</span>)}
        </div>
        <textarea id={id} wrap="off" value={value} spellCheck={false} autoFocus placeholder={placeholder}
          onChange={e => onChange(e.target.value)} onScroll={e => setAt({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })} />
      </div>
    </div>
  );
}

// Importing a list, pasted or from a file: every line is read first (address, already saved or listed above, or why it
// can't be one), then the valid ones come in, named from a pattern when one is given.
export function ProxyImportDialog({ d, wsId, data, onClose }: { d: Dict; wsId: string; data: WorkspaceData; onClose(): void }){
  const X = d.proxies, I = X.imp;
  const toast = useToast();
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [type, setType] = useState<ProxyType>('socks5');
  const [pattern, setPattern] = useState('');
  const [skip, setSkip] = useState(true);
  const [lines, setLines] = useState<ImportLine[] | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const read = useCallback(async () => {
    if (!text.trim()){ setLines(null); return; }
    setReading(true); setError(null);
    try { setLines((await folio.api<{ lines: ImportLine[] }>('POST', `/workspaces/${wsId}/proxies/import/preview`, { text, defaultType: type })).lines); }
    catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setReading(false); }
  }, [text, type, wsId]);
  // Read again a moment after typing stops.
  useEffect(() => { const t = setTimeout(() => void read(), 400); return () => clearTimeout(t); }, [read]);
  const valid = lines?.filter(l => l.ok) ?? [];
  const bad = (lines?.length ?? 0) - valid.length;
  // What would be added: every valid line, or (skipping duplicates) the ones neither saved nor listed above.
  const going = valid.filter(l => !skip || !(l.saved || l.repeat)).length;
  async function pick(e: ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f){ setFile(f.name); setText(await f.text()); }
  }
  async function submit(){
    setBusy(true); setError(null);
    try {
      const r = await folio.api<ProxyImport>('POST', `/workspaces/${wsId}/proxies/import`, { text, defaultType: type, skipDuplicates: skip, ...(pattern.trim() ? { namePattern: pattern.trim() } : {}) });
      // The lines as a job the task center lists, settled at once: what was brought in, and why the rest wasn't.
      const job = await folio.api<{ id: string }>('POST', `/workspaces/${wsId}/jobs`, { kind: 'proxy.import', finish: true, items: (lines ?? []).map(l => ({
        targetId: String(l.line), name: l.ok ? `${l.host}:${l.port}` : l.text.slice(0, 200), result: l.ok ? { ok: true } : { ok: false, error: l.why }
      })) }).catch(() => null);
      data.refresh('proxies');
      void data.check(r.proxies.filter(p => !p.lastCheck).map(p => p.id));
      if (bad && job) toast(d.states.partly(d.jobs.kinds['proxy.import'], valid.length, bad), { label: d.states.view, fn: () => data.showJob(job.id) }, 'bad');
      else toast(I.done(r.added, new Set(r.proxies.map(p => p.id)).size - r.added));
      onClose();
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setBusy(false); }
  }
  const example = (pattern.trim() || I.namePh).replaceAll('{n}', '1') + I.sep + (pattern.trim() || I.namePh).replaceAll('{n}', '2');
  return (
    <Modal wide title={I.title} onClose={onClose} busy={busy} dirty={!!(text.trim() || file || pattern)} foot={<>
      <label className="check-row" title={I.skipHelp}><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />{I.skip}</label>
      <span className="sp" />
      <Cancel />
      <button className="btn btn-secondary" type="button" disabled={reading || !text.trim()} onClick={() => void read()}>{I.reparse}</button>
      <button className="btn btn-primary" type="button" aria-busy={busy || undefined} disabled={busy || reading || !going} onClick={() => void submit()}>{I.submit(going)}</button>
    </>}>
      <div className="m-body px-imp">
        {error && <p className="notice error" role="alert">{error}</p>}
        <Tabs label={I.title} value={mode} tabs={['text', 'file']} name={m => I.modes[m]} onChange={setMode} />
        <div className="row2">
          <SelectField label={I.protocol} value={type} onChange={v => setType(v as ProxyType)} hint={I.protocolHint} options={TYPES.map(t => ({ value: t, label: t.toUpperCase() }))} />
          <div className="field">
            <label htmlFor="pi-name">{I.naming}<small className="opt">{d.form.optional}</small></label>
            <input id="pi-name" placeholder={I.namePh} value={pattern} onChange={e => setPattern(e.target.value)} maxLength={60} />
            <p className="hint">{I.nameHint(example)}</p>
          </div>
        </div>
        <div className="pi-grid">
          <div className="field">
            <label htmlFor="pi-text">{I.list}<span className="req" aria-hidden="true">*</span><small className="opt">{I.listHint}</small></label>
            {mode === 'text'
              ? <ListEditor id="pi-text" value={text} bad={new Set(lines?.flatMap(l => (l.ok ? [] : [l.line])))} onChange={v => { setText(v); setFile(null); }}
                  placeholder={'192.0.2.10:1080:user:pass\nuser:pass@198.51.100.20:1080\nsocks5://user:pass@203.0.113.30:1080'} />
              : <div className="ck-file">
                  <label className="btn btn-secondary file-btn"><Icon name="upload" />{I.chooseFile}<input type="file" accept=".txt,.csv,text/plain" onChange={e => void pick(e)} /></label>
                  <span className="muted">{file ?? I.noFile}</span>
                </div>}
            <p className="hint">{I.formats}</p>
          </div>
          <aside className="pi-notes" aria-label={I.notesTitle}>
            <p><Icon name="info" /><b>{I.notesTitle}</b></p>
            <ol>{I.notes.map(n => <li key={n}>{n}</li>)}</ol>
          </aside>
        </div>
        {lines && lines.length > 0 && <>
          <div className="sec-row">
            <h3 className="ck-h">{I.preview}</h3>
            <span className="ck-counts" data-testid="import-counts">{I.counts(lines.length)} · <span className="good-t">{I.valid(valid.length)}</span> · <span className={bad ? 'bad-t' : ''}>{I.invalid(bad)}</span></span>
          </div>
          <div className="tw ck-prev">
            <table>
              <thead><tr><th className="mid" scope="col">{I.cols.line}</th><th scope="col">{I.cols.address}</th><th className="mid" scope="col">{I.cols.port}</th><th scope="col">{I.cols.result}</th></tr></thead>
              <tbody>
                {lines.slice(0, 500).map(l => (
                  <tr key={l.line} data-line={l.line} className={l.ok ? '' : 'bad-row'}>
                    <td className="mono muted mid">{l.line}</td>
                    <td className="mono">{l.ok ? l.host : l.text}</td>
                    <td className="mono mid">{l.ok ? l.port : '—'}</td>
                    <td>{l.ok
                      ? <span className="ck-ok"><Icon name="check" />{I.ok}{(l.saved || l.repeat) && <small>{skip ? (l.saved ? I.saved : I.repeat) : I.again}</small>}</span>
                      : <span className="ck-bad"><Icon name="alert" />{I.why[l.why]}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bad > 0 && <p className="notice warn">{I.invalidNote}</p>}
        </>}
      </div>
    </Modal>
  );
}

// Choosing another proxy for one profile: the library to pick from (lines that don't answer can't be picked), a check of
// the one picked, and a reminder about the time zone and language. A profile running here changes only once stopped.
export function ReplaceProxyDialog({ d, data, profile, onClose, onDone }: { d: Dict; data: WorkspaceData; profile: Profile; onClose(): void; onDone(): void }){
  const X = d.proxies, R = X.replace;
  const toast = useToast();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | ProxyType>('all');
  const [region, setRegion] = useState('all');
  const [pick, setPick] = useState('');
  const [result, setResult] = useState<CheckResult | 'checking' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = data.status[profile.id];
  const current = data.proxies.find(p => p.id === profile.proxyId);
  const regions = [...new Map(data.proxies.flatMap(p => { const g = exitOf(p)?.geo; return g ? [[g.country, g.countryName] as const] : []; })).entries()];
  const needle = q.trim().toLowerCase();
  const list = data.proxies.filter(p => p.id !== profile.proxyId && (type === 'all' || p.type === type) && (region === 'all' || exitOf(p)?.geo?.country === region)
    && (!needle || [p.name, p.host].join(' ').toLowerCase().includes(needle)));
  async function confirm(){
    setBusy(true); setError(null);
    try {
      if (!(await data.patch(profile, { proxyId: pick }))){ setError(d.profiles.done.stale); return; }
      toast(R.done(profile.name, data.proxies.find(p => p.id === pick)?.name ?? ''));
      onDone();
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setBusy(false); }
  }
  return (
    <Modal wide title={R.title} onClose={onClose} foot={<>
      <span className="sp" />
      <Cancel />
      <button className="btn btn-primary" type="button" aria-busy={busy || undefined} disabled={busy || !pick || !!status} onClick={() => void confirm()}>{R.confirm}</button>
    </>}>
      <div className="m-body px-rep">
        {error && <p className="notice error" role="alert">{error}</p>}
        <p>{R.lead(profile.name)}</p>
        <dl className="rep-now">
          <div><dt>{R.current}</dt><dd>{current ? <span className="badge">{current.name}</span> : <span className="muted">{d.profiles.noProxy}</span>}</dd></div>
          <div><dt>{R.state}</dt><dd>{status ? <span className="dot-st run">{d.profiles.st.running}</span> : <span className="dot-st idle">{d.profiles.tabs.stopped}</span>}</dd></div>
        </dl>
        {status && <p className="notice warn">{R.running}<button type="button" className="btn btn-sm btn-secondary" onClick={() => void folio.stopProfile(profile.id)}>{R.stop}</button></p>}
        <div className="filters inline">
          <label className="search"><Icon name="search" /><span className="sr">{X.search}</span>
            <input type="search" placeholder={X.searchPh} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
          <span className="grp-pick"><Select label={X.filter.type} value={type} onChange={v => setType(v as 'all' | ProxyType)}
            options={[{ value: 'all', label: X.filter.types }, ...TYPES.map(t => ({ value: t, label: t.toUpperCase() }))]} /></span>
          <span className="grp-pick"><Select label={X.filter.region} value={region} onChange={setRegion}
            options={[{ value: 'all', label: X.filter.regions }, ...regions.map(([c, n]) => ({ value: c, label: n }))]} /></span>
        </div>
        <div className="tw rep-t dense">
          <table>
            <thead><tr><th scope="col" className="cb">{R.pick}</th><th scope="col">{X.cols.name}</th><th scope="col">{X.cols.type}</th><th className="ic" scope="col">{X.cols.exit}</th><th className="mid" scope="col">{X.cols.status}</th><th className="mid" scope="col">{X.cols.latency}</th><th className="mid" scope="col">{X.cols.profiles}</th></tr></thead>
            <tbody>
              {!list.length && <tr className="empty"><td colSpan={7}>{data.proxies.length > 1
                ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText} />
                : <Empty icon="proxies" title={X.emptyTitle} text={X.empty} />}</td></tr>}
              {list.map(p => {
                const down = proxyState(p) === 'down';
                return (
                  <tr key={p.id} data-id={p.id} className={down ? 'off' : pick === p.id ? 'cur' : ''} onClick={() => { if (!down){ setPick(p.id); setResult(null); } }}>
                    <td className="cb"><input type="radio" name="rep-px" checked={pick === p.id} disabled={down} onChange={() => { setPick(p.id); setResult(null); }} aria-label={p.name} /></td>
                    <td>{p.name}</td><td className="mono">{p.type.toUpperCase()}</td><td><Exit p={p} /></td>
                    <td className="mid"><ProxyState d={d} p={p} busy={data.checking.has(p.id)} /></td><td className="mid"><b className={`lat ${tone(p)}`}>{latency(d, p)}</b></td><td className="mid">{p.profiles}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-test">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!pick || result === 'checking'} onClick={() => { setResult('checking'); void folio.checkProxy(pick).then(setResult); }}>
            {result === 'checking' ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{R.test}
          </button>
        </div>
        {result && result !== 'checking' && <CheckCard d={d} r={result} />}
        <p className="notice warn">{R.warn}</p>
      </div>
    </Modal>
  );
}
