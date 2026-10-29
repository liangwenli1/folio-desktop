// Tasks: a flow run on a set of profiles, a few at a time, with retries, by hand or on a schedule. Runs happen on
// the computer of whoever starts them (a schedule's own computer for scheduled runs) and are reported to the server
// profile by profile, so the team sees each run and its results.
import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { nextSlot, weekOf, weekSlots, type Schedule } from '@shared/schedule';
import { folio, isApiError, type Profile, type Run, type RunItem, type Task, type Workspace } from './api';
import { readVariables, toCsv } from './csv';
import type { WorkspaceData } from './data';
import { flowError } from './Flows';
import { ago, errorText, type Dict, type Lang } from './i18n';
import { Act, Cancel, Empty, Icon, ListFailed, Modal, MoreMenu, SkelRows, Switch, ViewSwitch, useChanged, useFail, useToast, useView, type IconName } from './ui';
import { Flag } from './Flag';
import { Select, SelectField, groupOpts } from './Select';

type Counts = Run['counts'];
const finished = (c: Counts) => c.ok + c.failed + c.signed_out + c.skipped + c.canceled;
const total = (c: Counts) => finished(c) + c.pending + c.running;
const pad = (n: number) => String(n).padStart(4, '0');
const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const when = (iso: string | number, lang: Lang) => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// The run to show, when a notification about it is clicked.
export interface Focus { taskId: string; runId: string }

export function TasksPage({ d, lang, ws, data, focus }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; focus: Focus | null }){
  const T = d.tasks;
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(focus?.taskId ?? null);
  const [form, setForm] = useState<{ task?: Task } | null>(null);
  const [confirm, setConfirm] = useState<Task | null>(null);
  const [view, setView] = useView<'list' | 'calendar'>('tasks', 'list');
  // The task whose latest run shows under the list (by default, the one that ran last).
  const [latest, setLatest] = useState<string | null>(null);
  const [startup, setStartup] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const tasks = data.tasks.filter(t => !needle || t.name.toLowerCase().includes(needle));
  const flowName = new Map(data.flows.map(f => [f.id, f.name]));
  const fail = useFail();
  const task = open ? data.tasks.find(t => t.id === open) : undefined;
  const scheduledHere = data.tasks.some(t => t.schedule && t.runner?.self);
  const proxies = new Map(data.proxies.map(p => [p.id, p]));
  const profiles = new Map(data.profiles.map(p => [p.id, p]));
  const flag = (id: string | null) => {
    const p = id ? profiles.get(id) : undefined;
    return p && <Flag key={p.id} country={(p.proxyId && proxies.get(p.proxyId)?.lastCheck?.geo?.country) || null} kernel={p.kernel} />;
  };
  const ran = (t: Task) => t.lastRun && t.lastRun.status !== 'missed' && t.lastRun.status !== 'busy';
  const shown = data.tasks.find(t => t.id === latest && ran(t))
    ?? data.tasks.filter(ran).sort((a, b) => Date.parse(b.lastRun!.startedAt) - Date.parse(a.lastRun!.startedAt))[0];

  useEffect(() => { if (focus) setOpen(focus.taskId); }, [focus]);
  useEffect(() => { void folio.startup().then(setStartup); }, []);

  async function start(t: Task, trigger: 'manual' | 'rerun' = 'manual', ids?: string[]){
    try {
      const { runId } = await folio.runTask(t.id, trigger, ids);
      toast(T.started(t.name));
      return runId;
    } catch (e){ fail(e); return null; }
  }
  async function remove(t: Task){
    setConfirm(null);
    try { await folio.api('DELETE', `/tasks/${t.id}`); toast(T.deleted(t.name)); setOpen(null); } catch (e){ fail(e); }
    data.refresh('tasks');
  }
  async function toggleStartup(on: boolean){
    await folio.setStartup(on);
    setStartup(await folio.startup());
  }

  const formDialog = form && <TaskForm d={d} ws={ws} data={data} task={form.task} onClose={() => setForm(null)} onSaved={id => { setForm(null); setOpen(id); }} />;
  if (task) return <>
    <TaskDetail d={d} lang={lang} ws={ws} data={data} task={task} flowName={flowName.get(task.flowId) ?? ''} focusRun={focus?.taskId === task.id ? focus.runId : null}
      onBack={() => setOpen(null)} onEdit={() => setForm({ task })} onStart={start} />
    {formDialog}
  </>;

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{T.title}</h1></div>
          <span className="sp" />
          <ViewSwitch label={T.views.label} value={view} onChange={setView} options={[['list', 'list', T.views.list], ['calendar', 'calendar', T.views.calendar]]} />
          <button className="btn btn-primary" type="button" disabled={!data.flows.length} title={data.flows.length ? undefined : T.needFlow} onClick={() => setForm({})}><Icon name="plus" />{T.new}</button>
        </header>
        {scheduledHere && (
          <div className="task-note">
            <Icon name="tasks" /><p>{T.onlyOpen}</p>
            {startup?.supported && <Switch label={T.enableStartup} checked={startup.enabled} onChange={on => void toggleStartup(on)} />}
          </div>
        )}
        {view === 'calendar' ? <TaskCalendar d={d} lang={lang} tasks={data.tasks} onOpen={setOpen} /> : <>
          <section className="list-card" aria-label={T.title}>
          <div className="filters">
            <label className="search"><Icon name="search" /><span className="sr">{T.search}</span>
              <input type="search" placeholder={T.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
            <button type="button" className="btn btn-secondary flt-reset" disabled={!needle} onClick={() => setQ('')}>{d.profiles.reset}</button>
          </div>
          <div className="tw flow">
            <table>
              <thead>
                <tr><th scope="col">{T.cols.task}</th><th scope="col">{T.cols.profiles}</th><th scope="col">{T.cols.when}</th><th scope="col">{T.cols.last}</th><th scope="col">{T.cols.on}</th><th className="act" scope="col">{d.profiles.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th></tr>
              </thead>
              <tbody>
                {data.loadFailed.has('tasks')
                  ? <tr className="empty"><td colSpan={7}><ListFailed d={d} data={data} kind="tasks" /></td></tr>
                  : !data.loaded.has('tasks') ? <SkelRows cols={7} />
                  : !data.tasks.length ? <tr className="empty"><td colSpan={7}><Empty icon="tasks" title={T.emptyTitle} text={T.empty} /></td></tr>
                  : !tasks.length && <tr className="empty"><td colSpan={7}><Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQ('')}>{d.states.clear}</button>
                    </Empty></td></tr>}
                {tasks.map(t => {
                  const here = data.active.find(a => a.taskId === t.id);
                  return (
                    <tr key={t.id} data-task={t.name} className={t.id === shown?.id ? 'cur' : ''}>
                      <td><button type="button" className="rowlink" onClick={() => setOpen(t.id)}>{t.name}</button></td>
                      <td><span className="pflags"><span className="flags">{t.profileIds.slice(0, 3).map(flag)}</span>{t.profileIds.length === t.profiles ? t.profiles : `${t.profileIds.length} / ${t.profiles}`}</span></td>
                      <td><ScheduleCell d={d} lang={lang} task={t} /></td>
                      <td>{t.lastRun
                        ? <button type="button" className="last-run" title={ran(t) ? T.latest(t.name) : undefined} onClick={() => ran(t) && setLatest(t.id)}>
                          <ResultBar run={t.lastRun} /><RunLine d={d} lang={lang} run={t.lastRun} here={!!here} />
                        </button>
                        : <span className="muted">{T.never}</span>}</td>
                      <td>{t.schedule ? (t.runner?.self ? T.here : t.runner?.deviceName ?? '—') : <span className="muted">{T.starter}</span>}</td>
                      <td className="act">{here
                        ? <button type="button" className="btn btn-sm btn-secondary" onClick={() => void folio.stopRun(here.runId)}><Icon name="stop" />{T.stop}</button>
                        : <button type="button" className="btn btn-sm btn-secondary" disabled={!t.profileIds.length || t.lastRun?.status === 'running'} title={!t.profileIds.length ? T.noProfilesHere : t.lastRun?.status === 'running' ? T.runningElsewhere : undefined} aria-label={T.runX(t.name)} onClick={() => void start(t)}><Icon name="play" />{T.run}</button>}</td>
                      <td className="more">{t.canEdit && <MoreMenu label={d.profiles.actionsX(t.name)} items={[
                        { label: d.common.edit, onClick: () => setForm({ task: t }) },
                        { label: T.delete, onClick: () => setConfirm(t), danger: true }
                      ]} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {tasks.length > 0 && <p className="list-foot">{d.profiles.page.total(tasks.length)}</p>}
          </section>
          {!data.flows.length && <p className="notice page-tip"><Icon name="info" /><span>{T.needFlow}</span></p>}
          {shown && <LatestRun d={d} lang={lang} task={shown} flag={flag} idle={!data.active.some(a => a.taskId === shown.id) && shown.lastRun?.status !== 'running'} runsSeq={data.runsSeq}
            onRerun={ids => void start(shown, 'rerun', ids)} />}
        </>}
        {confirm && (
          <Modal kind="bad" title={T.confirmDelete(confirm.name)} onClose={() => setConfirm(null)} foot={<>
            <Cancel />
            <Act className="btn btn-danger solid" run={() => remove(confirm)}>{T.delete}</Act>
          </>}><p>{describeTask(d, lang, confirm)}</p></Modal>
        )}
      </main>
      {formDialog}
    </div>
  );
}

const describeTask = (d: Dict, lang: Lang, t: Task) => (t.schedule ? describe(d, lang, t.schedule) : d.tasks.manual);

// When a task runs: by hand, or its schedule with the next time (on this computer) or the computer it runs on.
function ScheduleCell({ d, lang, task }: { d: Dict; lang: Lang; task: Task }){
  const T = d.tasks;
  const s = task.schedule;
  if (!s) return <span className="muted">{T.manual}</span>;
  const next = task.runner?.self ? nextSlot(s, Date.now()) : null;
  // A one-off time is already on the first line; the second only says when it has passed.
  const second = !task.runner?.self ? T.on(task.runner?.deviceName ?? '—') : !next ? T.done : s.kind === 'daily' ? T.next(when(next, lang)) : null;
  return <span className="sched"><span>{describe(d, lang, s)}</span>{second && <span className="l2">{second}</span>}</span>;
}

export function describe(d: Dict, lang: Lang, s: Schedule){
  const T = d.tasks;
  const zone = s.tz !== localTz() ? ` (${s.tz})` : '';
  if (s.kind === 'once') return T.once(when(s.at, lang));
  const days = [...s.days].sort().join('');
  const which = days === '1234567' ? T.everyDay : days === '12345' ? T.weekdays : days === '67' ? T.weekends : s.days.slice().sort().map(n => T.dayNames[n - 1]).join(lang === 'zh' ? '、' : ', ');
  return `${which} ${s.time}${zone}`;
}

// A run as a bar: done in green, signed out or not run in yellow, failed in red, still to go in grey.
function ResultBar({ run }: { run: Run }){
  const c = run.counts, all = total(c);
  if (!all) return null;
  const part = (n: number, cls: string) => n > 0 && <i className={cls} style={{ flexGrow: n }} />;
  return <span className="rbar" aria-hidden="true">{part(c.ok, 'ok')}{part(c.signed_out + c.skipped + c.canceled, 'warn')}{part(c.failed, 'bad')}{part(c.pending + c.running, 'wait')}</span>;
}

// A run in one line: how far it got, or how it ended.
function RunLine({ d, lang, run, here }: { d: Dict; lang: Lang; run: Run; here: boolean }){
  const T = d.tasks, c = run.counts;
  const nothing = run.status === 'missed' || run.status === 'busy';
  // Under way in blue; some failed (with some done) is a partial failure, amber; all failed is red (delivery spec 6).
  const fails = c.failed + c.signed_out;
  const tone = run.status === 'running' ? 'info' : run.status === 'interrupted' || (fails && !c.ok) ? 'bad' : fails || nothing || c.skipped || c.canceled ? 'warn' : 'good';
  return (
    <span className="run-line">
      <span className={`d ${tone}${run.status === 'running' ? ' pulse' : ''}`} aria-hidden="true" />
      <b>{T.status[run.status]}</b>
      <span className="muted">{run.status === 'running' ? (here ? T.progress(finished(c), total(c)) : T.elsewhere(run.deviceName ?? run.startedBy ?? ''))
        : nothing ? when(run.scheduledFor ?? run.startedAt, lang) : T.counts(c)}</span>
    </span>
  );
}

// A run item's result as a status label.
const ITEM_ST: Record<RunItem['status'], [string, IconName | null]> = {
  ok: ['good', 'check'], failed: ['bad', 'alert'], signed_out: ['warn', 'alert'], skipped: ['', 'pause'], canceled: ['', 'pause'], pending: ['', 'pause'], running: ['info', null]
};
const ItemStatus = ({ d, status }: { d: Dict; status: RunItem['status'] }) => {
  const [cls, icon] = ITEM_ST[status];
  return <span className={`badge ${cls}`}>{icon ? <Icon name={icon} /> : <span className="spin" aria-hidden="true" />}{d.tasks.item[status]}</span>;
};

// The latest run of a task, profile by profile, with the ones that didn't finish to run again.
function LatestRun({ d, lang, task, flag, idle, runsSeq, onRerun }: {
  d: Dict; lang: Lang; task: Task; flag(id: string | null): ReactNode; idle: boolean; runsSeq: number; onRerun(ids: string[]): void;
}){
  const T = d.tasks, run = task.lastRun!;
  const [items, setItems] = useState<RunItem[]>([]);
  useEffect(() => {
    void folio.api<{ items: RunItem[] }>('GET', `/runs/${run.id}`).then(r => setItems(r.items), () => setItems([]));
  }, [run.id, runsSeq]);
  const again = items.filter(i => i.profileId && ['failed', 'signed_out', 'skipped', 'canceled'].includes(i.status)).map(i => i.profileId!);
  const took = run.finishedAt ? Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000) : null;
  return (
    <section className="latest" aria-label={T.latest(task.name)}>
      <header className="sec-row">
        <span><b>{T.latest(task.name)}</b><span className="muted"> {when(run.scheduledFor ?? run.startedAt, lang)}{took !== null && ` · ${T.took(took)}`}</span></span>
        {run.status !== 'running' && idle && again.length > 0 && <button type="button" className="btn btn-sm btn-secondary" onClick={() => onRerun(again)}>{T.rerun(again.length)}</button>}
      </header>
      <ul className="latest-grid">
        {items.map(i => (
          <li key={i.profileNumber} data-item={i.profileName} title={i.error ? itemError(d, i) : undefined}>
            {flag(i.profileId)}<b>{i.profileName}</b><ItemStatus d={d} status={i.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const PALETTE = 6;
const minutes = (t: number) => { const x = new Date(t); return x.getHours() * 60 + x.getMinutes(); };

// The week's scheduled runs: the tasks on the left, the days across, each time where it falls (this computer's time).
function TaskCalendar({ d, lang, tasks, onOpen }: { d: Dict; lang: Lang; tasks: Task[]; onOpen(id: string): void }){
  const T = d.tasks, C = T.calendar, locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const [monday, setMonday] = useState(() => weekOf(Date.now()));
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const days = Array.from({ length: 7 }, (_, k) => new Date(new Date(monday).setDate(new Date(monday).getDate() + k)));
  const slots = weekSlots(tasks.map(t => t.schedule), monday);
  // 07:00 to 22:00, widened to whatever falls outside it.
  const from = Math.min(7, ...slots.map(s => Math.floor(minutes(s.at) / 60))), to = Math.max(22, ...slots.map(s => Math.floor(minutes(s.at) / 60) + 1));
  const HOUR = 44;
  const y = (t: number) => ((minutes(t) - from * 60) / 60) * HOUR;
  const range = C.range(days[0], days[6]);
  const today = (day: Date) => new Date(now).toDateString() === day.toDateString();
  const time = (t: number) => new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  // Times close together on a day sit side by side.
  const placed = days.map(day => {
    const own = slots.filter(s => new Date(s.at).toDateString() === day.toDateString());
    const out: { i: number; at: number; col: number; cols: number }[] = [];
    let group: typeof out = [];
    for (const s of own){
      if (group.length && s.at - group[0].at >= 45 * 60_000){ group.forEach(g => (g.cols = group.length)); group = []; }
      const e = { ...s, col: group.length, cols: 1 };
      group.push(e); out.push(e);
    }
    group.forEach(g => (g.cols = group.length));
    return out;
  });
  const step = (by: number) => setMonday(m => { const x = new Date(m); x.setDate(x.getDate() + by * 7); return x.getTime(); });

  return (
    <div className="cal">
      <ul className="cal-tasks">
        {tasks.map((t, i) => (
          <li key={t.id}>
            <button type="button" className={`cal-task tc${i % PALETTE}`} onClick={() => onOpen(t.id)}>
              <b>{t.name}</b><small>{describeTask(d, lang, t)} · {T.n(t.profileIds.length)}</small>
              {t.lastRun && <><ResultBar run={t.lastRun} /><small>{t.lastRun.status === 'missed' || t.lastRun.status === 'busy' ? T.status[t.lastRun.status] : T.counts(t.lastRun.counts)}</small></>}
              {!t.lastRun && <small>{T.never}</small>}
            </button>
          </li>
        ))}
      </ul>
      <section className="cal-week" aria-label={range}>
        <header className="cal-h">
          <button type="button" className="icon-btn bare" aria-label={C.prev} title={C.prev} onClick={() => step(-1)}><Icon name="back" /></button>
          <b>{range}</b>
          <button type="button" className="icon-btn bare" aria-label={C.next} title={C.next} onClick={() => step(1)}><Icon name="chevR" /></button>
          {monday !== weekOf(now) && <button type="button" className="btn btn-sm btn-text" onClick={() => setMonday(weekOf(Date.now()))}>{C.thisWeek}</button>}
        </header>
        <div className="cal-grid">
          <div className="cal-times" style={{ height: (to - from) * HOUR }}>
            {Array.from({ length: to - from }, (_, h) => <span key={h} style={{ top: h * HOUR }}>{String(from + h).padStart(2, '0')}:00</span>)}
          </div>
          {days.map((day, k) => (
            <div key={k} className={`cal-day${today(day) ? ' today' : ''}`}>
              <span className="cal-dh">{T.dayNames[k]} {day.getDate()}</span>
              <div className="cal-col" style={{ height: (to - from) * HOUR, backgroundSize: `100% ${HOUR}px` }}>
                {placed[k].map(e => (
                  <button key={`${e.i}-${e.at}`} type="button" className={`cal-ev tc${e.i % PALETTE}${e.at < now ? ' past' : ''}`} data-task={tasks[e.i].name}
                    style={{ top: y(e.at), left: `${(e.col / e.cols) * 100}%`, width: `calc(${100 / e.cols}% - 4px)` }} onClick={() => onOpen(tasks[e.i].id)}>
                    <b>{tasks[e.i].name}</b><small>{C.at(time(e.at), tasks[e.i].profileIds.length)}</small>
                  </button>
                ))}
                {today(day) && minutes(now) >= from * 60 && minutes(now) < to * 60 && <i className="cal-now" style={{ top: y(now) }} />}
              </div>
            </div>
          ))}
        </div>
        {!slots.length && <p className="hint cal-none">{C.none}</p>}
      </section>
    </div>
  );
}

function TaskDetail({ d, lang, ws, data, task, flowName, focusRun, onBack, onEdit, onStart }: {
  d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; task: Task; flowName: string; focusRun: string | null; onBack(): void; onEdit(): void;
  onStart(t: Task, trigger?: 'manual' | 'rerun', ids?: string[]): Promise<string | null>;
}){
  const T = d.tasks;
  const toast = useToast();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [sel, setSel] = useState<string | null>(focusRun);
  const [detail, setDetail] = useState<{ run: Run; items: RunItem[] } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const runId = sel ?? runs?.[0]?.id ?? null;
  const here = data.active.find(a => a.taskId === task.id);

  useEffect(() => { if (focusRun) setSel(focusRun); }, [focusRun]);
  useEffect(() => {
    void folio.api<{ runs: Run[] }>('GET', `/workspaces/${ws.id}/runs?taskId=${task.id}`).then(r => setRuns(r.runs), () => setRuns([]));
  }, [task.id, data.runsSeq]);
  useEffect(() => {
    if (!runId){ setDetail(null); return; }
    void folio.api<{ run: Run; items: RunItem[] }>('GET', `/runs/${runId}`).then(setDetail, () => setDetail(null));
  }, [runId, data.runsSeq]);

  async function run(trigger: 'manual' | 'rerun' = 'manual', ids?: string[]){
    const id = await onStart(task, trigger, ids);
    if (id) setSel(id);
  }
  async function exportCsv(){
    if (!detail) return;
    const keys = [...new Set(detail.items.flatMap(i => Object.keys(i.data)))];
    const rows = [[T.csv.number, T.csv.profile, T.csv.status, T.csv.attempts, T.csv.problem, ...keys],
      ...detail.items.map(i => [pad(i.profileNumber), i.profileName, T.item[i.status], i.attempts, itemError(d, i), ...keys.map(k => i.data[k] ?? '')])];
    const name = `${task.name.replace(/[\\/:*?"<>|]+/g, '_')}-${detail.run.startedAt.slice(0, 16).replace(/[T:]/g, '-')}.csv`;
    const path = await folio.saveFile(name, `﻿${toCsv(rows)}`);
    if (path) toast(T.exported(path));
  }
  const again = detail?.items.filter(i => i.profileId && ['failed', 'signed_out', 'skipped', 'canceled'].includes(i.status)).map(i => i.profileId!) ?? [];
  const idle = !here && task.lastRun?.status !== 'running' && task.profileIds.length > 0;

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <button type="button" className="btn btn-text btn-sm task-back" aria-label={T.backLabel} onClick={onBack}><Icon name="back" />{T.back}</button>
          <span className="vsep" aria-hidden="true" />
          <div className="ttl"><h1>{task.name}</h1>
            <p className="sub">{T.about(flowName, task.profileIds.length, task.concurrency, task.retries)}{task.schedule ? ` · ${describe(d, lang, task.schedule)}` : ''}</p></div>
          <span className="sp" />
          {task.canEdit && <button type="button" className="btn btn-secondary" onClick={onEdit}>{d.common.edit}</button>}
          {here
            ? <button type="button" className="btn btn-secondary" onClick={() => void folio.stopRun(here.runId)}>{T.stop}</button>
            : <button type="button" className="btn btn-primary" disabled={!idle} title={idle ? undefined : !task.profileIds.length ? T.noProfilesHere : T.runningElsewhere} onClick={() => void run()}><Icon name="play" />{T.run}</button>}
        </header>
        <div className="task-detail">
          <section className="runs" aria-label={T.runs}>
            <h2 className="sec-t">{T.runs}</h2>
            {runs && !runs.length && <p className="hint">{T.noRuns}</p>}
            <ul className="run-list">
              {runs?.map(r => (
                <li key={r.id}>
                  <button type="button" className={r.id === runId ? 'cur' : ''} aria-current={r.id === runId ? 'true' : undefined} onClick={() => setSel(r.id)}>
                    <span className="l1"><time className="mono">{when(r.scheduledFor ?? r.startedAt, lang)}</time>{r.trigger !== 'manual' && <span className="badge">{T.triggers[r.trigger]}</span>}</span>
                    <RunLine d={d} lang={lang} run={r} here={data.active.some(a => a.runId === r.id)} />
                    <span className="l2">{[r.startedBy, r.deviceName].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="run-detail" aria-label={T.result}>
            {detail && (detail.run.status === 'missed' || detail.run.status === 'busy') && (
              <div className="away-note">
                <span>{detail.run.status === 'missed' ? T.missedNote(when(detail.run.scheduledFor!, lang), detail.run.deviceName ?? '') : T.busyNote(when(detail.run.scheduledFor!, lang))}</span>
                {idle && <div className="d-actions"><button type="button" className="btn btn-sm btn-primary" onClick={() => void run()}>{T.runNow}</button></div>}
              </div>
            )}
            {detail && detail.run.status !== 'missed' && detail.run.status !== 'busy' && <>
              <div className="sec-row">
                <div className="run-sum"><RunLine d={d} lang={lang} run={detail.run} here={data.active.some(a => a.runId === detail.run.id)} />
                  <span className="hint">{T.startedBy(detail.run.startedBy ?? '—', detail.run.deviceName, ago(detail.run.startedAt, d))}</span></div>
                <span className="sp" />
                {detail.run.status !== 'running' && again.length > 0 && idle && <button type="button" className="btn btn-sm btn-secondary" onClick={() => void run('rerun', again)}>{T.rerun(again.length)}</button>}
                <button type="button" className="btn btn-sm btn-text" disabled={!detail.items.length} onClick={() => void exportCsv()}>{T.export}</button>
              </div>
              <div className="tw flow">
                <table>
                  <thead><tr><th scope="col">{T.cols.profile}</th><th className="mid" scope="col">{T.cols.status}</th><th className="mid" scope="col">{T.cols.attempts}</th><th className="mid" scope="col">{T.cols.time}</th><th scope="col">{T.cols.result}</th></tr></thead>
                  <tbody>
                    {detail.items.map(i => {
                      const key = `${i.profileNumber}`, isOpen = expanded === key;
                      return (
                        <Fragment key={key}>
                          <tr data-item={i.profileName} className={isOpen ? 'cur' : ''}>
                            <td><button type="button" className="rowlink" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : key)}>{i.profileName}</button><span className="l2 mono">#{pad(i.profileNumber)}</span></td>
                            <td className="mid"><ItemStatus d={d} status={i.status} /></td>
                            <td className="mid mono">{i.attempts || ''}</td>
                            <td className="mid mono">{i.startedAt && i.finishedAt ? d.flows.trial.ms(Date.parse(i.finishedAt) - Date.parse(i.startedAt)) : ''}</td>
                            <td className="result">{i.error ? <span className="err">{itemError(d, i)}</span>
                              : Object.entries(i.data).map(([k, v]) => <span key={k} className="kv"><span className="mono">{k}</span> {v}</span>)}</td>
                          </tr>
                          {isOpen && (
                            <tr className="log-row"><td colSpan={5}>
                              {!i.log.length && <p className="hint">{T.noLog}</p>}
                              <ol className="run-log">
                                {i.log.map((l, k) => (
                                  <Fragment key={k}>
                                    {(k === 0 ? i.attempts > 1 : l.attempt !== i.log[k - 1].attempt) && <li className="attempt">{T.attempt(l.attempt)}</li>}
                                    <li className={l.error ? 'bad' : ''}>
                                      <span className="mono">{l.path}</span>
                                      <span><b>{d.flows.types[l.type as keyof Dict['flows']['types']] ?? l.type}</b>{l.target && <span className="mono t"> {l.target}</span>}
                                        {l.value !== undefined && !l.error && <span className="v"> → {l.value}</span>}
                                        {l.error && <span className="e"> {flowError(d, l.error)}</span>}</span>
                                      <span className="mono ms">{l.ms !== null ? d.flows.trial.ms(l.ms) : ''}</span>
                                    </li>
                                  </Fragment>
                                ))}
                              </ol>
                              {i.screenshots.length > 0 && <p className="shots">{i.screenshots.map(s => <button key={s} type="button" className="linkish hint" onClick={() => void folio.showFile(s)}>{s.split('/').pop()}</button>)}
                                <span className="hint">{T.shotsWhere(detail.run.deviceName ?? '')}</span></p>}
                            </td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>}
          </section>
        </div>
      </main>
    </div>
  );
}

export function itemError(d: Dict, i: Pick<RunItem, 'status' | 'error'>){
  const e = i.error;
  if (!e) return '';
  if (i.status === 'skipped') return d.tasks.skip[e.code] ?? d.launch[e.code] ?? e.code;
  return d.launch[e.code] ?? flowError(d, e);
}

// A schedule as the form edits it: datetime-local and time inputs are in this computer's local time.
type Sched = { kind: 'none' | 'once' | 'daily'; at: string; time: string; days: number[] };
const localInput = (iso: string) => { const t = new Date(iso); return new Date(t.getTime() - t.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const schedOf = (s: Schedule | null): Sched => ({
  kind: s?.kind ?? 'none', at: s?.kind === 'once' ? localInput(s.at) : '', time: s?.kind === 'daily' ? s.time : '09:00', days: s?.kind === 'daily' ? s.days : [1, 2, 3, 4, 5]
});
const toSchedule = (s: Sched): Schedule | null =>
  s.kind === 'once' ? { kind: 'once', at: new Date(s.at).toISOString(), tz: localTz() }
  : s.kind === 'daily' ? { kind: 'daily', time: s.time, days: [...s.days].sort(), tz: localTz() } : null;

function TaskForm({ d, ws, data, task, onClose, onSaved }: { d: Dict; ws: Workspace; data: WorkspaceData; task?: Task; onClose(): void; onSaved(id: string): void }){
  const T = d.tasks.form;
  const toast = useToast();
  const profiles = data.profiles;
  const [name, setName] = useState(task?.name ?? '');
  const [flowId, setFlowId] = useState(task?.flowId ?? data.flows[0]?.id ?? '');
  const [ids, setIds] = useState<Set<string>>(() => new Set(task?.profileIds ?? []));
  const [concurrency, setConcurrency] = useState(task?.concurrency ?? 3);
  const [retries, setRetries] = useState(task?.retries ?? 1);
  const [timeoutMin, setTimeoutMin] = useState(task?.timeoutMin ?? 5);
  const [sched, setSched] = useState<Sched>(() => schedOf(task?.schedule ?? null));
  const [runHere, setRunHere] = useState(false);
  const [vars, setVars] = useState<{ mode: 'keep' | 'replace' | 'clear'; text: string }>({ mode: task?.hasVariables ? 'keep' : 'replace', text: '' });
  const [stored, setStored] = useState<{ count: number; names: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useChanged({ name, flowId, ids: [...ids].sort().join(), concurrency, retries, timeoutMin, sched: JSON.stringify(sched), runHere, vars: JSON.stringify(vars) });
  const picked = profiles.filter(p => ids.has(p.id));
  const parsed = useMemo(() => (vars.mode === 'replace' && vars.text.trim() ? readVariables(vars.text, picked) : null), [vars, ids, profiles]);
  const elsewhere = task?.runner && !task.runner.self ? task.runner : null;

  useEffect(() => {
    if (!task?.hasVariables) return;
    void folio.api<{ variables: Record<string, Record<string, string>> }>('GET', `/tasks/${task.id}/variables`)
      .then(r => setStored({ count: Object.keys(r.variables).length, names: [...new Set(Object.values(r.variables).flatMap(Object.keys))] }), () => {});
  }, [task?.id]);

  async function pick(e: ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0];
    if (file) setVars({ mode: 'replace', text: await file.text() });
    e.target.value = '';
  }
  async function save(){
    setSaving(true);
    const variables = vars.mode === 'clear' ? null : vars.mode === 'replace' ? parsed?.vars ?? (task ? null : undefined) : undefined;
    const body = {
      name: name.trim(), flowId, profileIds: [...ids], concurrency, retries, timeoutMin, schedule: toSchedule(sched),
      ...(variables === undefined ? {} : { variables }), ...(runHere ? { runHere } : {})
    };
    try {
      const saved = task
        ? await folio.api<Task>('PATCH', `/tasks/${task.id}`, { version: task.version, ...body })
        : await folio.api<Task>('POST', `/workspaces/${ws.id}/tasks`, body);
      data.refresh('tasks');
      toast({ title: d.tasks.saved, detail: saved.name });
      onSaved(saved.id);
    } catch (e){
      toast({ title: isApiError(e) && e.code === 'stale' ? d.tasks.stale : errorText(d, isApiError(e) ? e.code : 'internal'), tone: 'bad' });
    } finally { setSaving(false); }
  }
  const badSchedule = (sched.kind === 'once' && !sched.at) || (sched.kind === 'daily' && (!sched.days.length || !sched.time));
  const blocked = !name.trim() || !flowId || !ids.size || !!parsed?.errors.length || badSchedule || saving;
  const toggleDay = (n: number) => setSched(s => ({ ...s, days: s.days.includes(n) ? s.days.filter(x => x !== n) : [...s.days, n] }));

  return (
    <Modal title={task ? T.editTitle : T.newTitle} onClose={onClose} busy={saving} dirty={dirty} foot={<>
      <Cancel />
      <button className="btn btn-primary" type="button" disabled={blocked} aria-busy={saving || undefined} onClick={() => void save()}>{task ? T.save : T.create}</button>
    </>}>
      <div className="m-body">
        <div className="row2">
          <label className="field"><span>{T.name}</span><input value={name} maxLength={80} onChange={e => setName(e.target.value)} autoFocus /></label>
          <SelectField label={T.flow} value={flowId} onChange={setFlowId} options={data.flows.map(f => ({ value: f.id, label: f.name }))} searchPh={d.form.searchPh} />
        </div>
        <ProfilePicker d={d} profiles={profiles} data={data} value={ids} onChange={setIds} />
        <div className="row3">
          <SelectField label={T.concurrency} value={String(concurrency)} onChange={v => setConcurrency(Number(v))} search={false}
            options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
          <SelectField label={T.retries} value={String(retries)} onChange={v => setRetries(Number(v))} options={[0, 1, 2, 3].map(n => ({ value: String(n), label: T.retriesN(n) }))} />
          <SelectField label={T.timeout} value={String(timeoutMin)} onChange={v => setTimeoutMin(Number(v))} options={[1, 2, 3, 5, 10, 15, 30, 60].map(n => ({ value: String(n), label: T.minutes(n) }))} />
        </div>
        <p className="hint">{T.memory}</p>

        <div className="field">
          <span className="label">{T.when}</span>
          <div className="seg" role="group" aria-label={T.when}>
            {(['none', 'once', 'daily'] as const).map(k => <button key={k} type="button" aria-pressed={sched.kind === k} onClick={() => setSched(s => ({ ...s, kind: k }))}>{T.kinds[k]}</button>)}
          </div>
          {sched.kind === 'once' && <input type="datetime-local" aria-label={T.at} value={sched.at} onChange={e => setSched(s => ({ ...s, at: e.target.value }))} />}
          {sched.kind === 'daily' && (
            <div className="sched-daily">
              <input type="time" aria-label={T.time} value={sched.time} onChange={e => setSched(s => ({ ...s, time: e.target.value }))} />
              <div className="days" role="group" aria-label={T.days}>
                {d.tasks.dayNames.map((n, i) => <button key={n} type="button" className="day" aria-pressed={sched.days.includes(i + 1)} onClick={() => toggleDay(i + 1)}>{n}</button>)}
              </div>
            </div>
          )}
          {sched.kind !== 'none' && <p className="hint">{elsewhere ? T.runsOn(elsewhere.deviceName ?? '—', elsewhere.email ?? '—') : T.runsHere} {T.scheduleHelp}</p>}
          {sched.kind !== 'none' && elsewhere && <label className="check-row"><input type="checkbox" checked={runHere} onChange={e => setRunHere(e.target.checked)} />{T.moveHere}</label>}
        </div>

        <div className="field">
          <span className="label">{T.vars}</span>
          <p className="hint">{T.varsHelp}</p>
          {vars.mode !== 'replace' && task?.hasVariables ? (
            <div className="vars-kept">
              <span>{vars.mode === 'clear' ? T.varsCleared : stored ? T.varsStored(stored.count, stored.names.join(', ')) : <span className="spin" aria-hidden="true" />}</span>
              <span className="sp" />
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setVars({ mode: 'replace', text: '' })}>{T.varsReplace}</button>
              {vars.mode === 'keep' && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setVars({ mode: 'clear', text: '' })}>{T.varsClear}</button>}
            </div>
          ) : <>
            <div className="file-row">
              <label className="btn btn-secondary btn-sm file-btn">{d.importer.file}<input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={pick} /></label>
              {task?.hasVariables && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVars({ mode: 'keep', text: '' })}>{T.varsKeep}</button>}
            </div>
            <textarea className="mono-in" rows={3} aria-label={T.vars} value={vars.text} placeholder={'profile,email,password\nShop-01,ada@example.com,…'} spellCheck={false} onChange={e => setVars({ mode: 'replace', text: e.target.value })} />
            {parsed && (parsed.errors.length
              ? <ul className="bad-lines" role="alert">{parsed.errors.map(e => <li key={e.line}><span className="mono">{d.importer.row(e.line)}</span> {T.varErrs[e.problem]}{e.value ? ` “${e.value}”` : ''}</li>)}</ul>
              : <p className="hint" role="status">{T.varsReady(Object.keys(parsed.vars).length, parsed.names.join(', '))}</p>)}
          </>}
        </div>
      </div>
    </Modal>
  );
}

// Profiles to run on: search, narrow to a group, select what is shown.
function ProfilePicker({ d, profiles, data, value, onChange }: { d: Dict; profiles: Profile[]; data: WorkspaceData; value: Set<string>; onChange(s: Set<string>): void }){
  const T = d.tasks.form;
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const shown = profiles.filter(p => (!group || p.groupId === group) && (!q.trim() || `${p.name} #${pad(p.number)} ${p.tags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())));
  const all = shown.length > 0 && shown.every(p => value.has(p.id));
  const toggle = (id: string) => { const n = new Set(value); if (n.has(id)) n.delete(id); else n.add(id); onChange(n); };
  return (
    <div className="field picker">
      <span className="label">{T.profiles(value.size)}</span>
      <div className="picker-bar">
        <input type="search" aria-label={T.search} placeholder={T.search} value={q} onChange={e => setQ(e.target.value)} />
        {data.groups.length > 0 && <Select variant="sm" label={d.form.group} value={group} onChange={setGroup} options={[{ value: '', label: d.groups.all }, ...groupOpts(data.groups)]} />}
        <label className="check-row"><input type="checkbox" checked={all} disabled={!shown.length}
          onChange={() => { const n = new Set(value); shown.forEach(p => (all ? n.delete(p.id) : n.add(p.id))); onChange(n); }} />{T.all}</label>
      </div>
      <ul className="picker-list" aria-label={T.profiles(value.size)}>
        {shown.map(p => (
          <li key={p.id}><label className="check-row"><input type="checkbox" checked={value.has(p.id)} onChange={() => toggle(p.id)} />
            <span>{p.name}</span><span className="mono muted">#{pad(p.number)}</span></label></li>
        ))}
        {!shown.length && <li className="hint">{T.none}</li>}
      </ul>
    </div>
  );
}
