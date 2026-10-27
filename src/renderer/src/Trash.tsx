// The Trash: profiles deleted lately, kept for the days the workspace sets and then deleted for good. Found by name
// or ID, the days they were deleted and who deleted them; restored (to their group, or another) or deleted for good,
// one at a time or together, with the ones picked summed up beside the table. Deleting for good asks for the
// profile's name (or how many) to be typed.
import { useState } from 'react';
import { MANAGE, can, folio, isApiError, type Profile, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { errorText, type Dict, type Lang } from './i18n';
import { dayLabel, time } from './Activity';
import { engineName } from './checks';
import { Act, BulkBar, Cancel, Empty, Icon, ListFailed, Loading, Modal, PanelEdge, ViewSwitch, useToast, useView } from './ui';
import { Flag } from './Flag';
import { Select, SelectField } from './Select';

const DAY = 86_400_000;
const number = (p: Profile) => `#${String(p.number).padStart(4, '0')}`;
// What sign-ins come back with it.
const signins = (d: Dict, p: Profile) => (p.syncMode === 'local' ? d.opening.local : d.trash.sites(p.data?.origins ?? 0));

export function TrashPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const toast = useToast();
  const T = d.trash;
  const [view, setView] = useView<'table' | 'cards'>('trash', 'table');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [by, setBy] = useState('all');
  const [asc, setAsc] = useState(false);
  const [target, setTarget] = useState('');
  const keep = ws.settings.trashDays;
  const all = data.trash;
  const needle = q.trim().toLowerCase(), num = /^#?\d+$/.test(needle) ? Number(needle.replace('#', '')) : null;
  const list = all.filter(p => (!needle || p.name.toLowerCase().includes(needle) || p.number === num) && (by === 'all' || p.deletedBy === by)
    && (!from || (p.deletedAt ?? '') >= new Date(`${from}T00:00:00`).toISOString()) && (!to || (p.deletedAt ?? '') < new Date(new Date(`${to}T00:00:00`).getTime() + DAY).toISOString()))
    .sort((a, b) => (asc ? 1 : -1) * ((a.deletedAt ?? '').localeCompare(b.deletedAt ?? '')));
  const picked = all.filter(p => sel.has(p.id));
  const filtered = !!(needle || from || to || by !== 'all');
  const groupName = new Map(data.groups.map(g => [g.id, g.name]));
  const email = new Map(data.members.map(m => [m.userId, m.email]));
  const country = (p: Profile) => data.proxies.find(x => x.id === p.proxyId)?.lastCheck?.geo?.country ?? null;
  const manager = can(ws.role, MANAGE);
  const left = (p: Profile) => Math.max(0, keep - Math.floor((Date.now() - Date.parse(p.deletedAt ?? new Date().toISOString())) / DAY));
  const deleters = [...new Set(all.map(p => p.deletedBy).filter((x): x is string => !!x))];

  async function restore(targets: Profile[]){
    const ids = targets.map(p => p.id);
    try {
      const n = await data.batch('restore', ids);
      // Into another group than the one each was in, when one was picked.
      if (target) await data.batch('move', ids, { groupId: target === 'none' ? null : target });
      setSel(new Set());
      toast(T.restored(n));
    } catch (e){
      const code = isApiError(e) ? e.code : 'internal';
      toast(errorText(d, code), code === 'plan_limit' && manager
        ? { label: d.plan.addProfiles, fn: () => void folio.openSite(`/${lang}/checkout/?ws=${ws.id}`) } : undefined, 'bad');
    }
  }
  async function purge(targets: Profile[]){
    setConfirm(null);
    try { toast(T.purged(await data.batch('purge', targets.map(p => p.id)))); setSel(new Set()); } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); }
  }
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const item = (p: Profile): TrashItem => ({
    d, p, checked: sel.has(p.id), country: country(p), group: p.groupId ? groupName.get(p.groupId) ?? d.groups.none : d.groups.none,
    by: p.deletedBy ? email.get(p.deletedBy) ?? d.activity.someone : d.activity.someone,
    when: p.deletedAt ? `${dayLabel(p.deletedAt, d, lang)} ${time(p.deletedAt, lang)}` : '—', left: left(p),
    onToggle: () => toggle(p.id), onRestore: () => void restore([p]), onPurge: () => setConfirm([p])
  });
  const shownSel = list.filter(p => sel.has(p.id)).length;
  const clear = () => { setQ(''); setFrom(''); setTo(''); setBy('all'); };

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{T.title}</h1><p className="sub">{T.lead}</p></div>
          <span className="sp" />
          <p className="hint tr-keep">{T.keeps(keep)}</p>
          <button className="btn btn-secondary" type="button" disabled={!all.length} onClick={() => void restore(all)}><Icon name="refresh" />{T.restoreAll}</button>
          <button className="btn btn-danger outline" type="button" disabled={!all.length} onClick={() => setConfirm(all)}><Icon name="trash" />{T.purgeAll}</button>
        </header>

        <div className={`side-wrap${picked.length ? ' with-panel' : ''}`}>
          <section className="side-main list-card" aria-label={T.title}>
            <div className="filters tr-f">
              <label className="search"><Icon name="search" /><span className="sr">{T.search}</span>
                <input type="search" placeholder={T.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
              <span className="lg-dates" role="group" aria-label={T.when}>
                <Icon name="calendar" />
                <input type="date" aria-label={d.activity.from} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
                <span aria-hidden="true">{d.activity.to}</span>
                <input type="date" aria-label={d.activity.until} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
              </span>
              <span className="grp-pick"><Select label={T.cols.by} value={by} onChange={setBy} search
                options={[{ value: 'all', label: T.anyone }, ...deleters.map(id => ({ value: id, label: email.get(id) ?? d.activity.someone }))]} /></span>
              {filtered && <button type="button" className="btn btn-text" onClick={clear}>{d.states.clear}</button>}
              <span className="sp" />
              <ViewSwitch label={d.profiles.views.label} value={view} onChange={setView} options={[['table', 'list', d.profiles.views.list], ['cards', 'grid', d.profiles.views.cards]]} />
            </div>

            {picked.length > 0 && (
              <BulkBar n={picked.length} label={d.common.selected(picked.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
                <button type="button" className="bb" onClick={() => void restore(picked)}><Icon name="refresh" />{T.restore}</button>
                <button type="button" className="bb danger" onClick={() => setConfirm(picked)}><Icon name="trash" />{T.purge}</button>
              </BulkBar>
            )}
            {data.loadFailed.has('trash')
              ? <div className="cards-empty"><ListFailed d={d} data={data} kind="trash" /></div>
              : !data.loaded.has('trash') ? <Loading cards={view === 'cards'} cols={7} />
              : !list.length && <div className="cards-empty">{all.length
                ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>{d.states.clear}</button>
                  </Empty>
                : <Empty icon="trash" title={T.empty} text={T.emptyText(keep)} />}</div>}
            {list.length > 0 && (view === 'cards'
              ? <ul className="pgrid">{list.map(p => <TrashCard key={p.id} {...item(p)} />)}</ul>
              : (
                <div className="tw tr-t">
                  <table>
                    <thead>
                      <tr>
                        <th className="cb" scope="col">
                          <input type="checkbox" aria-label={d.common.selectAll} checked={shownSel === list.length}
                            ref={el => { if (el) el.indeterminate = shownSel > 0 && shownSel < list.length; }}
                            onChange={() => setSel(shownSel === list.length ? new Set() : new Set(list.map(p => p.id)))} />
                        </th>
                        <th scope="col">{T.cols.profile}</th><th scope="col">{T.cols.number}</th><th scope="col">{T.cols.group}</th><th className="c-by" scope="col">{T.cols.by}</th>
                        <th scope="col" aria-sort={asc ? 'ascending' : 'descending'}><button type="button" className="th-sort" onClick={() => setAsc(x => !x)}>{T.cols.deleted}<Icon name={asc ? 'up' : 'down'} /></button></th>
                        <th scope="col">{T.cols.left}</th><th className="act" scope="col">{d.profiles.cols.actions}</th>
                      </tr>
                    </thead>
                    <tbody>{list.map(p => <TrashRow key={p.id} {...item(p)} />)}</tbody>
                  </table>
                </div>
              ))}
          </section>
          {picked.length > 0 && (
            <aside className="sec side-panel tr-panel" aria-label={T.picked(picked.length)}><PanelEdge />
              <div className="sec-row"><h3>{T.picked(picked.length)}</h3><button type="button" className="icon-btn bare" aria-label={d.common.close} title={d.common.close} onClick={() => setSel(new Set())}><Icon name="x" /></button></div>
              <dl className="kvl">
                <dt>{T.cols.profile}</dt><dd>{picked.map(p => p.name).join(lang === 'zh' ? '、' : ', ')}</dd>
                <dt>{T.cols.number}</dt><dd className="mono">{picked.map(number).join(', ')}</dd>
                <dt>{T.cols.by}</dt><dd>{[...new Set(picked.map(p => item(p).by))].join(lang === 'zh' ? '、' : ', ')}</dd>
                <dt>{T.cols.left}</dt><dd>{T.days(Math.min(...picked.map(left)))}</dd>
                {picked.length === 1 && <><dt>{T.cols.fingerprint}</dt><dd>{d.os[picked[0].os]} · {engineName(picked[0].kernel, picked[0].kernelVersion)}</dd>
                  <dt>{T.cols.signins}</dt><dd>{signins(d, picked[0])}</dd></>}
              </dl>
              <SelectField label={T.restoreTo} value={target} onChange={setTarget} hint={T.restoreToHint} searchPh={d.form.searchPh}
                options={[{ value: '', label: T.sameGroup }, { value: 'none', label: d.groups.none }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const }))]} />
              <Act className="btn btn-primary" run={() => restore(picked)}>{T.restoreN(picked.length)}</Act>
              <button type="button" className="btn btn-danger outline" onClick={() => setConfirm(picked)}>{T.purgeN(picked.length)}</button>
            </aside>
          )}
        </div>
        {confirm && <PurgeDialog d={d} targets={confirm} onClose={() => setConfirm(null)} onPurge={() => purge(confirm)} />}
      </main>
    </div>
  );
}

// Deleting for good can't be undone: the profile's name (or, for several, how many) is typed to confirm.
function PurgeDialog({ d, targets, onClose, onPurge }: { d: Dict; targets: Profile[]; onClose(): void; onPurge(): Promise<unknown> }){
  const T = d.trash;
  const [typed, setTyped] = useState('');
  const word = targets.length === 1 ? targets[0].name : String(targets.length);
  return (
    <Modal kind="bad" title={T.confirmPurge(targets.length)} onClose={onClose} foot={<>
      <Cancel />
      <Act className="btn btn-danger solid" disabled={typed.trim() !== word} run={onPurge}>{T.purge}</Act>
    </>}>
      <div className="m-body">
        <p>{T.confirmNote}</p>
        <label className="field"><span>{targets.length === 1 ? T.typeName(word) : T.typeCount(targets.length)}</span>
          <input value={typed} autoFocus placeholder={word} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && typed.trim() === word) onPurge(); }} /></label>
      </div>
    </Modal>
  );
}

interface TrashItem { d: Dict; p: Profile; checked: boolean; country: string | null; group: string; by: string; when: string; left: number; onToggle(): void; onRestore(): void; onPurge(): void }

function TrashRow({ d, p, checked, country, group, by, when, left, onToggle, onRestore, onPurge }: TrashItem){
  return (
    <tr data-id={p.id} className={checked ? 'on' : undefined}>
      <td className="cb"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} /></td>
      <td><span className="prof-cell"><Flag country={country} kernel={p.kernel} /><b>{p.name}</b></span></td>
      <td className="mono">{number(p)}</td>
      <td>{group}</td>
      <td className="ellip c-by">{by}</td>
      <td className="nowrap">{when}</td>
      <td><span className={left <= 3 ? 'bad-t' : ''}>{d.trash.days(left)}</span></td>
      <td className="act"><span className="actin">
        <button type="button" className="btn btn-sm btn-text" onClick={onRestore}>{d.trash.restore}</button>
        <button type="button" className="btn btn-sm btn-text danger-t" onClick={onPurge}>{d.trash.purge}</button>
      </span></td>
    </tr>
  );
}

function TrashCard({ d, p, checked, country, group, by, when, left, onToggle, onRestore, onPurge }: TrashItem){
  return (
    <li className={`pcard${checked ? ' cur' : ''}`} data-id={p.id}>
      <div className="pc-top">
        <Flag country={country} kernel={p.kernel} />
        <span><span className="l1"><b>{p.name}</b></span><span className="l2"><span className="mono">{number(p)}</span> · {group}</span></span>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={d.common.select(p.name)} />
      </div>
      <ul className="tr-facts">
        <li><Icon name={p.os} />{d.os[p.os]} · {engineName(p.kernel, p.kernelVersion)}</li>
        <li><Icon name="download" />{d.trash.cols.signins} · {signins(d, p)}</li>
        <li><Icon name="trash" />{d.trash.byAt(by, when)}</li>
        <li><Icon name="clock" />{d.trash.days(left)}</li>
      </ul>
      <div className="pc-foot">
        <button type="button" className="btn btn-sm btn-primary" onClick={onRestore}><Icon name="refresh" />{d.trash.restore}</button>
        <button type="button" className="btn btn-sm btn-text" onClick={onPurge}>{d.trash.purge}</button>
      </div>
    </li>
  );
}
