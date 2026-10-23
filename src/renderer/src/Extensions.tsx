// The workspace's extension library: owners and admins add extensions (a file, or from the Chrome Web Store or
// addons.mozilla.org), upload new versions and delete them; everyone sees the library and installs from it in the
// profile form or the bulk actions.
import { useState, type ChangeEvent } from 'react';
import type { KernelKind } from '@shared/bridge';
import { folio, isApiError, type Extension, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict } from './i18n';
import { Icon, Modal, useToast } from './ui';

const engine = (k: KernelKind) => (k === 'chromium' ? 'Chromium' : 'Firefox');

export function ExtensionsPage({ d, ws, data }: { d: Dict; ws: Workspace; data: WorkspaceData }){
  const X = d.extensions;
  const toast = useToast();
  const manager = data.role !== 'member';
  const [dialog, setDialog] = useState<{ ext?: Extension } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function remove(e: Extension){
    setConfirm(null);
    try { await folio.api('DELETE', `/extensions/${e.id}`); toast(X.deleted(e.name)); } catch (err){ toast(errorText(d, isApiError(err) ? err.code : 'internal')); }
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
        <div className="tw top-gap">
          <table>
            <thead><tr><th scope="col">{X.cols.name}</th><th scope="col">{X.cols.engine}</th><th scope="col">{X.cols.version}</th><th scope="col" className="num">{X.cols.profiles}</th><th scope="col">{X.cols.updated}</th>{manager && <th className="act" scope="col" />}</tr></thead>
            <tbody>
              {!data.extensions.length && <tr className="empty"><td colSpan={6}><p>{X.empty}</p></td></tr>}
              {data.extensions.map(e => (
                <tr key={e.id} data-extension={e.name}>
                  <td><b>{e.name}</b><span className="l2 mono">{e.source === 'store' ? e.storeId : X.uploaded}</span></td>
                  <td>{engine(e.kernel)}</td>
                  <td className="mono ver">{e.version}</td>
                  <td className="num">{e.profiles}</td>
                  <td>{ago(e.updatedAt, d)}</td>
                  {manager && <td className="act"><span className="actin">
                    {confirm === e.id ? <>
                      <span className="hint">{X.confirmDelete(e.name, e.profiles)}</span>
                      <button type="button" className="btn btn-xs btn-text" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
                      <button type="button" className="btn btn-xs btn-danger solid" onClick={() => void remove(e)}>{X.delete}</button>
                    </> : <>
                      <button type="button" className="btn btn-xs btn-secondary" onClick={() => setDialog({ ext: e })}>{X.update}</button>
                      <button type="button" className="btn btn-xs btn-danger" aria-label={X.deleteX(e.name)} onClick={() => setConfirm(e.id)}>{X.delete}</button>
                    </>}
                  </span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
