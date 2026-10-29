// Automation flows: the team's list, and an editor that draws the steps as a chart (a condition's branches side by
// side, a loop's steps in a frame), the picked step's settings and a trial run on one profile beside it.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { FlowEvent, FlowLog, FlowResult, Step } from '@shared/bridge';
import { folio, isApiError, type Flow, type Profile } from './api';
import type { WorkspaceData } from './data';
import { ago, type Dict } from './i18n';
import { Act, Cancel, Empty, Flt, Icon, ListFailed, Modal, MoreMenu, SkelRows, useFail, useLeave, useToast } from './ui';
import { SelectField } from './Select';

type StepType = Step['type'];
type Test = Extract<Step, { type: 'if' }>['test'];
// The add-step menu, by kind of step.
const STEP_GROUPS: [keyof Dict['flows']['groups'], StepType[]][] = [
  ['page', ['open', 'click', 'type', 'press', 'scroll', 'wait']], ['data', ['extract', 'set', 'screenshot', 'signedIn']], ['logic', ['if', 'loop']], ['other', ['script']]
];
const STEP_ICONS: Record<StepType, string> = {
  open: 'M9.75 14.25 14.25 9.75M10.5 6.75l1.5 -1.5a3.75 3.75 0 0 1 5.25 5.25l-1.5 1.5M13.5 17.25l-1.5 1.5A3.75 3.75 0 0 1 6.75 13.5l1.5 -1.5',
  click: 'M6 4.5l11.25 4.8 -4.65 1.8 -1.8 4.65zM12.6 11.1 18 16.5',
  type: 'M3 6.75h18v10.5H3zM6.75 10.5h0.015M10.5 10.5h0.015M14.25 10.5h0.015M18 10.5h0.015M7.5 14.25h9',
  press: 'M5.25 5.25h13.5v13.5h-13.5zM9 14.25l3 -5.25 3 5.25',
  wait: 'M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0zM12 7.5v4.5l3 2.25',
  scroll: 'M12 3.75v16.5M8.25 7.5 12 3.75 15.75 7.5M8.25 16.5 12 20.25 15.75 16.5',
  extract: 'M4.5 5.25h15M4.5 9.75h9M4.5 14.25h6M15.75 12v7.5M12.75 16.5l3 3 3 -3',
  set: 'M4.5 7.5l5.25 9M9.75 7.5 4.5 16.5M13.5 10.5h6M13.5 14.25h6',
  if: 'M6 3.75v16.5M6 9c0 3 2.25 4.5 6 4.5h5.25M15 11.25 17.25 13.5 15 15.75',
  loop: 'M4.5 12a7.5 7.5 0 0 1 12.75 -5.25M19.5 12a7.5 7.5 0 0 1 -12.75 5.25M17.25 3.75v3h-3M6.75 20.25v-3h3',
  screenshot: 'M3.75 7.5h3.75l1.5 -2.25h6l1.5 2.25h3.75v11.25h-16.5zM12 15.75a3 3 0 1 0 0 -6 3 3 0 0 0 0 6z',
  script: 'M8.25 6 3 12l5.25 6M15.75 6 21 12l-5.25 6',
  signedIn: 'M11.25 8.25a3.75 3.75 0 1 1 -7.5 0 3.75 3.75 0 0 1 7.5 0zM2.25 19.5c0.75 -3.45 3 -5.25 5.25 -5.25s4.5 1.8 5.25 5.25M14.25 13.5l2.25 2.25 4.5 -4.5'
};
const VAR = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

const fresh = (type: StepType): Step => {
  switch (type){
    case 'open': return { type, url: '' };
    case 'click': return { type, selector: '' };
    case 'type': return { type, selector: '', text: '', slow: false };
    case 'press': return { type, key: 'Enter' };
    case 'wait': return { type, until: 'time', seconds: 2, maxSeconds: null, selector: null };
    case 'scroll': return { type, to: 'bottom', selector: null, pixels: null };
    case 'extract': return { type, selector: '', attribute: null, variable: 'value' };
    case 'set': return { type, variable: 'name', value: '' };
    case 'if': return { type, test: { kind: 'exists', selector: '' }, then: [], else: [] };
    case 'loop': return { type, mode: 'times', times: 3, selector: null, steps: [] };
    case 'screenshot': return { type, selector: null };
    case 'script': return { type, code: 'return document.title;', variable: null };
    case 'signedIn': return { type, url: '', mode: 'present', selector: '', seconds: 10 };
  }
};

type Issue = 'url' | 'selector' | 'key' | 'variable' | 'pixels' | 'times' | 'code' | 'attribute';
function issueOf(s: Step): Issue | null {
  const blank = (v: string | null) => !v?.trim();
  switch (s.type){
    case 'open': return blank(s.url) ? 'url' : null;
    case 'signedIn': return blank(s.url) ? 'url' : blank(s.selector) ? 'selector' : null;
    case 'click': case 'type': return blank(s.selector) ? 'selector' : null;
    case 'press': return blank(s.key) ? 'key' : null;
    case 'wait': return s.until !== 'time' && blank(s.selector) ? 'selector' : null;
    case 'scroll': return s.to === 'element' && blank(s.selector) ? 'selector' : s.to === 'pixels' && s.pixels === null ? 'pixels' : null;
    case 'extract': return blank(s.selector) ? 'selector' : s.attribute !== null && blank(s.attribute) ? 'attribute' : VAR.test(s.variable) ? null : 'variable';
    case 'set': return VAR.test(s.variable) ? null : 'variable';
    case 'screenshot': return s.selector !== null && blank(s.selector) ? 'selector' : null;
    case 'script': return blank(s.code) ? 'code' : s.variable !== null && !VAR.test(s.variable) ? 'variable' : null;
    case 'if': return s.test.kind === 'equals' ? (VAR.test(s.test.variable) ? null : 'variable') : blank(s.test.selector) ? 'selector' : null;
    case 'loop': return s.mode === 'each' ? (blank(s.selector) ? 'selector' : null) : !s.times || s.times < 1 ? 'times' : null;
  }
}
export const countIssues = (steps: Step[]): number => steps.reduce((n, s) => n + (issueOf(s) ? 1 : 0)
  + (s.type === 'if' ? countIssues(s.then) + countIssues(s.else) : s.type === 'loop' ? countIssues(s.steps) : 0), 0);
export const countSteps = (steps: Step[]): number => steps.reduce((n, s) => n + 1
  + (s.type === 'if' ? countSteps(s.then) + countSteps(s.else) : s.type === 'loop' ? countSteps(s.steps) : 0), 0);

export function FlowsPage({ d, wsId, meId, data }: { d: Dict; wsId: string; meId: string; data: WorkspaceData }){
  const F = d.flows;
  const toast = useToast();
  const [open, setOpen] = useState<{ id: string | null; template?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Flow | null>(null);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const flows = data.flows.filter(f => !needle || f.name.toLowerCase().includes(needle));
  const person = new Map(data.members.map(m => [m.userId, m.email]));
  const fail = useFail();
  // The tasks a flow is used by, by name; such a flow can't be deleted.
  const users = (id: string) => data.tasks.filter(t => t.flowId === id).map(t => t.name).join(', ');

  async function duplicate(f: Flow){
    try {
      const copy = await folio.api<Flow>('POST', `/workspaces/${wsId}/flows`, { name: F.copyName(f.name).slice(0, 80), steps: f.steps });
      data.refresh('flows');
      setOpen({ id: copy.id });
    } catch (e){ fail(e); }
  }
  async function remove(f: Flow){
    setConfirm(null);
    try { await folio.api('DELETE', `/flows/${f.id}`); toast(F.deleted(f.name)); } catch (e){ fail(e); }
    data.refresh('flows');
  }

  if (open){
    const flow = open.id ? data.flows.find(f => f.id === open.id) ?? null : null;
    if (open.id && !flow) return <div className="page"><main className="main"><div className="flow-steps skel-list" aria-hidden="true"><i className="w2" /><i /><i /></div></main></div>;
    return <FlowEditor key={open.id ?? 'new'} d={d} wsId={wsId} data={data} flow={flow} template={!!open.template} onClose={() => setOpen(null)} onCreated={id => setOpen({ id })} onDuplicate={duplicate} />;
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{F.title}</h1></div>
          <span className="sp" />
          <button className="btn btn-secondary" type="button" onClick={() => setOpen({ id: null, template: true })}>{F.template}</button>
          <button className="btn btn-primary" type="button" onClick={() => setOpen({ id: null })}><Icon name="plus" />{F.new}</button>
        </header>
        <section className="list-card" aria-label={F.title}>
        <div className="filters">
          <Flt label={d.profiles.filterLabels.keyword} grow>
            <label className="search"><Icon name="search" /><span className="sr">{F.search}</span>
              <input type="search" placeholder={F.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
          </Flt>
          <button type="button" className="btn btn-secondary flt-reset" disabled={!needle} onClick={() => setQ('')}>{d.profiles.reset}</button>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr><th scope="col">{F.cols.name}</th><th className="mid" scope="col">{F.cols.steps}</th><th scope="col">{F.cols.by}</th><th className="mid" scope="col">{F.cols.updated}</th><th className="act" scope="col">{d.profiles.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th></tr>
            </thead>
            <tbody>
              {data.loadFailed.has('flows')
                ? <tr className="empty"><td colSpan={6}><ListFailed d={d} data={data} kind="flows" /></td></tr>
                : !data.loaded.has('flows') ? <SkelRows cols={6} />
                : !data.flows.length ? <tr className="empty"><td colSpan={6}><Empty icon="flows" title={F.emptyTitle} text={F.empty} /></td></tr>
                : !flows.length && <tr className="empty"><td colSpan={6}><Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQ('')}>{d.states.clear}</button>
                  </Empty></td></tr>}
              {flows.map(f => (
                <tr key={f.id} data-flow={f.name}>
                  <td><span className="l1"><button type="button" className="rowlink" onClick={() => setOpen({ id: f.id })}>{f.name}</button></span>
                    <span className="l2 flow-types">{[...new Set(f.steps.map(x => x.type))].slice(0, 5).map(t => <StepIcon key={t} t={t} />)}</span></td>
                  <td className="mid mono">{countSteps(f.steps)}</td>
                  <td>{f.createdBy === meId ? F.you : (f.createdBy && person.get(f.createdBy)) || '—'}</td>
                  <td className="mid">{ago(f.updatedAt, d)}</td>
                  <td className="act"><button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen({ id: f.id })}>{f.canEdit ? d.common.edit : F.view}</button></td>
                  <td className="more"><MoreMenu label={d.profiles.actionsX(f.name)} items={[
                    { label: F.duplicate, onClick: () => void duplicate(f) },
                    ...(f.canEdit ? [{ label: F.delete, onClick: () => setConfirm(f), danger: true }] : [])
                  ]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {flows.length > 0 && <p className="list-foot">{d.profiles.page.total(flows.length)}</p>}
        </section>
        {confirm && (
          <Modal kind="bad" title={F.confirmDelete(confirm.name)} onClose={() => setConfirm(null)} foot={<>
            <Cancel />
            {!users(confirm.id) && <Act className="btn btn-danger solid" run={() => remove(confirm)}>{F.delete}</Act>}
          </>}>{users(confirm.id) && <p>{F.inUse(users(confirm.id))}</p>}</Modal>
        )}
      </main>
    </div>
  );
}

// Where a step sits in the flow: its index in each list on the way down, and which list of the step above holds it
// (a condition's `then` or `else`, a loop's `steps`). [2, 'then', 0] is the first step of the third step's "when true".
type Branch = 'then' | 'else' | 'steps';
type Loc = (number | Branch)[];
const inner = (s: Step, b: Branch): Step[] => (s.type === 'if' ? (b === 'else' ? s.else : s.then) : s.type === 'loop' ? s.steps : []);
const listAt = (steps: Step[], path: Loc): Step[] => (path.length ? listAt(inner(steps[path[0] as number], path[1] as Branch), path.slice(2)) : steps);
export const stepAt = (steps: Step[], loc: Loc): Step | undefined => listAt(steps, loc.slice(0, -1))[loc[loc.length - 1] as number];
// The flow with the list at `path` replaced by what `fn` makes of it.
export function editList(steps: Step[], path: Loc, fn: (list: Step[]) => Step[]): Step[] {
  if (!path.length) return fn(steps);
  const [i, b, ...rest] = path as [number, Branch, ...Loc];
  return steps.map((s, k) => (k === i ? { ...s, [b]: editList(inner(s, b), rest, fn) } as Step : s));
}
// The number people see: "3", or "3.1" inside step 3 (either branch).
export const label = (loc: Loc) => loc.filter((x): x is number => typeof x === 'number').map(n => n + 1).join('.');
const same = (a: Loc | null, b: Loc) => !!a && a.length === b.length && a.every((x, k) => x === b[k]);

// `template`: a new flow that starts as a sign-in check, to fill in and save.
function FlowEditor({ d, wsId, data, flow, template, onClose, onCreated, onDuplicate }: {
  d: Dict; wsId: string; data: WorkspaceData; flow: Flow | null; template: boolean; onClose(): void; onCreated(id: string): void; onDuplicate(f: Flow): void;
}){
  const F = d.flows;
  const toast = useToast(), fail = useFail();
  const readOnly = !!flow && !flow.canEdit;
  const [base, setBase] = useState(flow);
  const [edit, setEdit] = useState({ name: flow?.name ?? (template ? F.templateName : F.untitled), steps: flow?.steps ?? (template ? [fresh('signedIn')] : []) });
  // The step being changed in the panel: the first one to begin with.
  const [sel, setSel] = useState<Loc | null>(edit.steps.length ? [0] : null);
  const [zoom, setZoom] = useState(1);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = !flow || edit.name !== base?.name || JSON.stringify(edit.steps) !== JSON.stringify(base?.steps);
  // Leaving with changes not saved, by the back button or the rail, asks first.
  const leave = useLeave(dirty && !readOnly);
  const issues = countIssues(edit.steps);
  const steps = (fn: (s: Step[]) => Step[]) => setEdit(x => ({ ...x, steps: fn(x.steps) }));

  // Someone else saved it while it was open here: take their version unless there are edits to keep.
  useEffect(() => {
    if (!flow || flow.version === base?.version) return;
    if (!dirty){ setBase(flow); setEdit({ name: flow.name, steps: flow.steps }); }
  }, [flow]);

  async function save(){
    setSaving(true);
    try {
      const body = { name: edit.name.trim(), steps: edit.steps };
      if (!base){
        const created = await folio.api<Flow>('POST', `/workspaces/${wsId}/flows`, body);
        data.refresh('flows');
        toast({ title: F.saved, detail: created.name });
        onCreated(created.id);
        return;
      }
      // After a stale warning, saving again goes over the latest version.
      const version = stale && flow ? flow.version : base.version;
      const saved = await folio.api<Flow>('PATCH', `/flows/${base.id}`, { version, ...body });
      setBase(saved); setStale(false);
      data.refresh('flows');
      toast({ title: F.saved, detail: saved.name });
    } catch (e){
      if (isApiError(e) && e.code === 'stale') setStale(true);
      else fail(e);
    } finally { setSaving(false); }
  }

  const add = (path: Loc, t: StepType) => {
    setSel([...path, listAt(edit.steps, path).length]);
    steps(s => editList(s, path, l => [...l, fresh(t)]));
  };
  const picked = sel ? stepAt(edit.steps, sel) : undefined;

  return (
    <div className="page">
      <main className="main flow-main">
        <header className="bar flow-bar">
          <button type="button" className="btn btn-text btn-sm" aria-label={F.backLabel} onClick={() => leave(onClose)}><Icon name="back" />{F.back}</button>
          <span className="vsep" aria-hidden="true" />
          <label className="flow-name">
            <span className="sr">{F.name}</span>
            <input value={edit.name} maxLength={80} readOnly={readOnly} aria-label={F.name} aria-invalid={!edit.name.trim()} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} />
          </label>
          {base && !dirty && <span className="flow-saved"><Icon name="check" />{F.upToDate}</span>}
          <span className="sp" />
          {readOnly
            ? <button type="button" className="btn btn-secondary" onClick={() => flow && onDuplicate(flow)}>{F.duplicateToEdit}</button>
            : <button type="button" className="btn btn-primary" aria-busy={saving || undefined} disabled={!dirty || !!issues || !edit.name.trim() || saving} title={issues ? F.issues(issues) : !edit.name.trim() ? F.nameNeeded : undefined} onClick={() => void save()}>{saving ? F.saving : F.save}</button>}
        </header>
        {readOnly && <p className="hint flow-note">{F.readOnly}</p>}
        {stale && <p className="notice error flow-note" role="alert">{F.stale}</p>}
        {!readOnly && issues > 0 && <p className="hint flow-note">{F.issues(issues)}</p>}
        <div className="flow-edit">
          <section className="canvas" aria-label={F.steps}>
            <div className="canvas-scroll"><div className="canvas-in" style={{ zoom }}>
              {!edit.steps.length && (readOnly ? <p className="hint">{F.noSteps}</p> : (
                <div className="flow-empty">
                  <h3>{F.start.title}</h3>
                  <p className="hint">{F.start.body}</p>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setSel([0]); steps(() => [fresh('signedIn')]); }}>{F.start.template}</button>
                </div>
              ))}
              <Chain d={d} steps={edit.steps} path={[]} sel={sel} readOnly={readOnly} onPick={setSel} onAdd={add} />
              {edit.steps.length > 0 && <span className="fend">{F.end}</span>}
            </div></div>
            <div className="zoom">
              <button type="button" aria-label={F.zoomOut} title={F.zoomOut} disabled={zoom <= 0.6} onClick={() => setZoom(z => Math.round((z - 0.1) * 10) / 10)}>−</button>
              <b className="mono">{Math.round(zoom * 100)}%</b>
              <button type="button" aria-label={F.zoomIn} title={F.zoomIn} disabled={zoom >= 1.3} onClick={() => setZoom(z => Math.round((z + 0.1) * 10) / 10)}>+</button>
            </div>
          </section>
          <div className="flow-side">
            <StepPanel d={d} steps={edit.steps} loc={picked ? sel : null} readOnly={readOnly}
              onChange={s => sel && steps(x => editList(x, sel.slice(0, -1), l => l.map((y, k) => (k === sel[sel.length - 1] ? s : y))))}
              onEdit={(fn, next) => { if (sel){ steps(x => editList(x, sel.slice(0, -1), fn)); setSel(next); } }} />
            <Trial d={d} profiles={data.profiles} steps={edit.steps} disabled={!!issues} />
          </div>
        </div>
      </main>
    </div>
  );
}

const CATEGORY = Object.fromEntries(STEP_GROUPS.flatMap(([g, types]) => types.map(t => [t, g]))) as Record<StepType, string>;
const StepIcon = ({ t }: { t: StepType }) => <span className={`stype ${CATEGORY[t]}`} aria-hidden="true"><svg className="i" viewBox="0 0 24 24"><path d={STEP_ICONS[t]} /></svg></span>;

// A step in one line, for its node.
function summary(d: Dict, s: Step): string {
  const S = d.flows.sum, f = d.flows.f;
  switch (s.type){
    case 'open': return s.url;
    case 'click': return s.selector;
    case 'type': return s.text ? `${s.selector} · ${s.text}` : s.selector;
    case 'press': return s.key;
    case 'wait': return s.until === 'time' ? S.secs(s.seconds, s.maxSeconds) : S.until(s.until === 'visible' ? f.untilVisible : f.untilHidden, s.selector ?? '', s.seconds);
    case 'scroll': return s.to === 'bottom' ? f.toBottom : s.to === 'pixels' ? S.pixels(s.pixels ?? 0) : s.selector ?? '';
    case 'extract': return S.into(s.selector, s.attribute ?? f.takeText, s.variable);
    case 'set': return `{{${s.variable}}} = ${s.value}`;
    case 'if': return s.test.kind === 'equals' ? `{{${s.test.variable}}} = ${s.test.value}` : s.test.kind === 'contains' ? S.contains(s.test.selector, s.test.text) : S.exists(s.test.selector);
    case 'loop': return s.mode === 'times' ? S.times(s.times ?? 0) : S.each(s.selector ?? '');
    case 'screenshot': return s.selector === null ? f.shotPage : s.selector;
    case 'script': return s.code.split('\n')[0];
    case 'signedIn': return `${s.url} · ${s.mode === 'present' ? f.signedPresent : f.signedAbsent} ${s.selector}`;
  }
}

interface ChainProps { d: Dict; steps: Step[]; path: Loc; sel: Loc | null; readOnly: boolean; onPick(l: Loc): void; onAdd(path: Loc, t: StepType): void }

// One list of steps, top to bottom, with "Add step" at its end. Steps nest four levels deep at most.
function Chain({ d, steps, path, sel, readOnly, onPick, onAdd }: ChainProps){
  const depth = path.length / 2 + 1;
  return (
    <ol className="chain">
      {steps.map((s, i) => <StepNode key={i} d={d} s={s} loc={[...path, i]} sel={sel} readOnly={readOnly} onPick={onPick} onAdd={onAdd} />)}
      {readOnly ? !steps.length && <li className="fnone">—</li> : <li><AddStep d={d} depth={depth} onAdd={t => onAdd(path, t)} /></li>}
    </ol>
  );
}

// A step's node: its kind, number and what it does; a condition's two branches side by side below it; a loop's steps
// in a frame.
function StepNode({ d, s, loc, sel, readOnly, onPick, onAdd }: Omit<ChainProps, 'steps' | 'path'> & { s: Step; loc: Loc }){
  const F = d.flows, path = label(loc), text = summary(d, s), issue = !readOnly && issueOf(s);
  const branch = (b: Branch, name: string, cls = '') => (
    <div className={`fbr ${cls}`} role="group" aria-label={name}>
      <span className="fbl">{name}</span>
      <Chain d={d} steps={inner(s, b)} path={[...loc, b]} sel={sel} readOnly={readOnly} onPick={onPick} onAdd={onAdd} />
    </div>
  );
  return (
    <li data-step={path} aria-label={`${path} ${F.types[s.type]}`}>
      <button type="button" className={`fnode${same(sel, loc) ? ' on' : ''}${issue ? ' bad' : ''}`} aria-pressed={same(sel, loc)} onClick={() => onPick(loc)}>
        <StepIcon t={s.type} />
        <span><small className="mono">{path}</small><b>{F.types[s.type]}</b><span className={text ? '' : 'muted'}>{text || F.sum.empty}</span></span>
      </button>
      {s.type === 'if' && <div className="fork">{branch('then', F.then, 'yes')}{branch('else', F.else)}</div>}
      {s.type === 'loop' && <div className="floop">{branch('steps', F.each)}</div>}
    </li>
  );
}

// "Add step": a menu of the step types by kind, each with what it does. Opens over the chart, which scrolls and zooms.
function AddStep({ d, depth, onAdd }: { d: Dict; depth: number; onAdd(t: StepType): void }){
  const F = d.flows;
  const [at, setAt] = useState<{ left: number; top: number | 'auto'; bottom: number | 'auto' } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setAt(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [at]);
  function toggle(){
    if (at){ setAt(null); return; }
    const r = button.current!.getBoundingClientRect(), left = Math.max(8, Math.min(r.left, innerWidth - 588));
    setAt(innerHeight - r.bottom > 380 ? { left, top: r.bottom + 6, bottom: 'auto' } : { left, top: 'auto', bottom: innerHeight - r.top + 6 });
  }
  return (
    <div className="add-step">
      <button ref={button} type="button" className="fadd" aria-haspopup="menu" aria-expanded={!!at} onClick={toggle}><Icon name="plus" />{F.add}</button>
      {at && createPortal(
        <div ref={menu} className="menu step-menu" role="menu" aria-label={F.add} style={at}>
          {STEP_GROUPS.map(([g, types]) => {
            const shown = types.filter(t => depth < 4 || (t !== 'if' && t !== 'loop'));
            return shown.length > 0 && (
              <div key={g} role="group" aria-label={F.groups[g]}>
                <p className="menu-t">{F.groups[g]}</p>
                {shown.map(t => (
                  <button key={t} type="button" role="menuitem" className="menu-item step-item" aria-label={F.types[t]} onClick={() => { setAt(null); onAdd(t); }}>
                    <StepIcon t={t} /><span><b>{F.types[t]}</b><small>{F.about[t]}</small></span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>, document.body)}
    </div>
  );
}

// The picked step's settings, and moving, duplicating or removing it.
function StepPanel({ d, steps, loc, readOnly, onChange, onEdit }: {
  d: Dict; steps: Step[]; loc: Loc | null; readOnly: boolean; onChange(s: Step): void; onEdit(fn: (list: Step[]) => Step[], next: Loc | null): void;
}){
  const F = d.flows;
  if (!loc) return <section className="fcard fstep" aria-label={F.settings}><p className="hint">{F.pick}</p></section>;
  const s = stepAt(steps, loc)!, i = loc[loc.length - 1] as number, up = loc.slice(0, -1), list = listAt(steps, up);
  const path = label(loc), issue = issueOf(s);
  return (
    <section className="fcard fstep" aria-label={F.settings}>
      <header className="fstep-h">
        <StepIcon t={s.type} />
        <span><small>{F.stepN(path)}</small><b>{F.types[s.type]}</b></span>
        <span className="sp" />
        {!readOnly && <span className="fstep-acts">
          <button type="button" className="icon-btn bare" aria-label={F.up(path)} title={F.up(path)} disabled={i === 0}
            onClick={() => onEdit(l => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; }, [...up, i - 1])}><Icon name="up" /></button>
          <button type="button" className="icon-btn bare" aria-label={F.down(path)} title={F.down(path)} disabled={i === list.length - 1}
            onClick={() => onEdit(l => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; }, [...up, i + 1])}><Icon name="down" /></button>
          <button type="button" className="icon-btn bare" aria-label={F.copyStep(path)} title={F.copyStep(path)} disabled={countSteps([s]) + countSteps(steps) > 300}
            onClick={() => onEdit(l => [...l.slice(0, i + 1), structuredClone(s), ...l.slice(i + 1)], [...up, i + 1])}><Icon name="copy" /></button>
          <button type="button" className="icon-btn bare danger" aria-label={F.remove(path)} title={F.remove(path)}
            onClick={() => onEdit(l => l.filter((_, k) => k !== i), null)}><Icon name="trash" /></button>
        </span>}
      </header>
      <fieldset className="step-body" disabled={readOnly}>
        <StepFields d={d} s={s} onChange={onChange} />
      </fieldset>
      {issue && !readOnly && <p className="err">{F.issue[issue]}</p>}
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }){
  return <label className={`field${wide ? ' wide' : ''}`}><span>{label}</span>{children}</label>;
}
function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange(v: T): void }){
  return (
    <div className="field wide"><span className="label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}
      </div>
    </div>
  );
}
const num = (v: string) => (v.trim() === '' ? null : Number(v));

function StepFields({ d, s, onChange }: { d: Dict; s: Step; onChange(s: Step): void }){
  const F = d.flows.f;
  const sel = (value: string | null, set: (v: string) => void, wide = true) => (
    <Field label={F.selector} wide={wide}><input className="mono-in" value={value ?? ''} placeholder={F.selectorPh} spellCheck={false} onChange={e => set(e.target.value)} /></Field>
  );
  const variable = (value: string, set: (v: string) => void, label = F.variable) => (
    <Field label={label}><input className="mono-in" value={value} maxLength={40} spellCheck={false} onChange={e => set(e.target.value)} /></Field>
  );
  switch (s.type){
    case 'open': return <Field label={F.url} wide><input className="mono-in" value={s.url} placeholder="https://" spellCheck={false} onChange={e => onChange({ ...s, url: e.target.value })} /></Field>;
    case 'click': return sel(s.selector, v => onChange({ ...s, selector: v }));
    case 'type': return <>
      {sel(s.selector, v => onChange({ ...s, selector: v }))}
      <Field label={F.text} wide><input value={s.text} spellCheck={false} onChange={e => onChange({ ...s, text: e.target.value })} /></Field>
      <label className="check-row wide"><input type="checkbox" checked={s.slow} onChange={e => onChange({ ...s, slow: e.target.checked })} />{F.slow}</label>
    </>;
    case 'press': return <Field label={F.key}><input className="mono-in" value={s.key} placeholder="Enter, Control+A" onChange={e => onChange({ ...s, key: e.target.value })} /></Field>;
    case 'wait': return <>
      <Seg label={F.until} value={s.until} options={[['time', F.untilTime], ['visible', F.untilVisible], ['hidden', F.untilHidden]]}
        onChange={until => onChange({ ...s, until, selector: until === 'time' ? null : s.selector ?? '', maxSeconds: until === 'time' ? s.maxSeconds : null, seconds: until === 'time' ? 2 : 30 })} />
      {s.until === 'time' ? <>
        <Field label={F.seconds}><input type="number" min={0} max={3600} step="any" value={s.seconds} onChange={e => onChange({ ...s, seconds: num(e.target.value) ?? 0 })} /></Field>
        <Field label={F.maxSeconds}><input type="number" min={0} max={3600} step="any" value={s.maxSeconds ?? ''} placeholder={F.optional} onChange={e => onChange({ ...s, maxSeconds: num(e.target.value) })} /></Field>
      </> : <>
        {sel(s.selector, v => onChange({ ...s, selector: v }), false)}
        <Field label={F.limit}><input type="number" min={1} max={3600} value={s.seconds} onChange={e => onChange({ ...s, seconds: num(e.target.value) ?? 30 })} /></Field>
      </>}
    </>;
    case 'scroll': return <>
      <Seg label={F.to} value={s.to} options={[['element', F.toElement], ['pixels', F.toPixels], ['bottom', F.toBottom]]}
        onChange={to => onChange({ ...s, to, selector: to === 'element' ? s.selector ?? '' : null, pixels: to === 'pixels' ? s.pixels ?? 600 : null })} />
      {s.to === 'element' && sel(s.selector, v => onChange({ ...s, selector: v }))}
      {s.to === 'pixels' && <Field label={F.pixels}><input type="number" min={-100000} max={100000} step={1} value={s.pixels ?? ''} onChange={e => onChange({ ...s, pixels: num(e.target.value) })} /></Field>}
    </>;
    case 'extract': return <>
      {sel(s.selector, v => onChange({ ...s, selector: v }))}
      <Seg label={F.take} value={s.attribute === null ? 'text' : 'attr'} options={[['text', F.takeText], ['attr', F.takeAttr]]}
        onChange={v => onChange({ ...s, attribute: v === 'text' ? null : 'href' })} />
      {s.attribute !== null && <Field label={F.attribute}><input className="mono-in" value={s.attribute} placeholder="href" onChange={e => onChange({ ...s, attribute: e.target.value })} /></Field>}
      {variable(s.variable, v => onChange({ ...s, variable: v }), F.into)}
    </>;
    case 'set': return <>
      {variable(s.variable, v => onChange({ ...s, variable: v }))}
      <Field label={F.value}><input value={s.value} spellCheck={false} onChange={e => onChange({ ...s, value: e.target.value })} /></Field>
    </>;
    case 'screenshot': return <>
      <Seg label={F.shot} value={s.selector === null ? 'page' : 'element'} options={[['page', F.shotPage], ['element', F.shotElement]]}
        onChange={v => onChange({ ...s, selector: v === 'page' ? null : '' })} />
      {s.selector !== null && sel(s.selector, v => onChange({ ...s, selector: v }))}
    </>;
    case 'script': return <>
      <Field label={F.code} wide><textarea className="mono-in" rows={4} value={s.code} spellCheck={false} onChange={e => onChange({ ...s, code: e.target.value })} /></Field>
      <Field label={F.result}><input className="mono-in" value={s.variable ?? ''} placeholder={F.optional} maxLength={40} onChange={e => onChange({ ...s, variable: e.target.value.trim() ? e.target.value : null })} /></Field>
      <p className="hint wide">{F.scriptHint}</p>
    </>;
    case 'if': {
      const t = s.test;
      const setTest = (test: Test) => onChange({ ...s, test });
      return <>
        <SelectField label={F.test} value={t.kind} options={[{ value: 'exists', label: F.exists }, { value: 'contains', label: F.contains }, { value: 'equals', label: F.equals }]}
          onChange={v => {
            const kind = v as Test['kind'];
            setTest(kind === 'equals' ? { kind, variable: 'name', value: '' } : kind === 'contains' ? { kind, selector: 'selector' in t ? t.selector : '', text: '' } : { kind, selector: 'selector' in t ? t.selector : '' });
          }} />
        {t.kind === 'equals' ? <>
          {variable(t.variable, v => setTest({ ...t, variable: v }))}
          <Field label={F.value}><input value={t.value} onChange={e => setTest({ ...t, value: e.target.value })} /></Field>
        </> : <>
          {sel(t.selector, v => setTest({ ...t, selector: v }), t.kind === 'exists')}
          {t.kind === 'contains' && <Field label={F.text}><input value={t.text} onChange={e => setTest({ ...t, text: e.target.value })} /></Field>}
        </>}
      </>;
    }
    case 'signedIn': return <>
      <Field label={F.url} wide><input className="mono-in" value={s.url} placeholder="https://" spellCheck={false} onChange={e => onChange({ ...s, url: e.target.value })} /></Field>
      <Seg label={F.signedBy} value={s.mode} options={[['present', F.signedPresent], ['absent', F.signedAbsent]]} onChange={mode => onChange({ ...s, mode })} />
      {sel(s.selector, v => onChange({ ...s, selector: v }), false)}
      <Field label={F.limit}><input type="number" min={1} max={120} value={s.seconds} onChange={e => onChange({ ...s, seconds: num(e.target.value) ?? 10 })} /></Field>
      <p className="hint wide">{F.signedHint}</p>
    </>;
    case 'loop': return <>
      <Seg label={F.repeat} value={s.mode} options={[['times', F.repeatTimes], ['each', F.repeatEach]]}
        onChange={mode => onChange({ ...s, mode, times: mode === 'times' ? s.times ?? 3 : null, selector: mode === 'each' ? s.selector ?? '' : null })} />
      {s.mode === 'times'
        ? <Field label={F.times}><input type="number" min={1} max={1000} step={1} value={s.times ?? ''} onChange={e => onChange({ ...s, times: num(e.target.value) })} /></Field>
        : sel(s.selector, v => onChange({ ...s, selector: v }))}
      <p className="hint wide">{s.mode === 'each' ? F.eachHint : F.timesHint}</p>
    </>;
  }
}

// A trial run on one profile, with the log as it happens. Uses the steps as they are in the editor.
function Trial({ d, profiles, steps, disabled }: { d: Dict; profiles: Profile[]; steps: Step[]; disabled: boolean }){
  const F = d.flows.trial;
  const [profileId, setProfileId] = useState('');
  const [varsText, setVarsText] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [log, setLog] = useState<FlowLog[]>([]);
  const [result, setResult] = useState<FlowResult | null>(null);
  const tokenRef = useRef<string | null>(null);
  const profile = profiles.find(p => p.id === profileId) ?? profiles[0];
  const vars = useMemo(() => Object.fromEntries(varsText.split('\n').map(l => l.split('=')).filter(([k, ...v]) => k.trim() && v.length).map(([k, ...v]) => [k.trim(), v.join('=').trim()])), [varsText]);

  useEffect(() => folio.onFlow((e: FlowEvent) => {
    if (e.token !== tokenRef.current) return;
    if (e.log) setLog(l => [...l, e.log!]);
    if (e.done){ setResult(e.done); setToken(null); tokenRef.current = null; }
  }), []);
  // Leaving the editor stops a run still under way.
  useEffect(() => () => { if (tokenRef.current) void folio.stopFlow(tokenRef.current); }, []);

  async function start(){
    if (!profile) return;
    setLog([]); setResult(null);
    const t = await folio.tryFlow(profile.id, steps, { ...vars, 'profile.name': profile.name, 'profile.number': String(profile.number).padStart(4, '0') });
    tokenRef.current = t; setToken(t);
  }
  const data = Object.entries(result?.data ?? {});

  return (
    <aside className="fcard trial" aria-label={F.title}>
      <h2>{F.title}</h2>
      <SelectField label={F.profile} value={profile?.id ?? ''} onChange={setProfileId} disabled={!!token || !profiles.length} placeholder={F.noProfiles} searchPh={d.form.searchPh}
        options={profiles.map(p => ({ value: p.id, label: p.name, hint: `#${String(p.number).padStart(4, '0')}` }))} />
      <Field label={F.vars}><textarea className="mono-in" rows={2} value={varsText} placeholder="email=me@example.com" spellCheck={false} onChange={e => setVarsText(e.target.value)} /></Field>
      {token
        ? <button type="button" className="btn btn-secondary" onClick={() => void folio.stopFlow(token)}><span className="spin" aria-hidden="true" />{F.stop}</button>
        : <button type="button" className="btn btn-primary" disabled={!profile || !steps.length || disabled} onClick={() => void start()}><Icon name="play" />{F.run}</button>}
      {(log.length > 0 || result) && (
        <ol className="run-log" aria-label={F.log}>
          {log.map((l, i) => (
            <li key={i} className={l.error ? 'bad' : ''}>
              <span className="mono">{l.path}</span>
              <span><b>{d.flows.types[l.type]}</b>{l.target && <span className="mono t"> {l.target}</span>}
                {l.value !== undefined && !l.error && <span className="v"> → {l.type === 'if' ? (l.value === 'then' ? d.flows.then : d.flows.else) : l.type === 'loop' ? F.times(Number(l.value)) : l.value}</span>}
                {l.error && <span className="e"> {flowError(d, l.error)}</span>}
              </span>
              <span className="mono ms">{l.ms !== null ? F.ms(l.ms) : ''}</span>
            </li>
          ))}
        </ol>
      )}
      {result && (
        <div className="trial-result" role="status">
          <p className={result.ok ? 'ok' : 'err'}>{result.ok ? F.ok : result.launchError ? F.notOpened(d.launch[result.launchError] ?? d.launch.launch_failed) : result.error!.code === 'signed_out' ? F.signedOut : F.failed(flowError(d, result.error!))}</p>
          {data.length > 0 && <dl className="trial-data">{data.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
          {result.screenshots.map(s => <button key={s} type="button" className="linkish hint" onClick={() => void folio.showFile(s)}>{F.shot(s.split(/[\\/]/).pop()!)}</button>)}
        </div>
      )}
    </aside>
  );
}

export function flowError(d: Dict, e: { code: string; message: string }){
  const E = d.flows.errors;
  if (e.code === 'variable') return E.variable(e.message);
  if (e.code === 'too_long') return E.too_long(e.message);
  const text = E[e.code as Exclude<keyof typeof E, 'variable' | 'too_long'>] ?? E.failed;
  return e.message && e.code !== 'stopped' && e.code !== 'no_item' ? `${text} (${e.message})` : text;
}
