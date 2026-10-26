import { useState } from 'react';
import { MANAGE, can, folio, isApiError, type Profile, type Workspace } from './api';
import type { BatchAction, WorkspaceData } from './data';
import { errorText, type Dict, type Lang } from './i18n';
import { dayLabel, time } from './Activity';
import { engineName } from './checks';
import { BulkBar, Icon, LoadFailed, Modal, ViewSwitch, useToast, useView } from './ui';
import { Flag } from './Flag';

export function TrashPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const toast = useToast();
  const T = d.trash;
  const [view, setView] = useView<'table' | 'cards'>('trash', 'table');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const list = data.trash ?? [];
  const ids = [...sel].filter(id => list.some(p => p.id === id));
  const groupName = new Map(data.groups.map(g => [g.id, g.name]));
  const email = new Map(data.members.map(m => [m.userId, m.email]));
  const country = (p: Profile) => data.proxies.find(x => x.id === p.proxyId)?.lastCheck?.geo?.country ?? null;
  const manager = can(ws.role, MANAGE);

  async function run(action: BatchAction, targets: string[]){
    setConfirm(null);
    try {
      const n = await data.batch(action, targets);
      setSel(new Set());
      toast(action === 'restore' ? T.restored(n) : T.purged(n));
    } catch (e){
      const code = isApiError(e) ? e.code : 'internal';
      toast(errorText(d, code), code === 'plan_limit' && manager
        ? { label: d.plan.addProfiles, fn: () => void folio.openSite(`/${lang}/checkout/?ws=${ws.id}`) } : undefined, 'bad');
    }
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const item = (p: Profile) => ({
    d, p, checked: sel.has(p.id), country: country(p), group: p.groupId ? groupName.get(p.groupId) ?? d.groups.none : d.groups.none,
    by: p.deletedBy ? email.get(p.deletedBy) ?? d.activity.someone : d.activity.someone,
    when: p.deletedAt ? `${dayLabel(p.deletedAt, d, lang)} ${time(p.deletedAt, lang)}` : '—',
    onToggle: () => toggle(p.id), onRestore: () => void run('restore', [p.id]), onPurge: () => setConfirm([p.id])
  });

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{T.title}</h1><p className="sub">{T.lead}</p></div>
          <span className="sp" />
          <button className="btn btn-secondary" type="button" disabled={!list.length} onClick={() => void run('restore', list.map(p => p.id))}><Icon name="refresh" />{T.restoreAll}</button>
          <button className="btn btn-danger outline" type="button" disabled={!list.length} onClick={() => setConfirm(list.map(p => p.id))}><Icon name="trash" />{T.purgeAll}</button>
        </header>

        <div className="filters">
          <span className="sp" />
          <ViewSwitch label={d.profiles.views.label} value={view} onChange={setView} options={[['table', 'list', d.profiles.views.list], ['cards', 'grid', d.profiles.views.cards]]} />
        </div>

        {data.loadFailed.has('trash')
          ? <div className="cards-empty"><LoadFailed d={d} onRetry={() => data.refresh('trash')} /></div>
          : data.trash !== null && !list.length && <div className="cards-empty"><p>{T.empty}</p></div>}
        {list.length > 0 && (view === 'cards'
          ? <ul className="pgrid">{list.map(p => <TrashCard key={p.id} {...item(p)} />)}</ul>
          : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th className="cb" scope="col">
                      <input type="checkbox" aria-label={d.common.selectAll} checked={ids.length === list.length}
                        onChange={() => setSel(ids.length === list.length ? new Set() : new Set(list.map(p => p.id)))} />
                    </th>
                    <th scope="col">{T.cols.profile}</th><th scope="col">{T.cols.fingerprint}</th><th scope="col">{T.cols.signins}</th>
                    <th scope="col">{T.cols.deleted}</th><th scope="col">{T.cols.by}</th><th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>{list.map(p => <TrashRow key={p.id} {...item(p)} />)}</tbody>
              </table>
            </div>
          ))}

        {ids.length > 0 && (
          <BulkBar n={ids.length} label={d.common.selected(ids.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
            <button type="button" className="bb" onClick={() => void run('restore', ids)}><Icon name="refresh" />{T.restore}</button>
            <button type="button" className="bb danger" onClick={() => setConfirm(ids)}><Icon name="trash" />{T.purge}</button>
          </BulkBar>
        )}
        {confirm && (
          <Modal icon="trash" tone="bad" title={T.confirmPurge(confirm.length)} closeLabel={d.common.close} onClose={() => setConfirm(null)} foot={<>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
            <button type="button" className="btn btn-danger solid" onClick={() => void run('purge', confirm)}>{T.purge}</button>
          </>}><p>{T.confirmNote}</p></Modal>
        )}
      </main>
    </div>
  );
}

interface TrashItem { d: Dict; p: Profile; checked: boolean; country: string | null; group: string; by: string; when: string; onToggle(): void; onRestore(): void; onPurge(): void }
const number = (p: Profile) => String(p.number).padStart(4, '0');
// What sign-ins come back with it.
const signins = (d: Dict, p: Profile) => (p.syncMode === 'local' ? d.opening.local : d.trash.sites(p.data?.origins ?? 0));

function TrashRow({ d, p, checked, country, group, by, when, onToggle, onRestore, onPurge }: TrashItem){
  return (
    <tr data-id={p.id} className={checked ? 'cur' : ''}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td><span className="prof-cell"><Flag country={country} kernel={p.kernel} /><span>
        <span className="l1"><b>{p.name}</b></span><span className="l2"><span className="mono">#{number(p)}</span> · {group}</span>
      </span></span></td>
      <td><span className="os-cell"><Icon name={p.os} /><span><span className="l1">{d.os[p.os]}</span><span className="l2">{engineName(p.kernel, p.kernelVersion)}</span></span></span></td>
      <td>{signins(d, p)}</td>
      <td className="mono">{when}</td>
      <td>{by}</td>
      <td className="act"><span className="actin">
        <button type="button" className="btn btn-sm btn-primary" onClick={onRestore}><Icon name="refresh" />{d.trash.restore}</button>
        <button type="button" className="btn btn-sm btn-text" onClick={onPurge}>{d.trash.purge}</button>
      </span></td>
    </tr>
  );
}

function TrashCard({ d, p, checked, country, group, by, when, onToggle, onRestore, onPurge }: TrashItem){
  return (
    <li className={`pcard${checked ? ' cur' : ''}`} data-id={p.id}>
      <div className="pc-top">
        <Flag country={country} kernel={p.kernel} />
        <span><span className="l1"><b>{p.name}</b></span><span className="l2"><span className="mono">#{number(p)}</span> · {group}</span></span>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} />
      </div>
      <ul className="tr-facts">
        <li><Icon name={p.os} />{d.os[p.os]} · {engineName(p.kernel, p.kernelVersion)}</li>
        <li><Icon name="download" />{d.trash.cols.signins} · {signins(d, p)}</li>
        <li><Icon name="trash" />{d.trash.byAt(by, when)}</li>
      </ul>
      <div className="pc-foot">
        <button type="button" className="btn btn-sm btn-primary" onClick={onRestore}><Icon name="refresh" />{d.trash.restore}</button>
        <button type="button" className="btn btn-sm btn-text" onClick={onPurge}>{d.trash.purge}</button>
      </div>
    </li>
  );
}
