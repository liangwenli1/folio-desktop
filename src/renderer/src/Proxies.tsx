// The proxy library: the lines as a table (or cards) with where they exit and how they answer, filtered by type, region
// and status; a line's details in a dialog (its recent checks, the profiles on it); adding and editing (checked before
// saving), importing lists, checking (through this computer, results shared with the team) and backup lines.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { CheckResult } from '@shared/bridge';
import { folio, isApiError, type Profile, type Proxy, type ProxyImport } from './api';
import { SLOW_MS, VERY_SLOW_MS, latencyTone, proxyState } from './checks';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict, type Lang } from './i18n';
import { dayLabel, time } from './Activity';
import { BulkBar, CopyBtn, DetailDialog, Icon, LoadFailed, Modal, MoreMenu, Switch, ViewSwitch, useToast, useView, type IconName } from './ui';
import { Flag } from './Flag';
import { Select, SelectField } from './Select';

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

export function ProxiesPage({ d, lang, data, onAdd, onEdit, onImport, onShowProfiles }: {
  d: Dict; lang: Lang; data: WorkspaceData; onAdd(): void; onEdit(id: string): void; onImport(): void; onShowProfiles(ids: string[], open?: string): void;
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
  const [cur, setCur] = useState<string | null>(null);
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
      return !needle || [p.name, p.host, p.username, ex?.ip, ex?.geo?.city, ex?.geo?.country, ex?.geo?.countryName].join(' ').toLowerCase().includes(needle);
    });
  }, [data.proxies, q, type, region, status]);
  const ids = [...sel].filter(id => byId.has(id));
  const shownSel = list.filter(p => sel.has(p.id)).length;
  const on = (id: string) => (data.profiles ?? []).filter(p => p.proxyId === id);
  const curProxy = cur ? byId.get(cur) ?? null : null;

  async function check(targets: string[]){
    await data.check(targets);
    toast(X.checked(targets.length));
  }
  async function remove(targets: string[]){
    setConfirm(null);
    try {
      await Promise.all(targets.map(id => folio.api('DELETE', `/proxies/${id}`)));
      setSel(new Set());
      if (cur && targets.includes(cur)) setCur(null);
      toast(X.deleted(targets.length));
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); }
    data.refresh('proxies', 'profiles');
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const item = (p: Proxy): ProxyItem => ({
    d, p, busy: data.checking.has(p.id), backup: p.backupId ? byId.get(p.backupId)?.name ?? null : null, checked: sel.has(p.id),
    onToggle: () => toggle(p.id), onView: () => setCur(p.id), onCheck: () => void data.check([p.id]), onEdit: () => onEdit(p.id),
    onDelete: () => setConfirm([p.id]), onShow: () => onShowProfiles(on(p.id).map(x => x.id))
  });
  const SUM: [Status, string, IconName, string][] = [['all', '', 'proxies', X.sum.total], ['ok', 'good', 'check', X.sum.ok], ['issues', 'bad', 'alert', X.sum.issues], ['unbound', '', 'link', X.sum.unbound]];

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{X.title}</h1><p className="sub">{X.lead}</p></div>
          <label className="search">
            <Icon name="search" /><span className="sr">{X.search}</span>
            <input type="search" placeholder={X.searchPh} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          <button className="btn btn-secondary" type="button" disabled={!data.proxies.length || data.checking.size > 0} title={data.checking.size ? d.common.checking : undefined} onClick={() => void check(data.proxies.map(p => p.id))}>
            {data.checking.size ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{X.checkAll}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onImport}>{X.import}</button>
          <button className="btn btn-primary" type="button" onClick={onAdd}><Icon name="plus" />{X.add}</button>
        </header>

        <section className="cards stats" aria-label={X.title}>
          {SUM.map(([s, tone, icon, label]) => (
            <button key={s} type="button" className="kc" aria-pressed={s === 'all' ? undefined : status === s} onClick={() => setStatus(s === status ? 'all' : s)}>
              <span className="kc-h"><span className={`kic ${tone}`}><Icon name={icon} /></span><small>{label}</small></span><b>{data.proxies.filter(p => matches(p, s)).length}</b>
            </button>
          ))}
        </section>

        <div className="filters">
          <span className="grp-pick"><Select label={X.filter.type} value={type} onChange={v => setType(v as 'all' | ProxyType)}
            options={[{ value: 'all', label: X.filter.types }, ...TYPES.map(t => ({ value: t, label: t.toUpperCase() }))]} /></span>
          <span className="grp-pick"><Select label={X.filter.region} value={region} onChange={setRegion}
            options={[{ value: 'all', label: X.filter.regions }, ...regions.map(([c, n]) => ({ value: c, label: n }))]} /></span>
          <span className="grp-pick"><Select label={X.filter.state} value={status} onChange={v => setStatus(v as Status)}
            options={STATUSES.map(s => ({ value: s, label: s === 'all' ? X.filter.states : X.states[s] }))} /></span>
          <span className="sp" />
          <ViewSwitch label={d.profiles.views.label} value={view} onChange={setView} options={[['table', 'list', d.profiles.views.list], ['cards', 'grid', d.profiles.views.cards]]} />
        </div>

        {data.loadFailed.has('proxies')
          ? <div className="cards-empty"><LoadFailed d={d} onRetry={() => data.refresh('proxies')} /></div>
          : !list.length && <div className="cards-empty"><p>{data.proxies.length ? d.profiles.emptyMatch : X.empty}</p></div>}
        {list.length > 0 && (view === 'cards'
          ? <ul className="pxg">{list.map(p => <ProxyCard key={p.id} {...item(p)} />)}</ul>
          : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th className="cb" scope="col">
                      <input type="checkbox" aria-label={d.common.selectAll} checked={shownSel === list.length}
                        onChange={() => setSel(shownSel === list.length ? new Set() : new Set(list.map(p => p.id)))} />
                    </th>
                    <th scope="col">{X.cols.name}</th><th scope="col">{X.cols.type}</th><th scope="col">{X.cols.address}</th><th scope="col">{X.cols.exit}</th>
                    <th scope="col">{X.cols.status}</th><th scope="col">{X.cols.latency}</th><th scope="col">{X.cols.profiles}</th><th className="act" scope="col">{X.cols.actions}</th>
                  </tr>
                </thead>
                <tbody>{list.map(p => <ProxyRow key={p.id} {...item(p)} />)}</tbody>
              </table>
            </div>
          ))}
        {data.proxies.some(p => p.lastCheck?.geo) && <p className="attrib page-attrib">{d.common.attribution}</p>}

        {ids.length > 0 && (
          <BulkBar n={ids.length} label={d.common.selected(ids.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
            <button type="button" className="bb" onClick={() => void check(ids)}><Icon name="refresh" />{X.bulkCheck}</button>
            <button type="button" className="bb danger" onClick={() => setConfirm(ids)}><Icon name="trash" />{X.bulkDelete}</button>
          </BulkBar>
        )}
        {confirm && (
          <Modal icon="trash" tone="bad" title={X.confirmDelete(confirm.length)} closeLabel={d.common.close} onClose={() => setConfirm(null)} foot={<>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
            <button type="button" className="btn btn-danger solid" onClick={() => void remove(confirm)}>{X.bulkDelete}</button>
          </>}><p>{X.confirmNote}</p></Modal>
        )}
      </main>

      {curProxy && (
        <DetailDialog label={X.detail.label} onClose={() => setCur(null)}>
          <ProxyDetail {...item(curProxy)} lang={lang} data={data} profiles={on(curProxy.id)} onClose={() => setCur(null)}
            onOpenProfile={id => onShowProfiles(on(curProxy.id).map(x => x.id), id)} />
        </DetailDialog>
      )}
    </div>
  );
}

interface ProxyItem {
  d: Dict; p: Proxy; busy: boolean; backup: string | null; checked: boolean;
  onToggle(): void; onView(): void; onCheck(): void; onEdit(): void; onDelete(): void; onShow(): void;
}

// What a proxy is doing now: a coloured dot and a word.
function ProxyState({ d, p, busy }: { d: Dict; p: Proxy; busy: boolean }){
  const X = d.proxies, s = proxyState(p);
  const [tone, text] = busy ? ['boot', d.common.checking] : s === 'ok' ? ['run', X.states.ok] : s === 'slow' ? ['boot', X.states.slow] : s === 'down' ? ['bad', X.states.down] : ['idle', X.states.unchecked];
  return <span className={`dot-st ${tone}`}>{text}</span>;
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

function Actions({ d, p, busy, onCheck, onEdit, onDelete }: ProxyItem){
  return <MoreMenu label={d.proxies.actionsX(p.name)} items={[
    { label: d.common.check, onClick: onCheck, disabled: busy }, { label: d.common.edit, onClick: onEdit }, { label: d.proxies.bulkDelete, onClick: onDelete, danger: true }
  ]} />;
}

function ProxyCard(props: ProxyItem){
  const { d, p, busy, backup, checked, onToggle, onView } = props;
  const X = d.proxies, ex = exitOf(p), s = proxyState(p), up = uptime(p);
  return (
    <li className={`pxc${s === 'down' ? ' bad' : ''}`} data-id={p.id}>
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
        <Actions {...props} />
      </div>
    </li>
  );
}

function ProxyRow(props: ProxyItem){
  const { d, p, busy, backup, checked, onToggle, onView } = props;
  const X = d.proxies, ex = exitOf(p);
  return (
    <tr data-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a,.menu')) onView(); }}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td><span className="l1"><button type="button" className="rowlink" onClick={onView}>{p.name}</button></span>{backup && <span className="l2">{X.backupOf(backup)}</span>}</td>
      <td className="mono">{p.type.toUpperCase()}</td>
      <td><span className="addr mono">{p.host}:{p.port}<CopyBtn text={`${p.host}:${p.port}`} label={d.common.copy} done={d.common.copied} /></span></td>
      <td>{ex?.geo ? <><span className="l1 px-exit"><Flag country={ex.geo.country} size="xs" />{ex.geo.city ?? ex.geo.countryName}</span><span className="l2 mono">{ex.ip}</span></> : <span className="muted">—</span>}</td>
      <td data-testid="proxy-check"><ProxyState d={d} p={p} busy={busy} /></td>
      <td><b className={`lat ${tone(p)}`}>{latency(d, p)}</b></td>
      <td><Count {...props} /></td>
      <td className="act"><Actions {...props} /></td>
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

// A line's details: where it exits and how fast, how it connects, its recent checks and the profiles on it.
function ProxyDetail(props: ProxyItem & { lang: Lang; data: WorkspaceData; profiles: Profile[]; onClose(): void; onOpenProfile(id: string): void }){
  const { d, lang, data, p, busy, backup, profiles, onClose, onCheck, onEdit, onShow, onOpenProfile } = props;
  const X = d.proxies, D = X.detail, ex = exitOf(p), s = proxyState(p), up = uptime(p);
  const groups = new Map(data.groups.map(g => [g.id, g.name]));
  return <>
    <header className="dh">
      <span className="dh-ic" aria-hidden="true"><Icon name="proxies" /></span>
      <div className="dh-t">
        <h2>{p.name}</h2>
        <span className="dh-sub"><ProxyState d={d} p={p} busy={busy} /><span className="cc">{p.type.toUpperCase()}</span></span>
      </div>
      <span className="sp" />
      <button type="button" className="btn btn-secondary" onClick={onEdit}>{d.common.edit}</button>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onCheck}>{busy ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{d.common.check}</button>
      <button type="button" className="icon-btn bare" aria-label={d.common.close} title={d.common.close} onClick={onClose}><Icon name="x" /></button>
    </header>
    <dl className="dstats">
      <div><dt>{D.exitIp}</dt><dd className="mono">{ex?.ip ?? '—'}{ex?.ip && <CopyBtn text={ex.ip} label={d.common.copy} done={d.common.copied} />}</dd></div>
      <div><dt>{D.region}</dt><dd title={ex?.geo ? place(ex.geo) : undefined}>{ex?.geo ? <><Flag country={ex.geo.country} size="xs" />{ex.geo.city ?? ex.geo.countryName}</> : '—'}</dd></div>
      <div><dt>{D.latency}</dt><dd className={`lat ${tone(p)}`}>{p.lastCheck?.ok ? latency(d, p) : s === 'down' ? X.states.down : '—'}</dd></div>
      <div><dt>{D.profiles}</dt><dd>{profiles.length}</dd></div>
    </dl>
    {ex?.geo && <p className="attrib">{d.common.attribution}</p>}
    <div className="dgrid">
      <section className="sec" aria-label={D.config}>
        <h3>{D.config}</h3>
        <dl className="kvl">
          <dt>{X.host}</dt><dd className="mono">{p.host}<CopyBtn text={p.host} label={d.common.copy} done={d.common.copied} /></dd>
          <dt>{X.port}</dt><dd className="mono">{p.port}</dd>
          <dt>{X.user}</dt><dd className="mono">{p.username ?? '—'}</dd>
          <dt>{X.pass}</dt><dd>{p.hasPassword ? D.passSet : D.passNone}</dd>
          <dt>{X.backup}</dt><dd>{backup ?? X.backupNone}</dd>
          <dt>{D.uptime}</dt><dd>{up === null ? '—' : D.uptimeOf(up, p.history.length)}</dd>
        </dl>
      </section>
      <section className="sec" aria-label={D.history}>
        <h3>{D.history}</h3>
        {p.history.length ? <>
          <Bars history={p.history} />
          <ol className="ck-log" data-testid="check-log">
            {[...p.history].reverse().slice(0, 6).map(h => (
              <li key={h.at}><time>{dayLabel(h.at, d, lang)} {time(h.at, lang)}</time><span className={`dot-st ${({ good: 'run', warn: 'boot', bad: 'bad' })[latencyTone(h.ok ? h.ms : null)]}`}>{h.ok ? D.ok(h.ms ?? 0) : D.failed}</span></li>
            ))}
          </ol>
        </> : <p className="hint">{D.noHistory}</p>}
      </section>
    </div>
    <section className="sec" aria-label={D.bound(profiles.length)}>
      <div className="sec-row"><h3>{D.bound(profiles.length)}</h3>{profiles.length > 0 && <button type="button" className="linkish" onClick={onShow}>{D.showAll}</button>}</div>
      {profiles.length ? (
        <ul className="bound">
          {profiles.map(x => {
            const run = data.status[x.id]?.state === 'running';
            return (
              <li key={x.id}>
                <button type="button" className="rowlink" onClick={() => onOpenProfile(x.id)}>{x.name}</button>
                <span className="muted">{x.groupId ? groups.get(x.groupId) ?? d.groups.none : d.groups.none}</span>
                <span className={`dot-st ${run ? 'run' : 'idle'}`}>{run ? d.profiles.st.running : d.profiles.st.idle}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="hint">{D.none}</p>}
    </section>
  </>;
}

// What a check made from a form found: the exit, its location and the time it took, or why it couldn't connect.
export function CheckCard({ d, r }: { d: Dict; r: CheckResult }){
  const X = d.proxies;
  return (
    <div className={`px-result ${r.ok ? 'ok' : 'bad'}`} role="status" data-testid="proxy-test">
      <p><Icon name={r.ok ? 'check' : 'alert'} /><b>{r.ok ? X.testOk : X.testBad}</b>{!r.ok && r.error && <span>{X.why[r.error] ?? r.error}</span>}</p>
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

export function ProxyForm({ d, wsId, data, proxy, onClose }: { d: Dict; wsId: string; data: WorkspaceData; proxy?: Proxy; onClose(): void }){
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
  const [another, setAnother] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState<CheckResult | 'checking' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const portN = Number(port), valid = HOST.test(host.trim()) && Number.isInteger(portN) && portN >= 1 && portN <= 65535;
  const hostErr = tried && !HOST.test(host.trim()) ? X.hostErr : null;
  const portErr = tried && !(Number.isInteger(portN) && portN >= 1 && portN <= 65535) ? X.portErr : null;
  // The saved password stays unless another is typed or authentication is turned off.
  const keep = auth && !password && !!proxy?.hasPassword;
  const user = auth ? username.trim() || null : null;
  // A changed detail makes the last check's result stale.
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setResult(null); };

  async function test(){
    setTried(true);
    if (!valid) return;
    setResult('checking');
    setResult(await folio.tryProxy({ type, host: host.trim(), port: portN, username: user, password: auth ? password || null : null, ...(keep ? { passwordOf: proxy!.id } : {}) }));
  }

  async function submit(e: FormEvent){
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    setBusy(true); setError(null);
    const body = {
      name: name.trim() || `${host.trim()}:${portN}`, type, host: host.trim(), port: portN, username: user, backupId: backupId || null,
      ...(keep ? {} : { password: auth ? password || null : null })
    };
    try {
      const saved = proxy
        ? await folio.api<Proxy>('PATCH', `/proxies/${proxy.id}`, body)
        : await folio.api<Proxy>('POST', `/workspaces/${wsId}/proxies`, body);
      data.refresh('proxies');
      toast(d.profiles.done.saved);
      // New and moved proxies have no check yet.
      if (!saved.lastCheck) void data.check([saved.id]);
      if (!another || proxy) return onClose();
      setName(''); setHost(''); setPort(''); setUsername(''); setPassword(''); setResult(null); setTried(false);
      nameRef.current?.focus();
    } catch (err){
      setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }

  return (
    <Modal title={proxy ? X.formEdit : X.formAdd} closeLabel={d.common.close} onClose={onClose} foot={<>
      {!proxy && <label className="check-row"><input type="checkbox" checked={another} onChange={e => setAnother(e.target.checked)} />{X.addMore}</label>}
      <span className="sp" />
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
      <button className="btn btn-primary" type="submit" form="proxy-form" disabled={busy}>{d.common.save}</button>
    </>}>
      <form className="m-body" id="proxy-form" onSubmit={submit} noValidate>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="px-name">{X.name}</label>
          <input id="px-name" ref={nameRef} placeholder={X.namePh} value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus />
        </div>
        <div className="field">
          <span className="label" id="px-type">{X.type}</span>
          <div className="seg fill" role="group" aria-labelledby="px-type">
            {TYPES.map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => change(setType)(t)}>{t.toUpperCase()}</button>)}
          </div>
        </div>
        <div className="row2 host-port">
          <div className="field">
            <label htmlFor="px-host">{X.host}</label>
            <input id="px-host" className="mono-in" value={host} onChange={e => change(setHost)(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!!hostErr} />
            {hostErr && <p className="err">{hostErr}</p>}
          </div>
          <div className="field">
            <label htmlFor="px-port">{X.port}</label>
            <input id="px-port" className="mono-in" inputMode="numeric" value={port} onChange={e => change(setPort)(e.target.value.replace(/\D/g, ''))} aria-invalid={!!portErr} />
            {portErr && <p className="err">{portErr}</p>}
          </div>
        </div>
        <div className="px-auth"><Switch label={X.auth} checked={auth} onChange={change(setAuth)} /></div>
        {auth && (
          <div className="row2">
            <div className="field">
              <label htmlFor="px-user">{X.user}</label>
              <input id="px-user" value={username} onChange={e => change(setUsername)(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <div className="field">
              <label htmlFor="px-pass">{X.pass}</label>
              <span className="pass-in">
                <input id="px-pass" type={reveal ? 'text' : 'password'} value={password} onChange={e => change(setPassword)(e.target.value)} autoComplete="new-password" placeholder={proxy?.hasPassword ? X.passKeep : ''} />
                <button type="button" className="icon-btn bare" aria-label={reveal ? X.conceal : X.reveal} title={reveal ? X.conceal : X.reveal} onClick={() => setReveal(r => !r)}><Icon name={reveal ? 'eyeOff' : 'eye'} /></button>
              </span>
            </div>
          </div>
        )}
        <SelectField label={X.backup} value={backupId} onChange={setBackupId} hint={X.backupHint} searchPh={d.form.searchPh}
          options={[{ value: '', label: X.backupNone }, ...data.proxies.filter(p => p.id !== proxy?.id).map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined }))]} />
        <div className="px-test">
          <button type="button" className="btn btn-secondary btn-sm" disabled={result === 'checking'} onClick={() => void test()}>
            {result === 'checking' ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{X.test}
          </button>
        </div>
        {result && result !== 'checking' && <CheckCard d={d} r={result} />}
      </form>
    </Modal>
  );
}

export function ProxyImportDialog({ d, wsId, data, onClose }: { d: Dict; wsId: string; data: WorkspaceData; onClose(): void }){
  const X = d.proxies;
  const [text, setText] = useState('');
  const [type, setType] = useState<ProxyType>('http');
  const [result, setResult] = useState<ProxyImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent){
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await folio.api<ProxyImport>('POST', `/workspaces/${wsId}/proxies/import`, { text, defaultType: type });
      setResult(r);
      data.refresh('proxies');
      void data.check(r.proxies.filter(p => !p.lastCheck).map(p => p.id));
      if (!r.errors.length) setText('');
    } catch (err){
      setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }
  const known = result ? new Set(result.proxies.map(p => p.id)).size - result.added : 0;

  return (
    <Modal title={X.importTitle} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.close}</button>
      <button className="btn btn-primary" type="submit" form="proxy-import" disabled={busy || !text.trim()}>{X.importBtn}</button>
    </>}>
      <form className="m-body" id="proxy-import" onSubmit={submit} noValidate>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="pi-text">{X.importLead}</label>
          <pre className="formats">{'socks5://user:pass@host:port\nuser:pass@host:port\nhost:port:user:pass\nhost:port'}</pre>
          <textarea id="pi-text" className="mono-in" rows={8} value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoFocus />
        </div>
        <SelectField label={X.defaultType} value={type} onChange={v => setType(v as ProxyType)} options={TYPES.map(t => ({ value: t, label: t.toUpperCase() }))} />
        {result && (
          <div className="import-result" role="status">
            <p><b>{X.imported(result.added, known)}</b></p>
            {result.errors.length > 0 && <>
              <p className="err">{X.badLines}</p>
              <ul className="bad-lines">{result.errors.map(e => <li key={e.line}><span className="mono">{X.line(e.line)}</span> {e.text}</li>)}</ul>
            </>}
          </div>
        )}
      </form>
    </Modal>
  );
}
