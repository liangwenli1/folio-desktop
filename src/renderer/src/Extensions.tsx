// The workspace's extension library: owners and admins add extensions (a file, or from the Chrome Web Store or
// addons.mozilla.org), upload new versions and delete them; everyone sees the library and installs from it in the
// profile form or the bulk actions.
import { useId, useState, type ChangeEvent, type ReactNode } from 'react';
import type { ExtensionSource, KernelKind } from '@shared/bridge';
import { MANAGE, can, folio, isApiError, type Extension, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { ago, errorText, type Dict } from './i18n';
import { ENGINES } from './checks';
import { Act, BulkBar, Cancel, Empty, ExtIcon, Flt, Icon, ListFailed, Loading, Modal, MoreMenu, ViewSwitch, useFail, useToast, useView } from './ui';
import { EngineLogo, Flag } from './Flag';
import { Select } from './Select';

// The shield on each card: every package is checked against Folio's signature and its sha256 before it is installed.
const SHIELD = 'M12 2.7 19.5 5.4v6.15c0 4.5 -3.15 8.25 -7.5 9.75 -4.35 -1.5 -7.5 -5.25 -7.5 -9.75V5.4zM8.4 12l2.55 2.55 4.8 -5.1';
type Filter = 'all' | KernelKind;

export function ExtensionsPage({ d, ws, data }: { d: Dict; ws: Workspace; data: WorkspaceData }){
  const X = d.extensions;
  const toast = useToast(), fail = useFail();
  const manager = can(data.role, MANAGE);
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
  const users = (e: Extension) => data.profiles.filter(p => p.extensionIds.includes(e.id));
  const country = (pid: string | null) => data.proxies.find(p => p.id === pid)?.lastCheck?.geo?.country ?? null;

  async function remove(e: Extension){
    setConfirm(null);
    try { await folio.api('DELETE', `/extensions/${e.id}`); toast(X.deleted(e.name)); } catch (err){ fail(err); }
    data.refresh('extensions', 'profiles');
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const item = (e: Extension) => {
    const on = users(e);
    return {
      d, e, manager, checked: sel.has(e.id), onToggle: () => toggle(e.id), onInstall: () => setInstalling([e]),
      onUpdate: () => setDialog({ ext: e }), onDelete: () => setConfirm(e),
      users: <span className="users"><span className="flags">{on.slice(0, 3).map(p => <Flag key={p.id} country={country(p.proxyId)} />)}</span>{X.inProfiles(e.profiles)}</span>
    };
  };

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{X.title}</h1></div>
          <span className="sp" />
          {manager && <button className="btn btn-primary" type="button" onClick={() => setDialog({})}><Icon name="plus" />{X.add}</button>}
        </header>
        <section className="list-card" aria-label={X.title}>
        <div className="filters">
          <Flt label={d.profiles.filterLabels.keyword} grow>
            <label className="search"><Icon name="search" /><span className="sr">{X.search}</span>
              <input type="search" placeholder={X.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
          </Flt>
          <Flt label={X.cols.engine}><span className="grp-pick"><Select label={X.cols.engine} value={filter} onChange={v => setFilter(v as Filter)}
            options={(['all', 'chromium', 'firefox'] as const).map(f => ({ value: f, label: f === 'all' ? d.profiles.filter.engines : ENGINES[f], count: counts[f] }))} /></span></Flt>
          <button type="button" className="btn btn-secondary flt-reset" disabled={!needle && filter === 'all'} onClick={() => { setQ(''); setFilter('all'); }}>{d.profiles.reset}</button>
          <ViewSwitch label={d.profiles.views.label} value={view} onChange={setView} options={[['table', 'list', d.profiles.views.list], ['cards', 'grid', d.profiles.views.cards]]} />
        </div>
        {picked.length > 0 && (
          <BulkBar n={picked.length} all={list.length > 0 && list.every(e => sel.has(e.id))} label={d.common.picked.extensions(picked.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
            <button type="button" className="bb lead" onClick={() => setInstalling(picked)}><Icon name="download" />{X.install}</button>
          </BulkBar>
        )}

        {data.loadFailed.has('extensions')
          ? <div className="cards-empty"><ListFailed d={d} data={data} kind="extensions" /></div>
          : !data.loaded.has('extensions') ? <Loading cards={view === 'cards'} cols={5} />
          : !list.length && <div className="cards-empty">{data.extensions.length
            ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setFilter('all'); }}>{d.states.clear}</button>
              </Empty>
            : <Empty icon="extensions" title={X.emptyTitle} text={X.empty}>
                {manager && <button className="btn btn-primary btn-sm" type="button" onClick={() => setDialog({})}><Icon name="plus" />{X.add}</button>}
              </Empty>}</div>}
        {list.length > 0 && (view === 'cards'
          ? <ul className="ext-grid">{list.map(e => <ExtCard key={e.id} {...item(e)} />)}</ul>
          : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th className="cb" scope="col"><input type="checkbox" aria-label={d.common.selectAll} checked={list.every(e => sel.has(e.id))} onChange={() => setSel(list.every(e => sel.has(e.id)) ? new Set() : new Set(list.map(e => e.id)))} /></th>
                    <th scope="col">{X.cols.name}</th><th className="mid" scope="col">{X.cols.version}</th><th scope="col">{X.cols.engine}</th><th className="mid" scope="col">{X.cols.signature}</th>
                    <th scope="col">{X.cols.profiles}</th><th className="mid" scope="col">{X.cols.updated}</th><th className="act" scope="col">{d.profiles.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th>
                  </tr>
                </thead>
                <tbody>{list.map(e => <ExtRow key={e.id} {...item(e)} />)}</tbody>
              </table>
            </div>
          ))}
        {list.length > 0 && <p className="list-foot">{d.profiles.page.total(list.length)}</p>}
        </section>
        {!manager && <p className="notice page-tip"><Icon name="info" /><span>{X.memberNote}</span></p>}

      </main>
      {dialog && <ExtensionDialog d={d} ws={ws} data={data} ext={dialog.ext} onClose={() => setDialog(null)} />}
      {installing && <InstallDialog d={d} data={data} exts={installing} onClose={() => setInstalling(null)} onDone={() => { setInstalling(null); setSel(new Set()); }} />}
      {confirm && (
        <Modal kind="bad" title={X.confirmDelete(confirm.name, confirm.profiles)} onClose={() => setConfirm(null)} foot={<>
          <Cancel />
          <Act className="btn btn-danger solid" run={() => remove(confirm)}>{X.delete}</Act>
        </>}><p>{X.deleteNote}</p></Modal>
      )}
    </div>
  );
}

interface ExtItem { d: Dict; e: Extension; manager: boolean; checked: boolean; users: ReactNode; onToggle(): void; onInstall(): void; onUpdate(): void; onDelete(): void }

const Shield = ({ d }: { d: Dict }) => <span className="badge good shield" title={d.extensions.signedNote}><svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={SHIELD} /></svg>{d.extensions.signed}</span>;
const source = (d: Dict, e: Extension) => (e.source === 'store' ? e.storeId : d.extensions.uploaded);

// The manager's own actions on an extension: a new version, or deleting it.
function ExtCard({ d, e, manager, checked, users, onToggle, onInstall, onUpdate, onDelete }: ExtItem){
  const X = d.extensions;
  return (
    <li className="ext-card" data-extension={e.name}>
      <div className="ext-top">
        <ExtIcon src={e.icon} />
        <span className="ext-name"><b>{e.name}</b><span className="l2 mono">{e.version}</span></span>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(e.name)} />
      </div>
      <p className="ext-tags"><EngineLogo kernel={e.kernel} /><Shield d={d} /></p>
      <div className="ext-foot">
        {users}
        <span className="sp" />
        {manager && <MoreMenu label={d.detail.more} items={[{ label: d.extensions.update, onClick: onUpdate }, { label: d.extensions.delete, onClick: onDelete, danger: true }]} />}
        <button type="button" className="btn btn-sm btn-secondary" onClick={onInstall}>{X.install}</button>
      </div>
    </li>
  );
}

function ExtRow({ d, e, manager, checked, users, onToggle, onInstall, onUpdate, onDelete }: ExtItem){
  return (
    <tr data-extension={e.name} className={checked ? 'on' : undefined}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(e.name)} /></td>
      <td><span className="prof-cell"><ExtIcon src={e.icon} /><span><span className="l1"><b>{e.name}</b></span><span className="l2 mono">{source(d, e)}</span></span></span></td>
      <td className="mono mid">{e.version}</td>
      <td><span className="l1"><EngineLogo kernel={e.kernel} />{ENGINES[e.kernel]}</span></td>
      <td className="mid"><Shield d={d} /></td>
      <td>{users}</td>
      <td className="mid">{ago(e.updatedAt, d)}</td>
      <td className="act"><button type="button" className="btn btn-sm btn-secondary" onClick={onInstall}>{d.extensions.install}</button></td>
      <td className="more">{manager && <MoreMenu label={d.detail.more} items={[{ label: d.extensions.update, onClick: onUpdate }, { label: d.extensions.delete, onClick: onDelete, danger: true }]} />}</td>
    </tr>
  );
}

// Installing extensions in profiles: the profiles of their engine, the ones that already have them ticked and fixed.
function InstallDialog({ d, data, exts, onClose, onDone }: { d: Dict; data: WorkspaceData; exts: Extension[]; onClose(): void; onDone(): void }){
  const X = d.extensions;
  const toast = useToast(), fail = useFail();
  const kinds = new Set(exts.map(e => e.kernel));
  const has = (pid: string) => exts.every(e => data.profiles.find(p => p.id === pid)?.extensionIds.includes(e.id));
  const profiles = data.profiles.filter(p => kinds.has(p.kernel));
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
    } catch (err){ fail(err); } finally { setBusy(false); }
  }
  return (
    <Modal kind="info" title={exts.length === 1 ? X.installTitle(exts[0].name) : X.installMany(exts.length)} onClose={onClose} busy={busy} foot={<>
      <Cancel />
      <button type="button" className="btn btn-primary" aria-busy={busy || undefined} disabled={!chosen.size || busy} onClick={() => void install()}>{X.installDo(chosen.size)}</button>
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

// Where a new extension (or a new version) comes from, here and in the profile form: its address (a store link, its
// ID, or a .crx/.xpi/.zip to download), or a file on this computer.
export interface ExtFrom { how: 'link' | 'file'; link: string; file: File | null }
export const extReady = (v: ExtFrom) => (v.how === 'file' ? !!v.file : !!v.link.trim());
export const extSource = async (v: ExtFrom): Promise<ExtensionSource> => (v.how === 'file' ? { file: new Uint8Array(await v.file!.arrayBuffer()) } : { store: v.link.trim() });
// Into the workspace's library, which then reloads; what was added (its id and name).
export async function addToLibrary(wsId: string, data: WorkspaceData, kernel: KernelKind, v: ExtFrom){
  const r = await folio.addExtension(wsId, kernel, await extSource(v));
  data.refresh('extensions');
  return r;
}

export function ExtSource({ d, kernel, value, onChange }: { d: Dict; kernel: KernelKind; value: ExtFrom; onChange(v: ExtFrom): void }){
  const X = d.extensions, id = useId();
  const pick = (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, file: e.target.files?.[0] ?? null });
  return <>
    <div className="field"><span className="label">{X.from}</span>
      <div className="seg" role="group" aria-label={X.from}>
        <button type="button" aria-pressed={value.how === 'link'} onClick={() => onChange({ ...value, how: 'link' })}>{X.fromLink}</button>
        <button type="button" aria-pressed={value.how === 'file'} onClick={() => onChange({ ...value, how: 'file' })}>{X.fromFile}</button>
      </div>
    </div>
    {value.how === 'file' ? (
      <div className="field">
        <div className="file-row">
          <label className="btn btn-secondary btn-sm file-btn">{X.chooseFile}<input type="file" aria-label={X.chooseFile} accept={kernel === 'chromium' ? '.crx,.zip' : '.xpi,.zip'} onChange={pick} /></label>
          {value.file && <span className="hint mono">{value.file.name}</span>}
        </div>
        <p className="hint">{kernel === 'chromium' ? X.fileHintChromium : X.fileHintFirefox}</p>
      </div>
    ) : (
      <div className="field">
        <label htmlFor={id}>{kernel === 'chromium' ? X.storeChromium : X.storeFirefox}</label>
        <input id={id} className="mono-in" value={value.link} spellCheck={false} placeholder={kernel === 'chromium' ? 'https://chromewebstore.google.com/detail/…' : 'https://addons.mozilla.org/firefox/addon/…'} onChange={e => onChange({ ...value, link: e.target.value })} />
        <p className="hint">{kernel === 'chromium' ? X.linkHintChromium : X.linkHintFirefox}</p>
      </div>
    )}
  </>;
}

// Adding an extension, or a new version of one.
function ExtensionDialog({ d, ws, data, ext, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; ext?: Extension; onClose(): void }){
  const X = d.extensions;
  const toast = useToast();
  const [kernel, setKernel] = useState<KernelKind>(ext?.kernel ?? 'chromium');
  const [from, setFrom] = useState<ExtFrom>({ how: !ext || ext.source === 'store' ? 'link' : 'file', link: ext?.source === 'store' ? ext.storeId ?? '' : '', file: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(){
    setBusy(true); setError(null);
    try {
      if (ext){
        const r = await folio.updateExtension(ext.id, ext.kernel, await extSource(from));
        data.refresh('extensions');
        toast(X.updated(r.name));
      } else toast(X.added((await addToLibrary(ws.id, data, kernel, from)).name));
      onClose();
    } catch (err){ setError(errorText(d, isApiError(err) ? err.code : 'internal')); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={ext ? X.updateTitle(ext.name) : X.addTitle} onClose={onClose} busy={busy} foot={<>
      <Cancel />
      <button className="btn btn-primary" type="button" disabled={!extReady(from) || busy} onClick={() => void submit()}>{busy ? (from.how === 'link' ? X.fetching : X.uploading) : ext ? X.updateDo : X.addDo}</button>
    </>}>
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        {!ext && (
          <div className="field"><span className="label">{X.cols.engine}</span>
            <div className="seg" role="group" aria-label={X.cols.engine}>
              {(['chromium', 'firefox'] as const).map(k => <button key={k} type="button" aria-pressed={kernel === k} onClick={() => { setKernel(k); setFrom(f => ({ ...f, file: null })); }}>{ENGINES[k]}</button>)}
            </div>
          </div>
        )}
        <ExtSource d={d} kernel={kernel} value={from} onChange={setFrom} />
        <p className="hint">{kernel === 'chromium' ? X.idNote : X.uuidNote}</p>
      </div>
    </Modal>
  );
}
