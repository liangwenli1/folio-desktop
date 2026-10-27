// Settings (design v2 23, 38): a menu card on the left, the chosen part in a card on the right with its own Save. The
// workspace's parts (its basics, what new profiles start with, how opening behaves, the plan reminder) are changed by
// whoever manages members and read by everyone else; the notifications are each person's own, and follow their
// account. Data (exporting or importing the whole workspace) and the plan are for managers. Changes stay while moving
// between parts and are saved together; leaving with some unsaved asks first.
import { useState } from 'react';
import { folio, isApiError, type Me, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Avatar, CopyBtn, Icon, Switch, useLeave, useToast } from './ui';
import { SelectField, type Opt } from './Select';

type Settings = Workspace['settings'];
type Notify = Me['user']['notify'];
type Part = 'workspace' | 'defaults' | 'opening' | 'notices' | 'data';
const KINDS = [['chromium', 'Chromium'], ['firefox', 'Firefox']] as const;

export function SettingsPage({ d, ws, me, data, manager, onSaved, onExport, onImport, onBilling }: {
  d: Dict; ws: Workspace; me: Me; data: WorkspaceData; manager: boolean; onSaved(): Promise<void>; onExport(): void; onImport(): void; onBilling(): void;
}){
  const S = d.settings;
  const toast = useToast();
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
  const parts: Part[] = manager ? ['workspace', 'defaults', 'opening', 'notices', 'data'] : ['workspace', 'defaults', 'opening', 'notices'];

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
      toast(S.saved);
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); } finally { setBusy(false); }
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
            {parts.map(x => (
              <button key={x} type="button" className={`duo-i${part === x ? ' on' : ''}`} aria-current={part === x ? 'true' : undefined} onClick={() => setPart(x)}>{S.tabs[x]}</button>
            ))}
            {manager && <button type="button" className="duo-i" onClick={onBilling}>{S.tabs.billing}</button>}
          </nav>

          {part === 'workspace' && (
            <section className="sec duo-body" aria-labelledby="set-h">
              <div><h3 id="set-h">{S.basics}</h3><p className="hint">{S.basicsLead}</p></div>
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
                <span className="set-owner">{owner && <Avatar text={owner.displayName} />}<b>{owner?.displayName ?? '—'}</b>{owner && <small>{owner.email}</small>}</span>
                <span className="hint">{S.ownerHint}</span>
              </div>
              <SelectField label={S.trashDays} value={String(set.trashDays)} disabled={ro} hint={S.trashDaysHint}
                onChange={v => change('trashDays', Number(v) as Settings['trashDays'])} options={['7', '15', '30', '60', '90'].map(n => ({ value: n, label: d.trash.days(Number(n)) }))} />
              {!ro && actions}
            </section>
          )}

          {part === 'defaults' && (
            <section className="sec duo-body" aria-labelledby="set-h">
              <div><h3 id="set-h">{S.defaults}</h3><p className="hint">{S.defaultsLead}</p></div>
              {ro && <p className="notice"><Icon name="lock" /><span>{S.readOnly}</span></p>}
              <p className="notice info"><Icon name="info" /><span>{S.defaultsNote}</span></p>
              <SelectField label={S.engine} hint={S.engineHint} value={engine} disabled={ro} search options={engines} loading={!data.loaded.has('kernels')}
                onChange={v => { const [kind, version] = v.split(':'); setSet(s => ({ ...s, defaultKernel: (kind || null) as Settings['defaultKernel'], defaultKernelVersion: version || null })); }} />
              <SelectField label={S.group} hint={S.groupHint} value={set.defaultGroupId ?? ''} disabled={ro} search onChange={v => change('defaultGroupId', v || null)}
                loading={!data.loaded.has('groups')} failed={data.loadFailed.has('groups')} onRetry={() => data.refresh('groups')}
                options={[{ value: '', label: S.groupNone }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const }))]} />
              <SelectField label={S.proxy} hint={S.proxyHint} value={set.defaultProxyId ?? ''} disabled={ro} search onChange={v => change('defaultProxyId', v || null)}
                loading={!data.loaded.has('proxies')} failed={data.loadFailed.has('proxies')} onRetry={() => data.refresh('proxies')}
                options={[{ value: '', label: S.proxyNone }, ...data.proxies.map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined }))]} />
              {!ro && actions}
            </section>
          )}

          {part === 'opening' && (
            <section className="sec duo-body" aria-labelledby="set-h">
              <div><h3 id="set-h">{S.opening}</h3><p className="hint">{S.openingLead}</p></div>
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
            <section className="sec duo-body" aria-labelledby="set-h">
              <div><h3 id="set-h">{S.notices}</h3><p className="hint">{S.noticesLead}</p></div>
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
            <section className="sec duo-body" aria-labelledby="set-h">
              <div><h3 id="set-h">{S.data}</h3><p className="hint">{S.dataLead}</p></div>
              <div className="duo-btns">
                <button type="button" className="btn btn-secondary" onClick={onExport}><Icon name="upload" />{d.user.exportAll}</button>
                <button type="button" className="btn btn-secondary" onClick={onImport}><Icon name="download" />{d.user.importAll}</button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
