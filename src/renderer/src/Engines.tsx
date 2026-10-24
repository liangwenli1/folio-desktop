// Engines: a card per engine with its versions for this computer (download, pause, delete the download), profiles on
// older versions moved to the recommended one in one go, the room they take here and a clean-up, the download settings,
// and the history of versions added and recommended. Platform admins also see every system's packages, upload new
// versions, pick the recommended one (with a note) and take versions off the catalog.
import { useEffect, useState } from 'react';
import type { KernelKind, KernelSettings, KernelUpload } from '@shared/bridge';
import { folio, isApiError, type Kernel } from './api';
import { kernelKey, type WorkspaceData } from './data';
import { ENGINES } from './checks';
import { errorText, type Dict, type Lang } from './i18n';
import { dayLabel } from './Activity';
import { SelectField } from './Select';
import { EngineLogo } from './Flag';
import { Icon, Modal, Progress, Ring, Switch, bytes, percent, useToast } from './ui';

const KINDS: KernelKind[] = ['chromium', 'firefox'];
const PLATFORMS = ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'];

export function EnginesPage({ d, lang, data, admin }: { d: Dict; lang: Lang; data: WorkspaceData; admin: boolean }){
  const E = d.engines;
  const toast = useToast();
  const [catalog, setCatalog] = useState<Kernel[]>([]);
  const [uploading, setUploading] = useState(false);
  const [retiring, setRetiring] = useState<Kernel[] | null>(null);
  const [recommending, setRecommending] = useState<Kernel | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [usage, setUsage] = useState<{ path: string; bytes: number } | null>(null);
  const [settings, setSettings] = useState<KernelSettings | null>(null);
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  // Admins manage every system's packages; everyone else needs only this computer's list.
  const loadCatalog = () => { if (admin) void folio.api<{ kernels: Kernel[] }>('GET', '/kernels').then(r => setCatalog(r.kernels), fail); };
  useEffect(loadCatalog, [admin]);
  const installed = data.kernels.filter(k => k.installed).map(k => kernelKey(k.kind, k.version)).join();
  useEffect(() => { void folio.kernelUsage().then(setUsage); }, [installed]);
  useEffect(() => { void folio.kernelSettings().then(setSettings); }, []);
  const reload = () => { data.reloadKernels(); loadCatalog(); };

  const profiles = data.profiles ?? [];
  const usedHere = (kind: KernelKind, version: string) => profiles.filter(p => p.kernel === kind && p.kernelVersion === version);
  const running = (kind: KernelKind, version: string) => usedHere(kind, version).some(p => data.status[p.id]);
  const when = (iso: string) => dayLabel(iso, d, lang);
  // Versions downloaded here that nothing here uses and that aren't recommended: what a clean-up deletes.
  const unused = data.kernels.filter(k => k.installed && !k.recommended && !usedHere(k.kind, k.version).length);
  const unusedSize = unused.reduce((n, k) => n + (k.size ?? 0), 0);
  // Profiles on an older version than the recommended one, by engine.
  const outdated = KINDS.flatMap(kind => {
    const rec = data.kernels.find(k => k.kind === kind && k.recommended);
    const old = rec ? profiles.filter(p => p.kernel === kind && p.kernelVersion !== rec.version) : [];
    return rec && old.length ? [{ kind, rec: rec.version, old, from: [...new Set(old.map(p => p.kernelVersion.split('.')[0]))].join(', ') }] : [];
  });
  // What happened to the versions for this computer: added, and made recommended; newest first.
  const history = data.kernels.flatMap(k => [
    ...(k.addedAt ? [{ at: k.addedAt, kind: k.kind, text: E.historyAdded(`${ENGINES[k.kind]} ${k.version}`), note: null as string | null }] : []),
    ...(k.recommendedAt && k.recommendedAt !== k.addedAt ? [{ at: k.recommendedAt, kind: k.kind, text: E.historyRecommended(`${ENGINES[k.kind]} ${k.version}`), note: k.note }] : [])
  ]).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  async function upgrade(kind: KernelKind, version: string, ids: string[]){
    try { toast(E.upgraded(await data.batch('set-kernel', ids, { kernel: kind, kernelVersion: version }), `${ENGINES[kind]} ${version}`)); } catch (e){ fail(e); }
    loadCatalog();
  }
  async function recommend(k: Kernel, note: string){
    setRecommending(null);
    try { await folio.api('PATCH', `/kernels/${k.id}`, { recommended: true, note }); toast(E.admin.recommended(`${ENGINES[k.kind]} ${k.version}`)); } catch (e){ fail(e); }
    reload();
  }
  async function retire(rows: Kernel[]){
    setRetiring(null);
    try { for (const k of rows) await folio.api('DELETE', `/kernels/${k.id}`); toast(E.admin.retiredDone(`${ENGINES[rows[0].kind]} ${rows[0].version}`)); } catch (e){ fail(e); }
    reload();
  }
  async function clean(){
    setCleaning(false);
    for (const k of unused) await data.removeKernel(k.kind, k.version);
    toast(E.cleaned(unused.length));
  }
  // The switch moves at once; the file on this computer catches up.
  const change = (c: Partial<KernelSettings>) => { setSettings(s => s && { ...s, ...c }); void folio.setKernelSettings(c).then(setSettings); };

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{E.title}</h1><p className="sub">{E.sub}</p></div>
          <span className="sp" />
          {admin && <button type="button" className="btn btn-secondary" onClick={() => setUploading(true)}><Icon name="upload" />{E.admin.upload}</button>}
        </header>
        <div className="engines-page">
          {outdated.map(o => (
            <div key={o.kind} className="upgrade-note wide" role="status">
              <Icon name="alert" />
              <span><b>{E.outdated(o.old.length, `${ENGINES[o.kind]} ${o.from}`)}</b><span className="hint">{E.upgradeNote(`${ENGINES[o.kind]} ${o.rec.split('.')[0]}`)}</span></span>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void upgrade(o.kind, o.rec, o.old.map(p => p.id))}>{E.upgrade(o.rec)}</button>
            </div>
          ))}
          {KINDS.map(kind => {
            const local = data.kernels.filter(k => k.kind === kind);
            const rec = local.find(k => k.recommended) ?? local.find(k => k.available);
            // Every version on this computer's list, plus (for admins) versions built only for other systems.
            const versions = [...new Set([...local.map(k => k.version), ...catalog.filter(k => k.kind === kind).map(k => k.version)])];
            return (
              <section key={kind} className="engine-card" aria-label={ENGINES[kind]} data-engine={kind}>
                <header className="en-h">
                  <EngineLogo kernel={kind} size={40} />
                  <span><h2>{ENGINES[kind]}</h2><small>{E.desc[kind]}</small></span>
                  {rec && <span className="en-rec"><small>{E.recommendedVersion}</small><b className="mono">{rec.version}</b></span>}
                </header>
                {!versions.length && <p className="hint">{E.none}</p>}
                <ol className="en-list">
                  {versions.map(version => {
                    const k = local.find(x => x.version === version);
                    const rows = catalog.filter(x => x.kind === kind && x.version === version);
                    const recommended = k ? k.recommended : rows.some(x => x.recommended);
                    const pr = data.progress[kernelKey(kind, version)], downloading = pr && !pr.finished && !pr.error && !pr.paused;
                    const here = usedHere(kind, version).length, everywhere = rows.find(x => x.profiles !== null)?.profiles ?? 0;
                    const label = `${ENGINES[kind]} ${version}`, added = k?.addedAt ?? rows[0]?.createdAt;
                    return (
                      <li key={version} className={`${recommended ? 'rec' : ''}${k?.installed ? ' got' : ''}`} data-version={version}>
                        <span className="en-dot" aria-hidden="true" />
                        <div className="en-main">
                          <p className="tl-head">
                            <b className="mono">{version}</b>
                            {recommended && <span className="tag rec-tag">{E.recommended}</span>}
                            {k && !k.available && <span className="tag">{E.retired}</span>}
                          </p>
                          <p className="hint">{[added && E.released(when(added)), E.usedBy(here), admin && E.everywhere(everywhere)].filter(Boolean).join(' · ')}</p>
                          {admin && rows.length > 0 && (
                            <p className="platforms">{rows.map(x => <span key={x.id} className={`tag first${x.ready ? '' : ' warn'}`} title={x.ready ? bytes(x.size) : E.admin.unfinished}>{E.platforms[x.platform] ?? x.platform}{!x.ready && ` · ${E.admin.unfinished}`}</span>)}</p>
                          )}
                          {pr?.error && <p className="err">{E.failed}</p>}
                        </div>
                        <div className="tl-acts">
                          {downloading ? <>
                            <Ring pct={percent(pr)} label={d.form.downloading(percent(pr))} />
                            <span className="en-state accent">{E.downloadingOf(bytes(pr.total || k?.size || 0))}</span>
                            <button type="button" className="btn btn-xs btn-text" onClick={() => void folio.pauseKernel(kind, version)}>{E.pause}</button>
                          </> : pr?.paused && !k?.installed ? <>
                            <span className="en-state">{E.paused(percent(pr))}</span>
                            <button type="button" className="btn btn-xs btn-secondary" onClick={() => void data.install(kind, version)}>{E.resume}</button>
                          </> : k?.installed ? <>
                            <span className="pill-ok"><Icon name="check" />{E.downloaded(k.size ? bytes(k.size) : '')}</span>
                            <button type="button" className="btn btn-xs btn-text" disabled={running(kind, version)} title={running(kind, version) ? E.removeBusy : undefined}
                              onClick={() => void data.removeKernel(kind, version).then(() => toast(E.removed(label)))}>{E.remove}</button>
                          </> : k?.available && <button type="button" className="btn btn-xs btn-secondary" onClick={() => void data.install(kind, version)}><Icon name="download" />{E.download(bytes(k.size ?? 0))}</button>}
                          {admin && rows.some(x => x.ready) && !recommended && <button type="button" className="btn btn-xs btn-text" onClick={() => setRecommending(rows.find(x => x.ready)!)}>{E.admin.recommend}</button>}
                          {admin && rows.length > 0 && <button type="button" className="btn btn-xs btn-danger" onClick={() => setRetiring(rows)}>{E.admin.retire}</button>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
          <section className="engine-card wide en-disk" aria-label={E.disk('')}>
            <Icon name="engines" />
            <span><b>{E.disk(usage ? bytes(usage.bytes) : '…')}</b><small className="mono">{usage?.path}</small></span>
            <span className="sp" />
            <button type="button" className="btn btn-sm btn-text" disabled={!unused.length} title={unused.length ? undefined : E.nothingToClean} onClick={() => setCleaning(true)}>{E.cleanup}</button>
          </section>
          <section className="engine-card" aria-label={E.settings}>
            <h3 className="en-t">{E.settings}</h3>
            {settings && <>
              <div className="en-set"><Switch label={E.autoDownload} checked={settings.autoDownload} onChange={on => change({ autoDownload: on })} /><small>{E.autoDownloadHint}</small></div>
              <div className="en-set"><Switch label={E.idleOnly} checked={settings.idleOnly} disabled={!settings.autoDownload} onChange={on => change({ idleOnly: on })} /><small>{E.idleOnlyHint}</small></div>
            </>}
          </section>
          <section className="engine-card" aria-label={E.history}>
            <h3 className="en-t">{E.history}</h3>
            {history.length ? (
              <ol className="en-hist">
                {history.map((h, i) => <li key={i}><EngineLogo kernel={h.kind} /><span><b>{h.text}</b>{h.note && <small>{h.note}</small>}</span><time className="mono">{when(h.at)}</time></li>)}
              </ol>
            ) : <p className="hint">{E.historyNone}</p>}
          </section>
        </div>
      </main>
      {uploading && <UploadDialog d={d} onClose={() => setUploading(false)} onDone={reload} />}
      {recommending && <RecommendDialog d={d} k={recommending} onClose={() => setRecommending(null)} onDone={note => void recommend(recommending, note)} />}
      {retiring && (
        <Modal icon="trash" tone="bad" title={E.admin.retireTitle(`${ENGINES[retiring[0].kind]} ${retiring[0].version}`)} closeLabel={d.common.close} onClose={() => setRetiring(null)} foot={<>
          <button type="button" className="btn btn-secondary" onClick={() => setRetiring(null)}>{d.common.cancel}</button>
          <button type="button" className="btn btn-danger solid" onClick={() => void retire(retiring)}>{E.admin.retire}</button>
        </>}><p>{E.admin.retireConfirm(retiring.find(x => x.profiles !== null)?.profiles ?? 0)}</p></Modal>
      )}
      {cleaning && (
        <Modal icon="trash" title={E.cleanupTitle(unused.length)} closeLabel={d.common.close} onClose={() => setCleaning(false)} foot={<>
          <button type="button" className="btn btn-secondary" onClick={() => setCleaning(false)}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={() => void clean()}>{E.cleanup}</button>
        </>}><p>{unused.map(k => `${ENGINES[k.kind]} ${k.version}`).join(' · ')}</p><p>{E.cleanupNote(bytes(unusedSize))}</p></Modal>
      )}
    </div>
  );
}

// Making a version the recommended one, with a line about what changed for the history.
function RecommendDialog({ d, k, onClose, onDone }: { d: Dict; k: Kernel; onClose(): void; onDone(note: string): void }){
  const A = d.engines.admin;
  const [note, setNote] = useState('');
  return (
    <Modal icon="check" tone="good" title={A.recommendTitle(`${ENGINES[k.kind]} ${k.version}`)} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button type="button" className="btn btn-secondary" onClick={onClose}>{d.common.cancel}</button>
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
    <Modal title={A.title} closeLabel={d.common.close} onClose={busy ? () => {} : onClose} foot={<>
      <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>{d.common.cancel}</button>
      <button className="btn btn-primary" type="button" disabled={busy || !file || !/^[0-9][0-9A-Za-z.+-]{0,39}$/.test(version.trim())} onClick={() => void send()}>
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
