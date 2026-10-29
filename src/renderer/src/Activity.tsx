// The activity log: who did what, to what, when and from which computer. Searched by word or entry number, filtered
// by person, kind and dates, newest or oldest first, a page at a time; an entry's details show beside the table.
import { useCallback, useEffect, useState } from 'react';
import { can, folio, isApiError, type ActivityEntry, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, fieldName, type Dict, type Lang } from './i18n';
import { Empty, Flt, Icon, LoadFailed, PanelEdge, SkelRows, useFail, useToast } from './ui';
import { Select } from './Select';
import { Pager } from './Pager';

type Kind = 'all' | keyof Dict['activity']['kinds'];

// What an entry says, without who did it.
export const said = (d: Dict, e: ActivityEntry) => d.activity.actions[e.action](e.profile ? `${e.profile.name} #${String(e.profile.number).padStart(4, '0')}` : '', e.detail);
// Who did it: a person by their email, or Folio itself (emptying the Trash of what it kept long enough).
export const who = (d: Dict, e: ActivityEntry) => e.actor ?? (e.detail.expired ? 'Folio' : d.activity.someone);
// One entry as a sentence, starting with who did it.
export const describe = (d: Dict, e: ActivityEntry) => `${who(d, e)} ${said(d, e)}`;
// What it was done to: the profile, or the thing the details name.
const objectOf = (e: ActivityEntry) => (e.profile ? e.profile.name : String(e.detail.name ?? e.detail.email ?? ''));
const numberOf = (e: ActivityEntry) => (e.profile ? `#${String(e.profile.number).padStart(4, '0')}` : null);

export const time = (iso: string, lang: Lang) => new Date(iso).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
export function dayLabel(iso: string, d: Dict, lang: Lang){
  const at = new Date(iso), today = new Date(), yesterday = new Date(today.getTime() - 86_400_000);
  if (at.toDateString() === today.toDateString()) return d.activity.today;
  if (at.toDateString() === yesterday.toDateString()) return d.activity.yesterday;
  return day(iso, lang);
}
const stamp = (iso: string) => { const t = new Date(iso); return `${t.toLocaleDateString('sv-SE')} ${t.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; };

// Reads a page of the log with the given filters; reloads on change events. `failed` says why the last read failed
// ('forbidden' for a role that may not see the log).
export function useActivity(wsId: string, query: string, data: WorkspaceData, page = 1, size = 20, enabled = true){
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await folio.api<{ entries: ActivityEntry[]; total: number }>('GET', `/workspaces/${wsId}/activity?limit=${size}&offset=${(page - 1) * size}${query}`);
      setEntries(r.entries); setTotal(r.total); setFailed(null);
    } catch (e){ setFailed(isApiError(e) ? e.code : 'internal'); }
  }, [wsId, query, page, size]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load, data.profiles, data.proxies, data.groups, data.members]);
  return { entries, total, failed, reload: load };
}

// A date picked in the filter, as the start of that day here.
const dayStart = (date: string, plus = 0) => { const t = new Date(`${date}T00:00:00`); t.setDate(t.getDate() + plus); return t.toISOString(); };

export function ActivityPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const A = d.activity;
  const toast = useToast(), fail = useFail();
  const [person, setPerson] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [cur, setCur] = useState<ActivityEntry | null>(null);
  // Search a moment after typing stops.
  useEffect(() => { const t = setTimeout(() => { setQ(typed.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [typed]);
  const query = [person && `&actorId=${person}`, kind !== 'all' && `&kind=${kind}`, q && `&q=${encodeURIComponent(q)}`,
    from && `&from=${encodeURIComponent(dayStart(from))}`, to && `&to=${encodeURIComponent(dayStart(to, 1))}`, asc && '&order=asc'].filter(Boolean).join('');
  const { entries, total, failed, reload } = useActivity(ws.id, query, data, page, size);
  // A role that may not view the log reads only its own part of it.
  const whole = can(data.role, 'activity.view'), canExport = whole && ws.subscription.plan === 'company';
  const filtered = !!(person || kind !== 'all' || q || from || to);
  const reset = () => { setPerson(''); setKind('all'); setTyped(''); setQ(''); setFrom(''); setTo(''); setPage(1); };
  const pick = (f: () => void) => { f(); setPage(1); };

  async function exportCsv(){
    try {
      const csv = await folio.api<string>('GET', `/workspaces/${ws.id}/activity.csv?${query.slice(1)}`);
      const path = await folio.saveFile(`folio-activity-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      if (path) toast(A.exported(path));
    } catch (e){ fail(e); }
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{A.title}</h1></div>
          <span className="sp" />
          {canExport && <button className="btn btn-secondary" type="button" onClick={() => void exportCsv()}><Icon name="upload" />{A.export}</button>}
        </header>
        {!whole && <p className="hint page-note">{A.partial}</p>}
        <div className={`side-wrap${cur ? ' with-panel' : ''}`}>
          <section className="side-main list-card" aria-label={A.title}>
            {/* Keyword, person, kind of action, dates, then Reset (v2 spec 5). */}
            <div className="filters">
              <Flt label={A.filterLabels.keyword} grow>
                <label className="search"><Icon name="search" /><span className="sr">{A.search}</span>
                  <input type="search" placeholder={A.search} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" /></label>
              </Flt>
              <Flt label={A.filterLabels.person}><span className="grp-pick"><Select label={A.person} value={person} onChange={v => pick(() => setPerson(v))} search searchPh={d.form.searchPh}
                options={[{ value: '', label: A.everyone }, ...data.members.map(m => ({ value: m.userId, label: m.email }))]} /></span></Flt>
              <Flt label={A.filterLabels.kind}><span className="grp-pick"><Select label={A.kind} value={kind} onChange={v => pick(() => setKind(v as Kind))}
                options={(Object.keys(A.kinds) as Kind[]).map(k => ({ value: k, label: A.kinds[k as keyof typeof A.kinds] }))} /></span></Flt>
              <Flt label={A.filterLabels.dates}>
                <span className="lg-dates" role="group" aria-label={A.dates}>
                  <Icon name="calendar" />
                  <input type="date" aria-label={A.from} value={from} max={to || undefined} onChange={e => pick(() => setFrom(e.target.value))} />
                  <span aria-hidden="true">{A.to}</span>
                  <input type="date" aria-label={A.until} value={to} min={from || undefined} onChange={e => pick(() => setTo(e.target.value))} />
                </span>
              </Flt>
              <button type="button" className="btn btn-secondary flt-reset" disabled={!filtered} onClick={reset}>{d.profiles.reset}</button>
            </div>
            <ActivityTable d={d} lang={lang} entries={entries} failed={failed} admin={data.admin} onRetry={() => void reload()} onClear={filtered ? reset : undefined}
              cur={cur?.seq ?? null} onPick={setCur} asc={asc} onSort={() => pick(() => setAsc(x => !x))} />
            {total > 0 && <Pager d={d} total={total} page={page} size={size} onPage={setPage} onSize={n => { setSize(n); setPage(1); }} />}
          </section>
          {cur && <EntryPanel d={d} lang={lang} e={cur} data={data} onClose={() => setCur(null)} />}
        </div>
      </main>
    </div>
  );
}

// The log as a table: here (with what each entry was done to), and on a profile's page for that profile alone.
// `onClear` is there while filters hide every entry.
export function ActivityTable({ d, lang, entries, failed, admin, onRetry, onClear, cur, onPick, asc, onSort, profile }: {
  d: Dict; lang: Lang; entries: ActivityEntry[] | null; failed: string | null; admin: string | null; onRetry(): void; onClear?(): void;
  cur?: number | null; onPick?(e: ActivityEntry): void; asc?: boolean; onSort?(): void; profile?: boolean;
}){
  const A = d.activity;
  const cols = (profile ? 4 : 5) + (onPick ? 1 : 0);
  return (
    <div className="tw lg-t">
      <table>
        <thead>
          <tr>
            <th className="mid" scope="col" aria-sort={onSort ? (asc ? 'ascending' : 'descending') : undefined}>
              {onSort ? <button type="button" className="th-sort" onClick={onSort}>{A.cols.time}<Icon name={asc ? 'up' : 'down'} /></button> : A.cols.time}
            </th>
            <th scope="col">{A.cols.person}</th><th scope="col">{A.cols.type}</th>{!profile && <th scope="col">{A.cols.object}</th>}<th scope="col">{A.cols.what}</th>{onPick && <th className="act" scope="col">{A.cols.view}</th>}
          </tr>
        </thead>
        <tbody>
          {entries === null && !failed && <SkelRows cols={cols} rows={6} />}
          {failed && <tr className="empty"><td colSpan={cols}><LoadFailed d={d} code={failed} admin={admin} onRetry={onRetry} /></td></tr>}
          {!failed && entries !== null && !entries.length && <tr className="empty"><td colSpan={cols}>{onClear
            ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>{d.states.clear}</button>
              </Empty>
            : <Empty icon="activity" title={A.empty} text={A.emptyText} />}</td></tr>}
          {entries?.map(e => (
            <tr key={e.seq} data-action={e.action} className={cur === e.seq ? 'cur' : ''} onClick={onPick ? ev => { if (!(ev.target as HTMLElement).closest('button')) onPick(e); } : undefined}>
              <td className="nowrap mid">{dayLabel(e.at, d, lang)} {time(e.at, lang)}</td>
              <td className="who-cell"><b>{who(d, e)}</b></td>
              <td>{A.types[e.action]}</td>
              {!profile && <td>{objectOf(e) ? <><span className="l1">{objectOf(e)}</span>{numberOf(e) && <span className="l2 mono">{numberOf(e)}</span>}</> : <span className="muted">—</span>}</td>}
              <td className="lg-what">{said(d, e)}</td>
              {onPick && <td className="act"><button type="button" className="btn btn-sm btn-secondary" onClick={() => onPick(e)}>{A.view}</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One entry beside the log: its number, who, when, what, to what and from which computer, and what it changed, from
// what to what (v2 40); a password only says it changed.
function EntryPanel({ d, lang, e, data, onClose }: { d: Dict; lang: Lang; e: ActivityEntry; data: WorkspaceData; onClose(): void }){
  const A = d.activity, D = A.detail;
  const changes = Array.isArray(e.detail.changes) ? e.detail.changes as { field: string; from?: unknown; to?: unknown; secret?: boolean }[] : [];
  const shown = (field: string, v: unknown) => valueOf(d, data, field, v);
  const fields = Array.isArray(e.detail.fields) ? (e.detail.fields as string[]).map(f => fieldName(lang, f)) : [];
  const change = typeof e.detail.from === 'string' ? [String(e.detail.from), String(e.detail.name ?? '')] : null;
  return (
    <aside className="sec side-panel lg-panel" aria-label={D.title}><PanelEdge />
      <div className="sec-row"><h3>{D.title}</h3><button type="button" className="icon-btn bare" aria-label={d.common.close} title={d.common.close} onClick={onClose}><Icon name="x" /></button></div>
      <dl className="kvl">
        <dt>{D.number}</dt><dd className="mono">#{e.seq}</dd>
        <dt>{D.person}</dt><dd>{who(d, e)}</dd>
        <dt>{D.time}</dt><dd className="mono">{stamp(e.at)}</dd>
        <dt>{D.type}</dt><dd>{A.types[e.action]}</dd>
        <dt>{D.object}</dt><dd>{objectOf(e) || '—'}{numberOf(e) && <span className="muted mono">{numberOf(e)}</span>}</dd>
        <dt>{D.device}</dt><dd>{e.deviceName ?? '—'}</dd>
      </dl>
      <h4>{D.what}</h4>
      <p className="lg-said">{describe(d, e)}</p>
      {changes.length > 0 ? <>
        <h4>{D.fields}</h4>
        <div className="tw dense lg-changes"><table>
          <thead><tr><th scope="col">{D.changes.field}</th><th scope="col">{D.changes.from}</th><th scope="col">{D.changes.to}</th></tr></thead>
          <tbody>{changes.map(c => (
            <tr key={c.field}><td>{fieldName(lang, c.field)}</td>{c.secret || isRecord(c.from) || isRecord(c.to)
              ? <td colSpan={2} className="muted">{c.secret ? D.secret : D.changed}</td>
              : <><td>{shown(c.field, c.from)}</td><td><b>{shown(c.field, c.to)}</b></td></>}</tr>
          ))}</tbody>
        </table></div>
      </> : fields.length > 0 && <><h4>{D.fields}</h4><ul className="lg-fields">{[...new Set(fields)].map(f => <li key={f}>{f}</li>)}</ul></>}
      {change && <><h4>{D.change}</h4><p className="lg-change"><span>{change[0]}</span><Icon name="chevR" /><b>{change[1]}</b></p></>}
      <p className="notice info lg-note"><Icon name="info" />{D.note}</p>
    </aside>
  );
}

// A setting made of several values (a fingerprint): the entry only says it changed.
const isRecord = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

// A value as it was or became: names for the groups, proxies, people and extensions it points at (the ones still
// here), the window's mode in words, yes or no, a list, or — for nothing.
function valueOf(d: Dict, data: WorkspaceData, field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'groupId' || field === 'parentId') return data.groups.find(g => g.id === v)?.name ?? '—';
  if (field === 'proxyId' || field === 'backupId') return data.proxies.find(p => p.id === v)?.name ?? '—';
  if (field === 'ownerId') return data.members.find(m => m.userId === v)?.email ?? '—';
  if (field === 'windowMode') return d.form.windowModes[v as keyof typeof d.form.windowModes] ?? String(v);
  if (field === 'extensionIds' && Array.isArray(v)) return v.map(id => data.extensions.find(x => x.id === id)?.name ?? '—').join(', ') || d.activity.detail.empty;
  if (typeof v === 'boolean') return v ? d.activity.detail.on : d.activity.detail.off;
  if (Array.isArray(v)) return v.length ? v.join(', ') : d.activity.detail.empty;
  return String(v);
}
