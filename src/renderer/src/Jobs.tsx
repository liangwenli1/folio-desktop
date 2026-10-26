// The task center: the batch operations of the last while — checking proxies, opening profiles, importing proxies,
// editing profiles in bulk, downloading engines — how far each got, how each target went and why the failed ones
// failed. Retrying runs only the failed targets again, on the computer that ran the job; a job running here can be
// canceled. With auto-refresh off the list holds still.
import { useEffect, useState } from 'react';
import { folio, isApiError, type Job, type JobDetail, type JobKind } from './api';
import type { WorkspaceData } from './data';
import { dayLabel, time } from './Activity';
import { errorText, type Dict, type Lang } from './i18n';
import { Empty, Icon, ListFailed, Switch, useToast, type IconName } from './ui';
import { Select } from './Select';

type Tab = 'all' | 'running' | 'done' | 'partial' | 'canceled';
type Range = 'day' | 'week' | 'month' | 'all';
const KINDS: JobKind[] = ['proxy.check', 'profile.open', 'proxy.import', 'profile.edit', 'kernel.download'];
const RANGE_MS: Record<Range, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, all: Infinity };
const STATE_ICON: Record<Job['status'], IconName> = { running: 'refresh', done: 'check', partial: 'alert', canceled: 'stop' };
// Jobs that run on a computer (rather than on the server) can only be retried there.
const pct = (j: Job) => (j.total ? Math.round(((j.ok + j.failed + j.canceled) / j.total) * 100) : 0);

// Why a target failed, in words: the codes the workbench reports, or the text an engine gave.
export function jobError(d: Dict, kind: JobKind, code: string | null){
  if (!code) return '—';
  const J = d.jobs.errors;
  if (code in J) return J[code];
  if (kind === 'proxy.check') return d.proxies.why[code] ?? code;
  if (kind === 'proxy.import') return d.proxies.imp.why[code as 'format' | 'port'] ?? code;
  if (kind === 'profile.open' && d.launch[code]) return d.launch[code];
  return kind === 'kernel.download' ? code : errorText(d, code);
}

export function JobsPage({ d, lang, meId, data, openId }: { d: Dict; lang: Lang; meId: string; data: WorkspaceData; openId: string | null }){
  const J = d.jobs;
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const [kind, setKind] = useState<'all' | JobKind>('all');
  const [range, setRange] = useState<Range>('week');
  const [live, setLive] = useState(true);
  const [held, setHeld] = useState<Job[]>([]);
  const [cur, setCur] = useState<string | null>(openId);
  const [device, setDevice] = useState<string | null>(null);
  useEffect(() => { void folio.info().then(i => setDevice(i.deviceId)); }, []);
  // Auto-refresh off: the list stays as it was when it was turned off.
  const jobs = live ? data.jobs : held;
  const since = Date.now() - RANGE_MS[range];
  const inRange = jobs.filter(j => (kind === 'all' || j.kind === kind) && Date.parse(j.createdAt) >= since);
  const shown = inRange.filter(j => tab === 'all' || j.status === tab);
  const count = (t: Tab) => inRange.filter(j => t === 'all' || j.status === t).length;
  const picked = jobs.find(j => j.id === cur) ?? null;

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{J.title}</h1><p className="sub">{J.lead}</p></div>
          <span className="sp" />
          <div className="jb-live"><Icon name="refresh" /><Switch label={J.live} checked={live} onChange={on => { setLive(on); if (!on) setHeld(data.jobs); }} /></div>
        </header>
        <div className="tabs page-tabs" role="tablist" aria-label={J.title}>
          {(['all', 'running', 'done', 'partial', 'canceled'] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{J.tabs[t]}{t === 'running' && count(t) > 0 && <small>{count(t)}</small>}</button>
          ))}
        </div>
        <div className={`side-wrap jb-wrap${picked ? ' with-panel' : ''}`}>
          <section className="sec side-main jb-main" aria-label={J.title}>
            <div className="filters inline">
              <span className="grp-pick"><Select label={J.kind} value={kind} onChange={v => setKind(v as 'all' | JobKind)}
                options={[{ value: 'all', label: J.kinds.all }, ...KINDS.map(k => ({ value: k, label: J.kinds[k] }))]} /></span>
              <span className="grp-pick"><Select label={J.range} value={range} onChange={v => setRange(v as Range)}
                options={(['day', 'week', 'month', 'all'] as const).map(r => ({ value: r, label: J.ranges[r] }))} /></span>
            </div>
            <div className="tw jb-t">
              <table>
                <thead>
                  <tr><th scope="col">{J.cols.name}</th><th scope="col">{J.cols.by}</th><th scope="col">{J.cols.progress}</th><th scope="col">{J.cols.status}</th><th scope="col">{J.cols.created}</th><th className="act" scope="col">{J.cols.actions}</th></tr>
                </thead>
                <tbody>
                  {data.loadFailed.has('jobs') && <tr className="empty"><td colSpan={6}><ListFailed d={d} data={data} kind="jobs" /></td></tr>}
                  {!shown.length && !data.loadFailed.has('jobs') && <tr className="empty"><td colSpan={6}><Empty icon="jobs" title={J.empty} /></td></tr>}
                  {shown.map(j => (
                    <tr key={j.id} data-job={j.kind} className={cur === j.id ? 'cur' : ''} onClick={e => { if (!(e.target as HTMLElement).closest('button')) setCur(j.id); }}>
                      <td><b>{J.kinds[j.kind]}</b></td>
                      <td className="ellip">{j.startedById === meId ? J.me : j.startedBy ?? '—'}</td>
                      <td>{j.status === 'canceled' && !j.ok && !j.failed ? <span className="muted">—</span> : <Bar j={j} />}</td>
                      <td><State d={d} j={j} /></td>
                      <td className="nowrap">{dayLabel(j.createdAt, d, lang)} {time(j.createdAt, lang)}</td>
                      <td className="act"><button type="button" className="btn btn-sm btn-text" onClick={() => setCur(j.id)}>{J.view}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {picked && <JobPanel key={picked.id} d={d} lang={lang} data={data} job={picked} mine={picked.startedById === meId} here={!!device && picked.deviceId === device}
            onClose={() => setCur(null)} onFail={e => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad')} />}
        </div>
      </main>
    </div>
  );
}

function Bar({ j }: { j: Job }){
  const p = pct(j);
  return (
    <span className="jb-bar">
      <span className="mono">{j.ok + j.failed} / {j.total}</span>
      <span className={`meter ${j.status === 'partial' ? 'warn' : j.status === 'done' ? 'good' : ''}`}><i style={{ width: `${p}%` }} /></span>
      <small className="mono">{p}%</small>
    </span>
  );
}

function State({ d, j }: { d: Dict; j: Job }){
  const J = d.jobs;
  const label = j.status === 'partial' && !j.ok ? J.states.failed : J.states[j.status];
  return <span className={`jb-st ${j.status}`}><Icon name={STATE_ICON[j.status]} />{label}</span>;
}

// One job beside the list: who started it and when, how many went which way, each target's result and the job's log,
// with retrying the failed ones, downloading the results, and (running here) canceling.
function JobPanel({ d, lang, data, job, mine, here, onClose, onFail }: {
  d: Dict; lang: Lang; data: WorkspaceData; job: Job; mine: boolean; here: boolean; onClose(): void; onFail(e: unknown): void;
}){
  const J = d.jobs;
  const toast = useToast();
  const [tab, setTab] = useState<'results' | 'log'>('results');
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState(false);
  // Read again whenever the job changes (its counts move as targets finish).
  const stamp = `${job.status}:${job.ok}:${job.failed}:${job.canceled}`;
  useEffect(() => { void folio.api<JobDetail>('GET', `/jobs/${job.id}`).then(setDetail, () => {}); }, [job.id, stamp]);
  const canRetry = mine && here && job.failed > 0 && job.status !== 'running' && job.kind !== 'proxy.import';
  const canCancel = data.mine.has(job.id);
  const log = [...(detail?.items ?? [])].filter(i => i.at).sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));

  async function retry(){
    setBusy(true);
    try { await data.rerun(job.id); } catch (e){ onFail(e); } finally { setBusy(false); }
  }
  async function download(){
    const rows = [[J.cols.target, J.cols.result, J.cols.reason, J.cols.at].join(',')].concat((detail?.items ?? []).map(i =>
      [i.name, J.results[i.status], i.status === 'failed' ? jobError(d, job.kind, i.error) : '', i.at ?? ''].map(csv).join(',')));
    const path = await folio.saveFile(`folio-${job.kind.replace('.', '-')}-${job.createdAt.slice(0, 10)}.csv`, rows.join('\n') + '\n');
    if (path) toast(J.saved(path));
  }

  return (
    <aside className="sec side-panel jb-panel" aria-label={J.kinds[job.kind]}>
      <div className="sec-row"><h3>{J.kinds[job.kind]}</h3><State d={d} j={job} /><button type="button" className="icon-btn bare" aria-label={d.common.close} title={d.common.close} onClick={onClose}><Icon name="x" /></button></div>
      <p className="hint">{J.by(mine ? J.me : job.startedBy ?? '—')} · {dayLabel(job.createdAt, d, lang)} {time(job.createdAt, lang)}{job.deviceName ? ` · ${job.deviceName}` : ''}</p>
      <dl className="dstats jb-stats">
        <div><dt>{J.total}</dt><dd>{job.total}</dd></div>
        <div><dt>{J.ok}</dt><dd className="good-t">{job.ok}</dd></div>
        <div><dt>{J.failed}</dt><dd className={job.failed ? 'bad-t' : ''}>{job.failed}</dd></div>
        {job.canceled > 0 && <div><dt>{J.canceled}</dt><dd>{job.canceled}</dd></div>}
      </dl>
      <div className="tabs" role="tablist" aria-label={J.kinds[job.kind]}>
        <button type="button" role="tab" aria-selected={tab === 'results'} onClick={() => setTab('results')}>{J.resultsTab}</button>
        <button type="button" role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>{J.logTab}</button>
      </div>
      {tab === 'results' ? (
        <div className="tw dense jb-items">
          <table>
            <thead><tr><th scope="col">{J.cols.target}</th><th scope="col">{J.cols.result}</th><th scope="col">{J.cols.reason}</th></tr></thead>
            <tbody>
              {(detail?.items ?? []).map(i => (
                <tr key={i.seq} data-item={i.name}>
                  <td className="ellip" title={i.name}>{i.name}</td>
                  <td><span className={`jb-r ${i.status}`}>{J.results[i.status]}</span></td>
                  <td className="ellip" title={i.status === 'failed' ? jobError(d, job.kind, i.error) : undefined}>{i.status === 'failed' ? jobError(d, job.kind, i.error) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="jb-log">
          <li><time>{time(job.createdAt, lang)}</time><span>{J.started(job.total)}</span></li>
          {log.map(i => <li key={`${i.seq}:${i.at}`} className={i.status}><time>{time(i.at!, lang)}</time><span>{i.name} · {J.results[i.status]}{i.status === 'failed' ? ` · ${jobError(d, job.kind, i.error)}` : ''}</span></li>)}
          {job.finishedAt && <li><time>{time(job.finishedAt, lang)}</time><span>{J.finished(J.states[job.status])}</span></li>}
        </ol>
      )}
      <div className="jb-foot">
        {job.failed > 0 && job.kind !== 'proxy.import' && <p className="hint"><Icon name="info" />{canRetry ? J.retryNote : mine ? J.retryElsewhere : J.retryTheirs}</p>}
        {canCancel && <button type="button" className="btn btn-secondary" onClick={() => data.cancel(job.id)}>{J.cancel}</button>}
        <div className="jb-acts">
          {job.kind !== 'proxy.import' && <button type="button" className="btn btn-primary" disabled={!canRetry || busy} onClick={() => void retry()}>{J.retry(job.failed)}</button>}
          <button type="button" className="btn btn-secondary" disabled={!detail} onClick={() => void download()}>{J.download}</button>
        </div>
      </div>
    </aside>
  );
}

const csv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
