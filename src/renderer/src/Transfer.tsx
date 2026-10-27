// Exporting a whole workspace to a passphrase-protected file, and importing one.
import { useState, type FormEvent } from 'react';
import type { ImportPreview } from '@shared/bridge';
import { folio, isApiError, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Cancel, Modal, useToast } from './ui';

const why = (d: Dict, e: unknown) => errorText(d, isApiError(e) ? e.code : 'internal');

export function ExportDialog({ d, ws, onClose }: { d: Dict; ws: Workspace; onClose(): void }){
  const T = d.transfer;
  const toast = useToast();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent){
    e.preventDefault();
    if (pass.length < 10){ setError(T.passShort); return; }
    if (pass !== again){ setError(T.passMismatch); return; }
    setBusy(true); setError(null);
    try {
      const r = await folio.exportWorkspace(ws.id, pass);
      if (r){ toast(T.exported(r.path)); onClose(); }
    } catch (err){ setError(why(d, err)); } finally { setBusy(false); }
  }
  return (
    <Modal title={T.exportTitle} onClose={onClose} busy={busy} foot={<>
      <Cancel />
      <button className="btn btn-primary" type="submit" form="export-form" disabled={busy} aria-busy={busy || undefined}>{T.export}</button>
    </>}>
      <form className="m-body" id="export-form" onSubmit={submit} noValidate>
        <p className="muted">{T.exportLead}</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="ex-pass">{T.passphrase}</label>
          <input id="ex-pass" type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="ex-again">{T.confirm}</label>
          <input id="ex-again" type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} />
          <p className="hint">{T.passHelp}</p>
        </div>
      </form>
    </Modal>
  );
}

export function ImportDialog({ d, ws, data, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; onClose(): void }){
  const T = d.transfer;
  const toast = useToast();
  const [file, setFile] = useState<{ token: string; name: string } | null>(null);
  const [pass, setPass] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const room = ws.subscription.entitlements.profiles - data.profiles.length;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (err){ setError(why(d, err)); } finally { setBusy(false); }
  };
  const unlock = (e: FormEvent) => { e.preventDefault(); void run(async () => { setPreview(await folio.unlockImport(file!.token, pass)); }); };
  const start = () => run(async () => {
    const r = await folio.runImport(file!.token, ws.id);
    data.refresh('profiles', 'proxies', 'groups');
    toast(T.imported(r));
    onClose();
  });

  return (
    <Modal title={T.importTitle} onClose={onClose} busy={busy} foot={<>
      <Cancel />
      {preview
        ? <button className="btn btn-primary" type="button" disabled={busy || preview.profiles > room} aria-busy={busy || undefined} onClick={() => void start()}>{T.import}</button>
        : <button className="btn btn-primary" type="submit" form="import-form" disabled={busy || !file || !pass} aria-busy={busy || undefined}>{T.unlock}</button>}
    </>}>
      <form className="m-body" id="import-form" onSubmit={unlock} noValidate>
        <p className="muted">{T.importLead}</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="file-row">
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void folio.pickImport().then(f => { if (f){ setFile(f); setPreview(null); } })}>{T.choose}</button>
          {file && <span className="hint mono">{file.name}</span>}
        </div>
        {file && !preview && (
          <div className="field">
            <label htmlFor="im-pass">{T.passphrase}</label>
            <input id="im-pass" type="password" autoComplete="off" value={pass} onChange={e => setPass(e.target.value)} autoFocus />
          </div>
        )}
        {preview && (
          <div className="import-result" role="status">
            <p><b>{T.preview(preview)}</b></p>
            {preview.profiles > room && <p className="err">{T.room(Math.max(0, room))}</p>}
          </div>
        )}
      </form>
    </Modal>
  );
}
