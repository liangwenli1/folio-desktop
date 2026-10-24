// The workspace's extension library: owners and admins add extensions (a file, or from the Chrome Web Store or
// addons.mozilla.org), upload new versions and delete them; everyone sees the library and installs from it in the
// profile form or the bulk actions.
import { useState, type ChangeEvent, type ReactNode } from 'react';
import type { KernelKind } from '@shared/bridge';
import { folio, isApiError, type Extension, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict } from './i18n';
import { ENGINES } from './checks';
import { BulkBar, ExtIcon, Icon, Modal, ViewSwitch, useOutsideClose, useToast, useView } from './ui';
import { EngineLogo, Flag } from './Flag';

// The shield on each card: every package is checked against Folio's signature and its sha256 before it is installed.
const SHIELD = 'M8 1.8 13 3.6v4.1c0 3-2.1 5.5-5 6.5-2.9-1-5-3.5-5-6.5V3.6zM5.6 8l1.7 1.7 3.2-3.4';
type Filter = 'all' | KernelKind;

export function ExtensionsPage({ d, ws, data }: { d: Dict; ws: Workspace; data: WorkspaceData }){
  const X = d.extensions;
  const toast = useToast();
  const manager = data.role !== 'member';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useView<'cards' | 'table'>('extensions', 'cards');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<{ ext?: Extension } | null>(null);
  const [installing, setInstalling] = useState<Extension[] | null>(null);
  const [confirm, setConfirm] = useState<Extension | null>(null);
  const counts: Record<Filter, number> = { all: data.extensions.length, chromium: 0, firefox: 0 };
  for (const e of data.extensions) counts[e.kernel]++;
  const needle = q.trim().toLowerCase();
  const list = data.extensions.filter(e => (filter === 'all' || e.kernel === filter) && (!needle || `${e.name} ${e.storeId ?? ''}`.toLowerCase().includes(needle)));
  const picked = data.extensions.filter(e => sel.has(e.id));
  // The profiles each extension is in, for their flags.
  const users = (e: Extension) => (data.profiles ?? []).filter(p => p.extensionIds.includes(e.id));
  const country = (pid: string | null) => data.proxies.find(p => p.id === pid)?.lastCheck?.geo?.country ?? null;

  async function remove(e: Extension){
    setConfirm(null);
    try { await folio.api('DELETE', `/extensions/${e.id}`); toast(X.deleted(e.name)); } catch (err){ toast(errorText(d, isApiError(err) ? err.code : 'internal'), undefined, 'bad'); }
    data.refresh('extensions', 'profiles');
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const item = (e: Extension) => {
    const on = users(e);
    return {
      d, e, manager, checked: sel.has(e.id), onToggle: () => toggle(e.id), onInstall: () => setInstalling([e]),
      onUpdate: () => setDialog({ ext: e }), onDelete: () => setConfirm(e),
      users: <span className="users">{on.slice(0, 3).map(p => <Flag key={p.id} country={country(p.proxyId)} />)}<em>{X.inProfiles(e.profiles)}</em></span>
    };
  };

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{X.title}</h1><p className="sub">{X.sub(data.extensions.length)}</p></div>
          <label className="search">
            <Icon name="search" /><span className="sr">{X.search}</span>
            <input type="search" placeholder={X.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          {manager && <button className="btn btn-primary" type="button" onClick={() => setDialog({})}><Icon name="plus" />{X.add}</button>}
        </header>
        {!manager && <p className="hint page-note">{X.memberNote}</p>}

        <div className="filters">
          <div className="seg" role="group" aria-label={X.cols.engine}>
            {(['all', 'chromium', 'firefox'] as const).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? d.profiles.filter.all : ENGINES[f]} <small>{counts[f]}</small></button>)}
          </div>
          <span className="sp" />
          <ViewSwitch label={d.profiles.views.label} value={view} onChange={setView} options={[['table', 'list', d.profiles.views.list], ['cards', 'grid', d.profiles.views.cards]]} />
        </div>

        {!list.length && <div className="cards-empty"><p>{data.extensions.length ? X.noMatch : X.empty}</p></div>}
        {list.length > 0 && (view === 'cards'
          ? <ul className="ext-grid">{list.map(e => <ExtCard key={e.id} {...item(e)} />)}</ul>
          : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th className="cb" scope="col"><input type="checkbox" aria-label={d.common.selectAll} checked={list.every(e => sel.has(e.id))} onChange={() => setSel(list.every(e => sel.has(e.id)) ? new Set() : new Set(list.map(e => e.id)))} /></th>
                    <th scope="col">{X.cols.name}</th><th scope="col">{X.cols.version}</th><th scope="col">{X.cols.engine}</th><th scope="col">{X.cols.signature}</th>
                    <th scope="col">{X.cols.profiles}</th><th scope="col">{X.cols.updated}</th><th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>{list.map(e => <ExtRow key={e.id} {...item(e)} />)}</tbody>
              </table>
            </div>
          ))}

        {picked.length > 0 && (
          <BulkBar n={picked.length} label={d.common.selected(picked.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
            <button type="button" className="bb" onClick={() => setInstalling(picked)}><Icon name="download" />{X.install}</button>
          </BulkBar>
        )}
      </main>
      {dialog && <ExtensionDialog d={d} ws={ws} data={data} ext={dialog.ext} onClose={() => setDialog(null)} />}
      {installing && <InstallDialog d={d} data={data} exts={installing} onClose={() => setInstalling(null)} onDone={() => { setInstalling(null); setSel(new Set()); }} />}
      {confirm && (
        <Modal icon="trash" tone="bad" title={X.confirmDelete(confirm.name, confirm.profiles)} closeLabel={d.common.close} onClose={() => setConfirm(null)} foot={<>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
          <button type="button" className="btn btn-danger solid" onClick={() => void remove(confirm)}>{X.delete}</button>
        </>}><p>{X.deleteNote}</p></Modal>
      )}
    </div>
  );
}

interface ExtItem { d: Dict; e: Extension; manager: boolean; checked: boolean; users: ReactNode; onToggle(): void; onInstall(): void; onUpdate(): void; onDelete(): void }

const Shield = ({ d }: { d: Dict }) => <span className="shield" title={d.extensions.signedNote}><svg className="i" viewBox="0 0 16 16" aria-hidden="true"><path d={SHIELD} /></svg>{d.extensions.signed}</span>;
const source = (d: Dict, e: Extension) => (e.source === 'store' ? e.storeId : d.extensions.uploaded);

// The manager's own actions on an extension: a new version, or deleting it.
function More({ d, onUpdate, onDelete }: { d: Dict; onUpdate(): void; onDelete(): void }){
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="d-more" ref={ref}>
      <button type="button" className="icon-btn bare sm" aria-label={d.detail.more} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon name="more" /></button>
      {open && (
        <div className="menu" role="menu">
          <button className="menu-item" type="button" role="menuitem" onClick={() => { setOpen(false); onUpdate(); }}>{d.extensions.update}</button>
          <button className="menu-item danger" type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }}>{d.extensions.delete}</button>
        </div>
      )}
    </div>
  );
}

function ExtCard({ d, e, manager, checked, users, onToggle, onInstall, onUpdate, onDelete }: ExtItem){
  const X = d.extensions;
  return (
    <li className="ext-card" data-extension={e.name}>
      <div className="ext-top">
        <ExtIcon src={e.icon} />
        <span className="ext-name"><b>{e.name}</b><span className="l2 mono">{e.version} · {source(d, e)}</span></span>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(e.name)} />
      </div>
      <p className="ext-tags"><EngineLogo kernel={e.kernel} /><Shield d={d} /><span className="muted">{ago(e.updatedAt, d)}</span></p>
      <div className="ext-foot">
        {users}
        <span className="sp" />
        {manager && <More d={d} onUpdate={onUpdate} onDelete={onDelete} />}
        <button type="button" className="btn btn-xs btn-secondary" onClick={onInstall}>{X.install}</button>
      </div>
    </li>
  );
}

function ExtRow({ d, e, manager, checked, users, onToggle, onInstall, onUpdate, onDelete }: ExtItem){
  return (
    <tr data-extension={e.name}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(e.name)} /></td>
      <td><span className="prof-cell"><ExtIcon src={e.icon} /><span><span className="l1"><b>{e.name}</b></span><span className="l2 mono">{source(d, e)}</span></span></span></td>
      <td className="mono">{e.version}</td>
      <td><span className="l1"><EngineLogo kernel={e.kernel} />{ENGINES[e.kernel]}</span></td>
      <td><Shield d={d} /></td>
      <td>{users}</td>
      <td>{ago(e.updatedAt, d)}</td>
      <td className="act"><span className="actin">
        <button type="button" className="btn btn-xs btn-secondary" onClick={onInstall}>{d.extensions.install}</button>
        {manager && <More d={d} onUpdate={onUpdate} onDelete={onDelete} />}
      </span></td>
    </tr>
  );
}

// Installing extensions in profiles: the profiles of their engine, the ones that already have them ticked and fixed.
function InstallDialog({ d, data, exts, onClose, onDone }: { d: Dict; data: WorkspaceData; exts: Extension[]; onClose(): void; onDone(): void }){
  const X = d.extensions;
  const toast = useToast();
  const kinds = new Set(exts.map(e => e.kernel));
  const has = (pid: string) => exts.every(e => (data.profiles ?? []).find(p => p.id === pid)?.extensionIds.includes(e.id));
  const profiles = (data.profiles ?? []).filter(p => kinds.has(p.kernel));
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const shown = profiles.filter(p => !q.trim() || `${p.name} #${p.number}`.toLowerCase().includes(q.trim().toLowerCase()));
  async function install(){
    setBusy(true);
    try {
      for (const e of exts){
        const ids = [...chosen].filter(id => profiles.find(p => p.id === id)?.kernel === e.kernel);
        if (ids.length) toast(d.profiles.done.extAdded(await data.batch('add-extension', ids, { extensionId: e.id }), e.name, 0));
      }
      onDone();
    } catch (err){ toast(errorText(d, isApiError(err) ? err.code : 'internal'), undefined, 'bad'); } finally { setBusy(false); }
  }
  return (
    <Modal icon="download" title={exts.length === 1 ? X.installTitle(exts[0].name) : X.installMany(exts.length)} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button type="button" className="btn btn-secondary" onClick={onClose}>{d.common.cancel}</button>
      <button type="button" className="btn btn-primary" disabled={!chosen.size || busy} onClick={() => void install()}>{X.installDo(chosen.size)}</button>
    </>}>
      <p>{[...kinds].map(k => ENGINES[k]).join(' · ')}</p>
      {profiles.length ? <>
        <input className="picker-q" type="search" aria-label={d.profiles.search} placeholder={d.profiles.searchPh} value={q} onChange={e => setQ(e.target.value)} />
        <ul className="picker-list">
          {shown.map(p => (
            <li key={p.id}><label className="check-row">
              <input type="checkbox" disabled={has(p.id)} checked={has(p.id) || chosen.has(p.id)} onChange={() => setChosen(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
              <span>{p.name}</span><span className="mono">{has(p.id) ? X.installedHere : `#${String(p.number).padStart(4, '0')}`}</span>
            </label></li>
          ))}
        </ul>
      </> : <p className="hint">{X.noProfiles}</p>}
    </Modal>
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
              {(['chromium', 'firefox'] as const).map(k => <button key={k} type="button" aria-pressed={kernel === k} onClick={() => { setKernel(k); setFile(null); }}>{ENGINES[k]}</button>)}
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
