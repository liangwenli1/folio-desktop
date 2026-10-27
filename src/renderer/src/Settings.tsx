// The workspace's own settings (delivery design 23): one page of cards — the workspace, what a new profile starts
// with, how profiles open, notices — with an index beside them that follows the card in view, and Cancel / Save at
// the foot. Changes are saved together; leaving with some unsaved asks first. The defaults only reach profiles made
// from now on. Only whoever manages members can change anything here.
import { useRef, useState } from 'react';
import { folio, isApiError, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Avatar, CopyBtn, Icon, Switch, useLeave, useToast } from './ui';
import { SelectField, type Opt } from './Select';

type Settings = Workspace['settings'];
const SECTIONS = ['workspace', 'defaults', 'opening', 'notices'] as const;
type Section = typeof SECTIONS[number];
const KINDS = [['chromium', 'Chromium'], ['firefox', 'Firefox']] as const;

export function SettingsPage({ d, ws, data, manager }: { d: Dict; ws: Workspace; data: WorkspaceData; manager: boolean }){
  const S = d.settings;
  const toast = useToast();
  // What the server holds (Cancel goes back to it), and what is being edited.
  const [saved, setSaved] = useState({ name: ws.name, set: ws.settings });
  const [name, setName] = useState(ws.name);
  const [set, setSet] = useState<Settings>(ws.settings);
  const [busy, setBusy] = useState(false);
  const dirty = name !== saved.name || JSON.stringify(set) !== JSON.stringify(saved.set);
  useLeave(dirty);
  const owner = data.members.find(m => m.role.key === 'owner');
  const change = <K extends keyof Settings>(k: K, v: Settings[K]) => setSet(s => ({ ...s, [k]: v }));

  // The default engine in one dropdown: none (the recommended one), an engine at its recommended version, or a version.
  const engine = set.defaultKernel ? `${set.defaultKernel}:${set.defaultKernelVersion ?? ''}` : '';
  const engines: Opt[] = [{ value: '', label: S.engineAuto }, ...KINDS.flatMap(([kind, label]) => [
    { value: `${kind}:`, label: `${label} · ${S.engineNone}`, group: label },
    ...[...new Set(data.kernels.filter(k => k.kind === kind).map(k => k.version))].map(v => ({ value: `${kind}:${v}`, label: `${label} ${v}`, group: label }))
  ])];

  // The index follows the card in view; a click on it scrolls there (and the index stays on it while it does).
  const main = useRef<HTMLElement>(null);
  const [at, setAt] = useState<Section>('workspace');
  const clickedAt = useRef(0);
  function follow(){
    const box = main.current;
    if (!box || Date.now() - clickedAt.current < 700) return;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4){ setAt('notices'); return; }
    setAt(SECTIONS.filter(x => (document.getElementById(`set-${x}`)?.offsetTop ?? 0) <= box.scrollTop + 120).at(-1) ?? 'workspace');
  }
  function goTo(x: Section){
    clickedAt.current = Date.now();
    setAt(x);
    document.getElementById(`set-${x}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  async function save(){
    setBusy(true);
    try {
      const body = { name: name.trim() || saved.name, settings: set };
      await folio.api('PATCH', `/workspaces/${ws.id}`, body);
      setName(body.name);
      setSaved({ name: body.name, set });
      toast(S.saved);
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); } finally { setBusy(false); }
  }
  const revert = () => { setName(saved.name); setSet(saved.set); };

  return (
    <div className="page">
      <main className="main set-page" ref={main} onScroll={follow}>
        <header className="bar">
          <div className="ttl"><h1>{S.title}</h1><p className="sub">{S.lead}</p></div>
        </header>
        {!manager && <p className="notice info page-note set-ro"><Icon name="lock" />{S.readOnly}</p>}

        <div className="setup">
          <nav className="setup-nav" aria-label={S.title}>
            {SECTIONS.map(x => (
              <button key={x} type="button" className={`nav-i${at === x ? ' active' : ''}`} aria-current={at === x ? 'true' : undefined} onClick={() => goTo(x)}>
                <span className="nav-l">{S.tabs[x]}</span>
              </button>
            ))}
          </nav>

          <div className="setup-body">
            <section className="sec" id="set-workspace" aria-labelledby="set-workspace-h">
              <div><h3 id="set-workspace-h">{S.basics}</h3><p className="hint">{S.basicsLead}</p></div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="set-name">{S.name}</label>
                  <span className="count-in">
                    <input id="set-name" value={name} maxLength={80} disabled={!manager} onChange={e => setName(e.target.value)} />
                    <small aria-hidden="true">{name.length}/80</small>
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="set-id">{S.id}</label>
                  <span className="copy-in"><input id="set-id" className="mono-in" value={ws.id} readOnly /><CopyBtn text={ws.id} label={d.common.copy} done={S.idCopied} /></span>
                  <span className="hint">{S.idHint}</span>
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <span className="label">{S.owner}</span>
                  <span className="set-owner">{owner && <Avatar text={owner.email} />}<b>{owner?.email ?? '—'}</b></span>
                  <span className="hint">{S.ownerHint}</span>
                </div>
                <SelectField label={S.trashDays} value={String(set.trashDays)} disabled={!manager} hint={S.trashDaysHint}
                  onChange={v => change('trashDays', Number(v) as Settings['trashDays'])} options={['7', '15', '30', '60', '90'].map(n => ({ value: n, label: d.trash.days(Number(n)) }))} />
              </div>
            </section>

            <section className="sec" id="set-defaults" aria-labelledby="set-defaults-h">
              <div className="set-h">
                <div><h3 id="set-defaults-h">{S.defaults}</h3><p className="hint">{S.defaultsLead}</p></div>
                <p className="set-note"><Icon name="alert" />{S.defaultsNote}</p>
              </div>
              <div className="row3">
                <SelectField label={S.engine} hint={S.engineHint} value={engine} disabled={!manager} search options={engines} loading={!data.loaded.has('kernels')}
                  onChange={v => { const [kind, version] = v.split(':'); setSet(s => ({ ...s, defaultKernel: (kind || null) as Settings['defaultKernel'], defaultKernelVersion: version || null })); }} />
                <SelectField label={S.group} hint={S.groupHint} value={set.defaultGroupId ?? ''} disabled={!manager} search onChange={v => change('defaultGroupId', v || null)}
                  loading={!data.loaded.has('groups')} failed={data.loadFailed.has('groups')} onRetry={() => data.refresh('groups')}
                  options={[{ value: '', label: S.groupNone }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const }))]} />
                <SelectField label={S.proxy} hint={S.proxyHint} value={set.defaultProxyId ?? ''} disabled={!manager} search onChange={v => change('defaultProxyId', v || null)}
                  loading={!data.loaded.has('proxies')} failed={data.loadFailed.has('proxies')} onRetry={() => data.refresh('proxies')}
                  options={[{ value: '', label: S.proxyNone }, ...data.proxies.map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined }))]} />
              </div>
            </section>

            <section className="sec" id="set-opening" aria-labelledby="set-opening-h">
              <div><h3 id="set-opening-h">{S.opening}</h3><p className="hint">{S.openingLead}</p></div>
              <div className="row2">
                <div className="set-row">
                  <Switch label={S.openDetail} checked={set.openDetailAfterLaunch} disabled={!manager} onChange={v => change('openDetailAfterLaunch', v)} />
                  <p className="hint">{S.openDetailHint}</p>
                </div>
                <div className="set-row">
                  <Switch label={S.stopOnClose} checked={set.stopOnWindowClose} disabled={!manager} onChange={v => change('stopOnWindowClose', v)} />
                  <p className="hint">{S.stopOnCloseHint}</p>
                </div>
              </div>
            </section>

            <section className="sec" id="set-notices" aria-labelledby="set-notices-h">
              <div><h3 id="set-notices-h">{S.notices}</h3><p className="hint">{S.noticesLead}</p></div>
              <div className="set-row">
                <Switch label={S.expiry} checked={set.expiryReminder} disabled={!manager} onChange={v => change('expiryReminder', v)} />
                <p className="hint">{d.billing.expiryHint}</p>
              </div>
            </section>
          </div>
        </div>

        {manager && (
          <footer className="set-foot">
            {dirty && <span className="pf-dirty"><span className="d warn" aria-hidden="true" /><b>{d.form.unsaved}</b></span>}
            <span className="sp" />
            <button type="button" className="btn btn-secondary" disabled={!dirty || busy} onClick={revert}>{d.common.cancel}</button>
            <button type="button" className="btn btn-primary" disabled={!dirty || busy} aria-busy={busy || undefined} onClick={() => void save()}>{S.save}</button>
          </footer>
        )}
      </main>
    </div>
  );
}
