// Creates profiles from a spreadsheet: proxies first (the server reads the lines and reuses saved ones),
// then missing groups, then a fingerprint per row from the main process, then one bulk create.
import { useMemo, useState, type ChangeEvent } from 'react';
import { folio, isApiError, type ProxyImport, type Workspace } from './api';
import { MAX_ROWS, TEMPLATE, readProfiles } from './csv';
import { kernelKey, type WorkspaceData } from './data';
import { errorText, type Dict } from './i18n';
import { Modal, percent, useToast } from './ui';

export function ProfileImportDialog({ d, ws, data, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; onClose(): void }){
  const I = d.importer;
  const toast = useToast();
  const [text, setText] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [badProxies, setBadProxies] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => (text.trim() ? readProfiles(text) : null), [text]);
  const rows = parsed?.rows ?? [];
  const room = ws.subscription.entitlements.profiles - (data.profiles?.length ?? 0);
  const firefox = data.kernels.find(k => k.kind === 'firefox');
  const needsFirefox = rows.some(r => r.kernel === 'firefox') && !firefox?.installed;
  const ffProgress = firefox ? data.progress[kernelKey('firefox', firefox.version)] : undefined;
  const blocked = !rows.length || !!parsed?.errors.length || rows.length > MAX_ROWS || rows.length > room || needsFirefox || !!step;

  async function pick(e: ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0];
    if (file){ setText(await file.text()); setBadProxies([]); }
    e.target.value = '';
  }

  async function submit(){
    setError(null); setBadProxies([]);
    try {
      const proxyOf = new Map<string, string>();
      const lines = [...new Set(rows.map(r => r.proxy).filter((l): l is string => !!l))];
      if (lines.length){
        setStep(I.steps.proxies);
        // Lines the server would skip as comments cannot be proxies either.
        const sendable = lines.filter(l => !l.startsWith('#'));
        const r = sendable.length ? await folio.api<ProxyImport>('POST', `/workspaces/${ws.id}/proxies/import`, { text: sendable.join('\n'), defaultType: 'http' }) : null;
        const failed = new Set([...lines.filter(l => l.startsWith('#')), ...(r?.errors ?? []).map(e => sendable[e.line - 1])]);
        sendable.filter(l => !failed.has(l)).forEach((l, i) => proxyOf.set(l, r!.proxies[i].id));
        data.refresh('proxies');
        if (failed.size){ setBadProxies(rows.filter(x => x.proxy && failed.has(x.proxy)).map(x => x.line)); return; }
      }

      setStep(I.steps.groups);
      const groupOf = new Map(data.groups.map(g => [g.name, g.id]));
      for (const name of new Set(rows.map(r => r.group).filter((g): g is string => !!g))){
        if (!groupOf.has(name)) groupOf.set(name, await data.ensureGroup(name));
      }

      const profiles = [];
      for (const [i, r] of rows.entries()){
        setStep(I.steps.fingerprints(i + 1, rows.length));
        const fp = await folio.newFingerprint(r.kernel, r.os);
        profiles.push({
          name: r.name, groupId: r.group ? groupOf.get(r.group)! : null, tags: [...new Set(r.tags)], kernel: r.kernel, os: r.os,
          kernelVersion: fp.kernelVersion, fingerprint: fp.fingerprint, proxyId: r.proxy ? proxyOf.get(r.proxy)! : null,
          timezoneOverride: r.timezone, localeOverride: r.language, notes: r.notes
        });
      }
      setStep(I.steps.saving);
      const created = (await folio.api<{ profiles: { id: string }[] }>('POST', `/workspaces/${ws.id}/profiles/bulk`, { profiles })).profiles;
      // Created in the order sent, so row i is profile i.
      for (const [i, r] of rows.entries()){
        if (!r.cookies) continue;
        setStep(I.steps.cookies(i + 1, rows.length));
        await folio.importCookies(created[i].id, r.cookies);
      }
      data.refresh('profiles', 'groups');
      toast(I.done(profiles.length));
      onClose();
    } catch (e){
      setError(errorText(d, isApiError(e) ? e.code : 'internal'));
    } finally { setStep(null); }
  }

  return (
    <Modal title={I.title} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-ghost" type="button" onClick={onClose}>{d.common.cancel}</button>
      <button className="btn btn-stamp" type="button" disabled={blocked} onClick={() => void submit()}>{step ?? I.submit(rows.length)}</button>
    </>}>
      <div className="m-body">
        <p className="muted">{I.lead}</p>
        <p className="hint">{I.columns}</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="file-row">
          <label className="btn btn-line btn-sm file-btn">{I.file}<input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={pick} /></label>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setText(TEMPLATE)}>{I.example}</button>
        </div>
        <div className="field">
          <label htmlFor="ci-text">{I.pasteLabel}</label>
          <textarea id="ci-text" className="mono-in" rows={7} value={text} onChange={e => { setText(e.target.value); setBadProxies([]); }} spellCheck={false} />
        </div>
        {parsed && (
          <div className="import-result" role="status">
            {parsed.errors.some(e => e.problem === 'header') ? <p className="err">{I.header}</p> : <>
              {rows.length > 0 && !parsed.errors.length && <p><b>{I.ready(rows.length)}</b></p>}
              {rows.length > MAX_ROWS && <p className="err">{I.tooMany}</p>}
              {rows.length <= MAX_ROWS && rows.length > room && <p className="err">{I.room(Math.max(0, room))}</p>}
              {needsFirefox && (
                <p className="err">{I.firefox}{' '}
                  {ffProgress && !ffProgress.error && !ffProgress.finished
                    ? d.form.downloading(percent(ffProgress))
                    : <button className="linkish" type="button" onClick={() => void data.install('firefox', firefox!.version)}>{d.form.download}</button>}
                </p>
              )}
              {(parsed.errors.length > 0 || badProxies.length > 0) && <>
                <p className="err">{I.problems}</p>
                <ul className="bad-lines">
                  {parsed.errors.map(e => <li key={e.line}><span className="mono">{I.row(e.line)}</span> {I.errs[e.problem]}{e.value ? ` “${e.value}”` : ''}</li>)}
                  {badProxies.map(line => <li key={`p${line}`}><span className="mono">{I.row(line)}</span> {I.errs.proxy}</li>)}
                </ul>
              </>}
            </>}
          </div>
        )}
      </div>
    </Modal>
  );
}
