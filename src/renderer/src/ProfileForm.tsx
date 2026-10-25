// New profile and edit profile. A new profile gets its fingerprint from the main process for the chosen
// engine and system; an edit keeps it unless the user regenerates it.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { CheckResult, Fingerprint, FingerprintAsk, KernelKind, Os } from '@shared/bridge';
import { SEARCH_IDS, type SearchEngine } from '@shared/search';
import { folio, isApiError, type Profile, type ProxyImport } from './api';
import { ENGINES, fingerprintFacts, gpuName, latencyTone, proxyState } from './checks';
import { kernelKey, type WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Icon, Modal, Switch, bytes, percent, type IconName } from './ui';
import { EngineLogo, Flag, SEARCH_LOGOS } from './Flag';
import { Select, SelectField, type Opt } from './Select';

interface Props { d: Dict; wsId: string; data: WorkspaceData; profile?: Profile; defaultGroup: string | null; onClose(): void; onDone(p: Profile): void }

const NEW_GROUP = '__new';
// Screens a Firefox identity can be drawn to exactly, per system (others come out at another size).
const SCREENS: Record<Os, string[]> = {
  windows: ['1920x1080', '1366x768', '1536x864', '1440x900', '1600x900', '1280x720', '1280x1024', '1680x1050', '1920x1200', '2560x1440', '3840x2160'],
  linux: ['1920x1080', '1366x768', '1536x864', '1440x900', '1280x1024', '1680x1050', '1920x1200', '2560x1440', '3840x2160'],
  macos: ['1440x900', '1512x982', '1728x1117', '1920x1080', '2560x1440']
};
const screenLabel = (v: string) => v.replace('x', ' × ');
const ZONES = Intl.supportedValuesOf('timeZone');
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// A check that got through is coloured by its latency: 'ok', 'warn' (slow), 'slow' (very slow); 'bad' is a line that
// couldn't be read.
type PxNote = { state: 'checking' | 'ok' | 'warn' | 'slow' | 'down' | 'bad'; text: string } | null;
const ANSWERED = { good: 'ok', warn: 'warn', bad: 'slow' } as const;
// A proxy from the library, a new one pasted in (it joins the library), or none.
type PxMode = 'saved' | 'custom' | 'none';
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
  const [pxMode, setPxMode] = useState<PxMode>((profile ? profile.proxyId : data.proxies.length) ? 'saved' : 'none');
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
  // Fingerprint choices. Firefox's screen ('' for random, else 'WxH') and GPU ('' for random, else vendor and renderer on
  // two lines) shape the identity drawn; Chromium's Canvas and GPU switches and Firefox's WebRTC apply at launch.
  const fp0 = profile?.fingerprint, ff0 = fp0?.kind === 'firefox' ? fp0.config : null;
  const [screenAsk, setScreenAsk] = useState(ff0 && typeof ff0['screen.width'] === 'number' ? `${ff0['screen.width']}x${ff0['screen.height']}` : '');
  const [gpuAsk, setGpuAsk] = useState(ff0 && typeof ff0['webGl:renderer'] === 'string' ? `${ff0['webGl:vendor']}\n${ff0['webGl:renderer']}` : '');
  const [canvas, setCanvas] = useState(fp0?.kind === 'chromium' ? fp0.canvas ?? 'noise' : 'noise');
  const [webgl, setWebgl] = useState(fp0?.kind === 'chromium' ? fp0.webgl ?? 'spoof' : 'spoof');
  const [webrtc, setWebrtc] = useState(fp0?.kind === 'firefox' ? fp0.webrtc ?? 'replace' : 'replace');
  const [gpus, setGpus] = useState<[string, string][]>([]);
  useEffect(() => { if (kernel === 'firefox') void folio.firefoxGpus(os).then(setGpus); }, [kernel, os]);
  const ask = (screen: string, gpu: string): FingerprintAsk => ({ screen: screen ? screen.split('x').map(Number) as [number, number] : null, gpu: gpu ? gpu.split('\n') as [string, string] : null });
  // The fingerprint as it will be saved: the identity drawn plus the choices applied at launch (defaults left out).
  const withChoices = (x: Fingerprint): Fingerprint => (x.kind === 'chromium'
    ? { ...x, canvas: canvas === 'real' ? 'real' : undefined, webgl: webgl === 'real' ? 'real' : undefined }
    : { ...x, webrtc: webrtc === 'block' ? 'block' : undefined });
  const choicesChanged = fp0?.kind === 'chromium' ? (fp0.canvas ?? 'noise') !== canvas || (fp0.webgl ?? 'spoof') !== webgl : fp0?.kind === 'firefox' && (fp0.webrtc ?? 'replace') !== webrtc;
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
    try { setFp({ state: 'ready', ...await folio.newFingerprint(kernel, os, chosen.version, ask(screenAsk, gpuAsk)) }); } catch { setFp({ state: 'error' }); }
  }, [kernel, os, chosen?.version, chosen?.installed, screenAsk, gpuAsk]);

  useEffect(() => { if (!edit) void generate(); }, [edit, generate]);

  const pickProxy = (id: string) => { setProxyId(id); setPxNote(null); };
  const pickMode = (m: PxMode) => { setPxMode(m); setPxNote(null); };
  // A pasted proxy joins the library and becomes the profile's choice; undefined when it can't be read.
  async function addPasted(){
    const r = await folio.api<ProxyImport>('POST', `/workspaces/${wsId}/proxies/import`, { text: paste.trim(), defaultType: 'http' }).catch(() => null);
    if (!r?.proxies.length){ setPxNote({ state: 'bad', text: f.proxyBad }); return undefined; }
    const id = r.proxies[0].id;
    setProxyId(id); setPxMode('saved'); setPaste(''); data.refresh('proxies');
    return id;
  }
  async function check(){
    const id = pxMode === 'custom' ? paste.trim() && await addPasted() : proxyId;
    if (!id) return;
    setPxNote({ state: 'checking', text: d.common.checking });
    const r: CheckResult = await folio.checkProxy(id);
    const place = r.geo ? [r.geo.city, r.geo.countryName].filter(Boolean).join(', ') : r.ip ?? '';
    setPxNote(r.ok ? { state: ANSWERED[latencyTone(r.ms)], text: f.proxyOk(place, r.ms ?? 0) } : { state: 'down', text: f.proxyDown });
  }

  async function regenerate(screen: string, gpu: string){
    if (!profile) return;
    setFp({ state: 'loading' });
    try {
      setFp({ state: 'ready', ...await folio.newFingerprint(profile.kernel, profile.os, kernelVersion, ask(screen, gpu)) }); setRegenerated(true);
    } catch { setFp({ state: 'error' }); }
  }
  // A new profile draws again by itself when a choice changes; an edit draws again only when asked.
  const pickScreen = (v: string) => { setScreenAsk(v); if (edit) void regenerate(v, gpuAsk); };
  const pickGpu = (v: string) => { setGpuAsk(v); if (edit) void regenerate(screenAsk, v); };
  // A random identity: Firefox's screen and GPU go back to random too.
  const randomize = () => { setScreenAsk(''); setGpuAsk(''); if (edit) void regenerate('', ''); else if (!screenAsk && !gpuAsk) void generate(); };

  const nameErr = tried && !name.trim() ? f.nameErr : null;
  const pxErr = tried && ((pxMode === 'saved' && !proxyId) || (pxMode === 'custom' && !paste.trim())) ? f.pickErr : null;
  const langErr = tried && langMode === 'custom' && !LANG.test(lang.trim()) ? f.langErr : null;

  async function submit(e: FormEvent){
    e.preventDefault();
    setTried(true);
    if (!name.trim() || (langMode === 'custom' && !LANG.test(lang.trim()))) return;
    if (fp.state !== 'ready' || (pxMode === 'saved' && !proxyId) || (pxMode === 'custom' && !paste.trim())) return;
    setBusy(true); setError(null);
    try {
      const px = pxMode === 'none' ? null : pxMode === 'custom' ? await addPasted() : proxyId;
      if (px === undefined) return;
      const group = groupId === NEW_GROUP ? (newGroup.trim() ? await data.ensureGroup(newGroup) : null) : groupId || null;
      const common = {
        name: name.trim(), groupId: group, proxyId: px, notes: notes.trim() || null,
        timezoneOverride: tz || null, localeOverride: langMode === 'custom' ? lang.trim() : null,
        tags: [...new Set(tags.split(/[,，]/).map(t => t.trim()).filter(Boolean))].slice(0, 10),
        extensionIds: extensionIds.filter(id => usable.some(x => x.id === id)), searchEngine, restoreTabs,
        ...(manager ? { ...(ownerId || profile ? { ownerId: ownerId || null } : {}), ...(data.departments.length ? { departmentId: departmentId || null } : {}) } : {})
      };
      if (profile && base){
        const ok = await data.patch(base, { ...common, kernelVersion, syncMode, ...(regenerated || choicesChanged ? { fingerprint: withChoices(fp.fingerprint) } : {}) });
        if (!ok){ setBase(profile); setError(f.stale); return; }
        onDone(profile);
      } else {
        const p = await folio.api<Profile>('POST', `/workspaces/${wsId}/profiles`, { ...common, kernel, os, kernelVersion: fp.kernelVersion, fingerprint: withChoices(fp.fingerprint) });
        data.refresh('profiles', 'groups');
        onDone(p);
      }
    } catch (err){
      setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }

  // Extensions from the library made for this engine.
  const usable = data.extensions.filter(x => x.kernel === kernel);
  const facts = fp.state === 'ready' ? fingerprintFacts(withChoices(fp.fingerprint)) : null;
  const F = d.fp;
  const screens = [...(screenAsk && !SCREENS[os].includes(screenAsk) ? [screenAsk] : []), ...SCREENS[os]];
  const gpuOpts = [...(gpuAsk && !gpus.some(([v, r]) => `${v}\n${r}` === gpuAsk) ? [gpuAsk.split('\n') as [string, string]] : []), ...gpus];
  // Each proxy with how its last check went and where it exits.
  const proxyOptions = useMemo<Opt[]>(() => data.proxies.map(p => {
    const st = proxyState(p), c = p.lastCheck;
    return {
      value: p.id, label: `${p.name} · ${p.type.toUpperCase()}`, dot: st === 'ok' ? 'good' as const : st === 'slow' ? 'warn' as const : st === 'down' ? 'bad' as const : 'idle' as const,
      hint: st === 'down' ? d.profiles.noResponse : st === 'unchecked' ? d.profiles.unchecked : [c?.geo?.city ?? c?.geo?.countryName, d.profiles.ms(c?.ms ?? 0)].filter(Boolean).join(' · ')
    };
  }), [data.proxies, d]);
  const zoneOptions = useMemo<Opt[]>(() => {
    const kept = profile?.timezoneOverride;
    return [{ value: '', label: f.follow }, ...(kept && !ZONES.includes(kept) ? [kept] : []).concat(ZONES).map(z => ({ value: z, label: z }))];
  }, [f, profile?.timezoneOverride]);

  // The preview: the card the profile will get (exit from the proxy's last check) and its fingerprint.
  const chosenPx = pxMode === 'saved' ? data.proxies.find(p => p.id === proxyId) : undefined;
  const pxGeo = chosenPx?.lastCheck?.geo ?? null;
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
                  options={[{ value: '', label: f.noGroup }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const })), { value: NEW_GROUP, label: f.newGroup }]} />
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
                    <button key={k} type="button" aria-pressed={kernel === k} disabled={edit && kernel !== k} onClick={() => { setKernel(k); setKernelVersion(''); setScreenAsk(''); setGpuAsk(''); }}><EngineLogo kernel={k} />{ENGINES[k]}</button>
                  ))}
                </div>
              </div>
              <SelectField label={f.engineVersion} value={edit ? kernelVersion : target} onChange={setKernelVersion} placeholder="—"
                options={[...(edit && !versions.some(k => k.version === kernelVersion) ? [{ value: kernelVersion, label: kernelVersion }] : []),
                  ...versions.map(k => ({ value: k.version, label: k.version, hint: k.recommended ? d.engines.recommended : k.installed ? d.engines.installed : undefined }))]} />
            </div>
            <div className="field">
              <span className="label" id="pf-os">{f.os}</span>
              <div className="seg fill" role="group" aria-labelledby="pf-os">
                {(['windows', 'macos', 'linux'] as const).map(o => (
                  <button key={o} type="button" aria-pressed={os === o} disabled={edit && os !== o} onClick={() => { setOs(o); setGpuAsk(''); if (!SCREENS[o].includes(screenAsk)) setScreenAsk(''); }}><Icon name={o} />{d.os[o]}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label" id="pf-proxy">{f.proxy}</span>
              <div className="radios" role="radiogroup" aria-labelledby="pf-proxy">
                {(['saved', 'custom', 'none'] as const).filter(m => m !== 'custom' || manager).map(m => (
                  <label key={m} className="check-row"><input type="radio" name="pf-px" checked={pxMode === m} onChange={() => pickMode(m)} />{f.proxyMode[m]}</label>
                ))}
              </div>
              {pxMode !== 'none' && (
                <div className="pxcheck">
                  {pxMode === 'saved'
                    ? <Select label={f.pickProxy} placeholder={f.pickProxy} value={proxyId} onChange={pickProxy} options={proxyOptions} searchPh={f.searchPh} empty={d.profiles.emptyMatch} />
                    : <input className="mono-in" aria-label={f.proxyMode.custom} placeholder={f.pastePh} value={paste} onChange={e => { setPaste(e.target.value); setPxNote(null); }} spellCheck={false} autoComplete="off" />}
                  <button className="btn btn-secondary" type="button" onClick={check} disabled={pxNote?.state === 'checking' || (pxMode === 'saved' ? !proxyId : !paste.trim())}>{d.proxies.test}</button>
                </div>
              )}
              {pxErr && !pxNote && <p className="err">{pxErr}</p>}
              {pxNote && (
                <p className={`pxres ${pxNote.state}`} aria-live="polite">
                  {pxNote.state === 'checking' ? <span className="spin" aria-hidden="true" /> : <Icon name={pxNote.state === 'down' || pxNote.state === 'bad' ? 'alert' : 'check'} />}
                  <span>{pxNote.text}</span>
                </p>
              )}
            </div>
          </section>

          <section className="pf-sec">
            <div className="sec-row">
              <h3><span className="n">3</span>{F.title}</h3>
              <button className="btn btn-xs btn-secondary" type="button" onClick={randomize} disabled={fp.state === 'loading' || fp.state === 'need-firefox'}><Icon name="refresh" />{F.random}</button>
            </div>
            <div className="row2">
              {kernel === 'chromium'
                ? <SelectField label={F.screen} value="host" onChange={() => {}} disabled options={[{ value: 'host', label: F.screenHost }]} />
                : <SelectField label={F.screen} value={screenAsk} onChange={pickScreen} options={[{ value: '', label: F.screenRandom }, ...screens.map(v => ({ value: v, label: screenLabel(v) }))]} />}
              {kernel === 'chromium'
                ? <SelectField label={F.webgl} value={webgl} onChange={v => setWebgl(v as 'spoof' | 'real')} options={(['spoof', 'real'] as const).map(v => ({ value: v, label: F.webglOpts[v] }))} />
                : <SelectField label={F.webgl} value={gpuAsk} onChange={pickGpu} searchPh={f.searchPh}
                  options={[{ value: '', label: F.webglOpts.spoof }, ...gpuOpts.map(([v, r]) => ({ value: `${v}\n${r}`, label: gpuName(r) }))]} />}
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
            <div className="row2">
              {kernel === 'chromium'
                ? <SelectField label={F.webrtc} value="udp" onChange={() => {}} disabled options={[{ value: 'udp', label: F.webrtcOpts.udp }]} />
                : <SelectField label={F.webrtc} value={webrtc} onChange={v => setWebrtc(v as 'replace' | 'block')} options={(['replace', 'block'] as const).map(v => ({ value: v, label: F.webrtcOpts[v] }))} />}
              {kernel === 'chromium'
                ? <SelectField label={F.canvas} value={canvas} onChange={v => setCanvas(v as 'noise' | 'real')} options={(['noise', 'real'] as const).map(v => ({ value: v, label: F.canvasOpts[v] }))} />
                : <SelectField label={F.canvas} value="engine" onChange={() => {}} disabled options={[{ value: 'engine', label: F.canvasOpts.engine }]} />}
            </div>
          </section>

          <section className="pf-sec">
            <h3><span className="n">4</span>{d.browser.title}</h3>
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
              <SelectField label={f.sync} value={syncMode} onChange={v => setSyncMode(v as 'cloud' | 'local')} hint={f.syncHelp}
                options={[{ value: 'cloud', label: f.syncCloud }, { value: 'local', label: f.syncLocal }]} />
            )}
            <div className="field">
              <label htmlFor="pf-notes">{f.notes}</label>
              <span className="counted">
                <textarea id="pf-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
                <small className="count">{notes.length} / 2000</small>
              </span>
            </div>
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
              <b>{pxGeo ? pxGeo.city ?? pxGeo.countryName : chosenPx || (pxMode === 'custom' && paste.trim()) ? d.detail.notChecked : d.detail.direct}</b>
              <span className="mono">{chosenPx?.name ?? ''}</span>
            </div>
          </div>
          <section className="fpbox" data-testid="fingerprint">
            <div className="fpbox-h"><b>{f.fp}</b></div>
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
                {tile('engines', d.detail.fields.cores, facts.cores ?? '—')}
                {tile('monitor', F.canvas, F.canvasOpts[facts.canvas])}
                {tile('monitor', F.screen, facts.screen ?? F.screenHost, true)}
                {tile('engines', d.detail.fields.engine, `${ENGINES[kernel]} ${fpVersion}`, true)}
                {tile('monitor', F.webgl, facts.gpu ?? F.webglOpts[facts.webgl], true)}
                {tile('proxies', F.webrtc, F.webrtcOpts[facts.webrtc], true)}
              </div>
            )}
            {regenerated && <p className="hint">{f.regenWarn}</p>}
          </section>
        </aside>
      </form>
    </Modal>
  );
}
