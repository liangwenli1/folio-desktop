import { useState } from 'react';
import { folio, isApiError, type Workspace } from './api';
import type { BatchAction, WorkspaceData } from './data';
import { ago, errorText, type Dict, type Lang } from './i18n';
import { engineName } from './checks';
import { BulkBar, Icon, Modal, useToast } from './ui';

export function TrashPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const toast = useToast();
  const T = d.trash;
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const list = data.trash ?? [];
  const ids = [...sel].filter(id => list.some(p => p.id === id));
  const groupName = new Map(data.groups.map(g => [g.id, g.name]));
  const manager = ws.role !== 'member';

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

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{T.title}</h1><p className="sub">{T.sub(list.length)}</p></div>
          <span className="sp" />
          <button className="btn btn-danger" type="button" disabled={!list.length} onClick={() => setConfirm(list.map(p => p.id))}>{T.purgeAll}</button>
        </header>

        {ids.length > 0 && (
          <BulkBar n={ids.length} label={d.common.selected(ids.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
            <button type="button" className="bb" onClick={() => void run('restore', ids)}><Icon name="up" />{T.restore}</button>
            <button type="button" className="bb danger" onClick={() => setConfirm(ids)}><Icon name="trash" />{T.purge}</button>
          </BulkBar>
        )}
        {confirm && (
          <Modal icon="trash" tone="bad" title={T.confirmPurge(confirm.length)} closeLabel={d.common.close} onClose={() => setConfirm(null)} foot={<>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
            <button type="button" className="btn btn-danger solid" onClick={() => void run('purge', confirm)}>{T.purge}</button>
          </>}><p>{T.confirmNote}</p></Modal>
        )}

        <div className="tw top-gap">
          <table>
            <thead>
              <tr>
                <th className="cb" scope="col">
                  <input type="checkbox" aria-label={d.common.selectAll} checked={list.length > 0 && ids.length === list.length}
                    onChange={() => setSel(ids.length === list.length ? new Set() : new Set(list.map(p => p.id)))} />
                </th>
                <th scope="col">{d.profiles.cols.profile}</th><th scope="col">{d.profiles.cols.fingerprint}</th><th scope="col">{T.deleted}</th><th className="act" scope="col" />
              </tr>
            </thead>
            <tbody>
              {data.trash === null && Array.from({ length: 3 }, (_, i) => <tr key={i} className="skel" aria-hidden="true"><td className="cb"><i /></td><td><i className="w2" /><i /></td><td><i /></td><td><i className="w3" /></td><td /></tr>)}
              {data.trash !== null && !list.length && <tr className="empty"><td colSpan={5}><p>{T.empty}</p></td></tr>}
              {list.map(p => (
                <tr key={p.id} data-id={p.id}>
                  <td className="cb"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={d.common.select(p.name)} /></td>
                  <td>
                    <span className="l1"><b>{p.name}</b></span>
                    <span className="l2"><span className="mono">#{String(p.number).padStart(4, '0')}</span> · {p.groupId ? groupName.get(p.groupId) ?? d.groups.none : d.groups.none}</span>
                  </td>
                  <td><span className="l1">{d.os[p.os]}</span><span className="l2">{engineName(p.kernel, p.kernelVersion)}</span></td>
                  <td>{ago(p.deletedAt, d)}</td>
                  <td className="act"><span className="actin">
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => void run('restore', [p.id])}>{T.restore}</button>
                    <button type="button" className="btn btn-xs btn-danger" onClick={() => setConfirm([p.id])}>{T.purge}</button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
