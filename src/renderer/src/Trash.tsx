import { useState } from 'react';
import { folio, isApiError, type Workspace } from './api';
import type { BatchAction, WorkspaceData } from './data';
import { ago, errorText, type Dict, type Lang } from './i18n';
import { engineName } from './checks';
import { useToast } from './ui';

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
        ? { label: d.plan.addProfiles, fn: () => void folio.openSite(`/${lang}/checkout/?ws=${ws.id}`) } : undefined);
    }
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{T.title}</h1><p className="sub">{T.sub(list.length)}</p></div>
          <span className="sp" />
          <button className="btn btn-ghost" type="button" disabled={!list.length} onClick={() => setConfirm(list.map(p => p.id))}>{T.purgeAll}</button>
        </header>

        {(confirm || ids.length > 0) && (
          <div className="bulk top-gap">
            {confirm ? (
              <>
                <b>{T.confirmPurge(confirm.length)}</b><span className="note">{T.confirmNote}</span><span className="sp" />
                <button type="button" className="bb" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
                <button type="button" className="bb danger" onClick={() => void run('purge', confirm)}>{T.purge}</button>
              </>
            ) : (
              <>
                <b>{d.common.selected(ids.length)}</b>
                <button type="button" className="bb" onClick={() => void run('restore', ids)}>{T.restore}</button>
                <button type="button" className="bb danger" onClick={() => setConfirm(ids)}>{T.purge}</button>
                <span className="sp" />
                <button type="button" className="bb plain" onClick={() => setSel(new Set())}>{d.common.clearSelection}</button>
              </>
            )}
          </div>
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
              {data.trash === null && <tr className="empty"><td colSpan={5}>{d.loading}</td></tr>}
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
                    <button type="button" className="btn btn-xs btn-line" onClick={() => void run('restore', [p.id])}>{T.restore}</button>
                    <button type="button" className="btn btn-xs btn-ghost" onClick={() => setConfirm([p.id])}>{T.purge}</button>
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
