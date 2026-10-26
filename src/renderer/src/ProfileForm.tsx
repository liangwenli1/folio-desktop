// New profile and edit profile: four sections (basics, proxy, fingerprint, how it opens) beside a rail that moves
// between them. A new profile starts from the workspace's defaults and gets its fingerprint from the main process for
// the chosen engine and system; an edit keeps it unless a new one is drawn. While the profile runs here, what it was
// started with (engine, proxy, fingerprint) waits until it is stopped, and closing with changes asks first.
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { CheckResult, KernelKind, Os } from '@shared/bridge';
import { SEARCH_IDS, type SearchEngine } from '@shared/search';
import { MANAGE, can, folio, isApiError, type Profile, type ProxyImport, type Workspace } from './api';
import { time } from './Activity';
import { ENGINES, latencyTone, proxyState } from './checks';
import { kernelKey, type WorkspaceData } from './data';
import { errorText, type Dict, type Lang } from './i18n';
import { Icon, Modal, Switch, bytes, percent } from './ui';
import { SEARCH_LOGOS } from './Flag';
import { Select, SelectField, type Opt } from './Select';
import { elsewhere } from './ProfileDetail';
import { CanvasField, CoresField, GpuField, LangField, ScreenField, WebrtcField, ZoneField, useFingerprint } from './Fingerprint';

interface Props { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; profile?: Profile; defaultGroup: string | null; onClose(): void; onDone(p: Profile): void }

const NEW_GROUP = '__new';
const URL_OK = /^https?:\/\/\S+$/;
type Sec = 'basic' | 'proxy' | 'fp' | 'launch';
const SECS: Sec[] = ['basic', 'proxy', 'fp', 'launch'];
// A check that got through is coloured by its latency: 'ok', 'warn' (slow), 'slow' (very slow); 'bad' is a line that
// couldn't be read; 'past' is the proxy's last check from before this form opened.
type PxNote = { state: 'checking' | 'ok' | 'warn' | 'slow' | 'down' | 'bad' | 'past'; text: string };
const ANSWERED = { good: 'ok', warn: 'warn', bad: 'slow' } as const;
// A proxy from the library, a new one pasted in (it joins the library), or none.
type PxMode = 'saved' | 'custom' | 'none';
type Win = NonNullable<Profile['windowMode']>;

export function ProfileForm({ d, lang, ws, data, profile, defaultGroup, onClose, onDone }: Props){
  // The version this edit is based on. Live updates do not move it, so a save over someone else's change is
  // refused once; after that it builds on their version and replaces it.
  const [base, setBase] = useState(profile);
  const f = d.form, edit = !!profile, set = ws.settings;
  const manager = can(data.role, MANAGE);
  const savedProxy = !edit && set.defaultProxyId && data.proxies.some(p => p.id === set.defaultProxyId) ? set.defaultProxyId : '';
  const [name, setName] = useState(profile?.name ?? f.defaultName((data.profiles?.length ?? 0) + 1));
  const [groupId, setGroupId] = useState(profile ? profile.groupId ?? '' : defaultGroup ?? set.defaultGroupId ?? '');
  const [newGroup, setNewGroup] = useState('');
  // 'kind:version' once picked; a new profile otherwise gets the workspace's default engine, or the recommended one.
  const [enginePick, setEnginePick] = useState(profile ? `${profile.kernel}:${profile.kernelVersion}` : '');
  const [os, setOs] = useState<Os>(profile?.os ?? 'windows');
  const [proxyId, setProxyId] = useState(profile?.proxyId ?? savedProxy);
  const [pxMode, setPxMode] = useState<PxMode>((profile ? profile.proxyId : data.proxies.length) ? 'saved' : 'none');
  // Whoever administers the workspace chooses who it is assigned to; a new profile goes to whoever makes it.
  const [ownerId, setOwnerId] = useState(profile ? profile.ownerId ?? '' : '');
  const [paste, setPaste] = useState('');
  const [pxNote, setPxNote] = useState<PxNote | null>(null);
  const [tags, setTags] = useState(profile?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [syncMode, setSyncMode] = useState(profile?.syncMode ?? 'cloud');
  const [extensionIds, setExtensionIds] = useState<string[]>(profile?.extensionIds ?? []);
  const [searchEngine, setSearchEngine] = useState<SearchEngine>(profile?.searchEngine ?? 'none');
  const [restoreTabs, setRestoreTabs] = useState(profile?.restoreTabs ?? true);
  const [startUrl, setStartUrl] = useState(profile?.startUrl ?? '');
  const [windowMode, setWindowMode] = useState<Win>(profile?.windowMode ?? 'default');
  const [width, setWidth] = useState(String(profile?.windowWidth ?? 1280));
  const [height, setHeight] = useState(String(profile?.windowHeight ?? 800));
  const [fpOpen, setFpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  // The engine versions offered: every one for this computer (a saved profile keeps its engine, so only its own).
  const avail = data.kernels.filter(k => k.available && (!profile || k.kind === profile.kernel)).sort((a, b) => a.kind.localeCompare(b.kind));
  const first = (kind: KernelKind) => avail.find(k => k.kind === kind && k.version === set.defaultKernelVersion) ?? avail.find(k => k.kind === kind && k.recommended) ?? avail.find(k => k.kind === kind);
  const fallback = (set.defaultKernel && first(set.defaultKernel)) || first('chromium') || avail[0];
  const engine = enginePick || (fallback ? `${fallback.kind}:${fallback.version}` : '');
  const kernel = (engine.split(':')[0] || 'chromium') as KernelKind, version = engine.split(':')[1] ?? '';
  const chosen = data.kernels.find(k => k.kind === kernel && k.version === version);
  const ffProgress = kernel === 'firefox' ? data.progress[kernelKey('firefox', version)] : undefined;
  const fpd = useFingerprint(profile, kernel, os, version, !!chosen?.installed);
  const engineOpts: Opt[] = [
    ...(profile && !avail.some(k => k.version === profile.kernelVersion) ? [{ value: `${profile.kernel}:${profile.kernelVersion}`, label: `${ENGINES[profile.kernel]} ${profile.kernelVersion}` }] : []),
    ...avail.map(k => ({
      value: `${k.kind}:${k.version}`, label: `${ENGINES[k.kind]} ${k.version}`, group: profile ? undefined : ENGINES[k.kind],
      hint: k.recommended ? d.engines.recommended : k.installed ? d.engines.installed : k.size ? f.notDownloaded(bytes(k.size)) : undefined
    }))
  ];

  // While it runs here, what it was started with can't change; elsewhere, changes apply when it next opens.
  const status = profile ? data.status[profile.id] : undefined;
  const away = profile ? elsewhere(profile) : null;
  const locked = !!status;

  const pickProxy = (id: string) => { setProxyId(id); setPxNote(null); };
  const pickMode = (m: PxMode) => { setPxMode(m); setPxNote(null); };
  // A pasted proxy joins the library and becomes the profile's choice; undefined when it can't be read.
  async function addPasted(){
    const r = await folio.api<ProxyImport>('POST', `/workspaces/${ws.id}/proxies/import`, { text: paste.trim(), defaultType: 'http' }).catch(() => null);
    if (!r?.proxies.length){ setPxNote({ state: 'bad', text: f.proxyBad }); return undefined; }
    const id = r.proxies[0].id;
    setProxyId(id); setPxMode('saved'); setPaste(''); data.refresh('proxies');
    return id;
  }
  const where = (r: { ip: string | null; geo: CheckResult['geo'] }) => (r.geo ? [r.geo.city, r.geo.countryName].filter(Boolean).join(', ') : r.ip ?? '');
  async function check(){
    const id = pxMode === 'custom' ? paste.trim() && await addPasted() : proxyId;
    if (!id) return;
    setPxNote({ state: 'checking', text: d.common.checking });
    const r: CheckResult = await folio.checkProxy(id);
    const at = f.checkedAt(time(new Date().toISOString(), lang));
    setPxNote(r.ok ? { state: ANSWERED[latencyTone(r.ms)], text: `${f.proxyOk(where(r), r.ms ?? 0)} · ${at}` } : { state: 'down', text: `${f.proxyDown} · ${at}` });
  }

  // Extensions from the library made for this engine.
  const usable = data.extensions.filter(x => x.kernel === kernel);
  const tagList = [...new Set(tags.split(/[,，]/).map(t => t.trim()).filter(Boolean))].slice(0, 10);
  const chosenPx = pxMode === 'saved' ? data.proxies.find(p => p.id === proxyId) : undefined;
  const pxGeo = chosenPx?.lastCheck?.ok ? chosenPx.lastCheck.geo : null;
  const last = chosenPx?.lastCheck;
  // Before a check here, the proxy's last one, with when it was.
  const shownNote = pxNote ?? (last ? { state: 'past' as const, text: `${last.ok ? f.proxyOk(where(last), last.ms ?? 0) : f.proxyDown} · ${f.lastChecked(time(last.checkedAt, lang))}` } : null);
  const proxyOptions: Opt[] = data.proxies.map(p => {
    const st = proxyState(p), c = p.lastCheck;
    return {
      value: p.id, label: `${p.name} · ${p.type.toUpperCase()}`, dot: st === 'ok' ? 'good' as const : st === 'slow' ? 'warn' as const : st === 'down' ? 'bad' as const : 'idle' as const,
      hint: st === 'down' ? d.profiles.noResponse : st === 'unchecked' ? d.profiles.unchecked : [c?.geo?.city ?? c?.geo?.countryName, d.profiles.ms(c?.ms ?? 0)].filter(Boolean).join(' · ')
    };
  });

  // Each field's problem, shown once a save was tried; the first one gets the focus.
  const okSize = (v: string, min: number, max: number) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;
  const problems: [Sec, string, string | null][] = [
    ['basic', 'pf-name', !name.trim() ? f.nameErr : null],
    ['proxy', 'pf-px', (pxMode === 'saved' && !proxyId) || (pxMode === 'custom' && !paste.trim()) ? f.pickErr : null],
    ['fp', 'fp-lang', fpd.langBad ? f.langErr : null],
    ['launch', 'pf-start', startUrl.trim() && !URL_OK.test(startUrl.trim()) ? f.startUrlErr : null],
    ['launch', 'pf-width', windowMode === 'custom' && !(okSize(width, 400, 7680) && okSize(height, 300, 4320)) ? f.windowErr : null]
  ];
  const err = (id: string) => (tried ? problems.find(p => p[1] === id)?.[2] ?? null : null);

  // The form field by field, to count what changed since it opened (the fingerprint counts as one).
  const fields: Record<string, string | boolean | null> = {
    name: name.trim(), groupId: groupId === NEW_GROUP ? `new:${newGroup.trim()}` : groupId, tags: tagList.join(','), ownerId, kernelVersion: enginePick, os,
    proxyId: pxMode === 'none' ? '' : pxMode === 'saved' ? proxyId : `paste:${paste.trim()}`, timezoneOverride: fpd.timezoneOverride, localeOverride: fpd.localeOverride,
    startUrl: startUrl.trim(), window: windowMode === 'custom' ? `custom:${width}x${height}` : windowMode, searchEngine, restoreTabs,
    extensionIds: [...extensionIds].sort().join(','), syncMode, notes: notes.trim()
  };
  const [opened] = useState(fields);
  const changes = Object.keys(fields).filter(k => fields[k] !== opened[k]).length + (fpd.changed ? 1 : 0);
  const requestClose = () => { if (busy || asking) return; if (changes) setAsking(true); else onClose(); };

  // The rail follows the section in view, and a click on it scrolls there (the rail stays on it while it does).
  const scroller = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<Sec>('basic');
  const clickedAt = useRef(0);
  function follow(){
    const box = scroller.current;
    if (!box || Date.now() - clickedAt.current < 700) return;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4){ setAt('launch'); return; }
    setAt(SECS.filter(s => (document.getElementById(`pf-sec-${s}`)?.offsetTop ?? 0) <= box.scrollTop + box.clientHeight / 3).at(-1) ?? 'basic');
  }
  const goTo = (s: Sec) => { clickedAt.current = Date.now(); setAt(s); document.getElementById(`pf-sec-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  async function submit(e: FormEvent){
    e.preventDefault();
    setTried(true);
    const bad = problems.find(p => p[2]);
    if (bad){
      if (bad[0] === 'fp') setFpOpen(true);
      requestAnimationFrame(() => { const el = document.getElementById(bad[1]); el?.scrollIntoView({ block: 'center' }); el?.focus(); });
      return;
    }
    const fingerprint = fpd.value();
    if (!fingerprint) return;
    setBusy(true); setError(null);
    try {
      const px = pxMode === 'none' ? null : pxMode === 'custom' ? await addPasted() : proxyId;
      if (px === undefined) return;
      const group = groupId === NEW_GROUP ? (newGroup.trim() ? await data.ensureGroup(newGroup) : null) : groupId || null;
      const custom = windowMode === 'custom';
      const common = {
        name: name.trim(), groupId: group, proxyId: px, notes: notes.trim() || null, tags: tagList,
        timezoneOverride: fpd.timezoneOverride, localeOverride: fpd.localeOverride,
        extensionIds: extensionIds.filter(id => usable.some(x => x.id === id)), searchEngine, restoreTabs,
        startUrl: startUrl.trim() || null, windowMode, windowWidth: custom ? Number(width) : null, windowHeight: custom ? Number(height) : null,
        ...(manager && (ownerId || profile) ? { ownerId: ownerId || null } : {})
      };
      if (profile && base){
        const ok = await data.patch(base, { ...common, kernelVersion: version, syncMode, ...(fpd.changed ? { fingerprint } : {}) });
        if (!ok){ setBase(profile); setError(f.stale); return; }
        onDone(profile);
      } else {
        const fp = fpd.fp.state === 'ready' ? fpd.fp.kernelVersion : version;
        const p = await folio.api<Profile>('POST', `/workspaces/${ws.id}/profiles`, { ...common, kernel, os, kernelVersion: fp, fingerprint });
        data.refresh('profiles', 'groups');
        onDone(p);
      }
    } catch (x){
      setError(errorText(d, isApiError(x) ? x.code : 'internal'));
    } finally { setBusy(false); }
  }

  const sec = (s: Sec, children: ReactNode, side?: ReactNode) => (
    <section className="pf-sec" id={`pf-sec-${s}`} aria-labelledby={`pf-h-${s}`}>
      <div className="sec-row"><h3 id={`pf-h-${s}`}>{f.sections[s]}</h3>{side}</div>
      {children}
    </section>
  );
  const req = <span className="req" aria-hidden="true">*</span>;
  const opt = <small className="opt">{f.optional}</small>;
  const lockNote = locked && <p className="lock-note"><Icon name="stop" />{f.lockedNote}</p>;
  const F = d.fp, facts = fpd.facts;
  const followed = (own: string | null, seen: string | undefined) => own ?? seen ?? (pxMode === 'none' ? d.detail.hostTz : f.follow);

  return (<>
    <Modal wide title={edit ? f.editTitle : f.newTitle} sub={profile && `${profile.name} · #${String(profile.number).padStart(4, '0')}`} closeLabel={d.common.close} onClose={requestClose} foot={<>
      {edit
        ? changes > 0 && <span className="pf-dirty"><span className="d warn" aria-hidden="true" /><b>{f.unsaved}</b>{f.changedN(changes)}</span>
        : <span className="hint">{f.createHint}</span>}
      <span className="sp" />
      <button className="btn btn-secondary" type="button" onClick={requestClose}>{d.common.cancel}</button>
      <button className="btn btn-primary" type="submit" form="profile-form" disabled={busy || fpd.fp.state !== 'ready' || (edit && !changes)}>{edit ? f.save : f.create}</button>
    </>}>
      {profile && (
        <div className={`pf-state${locked ? ' run' : ''}`} role="status">
          {status ? <span className="dot-st run">{d.profiles.st.running}</span> : away ? <span className="dot-st away">{d.profiles.inUseOn(away.deviceName ?? away.email)}</span> : <span className="dot-st idle">{d.profiles.tabs.stopped}</span>}
          <span>{locked ? f.runningNote : f.nextOpen}</span>
          {status?.state === 'running' && <><span className="sp" /><button type="button" className="btn btn-sm btn-secondary" onClick={() => void folio.stopProfile(profile.id)}><Icon name="stop" />{f.stopNow}</button></>}
        </div>
      )}
      <form className="pf" id="profile-form" onSubmit={submit} noValidate>
        <nav className="pf-rail" aria-label={f.sectionsLabel}>
          {SECS.map((s, i) => (
            <button key={s} type="button" aria-current={at === s ? 'step' : undefined} onClick={() => goTo(s)}>
              <span className="n">{i + 1}</span>{f.sections[s]}
              {tried && problems.some(p => p[0] === s && p[2]) && <span className="d bad" aria-label={f.hasProblem} />}
            </button>
          ))}
        </nav>
        <div className="pf-scroll" ref={scroller} onScroll={follow}>
          {error && <p className="notice error" role="alert">{error}</p>}

          {sec('basic', <>
            <div className="row2">
              <div className="field">
                <label htmlFor="pf-name">{f.name}{req}</label>
                <input id="pf-name" type="text" autoComplete="off" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus required aria-invalid={!!err('pf-name')} />
                {err('pf-name') && <p className="err">{err('pf-name')}</p>}
              </div>
              <div className="field">
                <span className="label" id="pf-group">{f.group}</span>
                <Select labelledBy="pf-group" value={groupId} onChange={setGroupId} searchPh={f.searchPh}
                  options={[{ value: '', label: f.noGroup }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const })), { value: NEW_GROUP, label: f.newGroup }]} />
                {groupId === NEW_GROUP && <input aria-label={f.newGroupPh} placeholder={f.newGroupPh} value={newGroup} onChange={e => setNewGroup(e.target.value)} maxLength={80} />}
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <span className="label" id="pf-engine">{f.engine}{req}</span>
                <Select labelledBy="pf-engine" value={engine} placeholder="—" required disabled={locked} options={engineOpts}
                  onChange={v => { const k = v.split(':')[0] as KernelKind; if (k !== kernel) fpd.refit(k, os); setEnginePick(v); }} />
              </div>
              <div className="field">
                <span className="label" id="pf-os">{f.os}{req}</span>
                <div className="seg fill" role="group" aria-labelledby="pf-os">
                  {(['windows', 'macos', 'linux'] as const).map(o => (
                    <button key={o} type="button" aria-pressed={os === o} disabled={edit && os !== o} onClick={() => { fpd.refit(kernel, o); setOs(o); }}><Icon name={o} />{d.os[o]}</button>
                  ))}
                </div>
              </div>
            </div>
            {lockNote}
            <div className="row2">
              <div className="field">
                <label htmlFor="pf-tags">{f.tags}{opt}</label>
                <input id="pf-tags" type="text" placeholder={f.tagsPh} value={tags} onChange={e => setTags(e.target.value)} autoComplete="off" />
              </div>
              {manager && (
                <SelectField label={f.owner} value={ownerId} onChange={setOwnerId} searchPh={f.searchPh}
                  options={[{ value: '', label: edit ? d.profiles.unassigned : d.team.you }, ...data.members.map(m => ({ value: m.userId, label: m.email }))]} />
              )}
            </div>
          </>)}

          {sec('proxy', <>
            {lockNote}
            <div className="field">
              <span className="label" id="pf-pxmode">{f.proxyKind}</span>
              <div className="radios" role="radiogroup" aria-labelledby="pf-pxmode">
                {(['saved', 'custom', 'none'] as const).filter(m => m !== 'custom' || manager).map(m => (
                  <label key={m} className="check-row"><input type="radio" name="pf-px" checked={pxMode === m} disabled={locked} onChange={() => pickMode(m)} />{f.proxyMode[m]}</label>
                ))}
              </div>
            </div>
            {pxMode !== 'none' && (
              <div className="field">
                <span className="label" id="pf-px-l">{pxMode === 'saved' ? f.pickProxy : f.proxyMode.custom}{req}</span>
                <div className="pxcheck">
                  {pxMode === 'saved'
                    ? <Select id="pf-px" labelledBy="pf-px-l" placeholder={f.pickProxy} value={proxyId} onChange={pickProxy} options={proxyOptions} searchPh={f.searchPh} empty={d.profiles.emptyMatch} required disabled={locked} />
                    : <input id="pf-px" className="mono-in" aria-labelledby="pf-px-l" placeholder={f.pastePh} value={paste} onChange={e => { setPaste(e.target.value); setPxNote(null); }} spellCheck={false} autoComplete="off" required disabled={locked} />}
                  <button className="btn btn-secondary" type="button" onClick={check} disabled={locked || pxNote?.state === 'checking' || (pxMode === 'saved' ? !proxyId : !paste.trim())}>{d.proxies.test}</button>
                </div>
                {err('pf-px') && !pxNote && <p className="err">{err('pf-px')}</p>}
                {shownNote && (
                  <p className={`pxres ${shownNote.state}`} aria-live="polite">
                    {shownNote.state === 'checking' ? <span className="spin" aria-hidden="true" /> : <Icon name={shownNote.state === 'past' ? 'clock' : shownNote.state === 'down' || shownNote.state === 'bad' ? 'alert' : 'check'} />}
                    <span>{shownNote.text}</span>
                  </p>
                )}
              </div>
            )}
          </>)}

          {sec('fp', <>
            {lockNote}
            <div className="fp-sum" data-testid="fingerprint">
              {fpd.fp.state === 'need-firefox' ? (
                <div className="fp-need">
                  <p className="hint">{f.firefoxMissing}</p>
                  {ffProgress && !ffProgress.error
                    ? <p className="hint">{f.downloading(percent(ffProgress))}</p>
                    : <button className="btn btn-secondary btn-sm" type="button" onClick={() => void data.install('firefox', version).then(ok => { if (ok) fpd.retry(); })}>{f.download}{chosen?.size ? ` · ${bytes(chosen.size)}` : ''}</button>}
                </div>
              ) : <>
                <dl>
                  <div><dt>{F.screen}</dt><dd>{facts ? facts.screen ?? F.screenHost : '…'}</dd></div>
                  <div><dt>{f.lang}</dt><dd>{followed(fpd.localeOverride, pxGeo?.locale)}</dd></div>
                  <div><dt>{f.tz}</dt><dd>{followed(fpd.timezoneOverride, pxGeo?.timezone)}</dd></div>
                  <div><dt>{F.cores}</dt><dd>{fpd.cores ?? '…'}</dd></div>
                </dl>
                {fpd.fp.state === 'loading' && <span className="spin" aria-hidden="true" />}
                {fpd.fp.state === 'error' && <p className="err">{f.fpErr}</p>}
                <button type="button" className="linkish" aria-expanded={fpOpen} onClick={() => setFpOpen(o => !o)}>{fpOpen ? f.fpHide : f.fpEdit}</button>
              </>}
            </div>
            {fpOpen && <>
              <div className="row2"><ScreenField d={d} f={fpd} disabled={locked} /><GpuField d={d} f={fpd} disabled={locked} /></div>
              <div className="row2">
                <ZoneField d={d} f={fpd} geo={pxGeo} proxied={pxMode !== 'none'} disabled={locked} />
                <LangField d={d} f={fpd} geo={pxGeo} proxied={pxMode !== 'none'} disabled={locked} error={err('fp-lang')} />
              </div>
              <div className="row2"><WebrtcField d={d} f={fpd} disabled={locked} /><CanvasField d={d} f={fpd} disabled={locked} /></div>
              <div className="row2"><CoresField d={d} f={fpd} disabled={locked} /></div>
            </>}
            {fpd.regenerated && <p className="hint">{f.regenWarn}</p>}
          </>, <button className="btn btn-sm btn-secondary" type="button" onClick={fpd.randomize} disabled={locked || fpd.fp.state === 'loading' || fpd.fp.state === 'need-firefox'}><Icon name="refresh" />{F.random}</button>)}

          {sec('launch', <>
            <div className="field">
              <label htmlFor="pf-start">{f.startUrl}{opt}</label>
              <input id="pf-start" type="url" placeholder="https://example.com" value={startUrl} onChange={e => setStartUrl(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!!err('pf-start')} />
              {err('pf-start') ? <p className="err">{err('pf-start')}</p> : <p className="hint">{f.startUrlHint}</p>}
            </div>
            <div className="field">
              <span className="label" id="pf-window">{f.window}</span>
              <div className="radios" role="radiogroup" aria-labelledby="pf-window">
                {(['default', 'custom', 'maximized'] as const).map(m => (
                  <label key={m} className="check-row"><input type="radio" name="pf-win" checked={windowMode === m} onChange={() => setWindowMode(m)} />{f.windowModes[m]}</label>
                ))}
              </div>
              {windowMode === 'custom' && (
                <div className="win-size">
                  <label htmlFor="pf-width">{f.width}</label>
                  <span className="unit"><input id="pf-width" inputMode="numeric" value={width} onChange={e => setWidth(e.target.value.trim())} aria-invalid={!!err('pf-width')} /><span aria-hidden="true">px</span></span>
                  <label htmlFor="pf-height">{f.height}</label>
                  <span className="unit"><input id="pf-height" inputMode="numeric" value={height} onChange={e => setHeight(e.target.value.trim())} aria-invalid={!!err('pf-width')} /><span aria-hidden="true">px</span></span>
                </div>
              )}
              {err('pf-width') ? <p className="err">{err('pf-width')}</p> : <p className="hint">{f.windowHint}</p>}
            </div>
            <div className="row2">
              <SelectField label={d.browser.search} value={searchEngine} onChange={v => setSearchEngine(v as SearchEngine)}
                options={SEARCH_IDS.map(id => ({ value: id, label: d.browser.name(id), ...(id !== 'none' ? { img: SEARCH_LOGOS[id] } : {}) }))} />
              <div className="field pf-switch"><Switch label={d.browser.restore} checked={restoreTabs} onChange={setRestoreTabs} /></div>
            </div>
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
            {edit && (
              <SelectField label={f.sync} value={syncMode} onChange={v => setSyncMode(v as 'cloud' | 'local')} hint={f.syncHelp}
                options={[{ value: 'cloud', label: f.syncCloud }, { value: 'local', label: f.syncLocal }]} />
            )}
            <div className="field">
              <label htmlFor="pf-notes">{f.notes}{opt}</label>
              <span className="counted">
                <textarea id="pf-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
                <small className="count">{notes.length} / 2000</small>
              </span>
            </div>
          </>)}
        </div>
      </form>
    </Modal>
    {/* Beside the form, not in it: the form's box would clip it. */}
    {asking && (
      <Modal icon="alert" title={f.discardTitle} closeLabel={d.common.close} onClose={() => setAsking(false)} foot={<>
        <button type="button" className="btn btn-secondary" onClick={() => setAsking(false)} autoFocus>{f.keepEditing}</button>
        <button type="button" className="btn btn-danger solid" onClick={onClose}>{f.discard}</button>
      </>}><p>{f.discardNote}</p></Modal>
    )}
  </>);
}
