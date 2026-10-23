// The activity log: who did what, when and on which computer, newest first and grouped by day.
import { useCallback, useEffect, useState } from 'react';
import { folio, isApiError, type ActivityEntry, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, errorText, type Dict, type Lang } from './i18n';
import { useToast } from './ui';
import { Select } from './Select';

type Kind = 'all' | keyof Dict['activity']['kinds'];
const PAGE = 50;

// One entry as a sentence, starting with who did it.
export function describe(d: Dict, e: ActivityEntry){
  const p = e.profile ? `${e.profile.name} #${String(e.profile.number).padStart(4, '0')}` : '';
  return `${e.actor ?? d.activity.someone} ${d.activity.actions[e.action](p, e.detail)}`;
}

export const time = (iso: string, lang: Lang) => new Date(iso).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
export function dayLabel(iso: string, d: Dict, lang: Lang){
  const at = new Date(iso), today = new Date(), yesterday = new Date(today.getTime() - 86_400_000);
  if (at.toDateString() === today.toDateString()) return d.activity.today;
  if (at.toDateString() === yesterday.toDateString()) return d.activity.yesterday;
  return day(iso, lang);
}

// Reads the log with the given filters; reloads on change events and pages back on request.
export function useActivity(wsId: string, query: string, data: WorkspaceData, limit = PAGE, enabled = true){
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [days, setDays] = useState(0);
  const [more, setMore] = useState(false);
  const load = useCallback(async (before?: number) => {
    const r = await folio.api<{ entries: ActivityEntry[]; retentionDays: number }>('GET', `/workspaces/${wsId}/activity?limit=${limit}${query}${before ? `&before=${before}` : ''}`);
    setEntries(list => (before ? [...(list ?? []), ...r.entries] : r.entries));
    setDays(r.retentionDays);
    setMore(r.entries.length === limit);
  }, [wsId, query, limit]);
  useEffect(() => { if (enabled) void load().catch(() => setEntries([])); }, [enabled, load, data.profiles, data.proxies, data.groups, data.members]);
  return { entries, days, more, older: () => entries?.length ? load(entries.at(-1)!.seq) : Promise.resolve() };
}

export function ActivityPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const A = d.activity;
  const toast = useToast();
  const [person, setPerson] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const { entries, days, more, older } = useActivity(ws.id, `${person ? `&actorId=${person}` : ''}${kind !== 'all' ? `&kind=${kind}` : ''}`, data);
  const canExport = data.role !== 'member' && ws.subscription.plan === 'company';

  async function exportCsv(){
    try {
      const csv = await folio.api<string>('GET', `/workspaces/${ws.id}/activity.csv`);
      const path = await folio.saveFile(`folio-activity-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      if (path) toast(A.exported(path));
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal')); }
  }

  const byDay: [string, ActivityEntry[]][] = [];
  for (const e of entries ?? []){
    const label = dayLabel(e.at, d, lang);
    if (byDay.at(-1)?.[0] === label) byDay.at(-1)![1].push(e); else byDay.push([label, [e]]);
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{A.title}</h1><p className="sub">{days ? A.sub(days) : ''}</p></div>
          <span className="sp" />
          <span className="sort"><span id="act-person">{A.person}</span>
            <Select variant="sm" labelledBy="act-person" value={person} onChange={setPerson} options={[{ value: '', label: A.everyone }, ...data.members.map(m => ({ value: m.userId, label: m.email }))]} />
          </span>
          <span className="sort"><span id="act-kind">{A.kind}</span>
            <Select variant="sm" labelledBy="act-kind" value={kind} onChange={v => setKind(v as Kind)} options={(Object.keys(A.kinds) as Kind[]).map(k => ({ value: k, label: A.kinds[k as keyof typeof A.kinds] }))} />
          </span>
          {canExport && <button className="btn btn-secondary" type="button" onClick={() => void exportCsv()}>{A.export}</button>}
        </header>
        <div className="log">
          {entries === null && <ol className="log-list skel-list" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <li key={i}><i className="w3" /><i /></li>)}</ol>}
          {entries?.length === 0 && <p className="hint">{A.empty}</p>}
          {byDay.map(([label, list]) => (
            <section key={label} aria-label={label}>
              <h2 className="sec-t">{label}</h2>
              <ol className="log-list">
                {list.map(e => (
                  <li key={e.seq} data-action={e.action}>
                    <time>{time(e.at, lang)}</time>
                    <span>{describe(d, e)}{e.deviceName && <span className="hint"> · {A.on(e.deviceName)}</span>}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {more && <button className="btn btn-secondary btn-sm" type="button" onClick={() => void older()}>{A.more}</button>}
        </div>
      </main>
    </div>
  );
}
