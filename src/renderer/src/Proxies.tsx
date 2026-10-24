// The proxy library: add, edit, import lists, check (through this computer, results shared with the team),
// and backup lines.
import { useMemo, useState, type FormEvent } from 'react';
import { folio, isApiError, type Proxy, type ProxyImport } from './api';
import { proxyState } from './checks';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict } from './i18n';
import { BulkBar, Icon, Modal, Spark, useToast } from './ui';
import { ExitMap, type Pin } from './ExitMap';
import { SelectField } from './Select';

type ProxyType = Proxy['type'];
const TYPES: ProxyType[] = ['http', 'https', 'socks5'];
const HOST = /^[A-Za-z0-9.:_-]+$/;

export function ProxiesPage({ d, data, onAdd, onEdit, onImport }: { d: Dict; data: WorkspaceData; onAdd(): void; onEdit(id: string): void; onImport(): void }){
  const toast = useToast();
  const X = d.proxies;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const byId = useMemo(() => new Map(data.proxies.map(p => [p.id, p])), [data.proxies]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data.proxies;
    return data.proxies.filter(p => {
      const g = p.lastCheck?.geo;
      return [p.name, p.host, p.username, p.lastCheck?.ip, g?.city, g?.country, g?.countryName].join(' ').toLowerCase().includes(needle);
    });
  }, [data.proxies, q]);
  const ids = [...sel].filter(id => byId.has(id));
  const down = data.proxies.filter(p => proxyState(p) === 'down').length;
  const states = { ok: 0, slow: 0, down: 0, unchecked: 0 };
  for (const p of data.proxies){ const st = proxyState(p); if (st !== 'none') states[st]++; }
  // A pin per exit; a line that is down sits where it last got through.
  const pins = useMemo(() => {
    const at = new Map<string, Pin>();
    for (const p of data.proxies){
      const st = proxyState(p), g = p.lastCheck?.ok ? p.lastCheck.geo : p.lastExit?.geo;
      if (!g || st === 'unchecked') continue;
      const key = g.city ?? g.countryName, pin = at.get(key);
      const state = st === 'down' ? 'bad' : st === 'slow' ? 'warn' : 'ok';
      if (!pin) at.set(key, { key, lat: g.lat, lon: g.lon, state, title: [g.city, g.countryName].filter(Boolean).join(', '), lines: [p.name] });
      else { pin.lines.push(p.name); if (state === 'bad' || (state === 'warn' && pin.state === 'ok')) pin.state = state; }
    }
    return [...at.values()];
  }, [data.proxies]);
  const shownSel = list.filter(p => sel.has(p.id)).length;

  async function check(targets: string[]){
    await data.check(targets);
    toast(X.checked(targets.length));
  }
  async function remove(targets: string[]){
    setConfirm(false);
    try {
      await Promise.all(targets.map(id => folio.api('DELETE', `/proxies/${id}`)));
      setSel(new Set());
      toast(X.deleted(targets.length));
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); }
    data.refresh('proxies', 'profiles');
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{X.title}</h1><p className="sub" data-testid="proxies-sub">{X.sub(data.proxies.length, down)}</p></div>
          <label className="search">
            <Icon name="search" /><span className="sr">{X.search}</span>
            <input type="search" placeholder={X.searchPh} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          <button className="btn btn-secondary" type="button" disabled={!data.proxies.length || data.checking.size > 0} title={data.checking.size ? d.common.checking : undefined} onClick={() => void check(data.proxies.map(p => p.id))}>{X.checkAll}</button>
          <button className="btn btn-secondary" type="button" onClick={onImport}>{X.import}</button>
          <button className="btn btn-primary" type="button" onClick={onAdd}><Icon name="plus" />{X.add}</button>
        </header>

        {data.proxies.length > 0 && (
          <section className="px-hero" aria-label={X.mapLabel}>
            <ExitMap small pins={pins} label={X.mapLabel} onPick={setQ} />
            <dl className="px-states">
              {(['ok', 'slow', 'down', 'unchecked'] as const).map(k => (
                <div key={k} className={k}><dt><span className={`d ${k === 'ok' ? 'good' : k === 'slow' ? 'warn' : k === 'down' ? 'bad' : ''}`} aria-hidden="true" />{X.states[k]}</dt><dd>{states[k]}</dd></div>
              ))}
            </dl>
          </section>
        )}

        {ids.length > 0 && (
          <BulkBar n={ids.length} label={d.common.selected(ids.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
            <button type="button" className="bb" onClick={() => void check(ids)}><Icon name="check" />{X.bulkCheck}</button>
            <button type="button" className="bb danger" onClick={() => setConfirm(true)}><Icon name="trash" />{X.bulkDelete}</button>
          </BulkBar>
        )}
        {confirm && ids.length > 0 && (
          <Modal icon="trash" tone="bad" title={X.confirmDelete(ids.length)} closeLabel={d.common.close} onClose={() => setConfirm(false)} foot={<>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{d.common.cancel}</button>
            <button type="button" className="btn btn-danger solid" onClick={() => void remove(ids)}>{X.bulkDelete}</button>
          </>}><p>{X.confirmNote}</p></Modal>
        )}

        <div className="tw top-gap">
          <table>
            <thead>
              <tr>
                <th className="cb" scope="col">
                  <input type="checkbox" aria-label={d.common.selectAll} checked={list.length > 0 && shownSel === list.length}
                    onChange={() => setSel(shownSel === list.length ? new Set() : new Set(list.map(p => p.id)))} />
                </th>
                <th scope="col">{X.cols.proxy}</th><th scope="col">{X.cols.exit}</th><th scope="col">{X.cols.check}</th>
                <th scope="col" className="num">{X.cols.profiles}</th><th scope="col">{X.cols.backup}</th><th className="act" scope="col" />
              </tr>
            </thead>
            <tbody>
              {!list.length && <tr className="empty"><td colSpan={7}><p>{data.proxies.length ? d.profiles.emptyMatch : X.empty}</p></td></tr>}
              {list.map(p => {
                const c = p.lastCheck, g = c?.ok ? c.geo : null, s = proxyState(p), busy = data.checking.has(p.id);
                return (
                  <tr key={p.id} data-id={p.id}>
                    <td className="cb"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={d.common.select(p.name)} /></td>
                    <td>
                      <span className="l1"><b>{p.name}</b><span className="cc">{p.type.toUpperCase()}</span></span>
                      <span className="l2 mono">{[p.name !== `${p.host}:${p.port}` && `${p.host}:${p.port}`, p.username].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td>
                      {g ? <span className="l1"><span className="cc">{g.country}</span>{g.city ?? g.countryName}</span>
                        : p.lastExit?.geo ? <span className="l1 muted" title={X.lastSeen}><span className="cc">{p.lastExit.geo.country}</span>{p.lastExit.geo.city ?? p.lastExit.geo.countryName}</span>
                        : <span className="l1">{X.none}</span>}
                      <span className="l2 mono">{c?.ok ? c.ip : p.lastExit?.ip ?? ''}</span>
                    </td>
                    <td data-testid="proxy-check">
                      {busy ? <span className="st boot"><span className="spin" aria-hidden="true" />{d.common.checking}</span> : (
                        <span className="check-cell">
                          <span>
                            <span className="l1">{!c ? <span className="lat">{X.never}</span> : c.ok
                              ? <span className={`lat ${s}`}>{d.profiles.ms(c.ms ?? 0)}</span> : <span className="lat down">{X.noResponse(c.error ?? '')}</span>}</span>
                            {c && <span className="l2">{ago(c.checkedAt, d)}{p.history.length > 1 && ` · ${X.uptime(Math.round((p.history.filter(h => h.ok).length / p.history.length) * 100))}`}</span>}
                          </span>
                          {p.history.length > 1 && <span title={X.history(p.history.length)}><Spark history={p.history} /></span>}
                        </span>
                      )}
                    </td>
                    <td className="num">{p.profiles}</td>
                    <td>{p.backupId ? byId.get(p.backupId)?.name ?? X.none : X.none}</td>
                    <td className="act"><span className="actin">
                      <button type="button" className="btn btn-xs btn-secondary" aria-label={X.checkX(p.name)} disabled={busy} onClick={() => void data.check([p.id])}>{d.common.check}</button>
                      <button type="button" className="btn btn-xs btn-text" aria-label={X.editX(p.name)} onClick={() => onEdit(p.id)}>{d.common.edit}</button>
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.proxies.some(p => p.lastCheck?.geo) && <p className="attrib page-attrib">{d.common.attribution}</p>}
      </main>
    </div>
  );
}

export function ProxyForm({ d, wsId, data, proxy, onClose }: { d: Dict; wsId: string; data: WorkspaceData; proxy?: Proxy; onClose(): void }){
  const X = d.proxies;
  const toast = useToast();
  const [name, setName] = useState(proxy?.name ?? '');
  const [type, setType] = useState<ProxyType>(proxy?.type ?? 'socks5');
  const [host, setHost] = useState(proxy?.host ?? '');
  const [port, setPort] = useState(proxy ? String(proxy.port) : '');
  const [username, setUsername] = useState(proxy?.username ?? '');
  const [password, setPassword] = useState('');
  const [dropPassword, setDropPassword] = useState(false);
  const [backupId, setBackupId] = useState(proxy?.backupId ?? '');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hostErr = tried && !HOST.test(host.trim()) ? X.hostErr : null;
  const portN = Number(port), portErr = tried && !(Number.isInteger(portN) && portN >= 1 && portN <= 65535) ? X.portErr : null;

  async function submit(e: FormEvent){
    e.preventDefault();
    setTried(true);
    if (!HOST.test(host.trim()) || !(Number.isInteger(portN) && portN >= 1 && portN <= 65535)) return;
    setBusy(true); setError(null);
    const body = {
      name: name.trim() || `${host.trim()}:${portN}`, type, host: host.trim(), port: portN, username: username.trim() || null, backupId: backupId || null,
      ...(password ? { password } : dropPassword ? { password: null } : proxy ? {} : { password: null })
    };
    try {
      const saved = proxy
        ? await folio.api<Proxy>('PATCH', `/proxies/${proxy.id}`, body)
        : await folio.api<Proxy>('POST', `/workspaces/${wsId}/proxies`, body);
      data.refresh('proxies');
      onClose();
      toast(d.profiles.done.saved);
      // New and moved proxies have no check yet.
      if (!saved.lastCheck) void data.check([saved.id]);
    } catch (err){
      setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }

  return (
    <Modal title={proxy ? X.formEdit : X.formAdd} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
      <button className="btn btn-primary" type="submit" form="proxy-form" disabled={busy}>{d.common.save}</button>
    </>}>
      <form className="m-body" id="proxy-form" onSubmit={submit} noValidate>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="row2">
          <div className="field">
            <label htmlFor="px-name">{X.name}</label>
            <input id="px-name" placeholder={X.namePh} value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div className="field">
            <span className="label" id="px-type">{X.type}</span>
            <div className="seg" role="group" aria-labelledby="px-type">
              {TYPES.map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>{t.toUpperCase()}</button>)}
            </div>
          </div>
        </div>
        <div className="row2 host-port">
          <div className="field">
            <label htmlFor="px-host">{X.host}</label>
            <input id="px-host" className="mono-in" value={host} onChange={e => setHost(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!!hostErr} />
            {hostErr && <p className="err">{hostErr}</p>}
          </div>
          <div className="field">
            <label htmlFor="px-port">{X.port}</label>
            <input id="px-port" className="mono-in" inputMode="numeric" value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} aria-invalid={!!portErr} />
            {portErr && <p className="err">{portErr}</p>}
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="px-user">{X.user}</label>
            <input id="px-user" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div className="field">
            <label htmlFor="px-pass">{X.pass}</label>
            <input id="px-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
              placeholder={proxy?.hasPassword && !dropPassword ? X.passKeep : ''} disabled={dropPassword} />
            {proxy?.hasPassword && (
              <label className="check-row"><input type="checkbox" checked={dropPassword} onChange={e => setDropPassword(e.target.checked)} />{X.passRemove}</label>
            )}
          </div>
        </div>
        <SelectField label={X.backup} value={backupId} onChange={setBackupId} hint={X.backupHint} searchPh={d.form.searchPh}
          options={[{ value: '', label: X.backupNone }, ...data.proxies.filter(p => p.id !== proxy?.id).map(p => ({ value: p.id, label: p.name, hint: p.lastCheck?.geo?.city ?? undefined }))]} />
      </form>
    </Modal>
  );
}

export function ProxyImportDialog({ d, wsId, data, onClose }: { d: Dict; wsId: string; data: WorkspaceData; onClose(): void }){
  const X = d.proxies;
  const [text, setText] = useState('');
  const [type, setType] = useState<ProxyType>('http');
  const [result, setResult] = useState<ProxyImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent){
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await folio.api<ProxyImport>('POST', `/workspaces/${wsId}/proxies/import`, { text, defaultType: type });
      setResult(r);
      data.refresh('proxies');
      void data.check(r.proxies.filter(p => !p.lastCheck).map(p => p.id));
      if (!r.errors.length) setText('');
    } catch (err){
      setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }
  const known = result ? new Set(result.proxies.map(p => p.id)).size - result.added : 0;

  return (
    <Modal title={X.importTitle} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.close}</button>
      <button className="btn btn-primary" type="submit" form="proxy-import" disabled={busy || !text.trim()}>{X.importBtn}</button>
    </>}>
      <form className="m-body" id="proxy-import" onSubmit={submit} noValidate>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="pi-text">{X.importLead}</label>
          <pre className="formats">{'socks5://user:pass@host:port\nuser:pass@host:port\nhost:port:user:pass\nhost:port'}</pre>
          <textarea id="pi-text" className="mono-in" rows={8} value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoFocus />
        </div>
        <SelectField label={X.defaultType} value={type} onChange={v => setType(v as ProxyType)} options={TYPES.map(t => ({ value: t, label: t.toUpperCase() }))} />
        {result && (
          <div className="import-result" role="status">
            <p><b>{X.imported(result.added, known)}</b></p>
            {result.errors.length > 0 && <>
              <p className="err">{X.badLines}</p>
              <ul className="bad-lines">{result.errors.map(e => <li key={e.line}><span className="mono">{X.line(e.line)}</span> {e.text}</li>)}</ul>
            </>}
          </div>
        )}
      </form>
    </Modal>
  );
}
