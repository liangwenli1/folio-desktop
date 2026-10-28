// New profile and edit profile: five sections (basics, proxy, fingerprint, extensions, how it opens) beside a rail that
// moves between them. A new profile starts from the workspace's defaults and gets its fingerprint from the main process for
// the chosen engine and system; an edit keeps it unless a new one is drawn. While the profile runs here, what it was
// started with (engine, system, proxy, fingerprint) waits until it is stopped, and closing with changes asks first.
import { Fragment, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { CheckResult, KernelKind, Os } from '@shared/bridge';
import { SEARCH_IDS, type SearchEngine } from '@shared/search';
import { MANAGE, can, folio, isApiError, type Extension, type Profile, type ProxyImport, type Workspace } from './api';
import { time } from './Activity';
import { ENGINES, latencyTone, proxyState } from './checks';
import { kernelKey, type WorkspaceData } from './data';
import { errorText, type Dict, type Lang } from './i18n';
import { Cancel, ExtIcon, Icon, Modal, Switch, bytes, percent, useHeld } from './ui';
import { ExtSource, addToLibrary, extReady, type ExtFrom } from './Extensions';
import { OsLogo, SEARCH_LOGOS } from './Flag';
import { Select, SelectField, groupOpts, ownerOpts, type Opt } from './Select';
import { elsewhere } from './ProfileDetail';
import { CanvasField, CoresField, GpuField, LangField, ScreenField, WebrtcField, ZoneField, useFingerprint } from './Fingerprint';

interface Props { d: Dict; lang: Lang; ws: Workspace; meId: string; data: WorkspaceData; profile?: Profile; defaultGroup: string | null; onClose(): void; onDone(p: Profile): void }

const NEW_GROUP = '__new';
const URL_OK = /^https?:\/\/\S+$/;
type Sec = 'basic' | 'proxy' | 'fp' | 'ext' | 'launch';
const SECS: Sec[] = ['basic', 'proxy', 'fp', 'ext', 'launch'];
// A check that got through is coloured by its latency: 'ok', 'warn' (slow), 'slow' (very slow); 'bad' is a line that
// couldn't be read; 'past' is the proxy's last check from before this form opened.
type PxNote = { state: 'checking' | 'ok' | 'warn' | 'slow' | 'down' | 'bad' | 'past'; text: string };
const ANSWERED = { good: 'ok', warn: 'warn', bad: 'slow' } as const;
// A proxy from the library, a new one pasted in (it joins the library), or none.
type PxMode = 'saved' | 'custom' | 'none';
type Win = NonNullable<Profile['windowMode']>;
// An extension to pick: one from the library, or one just added from the form (its version comes with the library).
type Pickable = Pick<Extension, 'id' | 'name' | 'kernel'> & Partial<Pick<Extension, 'version' | 'icon'>>;
const NO_SOURCE: ExtFrom = { how: 'link', link: '', file: null };
// A time zone breaks only after its slashes (America/ Los_Angeles), never inside a word.
const zoneBreaks = (tz: string) => tz.split('/').map((part, i) => <Fragment key={i}>{i > 0 && <>/<wbr /></>}{part}</Fragment>);

export function ProfileForm({ d, lang, ws, meId, data, profile, defaultGroup, onClose, onDone }: Props){
  // The version this edit is based on. Live updates do not move it, so a save over someone else's change is
  // refused once; after that it builds on their version and replaces it.
  const [base, setBase] = useState(profile);
  const f = d.form, edit = !!profile, set = ws.settings;
  const manager = can(data.role, MANAGE);
  const savedProxy = !edit && set.defaultProxyId && data.proxies.some(p => p.id === set.defaultProxyId) ? set.defaultProxyId : '';
  const [name, setName] = useState(profile?.name ?? f.defaultName(data.profiles.length + 1));
  const [groupId, setGroupId] = useState(profile ? profile.groupId ?? '' : defaultGroup ?? set.defaultGroupId ?? '');
  const [newGroup, setNewGroup] = useState('');
  // 'kind:version' once picked; a new profile otherwise gets the workspace's default engine, or the recommended one.
  const [enginePick, setEnginePick] = useState(profile ? `${profile.kernel}:${profile.kernelVersion}` : '');
  const [os, setOs] = useState<Os>(profile?.os ?? 'windows');
  const [proxyId, setProxyId] = useState(profile?.proxyId ?? savedProxy);
  const [pxMode, setPxMode] = useState<PxMode>((profile ? profile.proxyId : data.proxies.length) ? 'saved' : 'none');
  // Whoever administers the workspace chooses who it is assigned to; a new profile goes to whoever makes it.
  const [ownerId, setOwnerId] = useState(profile ? profile.ownerId ?? '' : meId);
  const [paste, setPaste] = useState('');
  const [pxNote, setPxNote] = useState<PxNote | null>(null);
  const [tags, setTags] = useState(profile?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [syncMode, setSyncMode] = useState(profile?.syncMode ?? 'cloud');
  const [extensionIds, setExtensionIds] = useState<string[]>(profile?.extensionIds ?? []);
  // The ones it had when the form opened lead the list (it doesn't reorder as boxes are ticked).
  const [firstIds] = useState(extensionIds);
  const [extQ, setExtQ] = useState('');
  const [adding, setAdding] = useState<ExtFrom>(NO_SOURCE);
  const [added, setAdded] = useState<Pickable[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [searchEngine, setSearchEngine] = useState<SearchEngine>(profile?.searchEngine ?? 'none');
  const [restoreTabs, setRestoreTabs] = useState(profile?.restoreTabs ?? true);
  const [startUrl, setStartUrl] = useState(profile?.startUrl ?? '');
  const [windowMode, setWindowMode] = useState<Win>(profile?.windowMode ?? 'default');
  const [width, setWidth] = useState(String(profile?.windowWidth ?? 1280));
  const [height, setHeight] = useState(String(profile?.windowHeight ?? 800));
  const [fpOpen, setFpOpen] = useState(false);
  // Asked: whether to move a saved profile to another system.
  const [osAsk, setOsAsk] = useState<Os | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Extensions from the library made for this engine, with the ones added here until the library has them.
  const usable: Pickable[] = [...data.extensions, ...added.filter(x => !data.extensions.some(e => e.id === x.id))].filter(x => x.kernel === kernel);
  const needle = extQ.trim().toLowerCase();
  const lead = (x: Pickable) => (firstIds.includes(x.id) || added.some(a => a.id === x.id) ? 0 : 1);
  const extList = usable.filter(x => !needle || x.name.toLowerCase().includes(needle)).sort((a, b) => lead(a) - lead(b) || a.name.localeCompare(b.name));
  const extPicked = extensionIds.filter(id => usable.some(x => x.id === id)).length;
  // A new one goes into the library and into this profile.
  async function addExt(){
    setAddBusy(true); setAddErr(null);
    try {
      const r = await addToLibrary(ws.id, data, kernel, adding);
      setAdded(a => [...a, { id: r.id, name: r.name, kernel }]);
      setExtensionIds(ids => [...ids, r.id]);
      setAdding({ ...NO_SOURCE, how: adding.how });
    } catch (x){ setAddErr(errorText(d, isApiError(x) ? x.code : 'internal')); } finally { setAddBusy(false); }
  }
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
  const goTo = (s: Sec) => { clickedAt.current = Date.now(); setAt(s); document.getElementById(`pf-sec-${s}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };

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
        ...(manager ? { ownerId: ownerId || null } : {})
      };
      if (profile && base){
        const ok = await data.patch(base, { ...common, kernelVersion: version, syncMode, ...(os !== profile.os ? { os } : {}), ...(fpd.changed ? { fingerprint } : {}) });
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
  // While it runs here, its engine, system, proxy and fingerprint say why they wait, with Stop.
  const { held, ask } = useHeld(profile?.id ?? '', status?.state === 'running', locked);
  const pickOs = (o: Os) => { if (o === os) return; if (edit){ setOsAsk(o); return; } fpd.refit(kernel, o); setOs(o); };
  const F = d.fp, facts = fpd.facts;
  const followed = (own: string | null, seen: string | undefined) => own ?? seen ?? (pxMode === 'none' ? d.detail.hostTz : f.follow);

  return (
    <Modal wide title={edit ? f.editTitle : f.newTitle} sub={profile && `${profile.name} · #${String(profile.number).padStart(4, '0')}`} onClose={onClose} busy={busy} dirty={changes > 0} foot={<>
      {/* Where it stands, at the foot's left (the user, 10-28): stopped, and when changes apply; or running, with Stop. */}
      {profile ? (
        <span className={`pf-state${locked ? ' run' : ''}`} role="status">
          {status ? <span className="dot-st run">{d.profiles.st.running}</span> : away ? <span className="dot-st away">{d.profiles.inUseOn(away.deviceName ?? away.email)}</span> : <span className="dot-st stop">{d.profiles.tabs.stopped}</span>}
          {!locked && <span>{f.nextOpen}</span>}
          {status?.state === 'running' && <button type="button" className="btn btn-sm btn-secondary" onClick={() => void folio.stopProfile(profile.id)}><Icon name="stop" />{f.stopNow}</button>}
        </span>
      ) : <span className="hint">{f.createHint}</span>}
      <span className="sp" />
      {edit && changes > 0 && <span className="pf-dirty"><span className="d warn" aria-hidden="true" /><b>{f.unsaved}</b>{f.changedN(changes)}</span>}
      <Cancel />
      <button className="btn btn-primary" type="submit" form="profile-form" aria-busy={busy || undefined} disabled={busy || fpd.fp.state !== 'ready' || (edit && !changes)}>{edit ? f.save : f.create}</button>
    </>}>
      <form className="pf" id="profile-form" onSubmit={submit} noValidate>
        <nav className="pf-rail" aria-label={f.sectionsLabel}>
          {SECS.map((s, i) => (
            <button key={s} type="button" aria-current={at === s ? 'step' : undefined} onClick={() => goTo(s)}>
              <span className="n">{i + 1}{tried && problems.some(p => p[0] === s && p[2]) && <span className="d bad" aria-label={f.hasProblem} />}</span>{f.sections[s]}
            </button>
          ))}
        </nav>
        <div className="pf-scroll" ref={scroller} onScroll={follow}>
          {error && <p className="notice error" role="alert">{error}</p>}

          {sec('basic', <>
            <div className="row2">
              <div className="field">
                <label htmlFor="pf-name">{f.name}{req}</label>
                <input id="pf-name" type="text" autoComplete="off" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus required aria-invalid={!!err('pf-name')} aria-describedby={err('pf-name') ? 'pf-name-err' : undefined} />
                {err('pf-name') && <p className="err" id="pf-name-err">{err('pf-name')}</p>}
              </div>
              <div className="field">
                <span className="label" id="pf-group">{f.group}</span>
                <Select labelledBy="pf-group" value={groupId} onChange={setGroupId} search searchPh={f.searchPh} loading={!data.loaded.has('groups')} failed={data.loadFailed.has('groups')} onRetry={() => data.refresh('groups')}
                  options={[{ value: '', label: f.noGroup }, ...groupOpts(data.groups), { value: NEW_GROUP, label: f.newGroup }]} />
                {groupId === NEW_GROUP && <input aria-label={f.newGroupPh} placeholder={f.newGroupPh} value={newGroup} onChange={e => setNewGroup(e.target.value)} maxLength={80} />}
              </div>
            </div>
            <div className="row2" {...held}>
              <div className="field">
                <span className="label" id="pf-engine">{f.engine}{req}</span>
                <Select labelledBy="pf-engine" value={engine} placeholder="—" required options={engineOpts} note={profile ? f.kindFixed(ENGINES[profile.kernel === 'chromium' ? 'firefox' : 'chromium']) : undefined}
                  onChange={v => { const k = v.split(':')[0] as KernelKind; if (k !== kernel) fpd.refit(k, os); setEnginePick(v); }} />
              </div>
              <div className="field">
                <span className="label" id="pf-os">{f.os}{req}</span>
                <div className="seg fill" role="group" aria-labelledby="pf-os">
                  {(['windows', 'macos', 'linux'] as const).map(o => (
                    <button key={o} type="button" aria-pressed={os === o} onClick={() => pickOs(o)}><OsLogo os={o} />{d.os[o]}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="pf-tags">{f.tags}{opt}</label>
                <input id="pf-tags" type="text" placeholder={f.tagsPh} value={tags} onChange={e => setTags(e.target.value)} autoComplete="off" />
              </div>
              {manager && (
                <SelectField label={f.owner} value={ownerId} onChange={setOwnerId} search searchPh={f.searchPh} loading={!data.loaded.has('members')} failed={data.loadFailed.has('members')} onRetry={() => data.refresh('members')}
                  options={ownerOpts(d, data.members, meId)} />
              )}
            </div>
          </>)}

          {sec('proxy', <div className="held" {...held}>
            <div className="field">
              <span className="label" id="pf-pxmode">{f.proxyKind}</span>
              <div className="radios" role="radiogroup" aria-labelledby="pf-pxmode">
                {(['saved', 'custom', 'none'] as const).filter(m => m !== 'custom' || manager).map(m => (
                  <label key={m} className="check-row"><input type="radio" name="pf-px" checked={pxMode === m} onChange={() => pickMode(m)} />{f.proxyMode[m]}</label>
                ))}
              </div>
            </div>
            {pxMode !== 'none' && (
              <div className="field">
                <span className="label" id="pf-px-l">{pxMode === 'saved' ? f.pickProxy : f.proxyMode.custom}{req}</span>
                <div className="pxcheck">
                  {pxMode === 'saved'
                    ? <Select id="pf-px" labelledBy="pf-px-l" placeholder={f.pickProxy} value={proxyId} onChange={pickProxy} options={proxyOptions} search searchPh={f.searchPh} loading={!data.loaded.has('proxies')} failed={data.loadFailed.has('proxies')} onRetry={() => data.refresh('proxies')} required />
                    : <input id="pf-px" className="mono-in" aria-labelledby="pf-px-l" placeholder={f.pastePh} value={paste} onChange={e => { setPaste(e.target.value); setPxNote(null); }} spellCheck={false} autoComplete="off" required />}
                  <button className="btn btn-secondary" type="button" onClick={check} disabled={pxNote?.state === 'checking' || (pxMode === 'saved' ? !proxyId : !paste.trim())}
                    title={(pxMode === 'saved' ? !proxyId : !paste.trim()) ? f.pickProxyFirst : undefined}>{d.proxies.test}</button>
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
          </div>)}

          {sec('fp', <>
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
                  <div><dt>{f.tz}</dt><dd>{zoneBreaks(followed(fpd.timezoneOverride, pxGeo?.timezone))}</dd></div>
                  <div><dt>{F.cores}</dt><dd>{fpd.cores ?? '…'}</dd></div>
                </dl>
                {fpd.fp.state === 'loading' && <span className="spin" aria-hidden="true" />}
                {fpd.fp.state === 'error' && <p className="err">{f.fpErr}</p>}
                <button type="button" className="linkish" aria-expanded={fpOpen} onClick={() => setFpOpen(o => !o)}>{fpOpen ? f.fpHide : f.fpEdit}</button>
              </>}
            </div>
            {fpOpen && <div className="held" {...held}>
              <div className="row2"><ScreenField d={d} f={fpd} /><GpuField d={d} f={fpd} /></div>
              <div className="row2">
                <ZoneField d={d} f={fpd} geo={pxGeo} proxied={pxMode !== 'none'} />
                <LangField d={d} f={fpd} geo={pxGeo} proxied={pxMode !== 'none'} error={err('fp-lang')} />
              </div>
              <div className="row2"><WebrtcField d={d} f={fpd} /><CanvasField d={d} f={fpd} /></div>
              <div className="row2"><CoresField d={d} f={fpd} /></div>
            </div>}
            {fpd.regenerated && <p className="hint">{f.regenWarn}</p>}
          </>, <span className="held" {...held}><button className="btn btn-sm btn-secondary" type="button" onClick={fpd.randomize} disabled={fpd.fp.state === 'loading' || fpd.fp.state === 'need-firefox'}><Icon name="refresh" />{F.random}</button></span>)}

          {/* The extensions it opens with (the user, 10-28): picked from the library, which can be searched, or added to it
              here from an address or a file and picked at once; adding is for the owner and admins. */}
          {sec('ext', <>
            {usable.length > 0 && (
              <label className="search"><Icon name="search" /><span className="sr">{f.extSearch}</span>
                <input type="search" placeholder={f.extSearch} value={extQ} onChange={e => setExtQ(e.target.value)} autoComplete="off" /></label>
            )}
            {!usable.length ? <p className="hint">{f.noExtensions(ENGINES[kernel])}</p>
              : !extList.length ? <p className="hint">{f.extNone}</p>
              : <ul className="ext-opts" aria-label={f.sections.ext}>{extList.map(x => (
                  <li key={x.id}><label className="check-row">
                    <input type="checkbox" checked={extensionIds.includes(x.id)} onChange={e => setExtensionIds(ids => e.target.checked ? [...ids, x.id] : ids.filter(i => i !== x.id))} />
                    <ExtIcon src={x.icon} /><span className="ext-n">{x.name}</span>{x.version && <span className="mono muted">{x.version}</span>}
                  </label></li>
                ))}</ul>}
            {manager ? (
              <div className="ext-add">
                <h4>{d.extensions.addTitle}</h4>
                <ExtSource d={d} kernel={kernel} value={adding} onChange={v => { setAdding(v); setAddErr(null); }} />
                {addErr && <p className="err" role="alert">{addErr}</p>}
                <div><button type="button" className="btn btn-secondary btn-sm" disabled={!extReady(adding) || addBusy} aria-busy={addBusy || undefined} onClick={() => void addExt()}>
                  {addBusy ? (adding.how === 'link' ? d.extensions.fetching : d.extensions.uploading) : f.extAdd}</button></div>
              </div>
            ) : <p className="hint">{f.extAddNote}</p>}
          </>, usable.length > 0 && <span className="hint">{f.extPicked(extPicked)}</span>)}

          {sec('launch', <>
            <div className="field">
              <label htmlFor="pf-start">{f.startUrl}{opt}</label>
              <input id="pf-start" type="url" placeholder="https://example.com" value={startUrl} onChange={e => setStartUrl(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!!err('pf-start')} aria-describedby="pf-start-msg" />
              {err('pf-start') ? <p className="err" id="pf-start-msg">{err('pf-start')}</p> : <p className="hint" id="pf-start-msg">{f.startUrlHint}</p>}
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
                  <span className="unit"><input id="pf-width" inputMode="numeric" value={width} onChange={e => setWidth(e.target.value.trim())} aria-invalid={!!err('pf-width')} aria-describedby="pf-window-msg" /><span aria-hidden="true">px</span></span>
                  <label htmlFor="pf-height">{f.height}</label>
                  <span className="unit"><input id="pf-height" inputMode="numeric" value={height} onChange={e => setHeight(e.target.value.trim())} aria-invalid={!!err('pf-width')} aria-describedby="pf-window-msg" /><span aria-hidden="true">px</span></span>
                </div>
              )}
              {err('pf-width') ? <p className="err" id="pf-window-msg">{err('pf-width')}</p> : <p className="hint" id="pf-window-msg">{f.windowHint}</p>}
            </div>
            <div className="row2">
              <SelectField label={d.browser.search} value={searchEngine} onChange={v => setSearchEngine(v as SearchEngine)}
                options={SEARCH_IDS.map(id => ({ value: id, label: d.browser.name(id), ...(id !== 'none' ? { img: SEARCH_LOGOS[id] } : {}) }))} />
              <div className="field pf-switch"><Switch label={d.browser.restore} checked={restoreTabs} onChange={setRestoreTabs} /></div>
            </div>
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
      {ask}
      {osAsk && (
        <Modal kind="warn" title={f.osTitle} onClose={() => setOsAsk(null)} foot={<>
          <Cancel />
          <button type="button" className="btn btn-primary" onClick={() => { fpd.refit(kernel, osAsk); setOs(osAsk); setOsAsk(null); }}>{f.osChange}</button>
        </>}><p>{f.osBody(d.os[osAsk])}</p></Modal>
      )}
    </Modal>
  );
}
