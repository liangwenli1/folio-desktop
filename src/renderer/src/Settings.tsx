// The workspace's own settings: what it is called, what a new profile starts with, and what happens when one
// is opened. The defaults only reach profiles made from now on.
import { useState } from 'react';
import { folio, isApiError, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Switch, useToast } from './ui';
import { SelectField } from './Select';

type Settings = Workspace['settings'];
type Section = 'workspace' | 'defaults' | 'opening' | 'notices';

export function SettingsPage({ d, ws, data, manager }: { d: Dict; ws: Workspace; data: WorkspaceData; manager: boolean }){
  const S = d.settings;
  const toast = useToast();
  const [section, setSection] = useState<Section>('workspace');
  const [name, setName] = useState(ws.name);
  const [set, setSet] = useState<Settings>(ws.settings);
  const [busy, setBusy] = useState(false);
  const owner = data.members.find(m => m.role.key === 'owner');
  const engines = [...new Set(data.kernels.filter(k => k.kind === set.defaultKernel).map(k => k.version))];
  const change = <K extends keyof Settings>(k: K, v: Settings[K]) => setSet(s => ({ ...s, [k]: v }));

  async function save(){
    setBusy(true);
    try {
      await folio.api('PATCH', `/workspaces/${ws.id}`, { name: name.trim() || ws.name, settings: set });
      toast(S.saved);
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{S.title}</h1><p className="sub">{S.lead}</p></div>
          <span className="sp" />
          {manager && <button className="btn btn-primary" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>{S.save}</button>}
        </header>

        <div className="setup">
          <nav className="setup-nav" aria-label={S.title}>
            {(['workspace', 'defaults', 'opening', 'notices'] as const).map(x => (
              <button key={x} type="button" className={`nav-i${section === x ? ' active' : ''}`} aria-current={section === x ? 'true' : undefined} onClick={() => setSection(x)}>
                <span className="nav-l">{S.tabs[x]}</span>
              </button>
            ))}
          </nav>

          <div className="setup-body">
            {section === 'workspace' && (
              <section className="sec" aria-label={S.basics}>
                <h3>{S.basics}</h3>
                <p className="hint">{S.basicsLead}</p>
                <div className="row2">
                  <label className="field"><span>{S.name}</span>
                    <input value={name} maxLength={80} disabled={!manager} onChange={e => setName(e.target.value)} />
                  </label>
                  <label className="field"><span>{S.id}</span>
                    <input className="mono-in" value={ws.id} readOnly />
                    <span className="hint">{S.idHint}</span>
                  </label>
                </div>
                <div className="field"><span>{S.owner}</span>
                  <p className="kv-plain">{owner?.email ?? '—'}</p>
                  <span className="hint">{S.ownerHint}</span>
                </div>
                <SelectField label={S.trashDays} value={String(set.trashDays)} disabled={!manager} hint={S.trashDaysHint}
                  onChange={v => change('trashDays', Number(v) as Settings['trashDays'])} options={['7', '15', '30', '60', '90'].map(n => ({ value: n, label: d.trash.days(Number(n)) }))} />
              </section>
            )}

            {section === 'defaults' && (
              <section className="sec" aria-label={S.defaults}>
                <h3>{S.defaults}</h3>
                <p className="hint">{S.defaultsLead}</p>
                <p className="notice warn">{S.defaultsNote}</p>
                <div className="row2">
                  <SelectField label={S.engine} value={set.defaultKernel ?? ''} disabled={!manager}
                    onChange={v => setSet(s => ({ ...s, defaultKernel: (v || null) as Settings['defaultKernel'], defaultKernelVersion: null }))}
                    options={[{ value: '', label: S.engineNone }, { value: 'chromium', label: 'Chromium' }, { value: 'firefox', label: 'Firefox' }]} />
                  <SelectField label={S.version} value={set.defaultKernelVersion ?? ''} disabled={!manager || !set.defaultKernel}
                    onChange={v => change('defaultKernelVersion', v || null)}
                    options={[{ value: '', label: S.engineNone }, ...engines.map(v => ({ value: v, label: v }))]} />
                </div>
                <div className="row2">
                  <SelectField label={S.group} value={set.defaultGroupId ?? ''} disabled={!manager} onChange={v => change('defaultGroupId', v || null)}
                    options={[{ value: '', label: S.groupNone }, ...data.groups.map(g => ({ value: g.id, label: g.name }))]} />
                  <SelectField label={S.proxy} value={set.defaultProxyId ?? ''} disabled={!manager} onChange={v => change('defaultProxyId', v || null)}
                    options={[{ value: '', label: S.proxyNone }, ...data.proxies.map(p => ({ value: p.id, label: p.name }))]} />
                </div>
              </section>
            )}

            {section === 'opening' && <>
              <section className="sec" aria-label={S.opening}>
                <h3>{S.opening}</h3>
                <p className="hint">{S.openingLead}</p>
                <div className="set-row">
                  <Switch label={S.openDetail} checked={set.openDetailAfterLaunch} disabled={!manager} onChange={v => change('openDetailAfterLaunch', v)} />
                  <p className="hint">{S.openDetailHint}</p>
                </div>
                <div className="set-row">
                  <Switch label={S.stopOnClose} checked={set.stopOnWindowClose} disabled={!manager} onChange={v => change('stopOnWindowClose', v)} />
                  <p className="hint">{S.stopOnCloseHint}</p>
                </div>
              </section>
            </>}

            {section === 'notices' && (
              <section className="sec" aria-label={S.notices}>
                <h3>{S.notices}</h3>
                <p className="hint">{S.noticesLead}</p>
                <div className="set-row">
                  <Switch label={S.expiry} checked={set.expiryReminder} disabled={!manager} onChange={v => change('expiryReminder', v)} />
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
