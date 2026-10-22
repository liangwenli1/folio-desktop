// Automation flows: the team's list, and an editor where steps are added, filled in, moved and nested, with a
// trial run on one profile beside it.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FlowEvent, FlowLog, FlowResult, Step } from '@shared/bridge';
import { folio, isApiError, type Flow, type Profile } from './api';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict } from './i18n';
import { useToast } from './ui';

type StepType = Step['type'];
type Test = Extract<Step, { type: 'if' }>['test'];
export const STEP_TYPES: StepType[] = ['open', 'click', 'type', 'press', 'wait', 'scroll', 'extract', 'set', 'if', 'loop', 'screenshot', 'script'];
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
  }
};

type Issue = 'url' | 'selector' | 'key' | 'variable' | 'pixels' | 'times' | 'code' | 'attribute';
function issueOf(s: Step): Issue | null {
  const blank = (v: string | null) => !v?.trim();
  switch (s.type){
    case 'open': return blank(s.url) ? 'url' : null;
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
  const [open, setOpen] = useState<{ id: string | null } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const email = new Map(data.members.map(m => [m.userId, m.email]));
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'));

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
    return <FlowEditor key={open.id ?? 'new'} d={d} wsId={wsId} data={data} flow={flow} onClose={() => setOpen(null)} onCreated={id => setOpen({ id })} onDuplicate={duplicate} />;
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{F.title}</h1><p className="sub">{F.sub(data.flows.length)}</p></div>
          <span className="sp" />
          <button className="btn btn-stamp" type="button" onClick={() => setOpen({ id: null })}>{F.new}</button>
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
                      <span className="hint">{F.confirmDelete(f.name)}</span>
                      <button type="button" className="btn btn-xs btn-ghost" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
                      <button type="button" className="btn btn-xs btn-stamp" onClick={() => void remove(f)}>{F.delete}</button>
                    </> : <>
                      <button type="button" className="btn btn-xs btn-line" onClick={() => setOpen({ id: f.id })}>{f.canEdit ? d.common.edit : F.view}</button>
                      <button type="button" className="btn btn-xs btn-ghost" onClick={() => void duplicate(f)}>{F.duplicate}</button>
                      {f.canEdit && <button type="button" className="btn btn-xs btn-ghost" aria-label={F.deleteX(f.name)} onClick={() => setConfirm(f.id)}>{F.delete}</button>}
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

function FlowEditor({ d, wsId, data, flow, onClose, onCreated, onDuplicate }: {
  d: Dict; wsId: string; data: WorkspaceData; flow: Flow | null; onClose(): void; onCreated(id: string): void; onDuplicate(f: Flow): void;
}){
  const F = d.flows;
  const toast = useToast();
  const readOnly = !!flow && !flow.canEdit;
  const [base, setBase] = useState(flow);
  const [edit, setEdit] = useState({ name: flow?.name ?? F.untitled, steps: flow?.steps ?? [] });
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (dirty && !readOnly ? setLeaving(true) : onClose())}>{F.back}</button>
          <label className="flow-name">
            <span className="sr">{F.name}</span>
            <input value={edit.name} maxLength={80} readOnly={readOnly} aria-label={F.name} aria-invalid={!edit.name.trim()} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} />
          </label>
          <span className="sp" />
          {readOnly
            ? <button type="button" className="btn btn-line" onClick={() => flow && onDuplicate(flow)}>{F.duplicateToEdit}</button>
            : <button type="button" className="btn btn-stamp" disabled={!dirty || !!issues || !edit.name.trim() || saving} onClick={() => void save()}>{saving ? F.saving : F.save}</button>}
        </header>
        {leaving && (
          <div className="away-note flow-note" role="alertdialog" aria-label={F.leave}>
            <span>{F.leave}</span>
            <div className="d-actions"><button type="button" className="btn btn-xs btn-ghost" onClick={() => setLeaving(false)}>{F.keepEditing}</button>
              <button type="button" className="btn btn-xs btn-stamp" onClick={onClose}>{F.discard}</button></div>
          </div>
        )}
        {readOnly && <p className="hint flow-note">{F.readOnly}</p>}
        {stale && <p className="notice error flow-note" role="alert">{F.stale}</p>}
        {!readOnly && issues > 0 && <p className="hint flow-note">{F.issues(issues)}</p>}
        <div className="flow-edit">
          <section className="flow-steps" aria-label={F.steps}>
            <StepList d={d} steps={edit.steps} prefix="" depth={1} readOnly={readOnly} onChange={steps => setEdit(x => ({ ...x, steps }))} />
            {!edit.steps.length && <p className="hint">{F.noSteps}</p>}
          </section>
          <Trial d={d} profiles={data.profiles ?? []} steps={edit.steps} disabled={!!issues} />
        </div>
      </main>
    </div>
  );
}

function StepList({ d, steps, prefix, depth, readOnly, onChange }: { d: Dict; steps: Step[]; prefix: string; depth: number; readOnly: boolean; onChange(s: Step[]): void }){
  const F = d.flows;
  const [adding, setAdding] = useState(false);
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
                <span className="step-n mono">{path}</span><b>{F.types[s.type]}</b>
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
      {!readOnly && (adding ? (
        <div className="add-step" role="group" aria-label={F.add}>
          {STEP_TYPES.filter(t => depth < 4 || (t !== 'if' && t !== 'loop')).map(t => (
            <button key={t} type="button" className="btn btn-xs btn-line" onClick={() => { onChange([...steps, fresh(t)]); setAdding(false); }}>{F.types[t]}</button>
          ))}
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setAdding(false)}>{d.common.cancel}</button>
        </div>
      ) : <button type="button" className="btn btn-xs btn-ghost add-btn" onClick={() => setAdding(true)}>{F.add}</button>)}
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
        <Field label={F.test}>
          <select value={t.kind} onChange={e => {
            const kind = e.target.value as Test['kind'];
            setTest(kind === 'equals' ? { kind, variable: 'name', value: '' } : kind === 'contains' ? { kind, selector: 'selector' in t ? t.selector : '', text: '' } : { kind, selector: 'selector' in t ? t.selector : '' });
          }}>
            <option value="exists">{F.exists}</option><option value="contains">{F.contains}</option><option value="equals">{F.equals}</option>
          </select>
        </Field>
        {t.kind === 'equals' ? <>
          {variable(t.variable, v => setTest({ ...t, variable: v }))}
          <Field label={F.value}><input value={t.value} onChange={e => setTest({ ...t, value: e.target.value })} /></Field>
        </> : <>
          {sel(t.selector, v => setTest({ ...t, selector: v }), t.kind === 'exists')}
          {t.kind === 'contains' && <Field label={F.text}><input value={t.text} onChange={e => setTest({ ...t, text: e.target.value })} /></Field>}
        </>}
      </>;
    }
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
      <Field label={F.profile}>
        <select value={profile?.id ?? ''} onChange={e => setProfileId(e.target.value)} disabled={!!token}>
          {!profiles.length && <option value="">{F.noProfiles}</option>}
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} · #{String(p.number).padStart(4, '0')}</option>)}
        </select>
      </Field>
      <Field label={F.vars}><textarea className="mono-in" rows={2} value={varsText} placeholder="email=me@example.com" spellCheck={false} onChange={e => setVarsText(e.target.value)} /></Field>
      {token
        ? <button type="button" className="btn btn-line" onClick={() => void folio.stopFlow(token)}><span className="spin" aria-hidden="true" />{F.stop}</button>
        : <button type="button" className="btn btn-stamp" disabled={!profile || !steps.length || disabled} onClick={() => void start()}>{F.run}</button>}
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
          <p className={result.ok ? 'ok' : 'err'}>{result.ok ? F.ok : result.launchError ? F.notOpened(d.launch[result.launchError] ?? d.launch.launch_failed) : F.failed(flowError(d, result.error!))}</p>
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
  const text = E[e.code as Exclude<keyof typeof E, 'variable'>] ?? E.failed;
  return e.message && e.code !== 'stopped' && e.code !== 'no_item' ? `${text} (${e.message})` : text;
}
