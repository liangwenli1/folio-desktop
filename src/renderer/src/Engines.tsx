// Engines: the versions of Chromium and Firefox for this computer as a timeline, newest first: download, delete the
// download, and move profiles on older versions to the recommended one. Platform admins also see every system's
// packages, upload new versions, pick the recommended one and take versions off the catalog.
import { useEffect, useState } from 'react';
import type { KernelKind, KernelUpload } from '@shared/bridge';
import { folio, isApiError, type Kernel } from './api';
import { kernelKey, type WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { SelectField } from './Select';
import { Icon, Modal, Progress, Ring, bytes, percent, useToast } from './ui';

const KINDS: KernelKind[] = ['chromium', 'firefox'];
const NAME: Record<KernelKind, string> = { chromium: 'Chromium', firefox: 'Firefox' };
const PLATFORMS = ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'];

export function EnginesPage({ d, data, admin }: { d: Dict; data: WorkspaceData; admin: boolean }){
  const E = d.engines;
  const toast = useToast();
  const [catalog, setCatalog] = useState<Kernel[]>([]);
  const [uploading, setUploading] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'));
  // Admins manage every system's packages; everyone else needs only this computer's list.
  const loadCatalog = () => { if (admin) void folio.api<{ kernels: Kernel[] }>('GET', '/kernels').then(r => setCatalog(r.kernels), fail); };
  useEffect(loadCatalog, [admin]);
  const reload = () => { data.reloadKernels(); loadCatalog(); };

  const profiles = data.profiles ?? [];
  const usedHere = (kind: KernelKind, version: string) => profiles.filter(p => p.kernel === kind && p.kernelVersion === version);
  const running = (kind: KernelKind, version: string) => usedHere(kind, version).some(p => data.status[p.id]);

  async function upgrade(kind: KernelKind, version: string, ids: string[]){
    try { toast(E.upgraded(await data.batch('set-kernel', ids, { kernel: kind, kernelVersion: version }), `${NAME[kind]} ${version}`)); } catch (e){ fail(e); }
    loadCatalog();
  }
  async function recommend(k: Kernel){
    try { await folio.api('PATCH', `/kernels/${k.id}`, { recommended: true }); toast(E.admin.recommended(`${NAME[k.kind]} ${k.version}`)); } catch (e){ fail(e); }
    reload();
  }
  async function retire(rows: Kernel[]){
    setRetiring(null);
    try { for (const k of rows) await folio.api('DELETE', `/kernels/${k.id}`); toast(E.admin.retiredDone(`${NAME[rows[0].kind]} ${rows[0].version}`)); } catch (e){ fail(e); }
    reload();
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{E.title}</h1><p className="sub">{E.sub}</p></div>
          <span className="sp" />
          {admin && <button type="button" className="btn btn-primary" onClick={() => setUploading(true)}><Icon name="upload" />{E.admin.upload}</button>}
        </header>
        <div className="engines-page">
          {KINDS.map(kind => {
            const local = data.kernels.filter(k => k.kind === kind);
            const rec = local.find(k => k.recommended) ?? local.find(k => k.available);
            const old = rec ? profiles.filter(p => p.kernel === kind && p.kernelVersion !== rec.version) : [];
            // Every version on this computer's list, plus (for admins) versions built only for other systems.
            const versions = [...new Set([...local.map(k => k.version), ...catalog.filter(k => k.kind === kind).map(k => k.version)])];
            return (
              <section key={kind} className="engine-card" aria-label={NAME[kind]} data-engine={kind}>
                <h2>{NAME[kind]}</h2>
                {old.length > 0 && rec && (
                  <div className="upgrade-note" role="status">
                    <Icon name="up" />
                    <span><b>{E.outdated(old.length, NAME[kind])}</b><span className="hint">{E.upgradeNote}</span></span>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => void upgrade(kind, rec.version, old.map(p => p.id))}>{E.upgrade(rec.version)}</button>
                  </div>
                )}
                {!versions.length && <p className="hint">{E.none}</p>}
                <ol className="timeline">
                  {versions.map(version => {
                    const k = local.find(x => x.version === version);
                    const rows = catalog.filter(x => x.kind === kind && x.version === version);
                    const recommended = k ? k.recommended : rows.some(x => x.recommended);
                    const pr = data.progress[kernelKey(kind, version)], downloading = pr && !pr.finished && !pr.error;
                    const here = usedHere(kind, version).length, everywhere = rows.find(x => x.profiles !== null)?.profiles ?? 0;
                    const label = `${NAME[kind]} ${version}`;
                    return (
                      <li key={version} className={`${recommended ? 'rec' : ''}${k?.installed ? ' got' : ''}`} data-version={version}>
                        <span className="tl-dot" aria-hidden="true" />
                        <div className="tl-main">
                          <p className="tl-head">
                            <b className="mono">{version}</b>
                            {recommended && <span className="tag first rec-tag">{E.recommended}</span>}
                            {k && !k.available && <span className="tag first">{E.retired}</span>}
                          </p>
                          <p className="hint">{[E.usedBy(here), admin && E.everywhere(everywhere)].filter(Boolean).join(' · ')}</p>
                          {admin && rows.length > 0 && (
                            <p className="platforms">{rows.map(x => <span key={x.id} className={`tag first${x.ready ? '' : ' warn'}`} title={x.ready ? bytes(x.size) : E.admin.unfinished}>{E.platforms[x.platform] ?? x.platform}{!x.ready && ` · ${E.admin.unfinished}`}</span>)}</p>
                          )}
                          {pr?.error && <p className="err">{E.failed}</p>}
                          {retiring === `${kind} ${version}` && (
                            <div className="away-note" role="alertdialog" aria-label={E.admin.retire}>
                              <span>{E.admin.retireConfirm(label, everywhere)}</span>
                              <div className="d-actions">
                                <button type="button" className="btn btn-xs btn-text" onClick={() => setRetiring(null)}>{d.common.cancel}</button>
                                <button type="button" className="btn btn-xs btn-danger solid" onClick={() => void retire(rows)}>{E.admin.retire}</button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="tl-acts">
                          {downloading ? <Ring pct={percent(pr)} label={d.form.downloading(percent(pr))} />
                            : k?.installed ? <>
                              <span className="pill-ok"><Icon name="check" />{E.installed}</span>
                              <button type="button" className="btn btn-xs btn-danger" disabled={running(kind, version)} title={running(kind, version) ? E.removeBusy : undefined}
                                onClick={() => void data.removeKernel(kind, version).then(() => toast(E.removed(label)))}>{E.remove}</button>
                            </>
                            : k?.available && <button type="button" className="btn btn-xs btn-secondary" onClick={() => void data.install(kind, version)}><Icon name="download" />{E.download(bytes(k.size ?? 0))}</button>}
                          {admin && rows.some(x => x.ready) && !recommended && <button type="button" className="btn btn-xs btn-text" onClick={() => void recommend(rows.find(x => x.ready)!)}>{E.admin.recommend}</button>}
                          {admin && rows.length > 0 && <button type="button" className="btn btn-xs btn-danger" onClick={() => setRetiring(`${kind} ${version}`)}>{E.admin.retire}</button>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </main>
      {uploading && <UploadDialog d={d} onClose={() => setUploading(false)} onDone={reload} />}
    </div>
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
      await folio.uploadKernel(file!.token, { kind, version: version.trim(), platform });
      toast(A.done(`${NAME[kind]} ${version.trim()}`));
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
              {KINDS.map(k => <button key={k} type="button" aria-pressed={kind === k} disabled={busy} onClick={() => setKind(k)}>{NAME[k]}</button>)}
            </div>
          </div>
          <SelectField label={A.platform} value={platform} onChange={setPlatform} disabled={busy} options={PLATFORMS.map(p => ({ value: p, label: d.engines.platforms[p] }))} />
        </div>
        <label className="field"><span>{A.version}</span>
          <input className="mono-in" value={version} placeholder={A.versionPh} disabled={busy} spellCheck={false} onChange={e => setVersion(e.target.value)} />
        </label>
        {progress && <Progress done={progress.done} total={progress.total} />}
      </div>
    </Modal>
  );
}
