// Engines: the version new profiles start with and how updates arrive, profiles on older versions moved to the
// recommended one in one go, then every version of both engines in one table — all of them, the ones downloaded here,
// or the ones newer than what is downloaded — with a version's notes beside it. Platform admins also upload versions,
// pick the recommended one (with a note) and take versions off the catalog.
import { useEffect, useState } from 'react';
import type { KernelKind, KernelProgress, KernelSettings, KernelState, KernelUpload } from '@shared/bridge';
import { folio, isApiError, type Kernel, type Profile, type Workspace } from './api';
import { kernelKey, type WorkspaceData } from './data';
import { ENGINES } from './checks';
import { errorText, type Dict } from './i18n';
import { Select, SelectField, type Opt } from './Select';
import { EngineLogo } from './Flag';
import { Act, Cancel, Empty, Flt, Icon, Modal, MoreMenu, PanelEdge, Progress, SkelRows, Switch, Tabs, bytes, percent, useFail, useToast } from './ui';

const KINDS: KernelKind[] = ['chromium', 'firefox'];
const PLATFORMS = ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'];
const FAMILIES = ['win', 'mac', 'linux'] as const;
type Family = (typeof FAMILIES)[number];
type Tab = 'all' | 'installed' | 'updates';
const familyOf = (platform: string): Family => (platform.startsWith('win') ? 'win' : platform.startsWith('darwin') ? 'mac' : 'linux');
const major = (version: string) => version.split('.')[0];
const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');
// Versions not downloaded yet that are newer than the newest one downloaded here (the list is newest first).
const newer = (list: KernelState[]) => list.filter((k, i) => k.available && !k.installed && list.slice(i + 1).some(x => x.kind === k.kind && x.installed));

// One version as the page shows it: what this computer knows of it (`k`) and, for platform admins, its packages.
interface Row {
  kind: KernelKind; version: string; key: string; label: string; k?: KernelState; pkgs: Kernel[]; pr?: KernelProgress;
  recommended: boolean; isDefault: boolean; platforms: string[]; size: number | null; added: string | null; note: string | null;
  downloading: boolean; here: Profile[]; everywhere: number; busy: boolean;
}

export function EnginesPage({ d, ws, data, admin, manager, onShowProfiles }: {
  d: Dict; ws: Workspace; data: WorkspaceData; admin: boolean; manager: boolean; onShowProfiles(ids: string[]): void;
}){
  const E = d.engines;
  const toast = useToast(), fail = useFail();
  const [catalog, setCatalog] = useState<Kernel[]>([]);
  const [uploading, setUploading] = useState(false);
  const [retiring, setRetiring] = useState<Kernel[] | null>(null);
  const [recommending, setRecommending] = useState<Kernel | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [usage, setUsage] = useState<{ path: string; bytes: number } | null>(null);
  const [settings, setSettings] = useState<KernelSettings | null>(null);
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [system, setSystem] = useState<'all' | Family>('all');
  // The version whose notes show beside the table: the default one until another is picked, none once closed.
  const [cur, setCur] = useState<string | null>(null);
  // Admins manage every system's packages; everyone else needs only this computer's list.
  const loadCatalog = () => { if (admin) void folio.api<{ kernels: Kernel[] }>('GET', '/kernels').then(r => setCatalog(r.kernels), fail); };
  useEffect(loadCatalog, [admin]);
  const installed = data.kernels.filter(k => k.installed).map(k => kernelKey(k.kind, k.version)).join();
  useEffect(() => { void folio.kernelUsage().then(setUsage); }, [installed]);
  useEffect(() => { void folio.kernelSettings().then(setSettings); }, []);
  const reload = () => { void data.reloadKernels(); loadCatalog(); };

  const profiles = data.profiles;
  const usedHere = (kind: KernelKind, version: string) => profiles.filter(p => p.kernel === kind && p.kernelVersion === version);
  // Versions downloaded here that nothing here uses and that aren't recommended: what a clean-up deletes.
  const unused = data.kernels.filter(k => k.installed && !k.recommended && !usedHere(k.kind, k.version).length);
  const unusedSize = unused.reduce((n, k) => n + (k.size ?? 0), 0);
  // Profiles on an older version than the recommended one, by engine; running ones change once they stop.
  const outdated = KINDS.flatMap(kind => {
    const rec = data.kernels.find(k => k.kind === kind && k.recommended);
    const old = rec ? profiles.filter(p => p.kernel === kind && p.kernelVersion !== rec.version) : [];
    return rec && old.length ? [{ kind, rec: rec.version, old, idle: old.filter(p => !data.status[p.id]), from: [...new Set(old.map(p => major(p.kernelVersion)))].join(', ') }] : [];
  });
  // The version new profiles start with: the workspace's choice, else the recommended version of its engine.
  const set = ws.settings, defKind = set.defaultKernel ?? 'chromium';
  const defVersion = set.defaultKernelVersion ?? (data.kernels.find(k => k.kind === defKind && k.recommended) ?? data.kernels.find(k => k.kind === defKind && k.available))?.version;
  const defValue = `${defKind}:${set.defaultKernelVersion ?? ''}`;
  const defOpts: Opt[] = KINDS.flatMap(kind => {
    const avail = data.kernels.filter(k => k.kind === kind && k.available);
    return avail.length ? [
      { value: `${kind}:`, label: E.defaultOf(ENGINES[kind]), hint: avail.find(k => k.recommended)?.version, group: ENGINES[kind] },
      ...avail.map(k => ({ value: `${kind}:${k.version}`, label: `${ENGINES[kind]} ${k.version}`, group: ENGINES[kind] }))
    ] : [];
  });
  if (!defOpts.some(o => o.value === defValue)) defOpts.unshift({ value: defValue, label: set.defaultKernelVersion ? `${ENGINES[defKind]} ${set.defaultKernelVersion}` : E.defaultOf(ENGINES[defKind]) });

  const rows: Row[] = KINDS.flatMap(kind => [...new Set([...data.kernels.filter(k => k.kind === kind).map(k => k.version), ...catalog.filter(k => k.kind === kind).map(k => k.version)])]
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    .map(version => {
      const k = data.kernels.find(x => x.kind === kind && x.version === version);
      const pkgs = catalog.filter(x => x.kind === kind && x.version === version);
      const pr = data.progress[kernelKey(kind, version)];
      const here = usedHere(kind, version);
      return {
        kind, version, k, pkgs, pr, key: kernelKey(kind, version), label: `${ENGINES[kind]} ${version}`,
        recommended: k ? k.recommended : pkgs.some(x => x.recommended), isDefault: kind === defKind && version === defVersion,
        platforms: k?.platforms ?? [...new Set(pkgs.filter(x => x.ready).map(x => x.platform))],
        size: k?.size ?? pkgs.find(x => x.ready)?.size ?? null, added: k?.addedAt ?? pkgs[0]?.createdAt ?? null, note: k?.note ?? pkgs.find(x => x.note)?.note ?? null,
        downloading: !!pr && !pr.finished && !pr.error && !pr.paused,
        here, everywhere: pkgs.find(x => x.profiles !== null)?.profiles ?? 0, busy: here.some(p => data.status[p.id])
      };
    }));
  const updates = new Set(newer(data.kernels).map(k => kernelKey(k.kind, k.version)));
  const needle = q.trim().toLowerCase();
  const filtered = tab !== 'all' || system !== 'all' || !!needle;
  const shown = rows.filter(r => (tab === 'all' || (tab === 'installed' ? !!r.k?.installed : updates.has(r.key)))
    && (system === 'all' || r.platforms.some(p => familyOf(p) === system))
    && (!needle || `${r.label} ${r.note ?? ''}`.toLowerCase().includes(needle)));
  const side = cur ? rows.find(r => r.key === cur) ?? null : null;

  async function checkUpdates(){
    setChecking(true);
    loadCatalog();
    const n = newer(await data.reloadKernels()).length;
    setChecking(false);
    toast({ title: n ? E.updates(n) : E.upToDate });
  }
  async function makeDefault(value: string){
    const [kind, version] = value.split(':') as [KernelKind, string];
    try {
      await folio.api('PATCH', `/workspaces/${ws.id}`, { settings: { defaultKernel: kind, defaultKernelVersion: version || null } });
      toast(E.defaultSet(version ? `${ENGINES[kind]} ${version}` : E.defaultOf(ENGINES[kind])));
    } catch (e){ fail(e); }
  }
  async function upgrade(kind: KernelKind, version: string, ids: string[]){
    try { toast(E.upgraded(await data.batch('set-kernel', ids, { kernel: kind, kernelVersion: version }), `${ENGINES[kind]} ${version}`)); } catch (e){ fail(e); }
    loadCatalog();
  }
  async function recommend(k: Kernel, note: string){
    setRecommending(null);
    try { await folio.api('PATCH', `/kernels/${k.id}`, { recommended: true, note }); toast(E.admin.recommended(`${ENGINES[k.kind]} ${k.version}`)); } catch (e){ fail(e); }
    reload();
  }
  async function retire(pkgs: Kernel[]){
    setRetiring(null);
    try { for (const k of pkgs) await folio.api('DELETE', `/kernels/${k.id}`); toast(E.admin.retiredDone(`${ENGINES[pkgs[0].kind]} ${pkgs[0].version}`)); } catch (e){ fail(e); }
    reload();
  }
  async function clean(){
    setCleaning(false);
    for (const k of unused) await data.removeKernel(k.kind, k.version);
    toast(E.cleaned(unused.length));
  }
  // The switch moves at once; the file on this computer catches up.
  const change = (c: Partial<KernelSettings>) => { setSettings(s => s && { ...s, ...c }); void folio.setKernelSettings(c).then(setSettings); };

  // What can be done with a version (v2 13): one step under Actions — pausing, resuming or starting its download, or
  // making it the default once it is here — or its notes when there is nothing to do; the rest is in the menu beside it.
  function stepOf(r: Row){
    const { kind, version, k, pr } = r;
    return r.downloading ? { label: E.pause, cls: 'btn-secondary', run: () => void folio.pauseKernel(kind, version) }
      : pr?.paused && !k?.installed ? { label: E.resume, cls: 'btn-secondary', run: () => void data.install(kind, version) }
      : k?.installed ? (manager && !r.isDefault && k.available ? { label: E.setDefault, cls: 'btn-primary', run: () => void makeDefault(`${kind}:${version}`) } : null)
      : k?.available ? { label: E.download, cls: 'btn-secondary', run: () => void data.install(kind, version) } : null;
  }
  function step(r: Row){
    const s = stepOf(r);
    return s ? <button type="button" className={`btn btn-sm ${s.cls}`} onClick={s.run}>{s.label}</button>
      : <button type="button" className="btn btn-sm btn-text" onClick={() => setCur(r.key)}>{E.details}</button>;
  }
  function menu(r: Row){
    const { kind, version, k } = r;
    const items = [
      ...(stepOf(r) ? [{ label: E.details, onClick: () => setCur(r.key) }] : []),
      ...(manager && !r.isDefault && k?.available && !k.installed ? [{ label: E.setDefault, onClick: () => void makeDefault(`${kind}:${version}`) }] : []),
      ...(k?.installed ? [{ label: E.remove, disabled: r.busy, onClick: () => void data.removeKernel(kind, version).then(() => toast(E.removed(r.label))) }] : []),
      ...(admin && r.pkgs.some(x => x.ready) && !r.recommended ? [{ label: E.admin.recommend, onClick: () => setRecommending(r.pkgs.find(x => x.ready)!) }] : []),
      ...(admin && r.pkgs.length ? [{ label: E.admin.retire, onClick: () => setRetiring(r.pkgs), danger: true }] : [])
    ];
    return items.length > 0 && <MoreMenu vertical label={E.actionsX(r.label)} items={items} />;
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{E.title}</h1></div>
          <span className="sp" />
          {admin && <button type="button" className="btn btn-secondary" onClick={() => setUploading(true)}><Icon name="upload" />{E.admin.upload}</button>}
          <button type="button" className="btn btn-primary" disabled={checking} onClick={() => void checkUpdates()}>
            {checking ? <span className="spin" aria-hidden="true" /> : <Icon name="refresh" />}{E.check}
          </button>
        </header>
        <section className="en-strip" aria-label={E.settings}>
          <label className="en-def"><span className="label">{E.defaultKernel}</span>
            <Select label={E.defaultKernel} value={defValue} disabled={!manager} onChange={v => void makeDefault(v)} options={defOpts} />
          </label>
          {settings && <div className="en-auto">
            <Switch label={E.autoDownload} checked={settings.autoDownload} onChange={on => change({ autoDownload: on })} />
            <span className="hint" title={E.autoHelp}>{E.autoHint}<Icon name="info" /></span>
            <Switch label={E.idleOnly} checked={settings.idleOnly} disabled={!settings.autoDownload} onChange={on => change({ idleOnly: on })} />
          </div>}
        </section>
        {outdated.map(o => (
          <div key={o.kind} className="upgrade-note wide" role="status">
            <Icon name="alert" />
            <span><b>{E.outdated(o.old.length, `${ENGINES[o.kind]} ${o.from}`)}</b>
              <span className="hint">{E.upgradeNote(`${ENGINES[o.kind]} ${major(o.rec)}`)}{o.idle.length < o.old.length && ` ${E.upgradeSkip(o.old.length - o.idle.length)}`}</span></span>
            <button type="button" className="btn btn-sm btn-primary" disabled={!o.idle.length} onClick={() => void upgrade(o.kind, o.rec, o.idle.map(p => p.id))}>{E.upgrade(o.rec)}</button>
          </div>
        ))}

        <Tabs className="page-tabs" label={E.title} value={tab} tabs={['all', 'installed', 'updates']} name={t => E.tabs[t]} count={t => t === 'updates' && updates.size > 0 && updates.size} onChange={setTab} />
        <div className={`side-wrap${side ? ' with-panel' : ''}`}>
          <section className="side-main list-card" aria-label={E.title}>
            <div className="filters">
              <Flt label={E.filterLabels.keyword} grow>
                <label className="search"><Icon name="search" /><span className="sr">{E.search}</span>
                  <input type="search" placeholder={E.searchPh} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
              </Flt>
              <Flt label={E.filterLabels.system}><span className="grp-pick"><Select label={E.system} value={system} onChange={v => setSystem(v as 'all' | Family)}
                options={[{ value: 'all', label: E.systems }, ...FAMILIES.map(f => ({ value: f, label: E.families[f] }))]} /></span></Flt>
              <button type="button" className="btn btn-secondary flt-reset" disabled={!needle && system === 'all'} onClick={() => { setQ(''); setSystem('all'); }}>{d.profiles.reset}</button>
            </div>
            <div className="tw en-t">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{E.cols.version}</th><th scope="col">{E.cols.number}</th><th scope="col">{E.cols.platforms}</th><th className="c-size mid" scope="col">{E.cols.size}</th>
                    <th className="c-rel mid" scope="col">{E.cols.released}</th><th className="mid" scope="col">{E.cols.profiles}</th><th className="mid" scope="col">{E.cols.status}</th><th className="act" scope="col">{E.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!data.loaded.has('kernels') && <SkelRows cols={9} rows={4} />}
                  {data.loaded.has('kernels') && !filtered && KINDS.filter(kind => !rows.some(r => r.kind === kind)).map(kind => (
                    <tr key={kind}><td colSpan={9}><span className="l1"><b>{ENGINES[kind]}</b></span><span className="l2">{E.none}</span></td></tr>
                  ))}
                  {filtered && !shown.length && <tr className="empty"><td colSpan={9}>{needle || system !== 'all'
                    ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setSystem('all'); }}>{d.states.clear}</button>
                      </Empty>
                    : tab === 'updates' ? <Empty icon="check" title={E.upToDate} text={E.upToDateText} />
                    : <Empty icon="engines" title={E.noneDownloaded} text={E.noneDownloadedText} />}</td></tr>}
                  {shown.map(r => (
                    <tr key={r.key} className={side?.key === r.key ? 'cur' : ''} data-engine={r.kind} data-version={r.version}
                      onClick={e => { if (!(e.target as HTMLElement).closest('button,input,a,.menu')) setCur(r.key); }}>
                      <td><span className="en-name"><b>{ENGINES[r.kind]} {major(r.version)}</b><Tags d={d} r={r} /></span></td>
                      <td className="mono">{r.version}</td>
                      <td><Systems d={d} r={r} admin={admin} /></td>
                      <td className="mono c-size mid">{r.size ? bytes(r.size) : '—'}</td>
                      <td className="mono c-rel mid">{r.added ? day(r.added) : '—'}</td>
                      <td className="mid">{r.here.length ? <button type="button" className="count-link" onClick={() => onShowProfiles(r.here.map(p => p.id))}>{r.here.length}</button> : <span className="muted">0</span>}
                        {admin && <span className="l2">{E.everywhere(r.everywhere)}</span>}</td>
                      <td className="mid"><State d={d} r={r} /></td>
                      <td className="act">{step(r)}</td>
                      <td className="more">{menu(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="en-foot">
              <span className="en-disk" title={usage?.path}><Icon name="engines" />{E.disk(usage ? bytes(usage.bytes) : '…')}</span>
              <button type="button" className="btn btn-sm btn-secondary" disabled={!unused.length} title={unused.length ? undefined : E.nothingToClean} onClick={() => setCleaning(true)}>{E.cleanup}</button>
            </p>
          </section>
          {side && <Notes d={d} r={side} admin={admin} onClose={() => setCur(null)} />}
        </div>
        <p className="notice page-tip"><Icon name="info" /><span>{E.tip}</span></p>
      </main>
      {uploading && <UploadDialog d={d} onClose={() => setUploading(false)} onDone={reload} />}
      {recommending && <RecommendDialog d={d} k={recommending} onClose={() => setRecommending(null)} onDone={note => void recommend(recommending, note)} />}
      {retiring && (
        <Modal kind="bad" title={E.admin.retireTitle(`${ENGINES[retiring[0].kind]} ${retiring[0].version}`)} onClose={() => setRetiring(null)} foot={<>
          <Cancel />
          <Act className="btn btn-danger solid" run={() => retire(retiring)}>{E.admin.retire}</Act>
        </>}><p>{E.admin.retireConfirm(retiring.find(x => x.profiles !== null)?.profiles ?? 0)}</p></Modal>
      )}
      {cleaning && (
        <Modal kind="warn" title={E.cleanupTitle(unused.length)} onClose={() => setCleaning(false)} foot={<>
          <Cancel />
          <Act className="btn btn-primary" run={() => clean()}>{E.cleanup}</Act>
        </>}><p>{unused.map(k => `${ENGINES[k.kind]} ${k.version}`).join(' · ')}</p><p>{E.cleanupNote(bytes(unusedSize))}</p></Modal>
      )}
    </div>
  );
}

// Recommended (by the platform), the workspace's default, or gone from the catalog.
function Tags({ d, r }: { d: Dict; r: Row }){
  const E = d.engines, gone = !!r.k && !r.k.available;
  if (!r.recommended && !r.isDefault && !gone) return null;
  return <span className="en-tags">{r.recommended && <span className="badge accent">{E.recommended}</span>}{r.isDefault && <span className="badge">{E.default}</span>}{gone && <span className="badge">{E.retired}</span>}</span>;
}

// The systems it is built for, as words (v2 13); platform admins also see packages whose upload didn't finish.
function Systems({ d, r, admin }: { d: Dict; r: Row; admin: boolean }){
  const E = d.engines;
  const unfinished = admin ? r.pkgs.filter(x => !x.ready) : [];
  return <>
    <span className="nowrap">{FAMILIES.filter(f => r.platforms.some(p => familyOf(p) === f)).map(f => E.families[f]).join(' / ') || '—'}</span>
    {unfinished.length > 0 && <span className="platforms">{unfinished.map(x => <span key={x.id} className="badge warn">{E.platforms[x.platform] ?? x.platform} · {E.admin.unfinished}</span>)}</span>}
  </>;
}

// Downloaded, downloading (how far), paused, failed or not downloaded; a version a running profile uses can't be removed.
function State({ d, r }: { d: Dict; r: Row }){
  const E = d.engines, { k, pr } = r;
  if (r.downloading) return <span className="en-prog"><span className="dot-st boot">{E.downloadingPct(percent(pr!))}</span><Progress done={pr!.done} total={pr!.total} /></span>;
  if (pr?.paused && !k?.installed) return <span className="dot-st idle">{E.paused(percent(pr))}</span>;
  if (pr?.error && !k?.installed) return <span className="dot-st bad">{E.failed}</span>;
  if (k?.installed) return <><span className="l1"><span className="dot-st run">{E.installed}</span></span>{r.busy && <span className="l2">{E.removeBusy}</span>}</>;
  return <span className="dot-st idle">{E.notDownloaded}</span>;
}

// A version's notes beside the table: what it is, what changed, the systems it is built for, and the reminder that a
// profile changes engines only once stopped.
function Notes({ d, r, admin, onClose }: { d: Dict; r: Row; admin: boolean; onClose(): void }){
  const E = d.engines, N = E.notes;
  const lines = r.note?.split(/\n|[；;]\s*/).map(s => s.trim()).filter(Boolean) ?? [];
  return (
    <aside className="sec side-panel en-panel" aria-label={N.title}><PanelEdge />
      <div className="sec-row"><h3>{N.title}</h3><button type="button" className="icon-btn bare" aria-label={d.common.close} title={d.common.close} onClick={onClose}><Icon name="x" /></button></div>
      <div className="side-h"><EngineLogo kernel={r.kind} size={28} /><b>{ENGINES[r.kind]} {major(r.version)}</b><Tags d={d} r={r} /></div>
      <dl className="kvl">
        <dt>{N.version}</dt><dd className="mono">{r.version}</dd>
        <dt>{N.released}</dt><dd className="mono">{r.added ? day(r.added) : '—'}</dd>
        <dt>{N.size}</dt><dd className="mono">{r.size ? bytes(r.size) : '—'}</dd>
        <dt>{N.profiles}</dt><dd>{r.here.length}{admin && <span className="muted">· {E.everywhere(r.everywhere)}</span>}</dd>
      </dl>
      <h4>{N.changes}</h4>
      {lines.length ? <ul className="en-notes">{lines.map(l => <li key={l}>{l}</li>)}</ul> : <p className="hint">{N.none}</p>}
      <h4>{N.systems}</h4>
      {r.platforms.length ? <span className="platforms">{r.platforms.map(p => <span key={p} className="badge">{E.platforms[p] ?? p}</span>)}</span> : <p className="hint">—</p>}
      <div className="notice warn en-warn"><Icon name="alert" /><span><b>{N.switchWarn}</b>{N.switchWhy}</span></div>
    </aside>
  );
}

// Making a version the recommended one, with a line about what changed for its notes.
function RecommendDialog({ d, k, onClose, onDone }: { d: Dict; k: Kernel; onClose(): void; onDone(note: string): void }){
  const A = d.engines.admin;
  const [note, setNote] = useState('');
  return (
    <Modal kind="good" title={A.recommendTitle(`${ENGINES[k.kind]} ${k.version}`)} onClose={onClose} foot={<>
      <Cancel />
      <button type="button" className="btn btn-primary" onClick={() => onDone(note.trim())}>{A.recommend}</button>
    </>}>
      <p>{A.recommendNote}</p>
      <input className="picker-q" aria-label={A.note} placeholder={A.note} value={note} maxLength={200} onChange={e => setNote(e.target.value)} autoFocus />
    </Modal>
  );
}

// Uploading a version for one system: the app checks the file here, then sends it straight to Folio's storage.
function UploadDialog({ d, onClose, onDone }: { d: Dict; onClose(): void; onDone(): void }){
  const A = d.engines.admin;
  const toast = useToast();
  const [kind, setKind] = useState<KernelKind>('chromium');
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState('win32-x64');
  const [file, setFile] = useState<{ token: string; name: string; size: number } | null>(null);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState<KernelUpload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => folio.onKernelUpload(setProgress), []);

  async function choose(){
    const f = await folio.pickKernelFile();
    if (!f) return;
    setFile(f);
    // Guess what it is from the file name the engines publish.
    const n = f.name.toLowerCase();
    if (n.includes('camoufox')) setKind('firefox'); else if (n.includes('chrom')) setKind('chromium');
    setPlatform(n.includes('win') ? 'win32-x64' : /arm64|aarch64/.test(n) ? 'darwin-arm64' : /mac|dmg|darwin/.test(n) ? 'darwin-x64' : n.includes('lin') ? 'linux-x64' : platform);
    const v = n.match(/(\d+\.\d+(?:\.\d+)*(?:-beta\.\d+)?)/);
    if (v && !version) setVersion(v[1]);
  }
  async function send(){
    setError(null);
    try {
      await folio.uploadKernel(file!.token, { kind, version: version.trim(), platform, note: note.trim() });
      toast(A.done(`${ENGINES[kind]} ${version.trim()}`));
      onDone(); onClose();
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); setProgress(null); }
  }
  const busy = !!progress;
  const pct = progress ? percent(progress) : 0;

  return (
    <Modal title={A.title} onClose={onClose} busy={busy} foot={<>
      <Cancel />
      <button className="btn btn-primary" type="button" aria-busy={busy || undefined} disabled={busy || !file || !/^[0-9][0-9A-Za-z.+-]{0,39}$/.test(version.trim())} onClick={() => void send()}>
        {progress ? (progress.stage === 'hash' ? A.hashing(pct) : A.uploading(pct)) : A.send}
      </button>
    </>}>
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="field">
          <span className="label">{A.file}</span>
          <div className="file-row">
            <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => void choose()}>{A.choose}</button>
            {file && <span className="hint mono">{file.name} · {bytes(file.size)}</span>}
          </div>
          <p className="hint">{A.fileHint}</p>
        </div>
        <div className="row2">
          <div className="field"><span className="label">{A.kind}</span>
            <div className="seg" role="group" aria-label={A.kind}>
              {KINDS.map(k => <button key={k} type="button" aria-pressed={kind === k} disabled={busy} onClick={() => setKind(k)}>{ENGINES[k]}</button>)}
            </div>
          </div>
          <SelectField label={A.platform} value={platform} onChange={setPlatform} disabled={busy} options={PLATFORMS.map(p => ({ value: p, label: d.engines.platforms[p] }))} />
        </div>
        <label className="field"><span>{A.version}</span>
          <input className="mono-in" value={version} placeholder={A.versionPh} disabled={busy} spellCheck={false} onChange={e => setVersion(e.target.value)} />
        </label>
        <label className="field"><span>{A.note}</span>
          <input value={note} maxLength={200} disabled={busy} onChange={e => setNote(e.target.value)} />
        </label>
        {progress && <Progress done={progress.done} total={progress.total} />}
      </div>
    </Modal>
  );
}
