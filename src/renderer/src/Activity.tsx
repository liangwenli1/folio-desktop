// The activity log: who did what, when and on which computer, newest first and grouped by day.
import { useCallback, useEffect, useState } from 'react';
import { folio, isApiError, type ActivityEntry, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, errorText, type Dict, type Lang } from './i18n';
import { Icon, useToast, type IconName } from './ui';
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

// Which filter of the log an entry belongs to (the server's grouping), for its category column.
const KINDS: Record<Exclude<Kind, 'all'>, string[]> = {
  open: ['profile.open', 'profile.close', 'profile.takeover'],
  profiles: ['profile.create', 'profile.update', 'profile.move', 'profile.tag', 'profile.untag', 'profile.set-proxy', 'profile.assign', 'profile.set-department', 'profile.add-extension', 'profile.remove-extension', 'profile.set-kernel', 'profile.set-browser'],
  trash: ['profile.trash', 'profile.restore', 'profile.purge'],
  proxies: ['proxy.create', 'proxy.import', 'proxy.update', 'proxy.delete', 'group.create', 'group.rename', 'group.delete'],
  cookies: ['cookies.export', 'cookies.import', 'workspace.export', 'workspace.import'],
  team: ['member.invite', 'member.join', 'member.role', 'member.remove', 'member.leave', 'invitation.withdraw', 'department.create', 'department.update', 'department.delete'],
  extensions: ['extension.add', 'extension.update', 'extension.delete'],
  automation: ['flow.create', 'flow.update', 'flow.delete', 'task.create', 'task.update', 'task.delete', 'run.start', 'run.finish']
};
const KIND_ICON: Record<Exclude<Kind, 'all'>, IconName> = { open: 'play', profiles: 'profiles', trash: 'trash', proxies: 'proxies', cookies: 'upload', team: 'team', extensions: 'extensions', automation: 'tasks' };
const kindOf = (action: string) => (Object.keys(KINDS) as Exclude<Kind, 'all'>[]).find(k => KINDS[k].includes(action)) ?? 'profiles';

export function ActivityPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const A = d.activity;
  const toast = useToast();
  const [person, setPerson] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const { entries, days, more, older } = useActivity(ws.id, `${person ? `&actorId=${person}` : ''}${kind !== 'all' ? `&kind=${kind}` : ''}`, data);
  const canExport = data.role !== 'member' && ws.subscription.plan === 'company';

  async function exportCsv(){
    try {
      const csv = await folio.api<string>('GET', `/workspaces/${ws.id}/activity.csv`);
      const path = await folio.saveFile(`folio-activity-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      if (path) toast(A.exported(path));
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); }
  }

  // What the entry says, without who did it (that has its own column).
  const said = (e: ActivityEntry) => d.activity.actions[e.action](e.profile ? `${e.profile.name} #${String(e.profile.number).padStart(4, '0')}` : '', e.detail);
  const needle = q.trim().toLowerCase();
  const byDay: [string, ActivityEntry[]][] = [];
  for (const e of entries ?? []){
    if (needle && !`${e.actor ?? ''} ${said(e)} ${e.deviceName ?? ''}`.toLowerCase().includes(needle)) continue;
    const label = dayLabel(e.at, d, lang);
    if (byDay.at(-1)?.[0] === label) byDay.at(-1)![1].push(e); else byDay.push([label, [e]]);
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{A.title}</h1><p className="sub">{days ? A.sub(days) : ''}</p></div>
          <label className="search">
            <Icon name="search" /><span className="sr">{A.search}</span>
            <input type="search" placeholder={A.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          {canExport && <button className="btn btn-secondary" type="button" onClick={() => void exportCsv()}><Icon name="download" />{A.export}</button>}
        </header>
        <div className="filters">
          <div className="seg wrap" role="group" aria-label={A.kind}>
            {(Object.keys(A.kinds) as Kind[]).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{A.kinds[k as keyof typeof A.kinds]}</button>)}
          </div>
          <span className="sp" />
          <Select variant="sm" label={A.person} value={person} onChange={setPerson} options={[{ value: '', label: A.everyone }, ...data.members.map(m => ({ value: m.userId, label: m.email }))]} />
        </div>
        <div className="tw flow">
          <table className="log-t">
            <thead>
              <tr><th scope="col">{A.cols.time}</th><th scope="col">{A.cols.person}</th><th scope="col">{A.cols.what}</th><th scope="col">{A.cols.kind}</th><th scope="col">{A.cols.device}</th></tr>
            </thead>
            <tbody>
              {entries === null && Array.from({ length: 6 }, (_, i) => <tr key={i} className="skel" aria-hidden="true"><td><i className="w3" /></td><td><i /></td><td><i /></td><td><i className="w3" /></td><td><i className="w3" /></td></tr>)}
              {entries !== null && !byDay.length && <tr className="empty"><td colSpan={5}><p>{A.empty}</p></td></tr>}
              {byDay.flatMap(([label, list]) => [
                <tr key={label} className="day"><td colSpan={5}>{label}</td></tr>,
                ...list.map(e => {
                  const k = kindOf(e.action);
                  return (
                    <tr key={e.seq} data-action={e.action}>
                      <td className="mono muted">{time(e.at, lang)}</td>
                      <td><span className="who-cell">{e.actor ? <span className="pav sm" aria-hidden="true">{e.actor.slice(0, 1).toUpperCase()}</span> : null}<b>{e.actor ?? A.someone}</b></span></td>
                      <td>{said(e)}</td>
                      <td><span className="kind-cell"><span className="kic sm" aria-hidden="true"><Icon name={KIND_ICON[k]} /></span>{A.kinds[k]}</span></td>
                      <td className="mono muted">{e.deviceName ?? '—'}</td>
                    </tr>
                  );
                })
              ])}
            </tbody>
          </table>
        </div>
        {more && <button className="btn btn-secondary btn-sm older" type="button" onClick={() => void older()}>{A.more}</button>}
      </main>
    </div>
  );
}
