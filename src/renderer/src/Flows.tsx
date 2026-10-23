// Automation flows: the team's list, and an editor where steps are added, filled in, moved and nested, with a
// trial run on one profile beside it.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FlowEvent, FlowLog, FlowResult, Step } from '@shared/bridge';
import { folio, isApiError, type Flow, type Profile } from './api';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict } from './i18n';
import { Icon, useOutsideClose, useToast } from './ui';
import { SelectField } from './Select';

type StepType = Step['type'];
type Test = Extract<Step, { type: 'if' }>['test'];
// The add-step menu, by kind of step.
const STEP_GROUPS: [keyof Dict['flows']['groups'], StepType[]][] = [
  ['page', ['open', 'click', 'type', 'press', 'scroll', 'wait']], ['data', ['extract', 'set', 'screenshot', 'signedIn']], ['logic', ['if', 'loop']], ['other', ['script']]
];
const STEP_ICONS: Record<StepType, string> = {
  open: 'M6.5 9.5 9.5 6.5M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1',
  click: 'M4 3l7.5 3.2-3.1 1.2-1.2 3.1zM8.4 7.4 12 11',
  type: 'M2 4.5h12v7H2zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5 9.5h6',
  press: 'M3.5 3.5h9v9h-9zM6 9.5l2-3.5 2 3.5',
  wait: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 5v3l2 1.5',
  scroll: 'M8 2.5v11M5.5 5 8 2.5 10.5 5M5.5 11 8 13.5 10.5 11',
  extract: 'M3 3.5h10M3 6.5h6M3 9.5h4M10.5 8v5M8.5 11l2 2 2-2',
  set: 'M3 5l3.5 6M6.5 5 3 11M9 7h4M9 9.5h4',
  if: 'M4 2.5v11M4 6c0 2 1.5 3 4 3h3.5M10 7.5 11.5 9 10 10.5',
  loop: 'M3 8a5 5 0 0 1 8.5-3.5M13 8a5 5 0 0 1-8.5 3.5M11.5 2.5v2h-2M4.5 13.5v-2h2',
  screenshot: 'M2.5 5h2.5l1-1.5h4l1 1.5h2.5v7.5h-11zM8 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  script: 'M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4',
  signedIn: 'M7.5 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM1.5 13c.5-2.3 2-3.5 3.5-3.5s3 1.2 3.5 3.5M9.5 9l1.5 1.5 3-3'
};
const StepIcon = ({ t }: { t: StepType }) => <span className="step-ic" aria-hidden="true"><svg className="i" viewBox="0 0 16 16"><path d={STEP_ICONS[t]} /></svg></span>;
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
  const [confirm, setConfirm] = useState<string | null>(null);
  const email = new Map(data.members.map(m => [m.userId, m.email]));
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'));
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
    if (open.id && !flow) return <div className="page"><main className="main"><p className="boot">{d.loading}</p></main></div>;
    return <FlowEditor key={open.id ?? 'new'} d={d} wsId={wsId} data={data} flow={flow} template={!!open.template} onClose={() => setOpen(null)} onCreated={id => setOpen({ id })} onDuplicate={duplicate} />;
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{F.title}</h1><p className="sub">{F.sub(data.flows.length)}</p></div>
          <span className="sp" />
          <button className="btn btn-secondary" type="button" onClick={() => setOpen({ id: null, template: true })}>{F.template}</button>
          <button className="btn btn-primary" type="button" onClick={() => setOpen({ id: null })}><Icon name="plus" />{F.new}</button>
        </header>
        <div className="tw top-gap">
          <table>
            <thead>
              <tr><th scope="col">{F.cols.name}</th><th scope="col" className="num">{F.cols.steps}</th><th scope="col">{F.cols.by}</th><th scope="col">{F.cols.updated}</th><th className="act" scope="col" /></tr>
            </thead>
            <tbody>
              {!data.flows.length && <tr className="empty"><td colSpan={5}><p>{F.empty}</p></td></tr>}
              {data.flows.map(f => (
                <tr key={f.id} data-flow={f.name}>
                  <td><button type="button" className="rowlink" onClick={() => setOpen({ id: f.id })}>{f.name}</button></td>
                  <td className="num">{countSteps(f.steps)}</td>
                  <td>{f.createdBy === meId ? F.you : (f.createdBy && email.get(f.createdBy)) || '—'}</td>
                  <td>{ago(f.updatedAt, d)}</td>
                  <td className="act"><span className="actin">
                    {confirm === f.id ? <>
                      <span className="hint">{users(f.id) ? F.inUse(users(f.id)) : F.confirmDelete(f.name)}</span>
                      <button type="button" className="btn btn-xs btn-text" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
                      {!users(f.id) && <button type="button" className="btn btn-xs btn-danger solid" onClick={() => void remove(f)}>{F.delete}</button>}
                    </> : <>
                      <button type="button" className="btn btn-xs btn-secondary" onClick={() => setOpen({ id: f.id })}>{f.canEdit ? d.common.edit : F.view}</button>
                      <button type="button" className="btn btn-xs btn-text" onClick={() => void duplicate(f)}>{F.duplicate}</button>
                      {f.canEdit && <button type="button" className="btn btn-xs btn-danger" aria-label={F.deleteX(f.name)} onClick={() => setConfirm(f.id)}>{F.delete}</button>}
                    </>}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

// `template`: a new flow that starts as a sign-in check, to fill in and save.
function FlowEditor({ d, wsId, data, flow, template, onClose, onCreated, onDuplicate }: {
  d: Dict; wsId: string; data: WorkspaceData; flow: Flow | null; template: boolean; onClose(): void; onCreated(id: string): void; onDuplicate(f: Flow): void;
}){
  const F = d.flows;
  const toast = useToast();
  const readOnly = !!flow && !flow.canEdit;
  const [base, setBase] = useState(flow);
  const [edit, setEdit] = useState({ name: flow?.name ?? (template ? F.templateName : F.untitled), steps: flow?.steps ?? (template ? [fresh('signedIn')] : []) });
  const [stale, setStale] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = !flow || edit.name !== base?.name || JSON.stringify(edit.steps) !== JSON.stringify(base?.steps);
  const issues = countIssues(edit.steps);

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
        toast(F.saved);
        onCreated(created.id);
        return;
      }
      // After a stale warning, saving again goes over the latest version.
      const version = stale && flow ? flow.version : base.version;
      const saved = await folio.api<Flow>('PATCH', `/flows/${base.id}`, { version, ...body });
      setBase(saved); setStale(false);
      data.refresh('flows');
      toast(F.saved);
    } catch (e){
      if (isApiError(e) && e.code === 'stale') setStale(true);
      else toast(errorText(d, isApiError(e) ? e.code : 'internal'));
    } finally { setSaving(false); }
  }

  return (
    <div className="page">
      <main className="main flow-main">
        <header className="bar">
          <button type="button" className="btn btn-text btn-sm" onClick={() => (dirty && !readOnly ? setLeaving(true) : onClose())}>{F.back}</button>
          <label className="flow-name">
            <span className="sr">{F.name}</span>
            <input value={edit.name} maxLength={80} readOnly={readOnly} aria-label={F.name} aria-invalid={!edit.name.trim()} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} />
          </label>
          <span className="sp" />
          {readOnly
            ? <button type="button" className="btn btn-secondary" onClick={() => flow && onDuplicate(flow)}>{F.duplicateToEdit}</button>
            : <button type="button" className="btn btn-primary" disabled={!dirty || !!issues || !edit.name.trim() || saving} title={issues ? F.issues(issues) : !edit.name.trim() ? F.nameNeeded : undefined} onClick={() => void save()}>{saving ? F.saving : F.save}</button>}
        </header>
        {leaving && (
          <div className="away-note flow-note" role="alertdialog" aria-label={F.leave}>
            <span>{F.leave}</span>
            <div className="d-actions"><button type="button" className="btn btn-xs btn-secondary" onClick={() => setLeaving(false)}>{F.keepEditing}</button>
              <button type="button" className="btn btn-xs btn-danger solid" onClick={onClose}>{F.discard}</button></div>
          </div>
        )}
        {readOnly && <p className="hint flow-note">{F.readOnly}</p>}
        {stale && <p className="notice error flow-note" role="alert">{F.stale}</p>}
        {!readOnly && issues > 0 && <p className="hint flow-note">{F.issues(issues)}</p>}
        <div className="flow-edit">
          <section className="flow-steps" aria-label={F.steps}>
            {!edit.steps.length && (readOnly ? <p className="hint">{F.noSteps}</p> : (
              <div className="flow-empty">
                <h3>{F.start.title}</h3>
                <p className="hint">{F.start.body}</p>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEdit(x => ({ ...x, steps: [fresh('signedIn')] }))}>{F.start.template}</button>
              </div>
            ))}
            <StepList d={d} steps={edit.steps} prefix="" depth={1} readOnly={readOnly} onChange={steps => setEdit(x => ({ ...x, steps }))} />
          </section>
          <Trial d={d} profiles={data.profiles ?? []} steps={edit.steps} disabled={!!issues} />
        </div>
      </main>
    </div>
  );
}

function StepList({ d, steps, prefix, depth, readOnly, onChange }: { d: Dict; steps: Step[]; prefix: string; depth: number; readOnly: boolean; onChange(s: Step[]): void }){
  const F = d.flows;
  const set = (i: number, s: Step) => onChange(steps.map((x, k) => (k === i ? s : x)));
  const move = (i: number, by: number) => { const n = [...steps]; [n[i], n[i + by]] = [n[i + by], n[i]]; onChange(n); };
  return (
    <div className="step-list">
      <ol className="steps">
        {steps.map((s, i) => {
          const path = `${prefix}${i + 1}`, issue = issueOf(s);
          return (
            <li key={i} className={`step${issue && !readOnly ? ' bad' : ''}`} data-step={path} aria-label={`${path} ${F.types[s.type]}`}>
              <div className="step-h">
                <span className="step-n mono">{path}</span><StepIcon t={s.type} /><b>{F.types[s.type]}</b>
                <span className="sp" />
                {!readOnly && <>
                  <button type="button" className="icon-btn sm" aria-label={F.up(path)} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="icon-btn sm" aria-label={F.down(path)} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="icon-btn sm" aria-label={F.copyStep(path)} disabled={countSteps([s]) + countSteps(steps) > 300} onClick={() => onChange([...steps.slice(0, i + 1), structuredClone(s), ...steps.slice(i + 1)])}>⧉</button>
                  <button type="button" className="icon-btn sm" aria-label={F.remove(path)} onClick={() => onChange(steps.filter((_, k) => k !== i))}>×</button>
                </>}
              </div>
              <fieldset className="step-body" disabled={readOnly}>
                <StepFields d={d} s={s} onChange={x => set(i, x)} />
              </fieldset>
              {issue && !readOnly && <p className="err">{F.issue[issue]}</p>}
              {s.type === 'if' && <>
                <Sub label={F.then}><StepList d={d} steps={s.then} prefix={`${path}.`} depth={depth + 1} readOnly={readOnly} onChange={then => set(i, { ...s, then })} /></Sub>
                <Sub label={F.else}><StepList d={d} steps={s.else} prefix={`${path}.`} depth={depth + 1} readOnly={readOnly} onChange={x => set(i, { ...s, else: x })} /></Sub>
              </>}
              {s.type === 'loop' && <Sub label={F.each}><StepList d={d} steps={s.steps} prefix={`${path}.`} depth={depth + 1} readOnly={readOnly} onChange={x => set(i, { ...s, steps: x })} /></Sub>}
            </li>
          );
        })}
      </ol>
      {!readOnly && <AddStep d={d} depth={depth} onAdd={t => onChange([...steps, fresh(t)])} />}
    </div>
  );
}

// "Add step": a menu of the step types by kind, each with what it does. Steps nest four levels deep at most.
function AddStep({ d, depth, onAdd }: { d: Dict; depth: number; onAdd(t: StepType): void }){
  const F = d.flows;
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="add-step" ref={ref}>
      <button type="button" className="btn btn-xs btn-secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon name="plus" />{F.add}</button>
      {open && (
        <div className="menu step-menu" role="menu" aria-label={F.add}>
          {STEP_GROUPS.map(([g, types]) => {
            const shown = types.filter(t => depth < 4 || (t !== 'if' && t !== 'loop'));
            return shown.length > 0 && (
              <div key={g} role="group" aria-label={F.groups[g]}>
                <p className="menu-t">{F.groups[g]}</p>
                {shown.map(t => (
                  <button key={t} type="button" role="menuitem" className="menu-item step-item" aria-label={F.types[t]} onClick={() => { setOpen(false); onAdd(t); }}>
                    <StepIcon t={t} /><span><b>{F.types[t]}</b><small>{F.about[t]}</small></span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const Sub = ({ label, children }: { label: string; children: ReactNode }) => <div className="sub-steps"><p className="sec-t">{label}</p>{children}</div>;

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
    <aside className="trial" aria-label={F.title}>
      <h2 className="sec-t">{F.title}</h2>
      <p className="hint">{F.lead}</p>
      <SelectField label={F.profile} value={profile?.id ?? ''} onChange={setProfileId} disabled={!!token || !profiles.length} placeholder={F.noProfiles} searchPh={d.form.searchPh}
        options={profiles.map(p => ({ value: p.id, label: p.name, hint: `#${String(p.number).padStart(4, '0')}` }))} />
      <Field label={F.vars}><textarea className="mono-in" rows={2} value={varsText} placeholder="email=me@example.com" spellCheck={false} onChange={e => setVarsText(e.target.value)} /></Field>
      {token
        ? <button type="button" className="btn btn-secondary" onClick={() => void folio.stopFlow(token)}><span className="spin" aria-hidden="true" />{F.stop}</button>
        : <button type="button" className="btn btn-primary" disabled={!profile || !steps.length || disabled} onClick={() => void start()}>{F.run}</button>}
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
          {data.length > 0 && <dl className="fpgrid">{data.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
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
