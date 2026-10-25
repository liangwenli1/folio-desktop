// Engines: the download settings and the room versions take here (with a clean-up), profiles on older versions moved to
// the recommended one in one go, then every version of both engines in one table: downloaded or not (download, pause,
// delete the download), how many profiles here use it and the note it was recommended with. Platform admins also see
// every system's packages, upload new versions, pick the recommended one (with a note) and take versions off the catalog.
import { useEffect, useState } from 'react';
import type { KernelKind, KernelSettings, KernelUpload } from '@shared/bridge';
import { folio, isApiError, type Kernel } from './api';
import { kernelKey, type WorkspaceData } from './data';
import { ENGINES } from './checks';
import { errorText, type Dict } from './i18n';
import { SelectField } from './Select';
import { EngineLogo } from './Flag';
import { Icon, Modal, MoreMenu, Progress, Switch, bytes, percent, useToast } from './ui';

const KINDS: KernelKind[] = ['chromium', 'firefox'];
const PLATFORMS = ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'];

export function EnginesPage({ d, data, admin }: { d: Dict; data: WorkspaceData; admin: boolean }){
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
  // Versions downloaded here that nothing here uses and that aren't recommended: what a clean-up deletes.
  const unused = data.kernels.filter(k => k.installed && !k.recommended && !usedHere(k.kind, k.version).length);
  const unusedSize = unused.reduce((n, k) => n + (k.size ?? 0), 0);
  // Profiles on an older version than the recommended one, by engine.
  const outdated = KINDS.flatMap(kind => {
    const rec = data.kernels.find(k => k.kind === kind && k.recommended);
    const old = rec ? profiles.filter(p => p.kernel === kind && p.kernelVersion !== rec.version) : [];
    return rec && old.length ? [{ kind, rec: rec.version, old, from: [...new Set(old.map(p => p.kernelVersion.split('.')[0]))].join(', ') }] : [];
  });
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
          <div className="ttl"><h1>{E.title}</h1></div>
          <span className="sp" />
          {admin && <button type="button" className="btn btn-secondary" onClick={() => setUploading(true)}><Icon name="upload" />{E.admin.upload}</button>}
        </header>
        <section className="en-strip" aria-label={E.settings}>
          {settings && <>
            <Switch label={E.autoDownload} checked={settings.autoDownload} onChange={on => change({ autoDownload: on })} />
            <Switch label={E.idleOnly} checked={settings.idleOnly} disabled={!settings.autoDownload} onChange={on => change({ idleOnly: on })} />
          </>}
          <span className="sp" />
          <span className="en-disk" title={usage?.path}><Icon name="engines" />{E.disk(usage ? bytes(usage.bytes) : '…')}</span>
          <button type="button" className="btn btn-sm btn-secondary" disabled={!unused.length} title={unused.length ? undefined : E.nothingToClean} onClick={() => setCleaning(true)}>{E.cleanup}</button>
        </section>
        {outdated.map(o => (
          <div key={o.kind} className="upgrade-note wide" role="status">
            <Icon name="alert" />
            <span><b>{E.outdated(o.old.length, `${ENGINES[o.kind]} ${o.from}`)}</b><span className="hint">{E.upgradeNote(`${ENGINES[o.kind]} ${o.rec.split('.')[0]}`)}</span></span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void upgrade(o.kind, o.rec, o.old.map(p => p.id))}>{E.upgrade(o.rec)}</button>
          </div>
        ))}
        <div className="tw top-gap">
          <table>
            <thead>
              <tr>
                <th scope="col">{E.cols.version}</th>{admin && <th scope="col">{E.cols.platforms}</th>}<th scope="col">{E.cols.size}</th><th scope="col">{E.cols.released}</th>
                <th scope="col">{E.cols.profiles}</th><th scope="col">{E.cols.status}</th><th className="act" scope="col">{E.cols.actions}</th>
              </tr>
            </thead>
            <tbody>
              {KINDS.flatMap(kind => {
                const local = data.kernels.filter(k => k.kind === kind);
                // Every version on this computer's list, plus (for admins) versions built only for other systems.
                const versions = [...new Set([...local.map(k => k.version), ...catalog.filter(k => k.kind === kind).map(k => k.version)])];
                if (!versions.length) return [<tr key={kind}><td colSpan={admin ? 7 : 6}><span className="l1"><EngineLogo kernel={kind} size={18} /><b>{ENGINES[kind]}</b></span><span className="l2">{E.none}</span></td></tr>];
                return versions.map(version => {
                  const k = local.find(x => x.version === version);
                  const rows = catalog.filter(x => x.kind === kind && x.version === version);
                  const recommended = k ? k.recommended : rows.some(x => x.recommended);
                  const pr = data.progress[kernelKey(kind, version)], downloading = pr && !pr.finished && !pr.error && !pr.paused;
                  const here = usedHere(kind, version).length, everywhere = rows.find(x => x.profiles !== null)?.profiles ?? 0;
                  const label = `${ENGINES[kind]} ${version}`, added = k?.addedAt ?? rows[0]?.createdAt, size = k?.size ?? rows.find(x => x.ready)?.size ?? null;
                  const note = k?.note ?? rows.find(x => x.note)?.note;
                  const busy = running(kind, version);
                  return (
                    <tr key={`${kind}:${version}`} className={recommended ? 'rec' : ''} data-engine={kind} data-version={version}>
                      <td>
                        <span className="l1"><EngineLogo kernel={kind} size={18} /><b>{ENGINES[kind]}</b><span className="mono">{version}</span>
                          {recommended && <span className="tag rec-tag">{E.recommended}</span>}{k && !k.available && <span className="tag">{E.retired}</span>}</span>
                        {note && <span className="l2">{note}</span>}
                      </td>
                      {admin && <td><span className="platforms">{rows.map(x => <span key={x.id} className={`tag first${x.ready ? '' : ' warn'}`} title={x.ready ? bytes(x.size) : E.admin.unfinished}>{E.platforms[x.platform] ?? x.platform}{!x.ready && ` · ${E.admin.unfinished}`}</span>)}</span></td>}
                      <td className="mono">{size ? bytes(size) : '—'}</td>
                      <td className="mono">{added ? new Date(added).toLocaleDateString('sv-SE') : '—'}</td>
                      <td><span className="l1">{here}</span>{admin && <span className="l2">{E.everywhere(everywhere)}</span>}</td>
                      <td>
                        {downloading ? <span className="en-prog"><span className="dot-st boot">{E.downloadingPct(percent(pr))}</span><Progress done={pr.done} total={pr.total} /></span>
                          : pr?.paused && !k?.installed ? <span className="dot-st idle">{E.paused(percent(pr))}</span>
                          : pr?.error && !k?.installed ? <span className="dot-st bad">{E.failed}</span>
                          : k?.installed ? <span className="dot-st run">{E.installed}</span>
                          : <span className="dot-st idle">{E.notDownloaded}</span>}
                      </td>
                      <td className="act"><span className="actin">
                        {downloading ? <button type="button" className="btn btn-xs btn-text" onClick={() => void folio.pauseKernel(kind, version)}>{E.pause}</button>
                          : pr?.paused && !k?.installed ? <button type="button" className="btn btn-xs btn-secondary" onClick={() => void data.install(kind, version)}>{E.resume}</button>
                          : k?.installed ? <button type="button" className="btn btn-xs btn-text" disabled={busy} title={busy ? E.removeBusy : undefined}
                            onClick={() => void data.removeKernel(kind, version).then(() => toast(E.removed(label)))}>{E.remove}</button>
                          : k?.available && <button type="button" className="btn btn-xs btn-secondary" onClick={() => void data.install(kind, version)}><Icon name="download" />{E.download(bytes(k.size ?? 0))}</button>}
                        {admin && rows.length > 0 && <MoreMenu label={E.actionsX(label)} items={[
                          ...(rows.some(x => x.ready) && !recommended ? [{ label: E.admin.recommend, onClick: () => setRecommending(rows.find(x => x.ready)!) }] : []),
                          { label: E.admin.retire, onClick: () => setRetiring(rows), danger: true }
                        ]} />}
                      </span></td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
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

// Making a version the recommended one, with a line about what changed for its row.
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
