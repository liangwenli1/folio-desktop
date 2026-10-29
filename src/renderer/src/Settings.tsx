// Platform settings (design v2 23, 38; named so by the user, 10-29): a menu card on the left, the chosen part in a card
// on the right with its own Save. The workspace's parts (its basics, what new profiles start with, how opening
// behaves, the plan reminder) are changed by whoever manages members and read by everyone else; the notifications are
// each person's own, and follow their account. The plan and Data (exporting or importing the whole workspace) are for
// managers. This computer's part (light or dark, opening at startup, the version) takes effect at once. Changes stay
// while moving between parts and are saved together; leaving with some unsaved asks first.
import { useEffect, useState } from 'react';
import type { Theme } from '@shared/bridge';
import { folio, type Me, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { type Dict } from './i18n';
import { Avatar, CopyBtn, Icon, Switch, useFail, useLeave, useMedia, useToast } from './ui';
import { SelectField, groupOpts, type Opt } from './Select';

type Settings = Workspace['settings'];
type Notify = Me['user']['notify'];
type Part = 'workspace' | 'defaults' | 'opening' | 'notices' | 'data' | 'local';
const KINDS = [['chromium', 'Chromium'], ['firefox', 'Firefox']] as const;

export function SettingsPage({ d, ws, me, data, manager, version, onSaved, onExport, onImport, onBilling }: {
  d: Dict; ws: Workspace; me: Me; data: WorkspaceData; manager: boolean; version: string; onSaved(): Promise<void>; onExport(): void; onImport(): void; onBilling(): void;
}){
  const S = d.settings;
  const toast = useToast(), fail = useFail();
  const [part, setPart] = useState<Part>('workspace');
  // What the server holds (Cancel goes back to it), and what is being edited.
  const [saved, setSaved] = useState({ name: ws.name, set: ws.settings, notify: me.user.notify });
  const [name, setName] = useState(ws.name);
  const [set, setSet] = useState<Settings>(ws.settings);
  const [notify, setNotify] = useState<Notify>(me.user.notify);
  const [busy, setBusy] = useState(false);
  const wsDirty = name !== saved.name || JSON.stringify(set) !== JSON.stringify(saved.set);
  const meDirty = JSON.stringify(notify) !== JSON.stringify(saved.notify);
  useLeave(wsDirty || meDirty);
  const owner = data.members.find(m => m.role.key === 'owner');
  const change = <K extends keyof Settings>(k: K, v: Settings[K]) => setSet(s => ({ ...s, [k]: v }));
  // The plan is a page of its own; its entry opens it.
  const parts: (Part | 'billing')[] = [...(manager ? ['workspace', 'defaults', 'opening', 'notices', 'billing', 'data'] as const : ['workspace', 'defaults', 'opening', 'notices'] as const), 'local'];

  // The default engine in one dropdown: none (the recommended one), an engine at its recommended version, or a version.
  const engine = set.defaultKernel ? `${set.defaultKernel}:${set.defaultKernelVersion ?? ''}` : '';
  const engines: Opt[] = [{ value: '', label: S.engineAuto }, ...KINDS.flatMap(([kind, label]) => [
    { value: `${kind}:`, label: `${label} · ${S.engineNone}`, group: label },
    ...[...new Set(data.kernels.filter(k => k.kind === kind).map(k => k.version))].map(v => ({ value: `${kind}:${v}`, label: `${label} ${v}`, group: label }))
  ])];
  const onOff: Opt[] = [{ value: 'on', label: S.on }, { value: 'off', label: S.off }];

  async function save(){
    setBusy(true);
    try {
      if (wsDirty){
        const body = { name: name.trim() || saved.name, settings: set };
        await folio.api('PATCH', `/workspaces/${ws.id}`, body);
        setName(body.name);
      }
      if (meDirty){ await folio.api('PATCH', '/me', { notify }); await onSaved(); }
      setSaved({ name: name.trim() || saved.name, set, notify });
      toast({ title: S.saved });
    } catch (e){ fail(e); } finally { setBusy(false); }
  }
  const revert = () => { setName(saved.name); setSet(saved.set); setNotify(saved.notify); };
  const ro = !manager;
  const actions = (
    <div className="duo-act">
      {(wsDirty || meDirty) && <span className="pf-dirty"><span className="d warn" aria-hidden="true" /><b>{d.form.unsaved}</b></span>}
      <span className="sp" />
      <button type="button" className="btn btn-secondary" disabled={!(wsDirty || meDirty) || busy} onClick={revert}>{d.common.cancel}</button>
      <button type="button" className="btn btn-primary" disabled={!(wsDirty || meDirty) || busy} aria-busy={busy || undefined} onClick={() => void save()}>{S.save}</button>
    </div>
  );

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{S.title}</h1></div>
        </header>
        <div className="duo">
          <nav className="sec duo-nav" aria-label={S.title}>
            {parts.map(x => x === 'billing'
              ? <button key={x} type="button" className="duo-i" onClick={onBilling}>{S.tabs.billing}</button>
              : <button key={x} type="button" className={`duo-i${part === x ? ' on' : ''}`} aria-current={part === x ? 'true' : undefined} onClick={() => setPart(x)}>{S.tabs[x]}</button>)}
          </nav>

          {part === 'workspace' && (
            <section className="sec duo-body" aria-label={S.tabs.workspace}>
              {ro && <p className="notice"><Icon name="lock" /><span>{S.readOnly}</span></p>}
              <div className="field">
                <label htmlFor="set-name">{S.name}</label>
                <span className="count-in">
                  <input id="set-name" value={name} maxLength={80} disabled={ro} onChange={e => setName(e.target.value)} />
                  <small aria-hidden="true">{name.length}/80</small>
                </span>
              </div>
              <div className="field">
                <label htmlFor="set-id">{S.id}</label>
                <span className="copy-in"><input id="set-id" className="mono-in" value={ws.id} readOnly /><CopyBtn text={ws.id} label={d.common.copy} done={S.idCopied} /></span>
                <span className="hint">{S.idHint}</span>
              </div>
              <div className="field">
                <span className="label">{S.owner}</span>
                <span className="set-owner">{owner && <Avatar text={owner.email} />}<b>{owner?.email ?? '—'}</b></span>
                <span className="hint">{S.ownerHint}</span>
              </div>
              <SelectField label={S.trashDays} value={String(set.trashDays)} disabled={ro} hint={S.trashDaysHint}
                onChange={v => change('trashDays', Number(v) as Settings['trashDays'])} options={['7', '15', '30', '60', '90'].map(n => ({ value: n, label: d.trash.days(Number(n)) }))} />
              {!ro && actions}
            </section>
          )}

          {part === 'defaults' && (
            <section className="sec duo-body" aria-label={S.tabs.defaults}>
              {ro && <p className="notice"><Icon name="lock" /><span>{S.readOnly}</span></p>}
              <p className="notice info"><Icon name="info" /><span>{S.defaultsNote}</span></p>
              <SelectField label={S.engine} hint={S.engineHint} value={engine} disabled={ro} search options={engines} loading={!data.loaded.has('kernels')}
                onChange={v => { const [kind, version] = v.split(':'); setSet(s => ({ ...s, defaultKernel: (kind || null) as Settings['defaultKernel'], defaultKernelVersion: version || null })); }} />
              <SelectField label={S.group} hint={S.groupHint} value={set.defaultGroupId ?? ''} disabled={ro} search onChange={v => change('defaultGroupId', v || null)}
                loading={!data.loaded.has('groups')} failed={data.loadFailed.has('groups')} onRetry={() => data.refresh('groups')}
                options={[{ value: '', label: S.groupNone }, ...groupOpts(data.groups)]} />
              <SelectField label={S.proxy} hint={S.proxyHint} value={set.defaultProxyId ?? ''} disabled={ro} search onChange={v => change('defaultProxyId', v || null)}
                loading={!data.loaded.has('proxies')} failed={data.loadFailed.has('proxies')} onRetry={() => data.refresh('proxies')}
                options={[{ value: '', label: S.proxyNone }, ...data.proxies.map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined }))]} />
              {!ro && actions}
            </section>
          )}

          {part === 'opening' && (
            <section className="sec duo-body" aria-label={S.tabs.opening}>
              {ro && <p className="notice"><Icon name="lock" /><span>{S.readOnly}</span></p>}
              <div className="set-row">
                <Switch label={S.openDetail} checked={set.openDetailAfterLaunch} disabled={ro} onChange={v => change('openDetailAfterLaunch', v)} />
                <p className="hint">{S.openDetailHint}</p>
              </div>
              <div className="set-row">
                <Switch label={S.stopOnClose} checked={set.stopOnWindowClose} disabled={ro} onChange={v => change('stopOnWindowClose', v)} />
                <p className="hint">{S.stopOnCloseHint}</p>
              </div>
              {!ro && actions}
            </section>
          )}

          {part === 'notices' && (
            <section className="sec duo-body" aria-label={S.tabs.notices}>
              {(Object.keys(S.notifyItems) as (keyof Notify)[]).map(k => (
                <SelectField key={k} label={S.notifyItems[k]} value={notify[k] ? 'on' : 'off'} options={onOff} onChange={v => setNotify(n => ({ ...n, [k]: v === 'on' }))} />
              ))}
              {manager && <>
                <h4>{S.workspaceNotices}</h4>
                <SelectField label={S.expiry} value={set.expiryReminder ? 'on' : 'off'} options={onOff} hint={d.billing.expiryHint} onChange={v => change('expiryReminder', v === 'on')} />
              </>}
              {actions}
            </section>
          )}

          {part === 'data' && (
            <section className="sec duo-body" aria-label={S.tabs.data}>
              <div className="duo-btns">
                <button type="button" className="btn btn-secondary" onClick={onExport}><Icon name="upload" />{d.user.exportAll}</button>
                <button type="button" className="btn btn-secondary" onClick={onImport}><Icon name="download" />{d.user.importAll}</button>
              </div>
            </section>
          )}

          {part === 'local' && <LocalPart d={d} version={version} />}
        </div>
      </main>
    </div>
  );
}

// This computer's own, each taking effect at once with nothing to save: light, dark or the system's (the button at the
// top right switches between light and dark), opening Folio when the computer starts (Windows and macOS), the version.
function LocalPart({ d, version }: { d: Dict; version: string }){
  const S = d.settings;
  const [theme, setTheme] = useState<Theme | null>(null);
  // Read again whenever the theme in use changes, the top right's button included.
  const dark = useMedia('(prefers-color-scheme: dark)');
  useEffect(() => { void folio.theme().then(setTheme); }, [dark]);
  const [startup, setStartup] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  useEffect(() => { void folio.startup().then(setStartup); }, []);
  const pick = (t: Theme) => { setTheme(t); void folio.setTheme(t); };
  return (
    <section className="sec duo-body" aria-label={S.tabs.local}>
      <div className="field">
        <span className="label" id="set-theme">{S.theme}</span>
        <div className="seg" role="group" aria-labelledby="set-theme">
          {(['system', 'light', 'dark'] as const).map(t => <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>{S.themes[t]}</button>)}
        </div>
      </div>
      {startup?.supported && (
        <div className="set-row">
          <Switch label={d.user.startup} checked={startup.enabled} onChange={on => { setStartup({ ...startup, enabled: on }); void folio.setStartup(on); }} />
          <p className="hint">{d.user.startupHint}</p>
        </div>
      )}
      <div className="field">
        <span className="label">{S.version}</span>
        <span>{d.account.version(version)}</span>
      </div>
    </section>
  );
}
