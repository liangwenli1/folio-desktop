// New profile and edit profile. A new profile gets its fingerprint from the main process for the chosen
// engine and system; an edit keeps it unless the user regenerates it.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { CheckResult, Fingerprint, KernelKind, Os } from '@shared/bridge';
import { folio, isApiError, type Profile, type ProxyImport } from './api';
import { fingerprintFacts, proxyState } from './checks';
import { kernelKey, type WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Modal, percent } from './ui';
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
  const [kernelVersion, setKernelVersion] = useState(profile?.kernelVersion ?? '');
  const [fp, setFp] = useState<FpState>(profile ? { state: 'ready', fingerprint: profile.fingerprint, kernelVersion: profile.kernelVersion } : { state: 'loading' });
  const [regenerated, setRegenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const versions = data.kernels.filter(k => k.kind === kernel);
  const latest = versions[0];
  const ffKey = latest ? kernelKey('firefox', latest.version) : '';
  const ffProgress = kernel === 'firefox' ? data.progress[ffKey] : undefined;

  const generate = useCallback(async () => {
    if (!latest) return;
    if (kernel === 'firefox' && !latest.installed){ setFp({ state: 'need-firefox', version: latest.version }); return; }
    setFp({ state: 'loading' });
    try {
      const r = await folio.newFingerprint(kernel, os);
      setFp({ state: 'ready', ...r });
      setKernelVersion(r.kernelVersion);
    } catch { setFp({ state: 'error' }); }
  }, [kernel, os, latest]);

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
      const r = await folio.newFingerprint(profile.kernel, profile.os);
      setFp({ state: 'ready', ...r }); setKernelVersion(r.kernelVersion); setRegenerated(true);
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
        extensionIds: extensionIds.filter(id => usable.some(x => x.id === id)),
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

  return (
    <Modal title={edit ? f.editTitle : f.newTitle} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
      <button className="btn btn-primary" type="submit" form="profile-form" disabled={busy || fp.state !== 'ready'}>{edit ? f.save : f.create}</button>
    </>}>
      <form className="m-body" id="profile-form" onSubmit={submit} noValidate>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="row2">
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
        </div>

        {!edit && (
          <div className="row2">
            <div className="field">
              <span className="label" id="pf-engine">{f.engine}</span>
              <div className="seg" role="group" aria-labelledby="pf-engine">
                {(['chromium', 'firefox'] as const).map(k => (
                  <button key={k} type="button" aria-pressed={kernel === k} onClick={() => setKernel(k)}>{k === 'chromium' ? 'Chromium' : 'Firefox'}</button>
                ))}
              </div>
              <p className="hint">{kernel === 'chromium' ? f.recommended : f.firefoxNote}</p>
            </div>
            <SelectField label={f.os} value={os} onChange={v => setOs(v as Os)} options={(['windows', 'macos', 'linux'] as const).map(o => ({ value: o, label: d.os[o] }))} />
          </div>
        )}

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

        {data.extensions.length > 0 && (
          <fieldset className="field ext-pick">
            <legend className="label">{f.extensions}</legend>
            {!usable.length && <p className="hint">{f.noExtensions(kernel === 'chromium' ? 'Chromium' : 'Firefox')}</p>}
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
            <div className="field">
              <label htmlFor="pf-tags">{f.tags}</label>
              <input id="pf-tags" type="text" placeholder={f.tagsPh} value={tags} onChange={e => setTags(e.target.value)} autoComplete="off" />
            </div>
            <div className="row2">
              <SelectField label={f.tz} value={tz} onChange={setTz} options={zoneOptions} search searchPh={f.tzPh} empty={f.tzNone} />
              <div className="field">
                <span className="label" id="pf-lang">{f.lang}</span>
                <Select labelledBy="pf-lang" value={langMode} onChange={setLangMode} options={[{ value: 'follow', label: f.follow }, { value: 'custom', label: f.custom }]} />
                {langMode === 'custom' && <input aria-label={f.lang} placeholder={f.langPh} value={lang} onChange={e => setLang(e.target.value)} aria-invalid={!!langErr} />}
                {langErr && <p className="err">{langErr}</p>}
              </div>
            </div>
            <SelectField label={f.engineVersion} value={kernelVersion} onChange={setKernelVersion}
              options={[...(versions.some(k => k.version === kernelVersion) ? [] : [{ value: kernelVersion, label: kernelVersion }]),
                ...versions.map(k => ({ value: k.version, label: `${kernel === 'chromium' ? 'Chromium' : 'Firefox'} ${k.version}` }))]} />
            <SelectField label={f.sync} value={syncMode} onChange={v => setSyncMode(v as 'cloud' | 'local')} hint={f.syncHelp}
              options={[{ value: 'cloud', label: f.syncCloud }, { value: 'local', label: f.syncLocal }]} />
            <div className="field">
              <label htmlFor="pf-notes">{f.notes}</label>
              <textarea id="pf-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
            </div>
          </>
        )}

        <div className="fpbox" data-testid="fingerprint">
          <div className="fpbox-h">
            <b>{f.fp}</b>
            {fp.state !== 'need-firefox' && <button className="btn btn-secondary btn-xs" type="button" onClick={() => void (edit ? regenerate() : generate())} disabled={fp.state === 'loading'}>{f.regen}</button>}
          </div>
          {fp.state === 'loading' && <p className="hint"><span className="spin" aria-hidden="true" /></p>}
          {fp.state === 'error' && <p className="err">{f.fpErr}</p>}
          {fp.state === 'need-firefox' && (
            <div className="fp-need">
              <p className="hint">{f.firefoxMissing}</p>
              {ffProgress && !ffProgress.error
                ? <p className="hint">{f.downloading(percent(ffProgress))}</p>
                : <button className="btn btn-secondary btn-sm" type="button" onClick={() => void data.install('firefox', fp.version).then(ok => { if (ok) void generate(); })}>{f.download} · 1.3 GB</button>}
            </div>
          )}
          {facts && (
            <dl className="fpgrid">
              <div><dt>{d.detail.fields.os}</dt><dd>{d.os[profile?.os ?? os]}</dd></div>
              <div><dt>{d.detail.fields.engine}</dt><dd>{`${kernel === 'chromium' ? 'Chromium' : 'Firefox'} ${(fp.state === 'ready' ? fp.kernelVersion : kernelVersion).split('.')[0]}`}</dd></div>
              {facts.seed && <div><dt>{d.detail.fields.seed}</dt><dd>{facts.seed}</dd></div>}
              {facts.screen && <div><dt>{d.detail.fields.screen}</dt><dd>{facts.screen}</dd></div>}
              <div><dt>{d.detail.fields.cores}</dt><dd>{facts.cores ?? '—'}</dd></div>
              {facts.gpu && <div className="wide"><dt>{d.detail.fields.gpu}</dt><dd>{facts.gpu}</dd></div>}
            </dl>
          )}
          <p className="hint">{regenerated ? f.regenWarn : f.fpHint}</p>
        </div>
      </form>
    </Modal>
  );
}
