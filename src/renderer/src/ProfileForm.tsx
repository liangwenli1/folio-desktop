// New profile and edit profile. A new profile gets its fingerprint from the main process for the chosen
// engine and system; an edit keeps it unless the user regenerates it.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { CheckResult, Fingerprint, KernelKind, Os } from '@shared/bridge';
import { SEARCH_IDS, type SearchEngine } from '@shared/search';
import { folio, isApiError, type Profile, type ProxyImport } from './api';
import { ENGINES, fingerprintFacts, proxyState } from './checks';
import { kernelKey, type WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Icon, Modal, Switch, bytes, percent, type IconName } from './ui';
import { EngineLogo, Flag, SEARCH_LOGOS } from './Flag';
import { Select, SelectField, type Opt } from './Select';

interface Props { d: Dict; wsId: string; data: WorkspaceData; profile?: Profile; defaultGroup: string | null; onClose(): void; onDone(p: Profile): void }

const NEW_GROUP = '__new', PASTE = '__paste';
const ZONES = Intl.supportedValuesOf('timeZone');
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

type PxNote = { state: 'checking' | 'ok' | 'down' | 'bad' | 'added'; text: string } | null;
type FpState = { state: 'loading' } | { state: 'ready'; fingerprint: Fingerprint; kernelVersion: string } | { state: 'need-firefox'; version: string } | { state: 'error' };

export function ProfileForm({ d, wsId, data, profile, defaultGroup, onClose, onDone }: Props){
  // The version this edit is based on. Live updates do not move it, so a save over someone else's change is
  // refused once; after that it builds on their version and replaces it.
  const [base, setBase] = useState(profile);
  const f = d.form, edit = !!profile;
  const [name, setName] = useState(profile?.name ?? f.defaultName((data.profiles?.length ?? 0) + 1));
  const [groupId, setGroupId] = useState(profile ? profile.groupId ?? '' : defaultGroup ?? '');
  const [newGroup, setNewGroup] = useState('');
  const [kernel, setKernel] = useState<KernelKind>(profile?.kernel ?? 'chromium');
  const [os, setOs] = useState<Os>(profile?.os ?? 'windows');
  const [proxyId, setProxyId] = useState(profile?.proxyId ?? '');
  // Owners and admins choose who it is assigned to (new profiles default to whoever creates them) and its department.
  const manager = data.role !== 'member';
  const [ownerId, setOwnerId] = useState(profile ? profile.ownerId ?? '' : '');
  const [departmentId, setDepartmentId] = useState(profile?.departmentId ?? '');
  const [paste, setPaste] = useState('');
  const [pxNote, setPxNote] = useState<PxNote>(null);
  const [tags, setTags] = useState(profile?.tags.join(', ') ?? '');
  // '' follows the proxy.
  const [tz, setTz] = useState(profile?.timezoneOverride ?? '');
  const [lang, setLang] = useState(profile?.localeOverride ?? '');
  const [langMode, setLangMode] = useState(profile?.localeOverride ? 'custom' : 'follow');
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [syncMode, setSyncMode] = useState(profile?.syncMode ?? 'cloud');
  const [extensionIds, setExtensionIds] = useState<string[]>(profile?.extensionIds ?? []);
  const [searchEngine, setSearchEngine] = useState<SearchEngine>(profile?.searchEngine ?? 'none');
  const [restoreTabs, setRestoreTabs] = useState(profile?.restoreTabs ?? true);
  const [kernelVersion, setKernelVersion] = useState(profile?.kernelVersion ?? '');
  const [fp, setFp] = useState<FpState>(profile ? { state: 'ready', fingerprint: profile.fingerprint, kernelVersion: profile.kernelVersion } : { state: 'loading' });
  const [regenerated, setRegenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  // The engine's versions for this computer. A new profile gets the recommended one unless another is picked.
  const versions = data.kernels.filter(k => k.kind === kernel && k.available);
  const target = edit ? kernelVersion : kernelVersion || (versions.find(k => k.recommended) ?? versions[0])?.version || '';
  const chosen = data.kernels.find(k => k.kind === kernel && k.version === target);
  const ffProgress = kernel === 'firefox' ? data.progress[kernelKey('firefox', target)] : undefined;

  const generate = useCallback(async () => {
    if (!chosen) return;
    if (kernel === 'firefox' && !chosen.installed){ setFp({ state: 'need-firefox', version: chosen.version }); return; }
    setFp({ state: 'loading' });
    try { setFp({ state: 'ready', ...await folio.newFingerprint(kernel, os, chosen.version) }); } catch { setFp({ state: 'error' }); }
  }, [kernel, os, chosen?.version, chosen?.installed]);

  useEffect(() => { if (!edit) void generate(); }, [edit, generate]);

  const pickProxy = (id: string) => { setProxyId(id); setPxNote(null); };
  async function check(){
    let id = proxyId;
    if (id === PASTE){
      if (!paste.trim()) return;
      const r = await folio.api<ProxyImport>('POST', `/workspaces/${wsId}/proxies/import`, { text: paste.trim(), defaultType: 'http' }).catch(() => null);
      if (!r?.proxies.length){ setPxNote({ state: 'bad', text: f.proxyBad }); return; }
      id = r.proxies[0].id;
      setProxyId(id); setPaste(''); data.refresh('proxies');
    }
    if (!id) return;
    setPxNote({ state: 'checking', text: d.common.checking });
    const r: CheckResult = await folio.checkProxy(id);
    const place = r.geo ? [r.geo.city, r.geo.countryName].filter(Boolean).join(', ') : r.ip ?? '';
    setPxNote(r.ok ? { state: 'ok', text: f.proxyOk(place, r.ms ?? 0) } : { state: 'down', text: f.proxyDown });
  }

  async function regenerate(){
    if (!profile) return;
    setFp({ state: 'loading' });
    try {
      setFp({ state: 'ready', ...await folio.newFingerprint(profile.kernel, profile.os, kernelVersion) }); setRegenerated(true);
    } catch { setFp({ state: 'error' }); }
  }

  const nameErr = tried && !name.trim() ? f.nameErr : null;
  const langErr = tried && langMode === 'custom' && !LANG.test(lang.trim()) ? f.langErr : null;

  async function submit(e: FormEvent){
    e.preventDefault();
    setTried(true);
    if (!name.trim() || (langMode === 'custom' && !LANG.test(lang.trim()))) return;
    if (fp.state !== 'ready' || proxyId === PASTE) return;
    setBusy(true); setError(null);
    try {
      const group = groupId === NEW_GROUP ? (newGroup.trim() ? await data.ensureGroup(newGroup) : null) : groupId || null;
      const common = {
        name: name.trim(), groupId: group, proxyId: proxyId || null,
        tags: [...new Set(tags.split(/[,，]/).map(t => t.trim()).filter(Boolean))].slice(0, 10),
        extensionIds: extensionIds.filter(id => usable.some(x => x.id === id)), searchEngine, restoreTabs,
        ...(manager ? { ...(ownerId || profile ? { ownerId: ownerId || null } : {}), ...(data.departments.length ? { departmentId: departmentId || null } : {}) } : {})
      };
      if (profile && base){
        const ok = await data.patch(base, {
          ...common, notes: notes.trim() || null, kernelVersion, syncMode, ...(regenerated ? { fingerprint: fp.fingerprint } : {}),
          timezoneOverride: tz || null, localeOverride: langMode === 'custom' ? lang.trim() : null
        });
        if (!ok){ setBase(profile); setError(f.stale); return; }
        onDone(profile);
      } else {
        const p = await folio.api<Profile>('POST', `/workspaces/${wsId}/profiles`, { ...common, kernel, os, kernelVersion: fp.kernelVersion, fingerprint: fp.fingerprint });
        data.refresh('profiles', 'groups');
        onDone(p);
      }
    } catch (err){
      setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }

  // Extensions from the library made for this engine.
  const usable = data.extensions.filter(x => x.kernel === kernel);
  const facts = fp.state === 'ready' ? fingerprintFacts(fp.fingerprint) : null;
  // Each proxy with how its last check went and where it exits.
  const proxyOptions = useMemo<Opt[]>(() => [
    { value: '', label: f.noProxy },
    ...data.proxies.map(p => {
      const st = proxyState(p), c = p.lastCheck;
      return {
        value: p.id, label: p.name, dot: st === 'ok' ? 'good' as const : st === 'slow' ? 'warn' as const : st === 'down' ? 'bad' as const : 'idle' as const,
        hint: st === 'down' ? d.profiles.noResponse : st === 'unchecked' ? d.profiles.unchecked : [c?.geo?.city ?? c?.geo?.countryName, d.profiles.ms(c?.ms ?? 0)].filter(Boolean).join(' · ')
      };
    }),
    ...(manager ? [{ value: PASTE, label: f.pasteProxy }] : [])
  ], [data.proxies, manager, d, f]);
  const zoneOptions = useMemo<Opt[]>(() => {
    const kept = profile?.timezoneOverride;
    return [{ value: '', label: f.follow }, ...(kept && !ZONES.includes(kept) ? [kept] : []).concat(ZONES).map(z => ({ value: z, label: z }))];
  }, [f, profile?.timezoneOverride]);

  // The preview: the card the profile will get (exit from the proxy's last check) and its fingerprint.
  const pxGeo = data.proxies.find(p => p.id === proxyId)?.lastCheck?.geo ?? null;
  const groupLabel = groupId === NEW_GROUP ? newGroup.trim() || f.newGroup : data.groups.find(g => g.id === groupId)?.name ?? f.noGroup;
  const fpVersion = (fp.state === 'ready' ? fp.kernelVersion : target).split('.')[0];
  const tile = (icon: IconName, label: string, value: string | number, wide?: boolean) => (
    <div className={`fp-tile${wide ? ' wide' : ''}`}><span className="ft-ic" aria-hidden="true"><Icon name={icon} /></span><span><small>{label}</small><b>{value}</b></span></div>
  );

  return (
    <Modal wide title={edit ? f.editTitle : f.newTitle} closeLabel={d.common.close} onClose={onClose} foot={<>
      <span className="sp" />
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
      <button className="btn btn-primary" type="submit" form="profile-form" disabled={busy || fp.state !== 'ready'}>{edit ? f.save : f.create}</button>
    </>}>
      <form className="m-body pf" id="profile-form" onSubmit={submit} noValidate>
        <div className="pf-main">
          {error && <p className="notice error" role="alert">{error}</p>}
          <section className="pf-sec">
            <h3><span className="n">1</span>{f.basic}</h3>
            <div className="row3">
              <div className="field">
                <label htmlFor="pf-name">{f.name}</label>
                <input id="pf-name" type="text" autoComplete="off" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus aria-invalid={!!nameErr} />
                {nameErr && <p className="err">{nameErr}</p>}
              </div>
              <div className="field">
                <span className="label" id="pf-group">{f.group}</span>
                <Select labelledBy="pf-group" value={groupId} onChange={setGroupId} searchPh={f.searchPh}
                  options={[{ value: '', label: f.noGroup }, ...data.groups.map(g => ({ value: g.id, label: g.name })), { value: NEW_GROUP, label: f.newGroup }]} />
                {groupId === NEW_GROUP && <input aria-label={f.newGroupPh} placeholder={f.newGroupPh} value={newGroup} onChange={e => setNewGroup(e.target.value)} maxLength={80} />}
              </div>
              <div className="field">
                <label htmlFor="pf-tags">{f.tags}</label>
                <input id="pf-tags" type="text" placeholder={f.tagsPh} value={tags} onChange={e => setTags(e.target.value)} autoComplete="off" />
              </div>
            </div>
          </section>

          <section className="pf-sec">
            <h3><span className="n">2</span>{f.engineProxy}</h3>
            <div className="row2">
              <div className="field">
                <span className="label" id="pf-engine">{f.engine}</span>
                <div className="seg fill" role="group" aria-labelledby="pf-engine">
                  {(['chromium', 'firefox'] as const).map(k => (
                    <button key={k} type="button" aria-pressed={kernel === k} disabled={edit && kernel !== k} onClick={() => { setKernel(k); setKernelVersion(''); }}><EngineLogo kernel={k} />{ENGINES[k]}</button>
                  ))}
                </div>
              </div>
              <SelectField label={f.engineVersion} value={edit ? kernelVersion : target} onChange={setKernelVersion} placeholder="—"
                options={[...(edit && !versions.some(k => k.version === kernelVersion) ? [{ value: kernelVersion, label: kernelVersion }] : []),
                  ...versions.map(k => ({ value: k.version, label: k.version, hint: k.recommended ? d.engines.recommended : k.installed ? d.engines.installed : undefined }))]} />
            </div>
            <div className="row2">
              <div className="field">
                <span className="label" id="pf-os">{f.os}</span>
                <div className="seg fill" role="group" aria-labelledby="pf-os">
                  {(['windows', 'macos', 'linux'] as const).map(o => (
                    <button key={o} type="button" aria-pressed={os === o} disabled={edit && os !== o} onClick={() => setOs(o)}><Icon name={o} />{d.os[o]}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label" id="pf-proxy">{f.proxy}</span>
                <div className="pxcheck">
                  <Select labelledBy="pf-proxy" value={proxyId} onChange={pickProxy} options={proxyOptions} searchPh={f.searchPh} empty={d.profiles.emptyMatch} />
                  {proxyId && <button className="btn btn-secondary btn-sm" type="button" onClick={check} disabled={pxNote?.state === 'checking'}>{d.common.check}</button>}
                </div>
                {proxyId === PASTE && (
                  <input className="mono-in" aria-label={f.pasteProxy} placeholder={f.pastePh} value={paste} onChange={e => setPaste(e.target.value)} spellCheck={false} autoComplete="off" />
                )}
                {pxNote && (
                  <p className={`pxres ${pxNote.state}`} aria-live="polite">
                    {pxNote.state === 'checking' ? <span className="spin" aria-hidden="true" /> : pxNote.state === 'ok' && <span className="d" aria-hidden="true" />}
                    <span>{pxNote.text}</span>
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="pf-sec">
            <h3><span className="n">3</span>{d.browser.title}</h3>
            <div className="row2">
              <SelectField label={d.browser.search} value={searchEngine} onChange={v => setSearchEngine(v as SearchEngine)}
                options={SEARCH_IDS.map(id => ({ value: id, label: d.browser.name(id), ...(id !== 'none' ? { img: SEARCH_LOGOS[id] } : {}) }))} />
              <div className="field pf-switch">
                <Switch label={d.browser.restore} checked={restoreTabs} onChange={setRestoreTabs} />
              </div>
            </div>
          </section>

          <details className="pf-sec pf-more" open={edit}>
            <summary><h3>{f.more}</h3><Icon name="chev" /></summary>
            {data.extensions.length > 0 && (
              <fieldset className="field ext-pick">
                <legend className="label">{f.extensions}</legend>
                {!usable.length && <p className="hint">{f.noExtensions(ENGINES[kernel])}</p>}
                {usable.map(x => (
                  <label key={x.id} className="check-row">
                    <input type="checkbox" checked={extensionIds.includes(x.id)} onChange={e => setExtensionIds(ids => e.target.checked ? [...ids, x.id] : ids.filter(i => i !== x.id))} />
                    <span>{x.name}</span><span className="mono muted">{x.version}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {manager && (
              <div className="row2">
                <SelectField label={f.owner} value={ownerId} onChange={setOwnerId} searchPh={f.searchPh}
                  options={[{ value: '', label: edit ? d.profiles.unassigned : d.team.you }, ...data.members.map(m => ({ value: m.userId, label: m.email }))]} />
                {data.departments.length > 0 && (
                  <SelectField label={f.department} value={departmentId} onChange={setDepartmentId}
                    options={[{ value: '', label: f.noDepartment }, ...data.departments.map(x => ({ value: x.id, label: x.name }))]} />
                )}
              </div>
            )}
            {edit && (
              <>
                <div className="row2">
                  <SelectField label={f.tz} value={tz} onChange={setTz} options={zoneOptions} search searchPh={f.tzPh} empty={f.tzNone} />
                  <div className="field">
                    <span className="label" id="pf-lang">{f.lang}</span>
                    <Select labelledBy="pf-lang" value={langMode} onChange={setLangMode} options={[{ value: 'follow', label: f.follow }, { value: 'custom', label: f.custom }]} />
                    {langMode === 'custom' && <input aria-label={f.lang} placeholder={f.langPh} value={lang} onChange={e => setLang(e.target.value)} aria-invalid={!!langErr} />}
                    {langErr && <p className="err">{langErr}</p>}
                  </div>
                </div>
                <SelectField label={f.sync} value={syncMode} onChange={v => setSyncMode(v as 'cloud' | 'local')} hint={f.syncHelp}
                  options={[{ value: 'cloud', label: f.syncCloud }, { value: 'local', label: f.syncLocal }]} />
                <div className="field">
                  <label htmlFor="pf-notes">{f.notes}</label>
                  <textarea id="pf-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
                </div>
              </>
            )}
          </details>
        </div>

        <aside className="pf-preview" aria-label={f.preview}>
          <p className="pf-t">{f.preview}</p>
          <div className="idcard">
            <div className="idc-top">
              <Flag country={pxGeo?.country ?? null} kernel={kernel} size="lg" />
              <div><h2>{name.trim() || f.defaultName((data.profiles?.length ?? 0) + 1)}</h2><span className="mono">{groupLabel}</span></div>
            </div>
            <div className="idc-city">
              <b>{pxGeo ? pxGeo.city ?? pxGeo.countryName : proxyId && proxyId !== PASTE ? d.detail.notChecked : d.detail.direct}</b>
              <span className="mono">{data.proxies.find(p => p.id === proxyId)?.name ?? ''}</span>
            </div>
          </div>
          <section className="fpbox" data-testid="fingerprint">
            <div className="fpbox-h">
              <b>{f.fp}</b>
              {fp.state !== 'need-firefox' && <button className="btn btn-text btn-xs" type="button" onClick={() => void (edit ? regenerate() : generate())} disabled={fp.state === 'loading'}><Icon name="refresh" />{f.regen}</button>}
            </div>
            {fp.state === 'loading' && <p className="hint"><span className="spin" aria-hidden="true" /></p>}
            {fp.state === 'error' && <p className="err">{f.fpErr}</p>}
            {fp.state === 'need-firefox' && (
              <div className="fp-need">
                <p className="hint">{f.firefoxMissing}</p>
                {ffProgress && !ffProgress.error
                  ? <p className="hint">{f.downloading(percent(ffProgress))}</p>
                  : <button className="btn btn-secondary btn-sm" type="button" onClick={() => void data.install('firefox', fp.version).then(ok => { if (ok) void generate(); })}>{f.download}{chosen?.size ? ` · ${bytes(chosen.size)}` : ''}</button>}
              </div>
            )}
            {facts && (
              <div className="fp-tiles">
                {tile('proxies', d.detail.fields.tz, pxGeo?.timezone ?? f.follow, true)}
                {tile('lang', d.detail.fields.lang, pxGeo?.locale ?? f.follow)}
                {tile(profile?.os ?? os, d.detail.fields.os, d.os[profile?.os ?? os])}
                {facts.seed ? tile('monitor', d.detail.fields.seed, facts.seed) : tile('monitor', d.detail.fields.screen, facts.screen ?? '—')}
                {tile('engines', d.detail.fields.cores, facts.cores ?? '—')}
                {tile('engines', d.detail.fields.engine, `${ENGINES[kernel]} ${fpVersion}`, true)}
                {facts.gpu && tile('monitor', d.detail.fields.gpu, facts.gpu, true)}
              </div>
            )}
            {regenerated && <p className="hint">{f.regenWarn}</p>}
          </section>
        </aside>
      </form>
    </Modal>
  );
}
