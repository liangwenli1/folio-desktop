// The workspace's extension library: owners and admins add extensions (a file, or from the Chrome Web Store or
// addons.mozilla.org), upload new versions and delete them; everyone sees the library and installs from it in the
// profile form or the bulk actions.
import { useState, type ChangeEvent } from 'react';
import type { KernelKind } from '@shared/bridge';
import { folio, isApiError, type Extension, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict } from './i18n';
import { Icon, Modal, useToast } from './ui';

// The shield on each card: every package is checked against Folio's signature and its sha256 before it is installed.
const SHIELD = 'M8 1.8 13 3.6v4.1c0 3-2.1 5.5-5 6.5-2.9-1-5-3.5-5-6.5V3.6zM5.6 8l1.7 1.7 3.2-3.4';

const engine = (k: KernelKind) => (k === 'chromium' ? 'Chromium' : 'Firefox');

export function ExtensionsPage({ d, ws, data }: { d: Dict; ws: Workspace; data: WorkspaceData }){
  const X = d.extensions;
  const toast = useToast();
  const manager = data.role !== 'member';
  const [dialog, setDialog] = useState<{ ext?: Extension } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  // Icons that turned out not to be images show the generic one.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());

  async function remove(e: Extension){
    setConfirm(null);
    try { await folio.api('DELETE', `/extensions/${e.id}`); toast(X.deleted(e.name)); } catch (err){ toast(errorText(d, isApiError(err) ? err.code : 'internal'), undefined, 'bad'); }
    data.refresh('extensions', 'profiles');
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{X.title}</h1><p className="sub">{X.sub(data.extensions.length)}</p></div>
          <span className="sp" />
          {manager && <button className="btn btn-primary" type="button" onClick={() => setDialog({})}><Icon name="plus" />{X.add}</button>}
        </header>
        {!manager && <p className="hint page-note">{X.memberNote}</p>}
        {!data.extensions.length && <div className="ext-empty"><Icon name="extensions" /><p>{X.empty}</p></div>}
        <ul className="ext-grid">
          {data.extensions.map(e => (
            <li key={e.id} className="ext-card" data-extension={e.name}>
              <div className="ext-top">
                <span className="ext-icon">{e.icon && !broken.has(e.id) ? <img src={e.icon} alt="" onError={() => setBroken(b => new Set(b).add(e.id))} /> : <Icon name="extensions" />}</span>
                <span className="ext-name"><b>{e.name}</b><span className="l2 mono">{e.source === 'store' ? e.storeId : X.uploaded}</span></span>
                <span className="shield" title={X.signedNote}><svg className="i" viewBox="0 0 16 16" aria-hidden="true"><path d={SHIELD} /></svg>{X.signed}</span>
              </div>
              <dl className="ext-facts">
                <div><dt>{X.cols.engine}</dt><dd><span className={`eng-dot ${e.kernel}`} aria-hidden="true" />{engine(e.kernel)}</dd></div>
                <div><dt>{X.cols.version}</dt><dd className="mono">{e.version}</dd></div>
                <div><dt>{X.cols.profiles}</dt><dd>{e.profiles}</dd></div>
                <div><dt>{X.cols.updated}</dt><dd>{ago(e.updatedAt, d)}</dd></div>
              </dl>
              {manager && (confirm === e.id ? (
                <div className="away-note" role="alertdialog" aria-label={X.delete}>
                  <span>{X.confirmDelete(e.name, e.profiles)}</span>
                  <div className="d-actions"><button type="button" className="btn btn-xs btn-text" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
                    <button type="button" className="btn btn-xs btn-danger solid" onClick={() => void remove(e)}>{X.delete}</button></div>
                </div>
              ) : (
                <div className="ext-acts">
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => setDialog({ ext: e })}>{X.update}</button>
                  <button type="button" className="btn btn-xs btn-danger" aria-label={X.deleteX(e.name)} onClick={() => setConfirm(e.id)}>{X.delete}</button>
                </div>
              ))}
            </li>
          ))}
        </ul>
      </main>
      {dialog && <ExtensionDialog d={d} ws={ws} data={data} ext={dialog.ext} onClose={() => setDialog(null)} />}
    </div>
  );
}

// Adding an extension, or a new version of one: from a file, or from its store.
function ExtensionDialog({ d, ws, data, ext, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; ext?: Extension; onClose(): void }){
  const X = d.extensions;
  const toast = useToast();
  const [kernel, setKernel] = useState<KernelKind>(ext?.kernel ?? 'chromium');
  const [how, setHow] = useState<'file' | 'store'>(ext?.source === 'store' ? 'store' : 'file');
  const [file, setFile] = useState<File | null>(null);
  const [store, setStore] = useState(ext?.source === 'store' ? ext.storeId ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(){
    setBusy(true); setError(null);
    try {
      const from = how === 'file' ? { file: new Uint8Array(await file!.arrayBuffer()) } : { store: store.trim() };
      const r = ext ? await folio.updateExtension(ext.id, ext.kernel, from) : await folio.addExtension(ws.id, kernel, from);
      data.refresh('extensions');
      toast(ext ? X.updated(r.name) : X.added(r.name));
      onClose();
    } catch (err){ setError(errorText(d, isApiError(err) ? err.code : 'internal')); }
    finally { setBusy(false); }
  }
  const pick = (e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null);
  const ready = how === 'file' ? !!file : !!store.trim();

  return (
    <Modal title={ext ? X.updateTitle(ext.name) : X.addTitle} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
      <button className="btn btn-primary" type="button" disabled={!ready || busy} onClick={() => void submit()}>{busy ? (how === 'store' ? X.fetching : X.uploading) : ext ? X.updateDo : X.addDo}</button>
    </>}>
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        {!ext && (
          <div className="field"><span className="label">{X.cols.engine}</span>
            <div className="seg" role="group" aria-label={X.cols.engine}>
              {(['chromium', 'firefox'] as const).map(k => <button key={k} type="button" aria-pressed={kernel === k} onClick={() => { setKernel(k); setFile(null); }}>{engine(k)}</button>)}
            </div>
          </div>
        )}
        <div className="field"><span className="label">{X.from}</span>
          <div className="seg" role="group" aria-label={X.from}>
            <button type="button" aria-pressed={how === 'file'} onClick={() => setHow('file')}>{X.fromFile}</button>
            <button type="button" aria-pressed={how === 'store'} onClick={() => setHow('store')}>{X.fromStore(kernel)}</button>
          </div>
        </div>
        {how === 'file' ? (
          <div className="field">
            <div className="file-row">
              <label className="btn btn-secondary btn-sm file-btn">{X.chooseFile}<input type="file" aria-label={X.chooseFile} accept={kernel === 'chromium' ? '.crx,.zip' : '.xpi,.zip'} onChange={pick} /></label>
              {file && <span className="hint mono">{file.name}</span>}
            </div>
            <p className="hint">{kernel === 'chromium' ? X.fileHintChromium : X.fileHintFirefox}</p>
          </div>
        ) : (
          <label className="field"><span>{kernel === 'chromium' ? X.storeChromium : X.storeFirefox}</span>
            <input className="mono-in" value={store} spellCheck={false} placeholder={kernel === 'chromium' ? 'https://chromewebstore.google.com/detail/…' : 'https://addons.mozilla.org/firefox/addon/…'} onChange={e => setStore(e.target.value)} />
          </label>
        )}
        <p className="hint">{kernel === 'chromium' ? X.idNote : X.uuidNote}</p>
      </div>
    </Modal>
  );
}
