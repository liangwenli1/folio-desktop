// Groups: the tree on the left (every profile, the ones in no group, then each group with what is in it and under
// it), the picked group's profiles in the middle, and its settings on the right — name, place in the tree, colour,
// description, who is authorised for it (Company) and their roles, and whether the people of the group above reach it
// too. A role is the person's across the workspace; a group only decides which profiles they reach.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MANAGE, can, folio, isApiError, type Group, type Workspace } from './api';
import { kernelKey, type WorkspaceData } from './data';
import { health } from './checks';
import { errorText, roleName, type Dict, type Lang } from './i18n';
import { Act, Avatar, BulkBar, Cancel, Empty, GROUP_COLORS, Icon, ListFailed, Modal, MoreMenu, PanelEdge, PartialFailed, SkelRows, Switch, useChanged, useToast, type GroupColor } from './ui';
import { Select, SelectField } from './Select';
import { Flag } from './Flag';
import { Pager } from './Pager';
import { stateOf } from './Profiles';

type Pick = 'all' | 'none' | string;
type Kids = Map<string | null, Group[]>;
// Each group's children, in the server's order (by name).
const childrenOf = (groups: Group[]): Kids => {
  const m: Kids = new Map();
  for (const g of groups) m.set(g.parentId, [...(m.get(g.parentId) ?? []), g]);
  return m;
};
// A group and every group under it.
const subtree = (kids: Kids, id: string): string[] => [id, ...(kids.get(id) ?? []).flatMap(c => subtree(kids, c.id))];
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

export function GroupsPage({ d, lang, ws, meId, data, onOpenProfile, onNewProfile }: {
  d: Dict; lang: Lang; ws: Workspace; meId: string; data: WorkspaceData; onOpenProfile(id: string): void; onNewProfile(groupId: string | null): void;
}){
  const G = d.groups;
  const toast = useToast();
  const manager = can(data.role, MANAGE), editor = can(data.role, 'profiles.edit');
  const company = ws.subscription.plan === 'company';
  const kids = useMemo(() => childrenOf(data.groups), [data.groups]);
  const byId = useMemo(() => new Map(data.groups.map(g => [g.id, g])), [data.groups]);
  const proxies = useMemo(() => new Map(data.proxies.map(p => [p.id, p])), [data.proxies]);
  const profiles = data.profiles;
  const [pick, setPick] = useState<Pick>('all');
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [q, setQ] = useState('');
  const [run, setRun] = useState<'all' | 'running' | 'stopped'>('all');
  const [owner, setOwner] = useState('all');
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const group = pick !== 'all' && pick !== 'none' ? byId.get(pick) ?? null : null;
  // A group deleted here or elsewhere leaves every profile showing; one just made is waited for.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (pick === 'all' || pick === 'none') return;
    if (byId.has(pick)) seen.current = pick; else if (seen.current === pick) setPick('all');
  }, [pick, byId]);
  useEffect(() => { setPage(1); setSel(new Set()); }, [pick]);
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');

  const within = (id: string) => { const ids = new Set(subtree(kids, id)); return profiles.filter(p => p.groupId && ids.has(p.groupId)); };
  const shown = pick === 'all' ? profiles : pick === 'none' ? profiles.filter(p => !p.groupId) : within(pick);
  const names = new Map(data.members.map(m => [m.userId, m.displayName]));
  const needle = q.trim().toLowerCase(), num = /^#?\d+$/.test(needle) ? Number(needle.replace('#', '')) : null;
  const list = shown
    .filter(p => (run === 'all' || (run === 'running') === !!data.status[p.id]) && (owner === 'all' || p.ownerId === owner)
      && (!needle || p.name.toLowerCase().includes(needle) || p.number === num))
    .sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name, lang, { numeric: true }));
  const pages = Math.max(1, Math.ceil(list.length / size)), at = Math.min(page, pages);
  const rows = list.slice((at - 1) * size, at * size);
  const ids = [...sel].filter(id => list.some(p => p.id === id));
  const shownSel = rows.filter(p => sel.has(p.id)).length;
  const reset = () => setPage(1);
  // The table needs both lists; the first that failed to load says so in its place.
  const failed = (['profiles', 'groups'] as const).find(k => data.loadFailed.has(k));

  async function move(targets: string[], groupId: string | null){
    try {
      const n = await data.batch('move', targets, { groupId });
      toast(groupId ? d.profiles.done.moved(n, byId.get(groupId)?.name ?? '') : G.movedOut(n));
      setSel(new Set());
    } catch (e){ fail(e); }
  }

  // One row of the tree: its colour, name and how many profiles are in it and under it, with a fold for the
  // groups under it.
  const node = (g: Group, depth: number): ReactNode => {
    const below = kids.get(g.id) ?? [], open = !folded.has(g.id);
    return (
      <li key={g.id} role="treeitem" aria-selected={pick === g.id} aria-expanded={below.length ? open : undefined}>
        <div className={`gt-row${pick === g.id ? ' cur' : ''}`} style={{ paddingLeft: 8 + depth * 18 }}>
          {below.length
            ? <button type="button" className="gt-fold" aria-label={open ? G.collapse(g.name) : G.expand(g.name)} onClick={() => setFolded(s => { const n = new Set(s); if (open) n.add(g.id); else n.delete(g.id); return n; })}><Icon name={open ? 'chev' : 'chevR'} /></button>
            : <span className="gt-fold" />}
          <button type="button" className="gt-pick" data-group={g.name} onClick={() => setPick(g.id)}>
            <span className={`gt-ic gc-${g.color}`}><Icon name="folder" /></span><span className="gt-n">{g.name}</span><span className="gt-c">{within(g.id).length}</span>
          </button>
        </div>
        {below.length > 0 && open && <ul role="group">{below.map(c => node(c, depth + 1))}</ul>}
      </li>
    );
  };
  const fixed = (k: 'all' | 'none', label: string, n: number) => (
    <li role="treeitem" aria-selected={pick === k}>
      <div className={`gt-row${pick === k ? ' cur' : ''}`} style={{ paddingLeft: 8 }}>
        <span className="gt-fold" />
        <button type="button" className="gt-pick" onClick={() => setPick(k)}><span className="gt-ic"><Icon name="folder" /></span><span className="gt-n">{label}</span><span className="gt-c">{n}</span></button>
      </div>
    </li>
  );

  const title = group ? group.name : pick === 'none' ? G.none : G.everything;
  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{G.title}</h1></div>
          <span className="sp" />
          {manager && <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" />{G.add}</button>}
        </header>
        <div className={`gp${group && manager && panel ? ' with-panel' : ''}`}>
          <section className="sec gp-tree" aria-label={G.tree}>
            <div className="sec-row"><h3>{G.tree}</h3></div>
            <ul role="tree" aria-label={G.tree}>
              {fixed('all', G.everything, profiles.length)}
              {fixed('none', G.none, profiles.filter(p => !p.groupId).length)}
              {(kids.get(null) ?? []).map(g => node(g, 0))}
            </ul>
          </section>

          <section className="sec gp-main" aria-label={title}>
            {data.loaded.has('profiles') && <PartialFailed d={d} data={data} kinds={['members']} />}
            <div className="gp-head">
              <div><h2 data-testid="group-title">{title}</h2><p className="hint">{G.sum(shown.length, group ? group.memberIds.length : null)}</p></div>
              <span className="sp" />
              {group && manager && <button type="button" className="btn btn-secondary" onClick={() => setPanel(true)}>{G.edit}</button>}
              {can(data.role, 'profiles.create') && <button type="button" className="btn btn-primary" onClick={() => onNewProfile(group?.id ?? null)}><Icon name="plus" />{G.addProfile}</button>}
            </div>
            <div className="filters inline">
              <label className="search"><Icon name="search" /><span className="sr">{G.search}</span>
                <input type="search" placeholder={G.search} value={q} onChange={e => { setQ(e.target.value); reset(); }} autoComplete="off" /></label>
              <span className="grp-pick"><Select label={G.state} value={run} onChange={v => { setRun(v as typeof run); reset(); }}
                options={(['all', 'running', 'stopped'] as const).map(s => ({ value: s, label: G.states[s] }))} /></span>
              <span className="grp-pick"><Select label={G.owner} value={owner} onChange={v => { setOwner(v); reset(); }} searchPh={d.form.searchPh}
                options={[{ value: 'all', label: G.owners }, ...data.members.map(m => ({ value: m.userId, label: m.displayName, hint: m.email }))]} /></span>
              <button type="button" className="icon-btn" aria-label={G.sort} title={G.sort} aria-pressed={desc} onClick={() => setDesc(x => !x)}><Icon name={desc ? 'up' : 'down'} /></button>
            </div>
            {ids.length > 0 && editor && (
              <BulkBar n={ids.length} label={d.common.picked.profiles(ids.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
                <Select variant="bar" action icon="folder" label={G.move} placeholder={G.move} value="" searchPh={d.form.searchPh} onChange={v => void move(ids, v)}
                  options={data.groups.filter(g => g.id !== group?.id).map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const }))} />
                {pick !== 'none' && <button type="button" className="bb" onClick={() => void move(ids, null)}>{G.moveOut}</button>}
              </BulkBar>
            )}
            <div className="tw gp-t">
              <table>
                <thead>
                  <tr>
                    <th className="cb" scope="col">
                      <input type="checkbox" aria-label={d.common.selectAll} checked={rows.length > 0 && shownSel === rows.length}
                        ref={el => { if (el) el.indeterminate = shownSel > 0 && shownSel < rows.length; }}
                        onChange={() => setSel(s => { const n = new Set(s); rows.forEach(p => (shownSel === rows.length ? n.delete(p.id) : n.add(p.id))); return n; })} />
                    </th>
                    <th scope="col">{G.cols.name}</th><th className="mid" scope="col">{G.cols.number}</th><th className="c-region ic" scope="col">{G.cols.region}</th>
                    <th className="mid" scope="col">{G.cols.status}</th><th scope="col">{G.cols.owner}</th><th className="act" scope="col">{G.cols.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {failed && <tr className="empty"><td colSpan={7}><ListFailed d={d} data={data} kind={failed} /></td></tr>}
                  {!failed && !data.loaded.has('profiles') && <SkelRows cols={7} check />}
                  {!failed && data.loaded.has('profiles') && !rows.length && <tr className="empty"><td colSpan={7}>{shown.length
                    ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setRun('all'); setOwner('all'); reset(); }}>{d.states.clear}</button>
                      </Empty>
                    : <Empty icon="folder" title={G.empty} text={G.emptyText}>
                        {can(data.role, 'profiles.create') && <button type="button" className="btn btn-primary btn-sm" onClick={() => onNewProfile(group?.id ?? null)}><Icon name="plus" />{G.addProfile}</button>}
                      </Empty>}</td></tr>}
                  {rows.map(p => {
                    const h = health(p, proxies, data.kernels), [tone, text] = stateOf(d, p, h, data.status[p.id], data.progress[kernelKey(p.kernel, p.kernelVersion)]);
                    return (
                      <tr key={p.id} data-id={p.id} className={sel.has(p.id) ? 'on' : undefined}>
                        <td className="cb"><input type="checkbox" checked={sel.has(p.id)} aria-label={d.common.select(p.name)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /></td>
                        <td><button type="button" className="rowlink" onClick={() => onOpenProfile(p.id)}>{p.name}</button></td>
                        <td className="mono mid">#{String(p.number).padStart(4, '0')}</td>
                        <td className="c-region">{h.geo ? <span className="px-exit"><Flag country={h.geo.country} size="xs" />{h.geo.countryName}</span> : <span className="muted hang">—</span>}</td>
                        <td className="mid"><span className={`dot-st ${tone}`}>{text}</span></td>
                        <td className="ellip">{names.get(p.ownerId ?? '') ?? '—'}</td>
                        <td className="act"><MoreMenu label={d.profiles.actionsX(p.name)} items={[
                          { label: d.proxies.detail.viewProfile, onClick: () => onOpenProfile(p.id) },
                          ...(editor && p.groupId ? [{ label: G.moveOut, onClick: () => void move([p.id], null) }] : [])
                        ]} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {list.length > 0 && <Pager d={d} total={list.length} page={at} size={size} onPage={setPage} onSize={n => { setSize(n); setPage(1); }} />}
            <p className="notice info"><Icon name="info" /><span>{G.tip}</span></p>
          </section>

          {group && manager && panel && <GroupSettings key={group.id} d={d} ws={ws} data={data} meId={meId} group={group} kids={kids} company={company}
            onClose={() => setPanel(false)} onDelete={() => setDeleting(group)} />}
        </div>
      </main>
      {adding && <NewGroupDialog d={d} ws={ws} data={data} meId={meId} company={company} parentId={group?.id ?? null}
        onClose={() => setAdding(false)} onDone={id => { setAdding(false); setPick(id); setPanel(true); }} />}
      {deleting && <DeleteGroupDialog d={d} data={data} group={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); setPick(deleting.parentId ?? 'all'); }} />}
    </div>
  );
}

// Who is authorised for a group and with which role. The role is the person's across the workspace, so changing it
// here changes it everywhere; adding people to a group is part of the Company plan.
function MemberRoles({ d, data, meId, company, title, memberIds, roles, onIds, onRole }: {
  d: Dict; data: WorkspaceData; meId: string; company: boolean; title: string; memberIds: string[]; roles: Record<string, string>;
  onIds(ids: string[]): void; onRole(userId: string, roleId: string): void;
}){
  const G = d.groups;
  const givable = data.roles.filter(r => r.key !== 'owner');
  const people = data.members.filter(m => memberIds.includes(m.userId));
  const addable = data.members.filter(m => m.role.key !== 'owner' && !memberIds.includes(m.userId));
  return <>
    <div className="sec-row">
      <h4>{title}</h4>
      {company && <Select variant="sm" action label={G.addMember} placeholder={G.addMember} value="" searchPh={G.findMember} empty={G.noneToAdd}
        onChange={id => onIds([...memberIds, id])} options={addable.map(m => ({ value: m.userId, label: m.displayName, hint: m.email }))} />}
    </div>
    {!company && <p className="notice info">{G.companyOnly}</p>}
    {people.length > 0 && (
      <ul className="gm-list">
        {people.map(m => {
          const fixed = m.role.key === 'owner' || m.userId === meId;
          return (
            <li key={m.userId} data-member={m.email}>
              <Avatar text={m.displayName} /><span className="gm-e" title={m.email}>{m.displayName}</span>
              {fixed
                ? <span className="gm-r muted">{roleName(d, m.role)}</span>
                : <span className="gm-r"><Select variant="sm" label={G.roleOf(m.displayName)} value={roles[m.userId] ?? m.role.id} onChange={r => onRole(m.userId, r)}
                    options={givable.map(r => ({ value: r.id, label: roleName(d, r) }))} /></span>}
              {company && <button type="button" className="icon-btn bare" aria-label={G.removeMember(m.displayName)} title={G.removeMember(m.displayName)} onClick={() => onIds(memberIds.filter(id => id !== m.userId))}><Icon name="x" /></button>}
            </li>
          );
        })}
      </ul>
    )}
    {people.length > 0 && <p className="hint">{G.roleNote}</p>}
  </>;
}

// The roles that changed, saved one by one (a role belongs to the person, not the group).
async function saveRoles(wsId: string, data: WorkspaceData, roles: Record<string, string>){
  for (const m of data.members) if (roles[m.userId] && roles[m.userId] !== m.role.id) await folio.api('PATCH', `/workspaces/${wsId}/members/${m.userId}`, { roleId: roles[m.userId] });
}

// The picked group's settings beside its profiles.
function GroupSettings({ d, ws, data, meId, group, kids, company, onClose, onDelete }: {
  d: Dict; ws: Workspace; data: WorkspaceData; meId: string; group: Group; kids: Kids; company: boolean; onClose(): void; onDelete(): void;
}){
  const G = d.groups;
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [parentId, setParentId] = useState(group.parentId ?? '');
  const [color, setColor] = useState<GroupColor>(group.color);
  const [description, setDescription] = useState(group.description ?? '');
  const [inherit, setInherit] = useState(group.inheritMembers);
  const [memberIds, setMemberIds] = useState(group.memberIds);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // It can't sit inside itself or anything under it.
  const below = new Set(subtree(kids, group.id));

  async function save(){
    if (!name.trim()){ setError(G.nameErr); return; }
    const body: Record<string, unknown> = {};
    if (name.trim() !== group.name) body.name = name.trim();
    if ((parentId || null) !== group.parentId) body.parentId = parentId || null;
    if (color !== group.color) body.color = color;
    if ((description.trim() || null) !== group.description) body.description = description.trim() || null;
    if (inherit !== group.inheritMembers) body.inheritMembers = inherit;
    if (!sameSet(memberIds, group.memberIds)) body.memberIds = memberIds;
    setBusy(true); setError(null);
    try {
      if (Object.keys(body).length) await folio.api('PATCH', `/groups/${group.id}`, body);
      await saveRoles(ws.id, data, roles);
      setRoles({});
      toast(G.saved);
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setBusy(false); }
    data.refresh('groups', 'members', 'profiles');
  }

  return (
    <aside className="sec side-panel gp-set" aria-label={G.settings}><PanelEdge />
      <div className="sec-row"><h3>{G.settings}</h3><button type="button" className="icon-btn bare" aria-label={d.common.close} title={d.common.close} onClick={onClose}><Icon name="x" /></button></div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <label className="field"><span>{G.name}<span className="req" aria-hidden="true">*</span></span>
        <input value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-required="true" /></label>
      <SelectField label={G.parent} value={parentId} onChange={setParentId} searchPh={d.form.searchPh}
        options={[{ value: '', label: G.parentNone }, ...data.groups.filter(g => !below.has(g.id)).map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const }))]} />
      <Swatches d={d} value={color} onChange={setColor} />
      <label className="field"><span>{G.description}<small className="opt">{d.form.optional}</small></span>
        <textarea rows={2} value={description} maxLength={200} onChange={e => setDescription(e.target.value)} /></label>
      <MemberRoles d={d} data={data} meId={meId} company={company} title={G.members} memberIds={memberIds} roles={roles} onIds={setMemberIds} onRole={(u, r) => setRoles(s => ({ ...s, [u]: r }))} />
      <h4>{G.access}</h4>
      <div className="set-row">
        <Switch label={G.inherit} checked={inherit} disabled={!parentId} onChange={setInherit} />
        <p className="hint">{G.inheritHint}</p>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>{G.save}</button>
      <button type="button" className="btn btn-text danger-t" onClick={onDelete}>{G.delete}</button>
    </aside>
  );
}

// The seven group colours, as round buttons.
function Swatches({ d, value, onChange }: { d: Dict; value: GroupColor; onChange(c: GroupColor): void }){
  const G = d.groups;
  return (
    <div className="field"><span className="label" id="gp-color">{G.color}</span>
      <div className="swatches big" role="group" aria-labelledby="gp-color">
        {GROUP_COLORS.map(c => <button key={c} type="button" className={`sw gc-${c}`} aria-label={G.colors[c]} title={G.colors[c]} aria-pressed={value === c} onClick={() => onChange(c)} />)}
      </div>
    </div>
  );
}

// A new group: where it sits, its colour and description, and (Company) who is authorised for it.
function NewGroupDialog({ d, ws, data, meId, company, parentId: under, onClose, onDone }: {
  d: Dict; ws: Workspace; data: WorkspaceData; meId: string; company: boolean; parentId: string | null; onClose(): void; onDone(id: string): void;
}){
  const G = d.groups;
  const toast = useToast();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(under ?? '');
  const [color, setColor] = useState<GroupColor>(GROUP_COLORS[data.groups.length % (GROUP_COLORS.length - 1)]);
  const [description, setDescription] = useState('');
  // Off unless asked for (v2 12): a new subgroup's members are only those given to it.
  const [inherit, setInherit] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useChanged({ name, parentId, color, description, inherit, members: memberIds.join(), roles: JSON.stringify(roles) });

  async function create(){
    setTried(true);
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      const g = await folio.api<Group>('POST', `/workspaces/${ws.id}/groups`, {
        name: name.trim(), parentId: parentId || null, color, description: description.trim() || null, inheritMembers: inherit, ...(memberIds.length ? { memberIds } : {})
      });
      await saveRoles(ws.id, data, roles);
      data.refresh('groups', 'members');
      toast(G.created(g.name));
      onDone(g.id);
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setBusy(false); }
  }

  return (
    <Modal wide title={G.newTitle} onClose={onClose} busy={busy} dirty={dirty} foot={<>
      <span className="hint">{G.createHint}</span>
      <span className="sp" />
      <Cancel />
      <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined} onClick={() => void create()}>{G.create}</button>
    </>}>
      <div className="m-body gp-new">
        {error && <p className="notice error" role="alert">{error}</p>}
        <label className="field"><span>{G.name}<span className="req" aria-hidden="true">*</span></span>
          <span className="counted"><input value={name} maxLength={80} placeholder={G.namePh} onChange={e => setName(e.target.value)} aria-required="true" aria-invalid={tried && !name.trim()} autoFocus />
            <small className="count">{name.length}/80</small></span>
          {tried && !name.trim() && <p className="err">{G.nameErr}</p>}
        </label>
        <SelectField label={G.parent} value={parentId} onChange={setParentId} searchPh={d.form.searchPh}
          options={[{ value: '', label: G.parentNone }, ...data.groups.map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const }))]} />
        <Swatches d={d} value={color} onChange={setColor} />
        <label className="field"><span>{G.description}<small className="opt">{d.form.optional}</small></span>
          <span className="counted"><textarea rows={3} value={description} maxLength={200} onChange={e => setDescription(e.target.value)} /><small className="count">{description.length}/200</small></span>
        </label>
        <h3 className="gp-h">{G.members}</h3>
        <div className="set-row">
          <Switch label={G.inherit} checked={inherit} disabled={!parentId} onChange={setInherit} />
          <p className="hint">{G.inheritHint}</p>
        </div>
        <MemberRoles d={d} data={data} meId={meId} company={company} title={G.people} memberIds={memberIds} roles={roles} onIds={setMemberIds} onRole={(u, r) => setRoles(s => ({ ...s, [u]: r }))} />
        <div className="pi-notes">
          <p><Icon name="info" /><b>{G.rolesTitle}</b></p>
          <ul>{data.roles.filter(r => r.key && r.key !== 'owner').map(r => <li key={r.id}><b>{roleName(d, r)}</b>{d.team.roleHelp[r.key!]}</li>)}</ul>
        </div>
      </div>
    </Modal>
  );
}

// Deleting a group: its own profiles go where chosen (no group by default, or its parent), the groups under it move
// up to its parent.
function DeleteGroupDialog({ d, data, group, onClose, onDone }: { d: Dict; data: WorkspaceData; group: Group; onClose(): void; onDone(): void }){
  const G = d.groups;
  const toast = useToast();
  const [moveTo, setMoveTo] = useState(group.parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const n = data.profiles.filter(p => p.groupId === group.id).length, kids = data.groups.filter(g => g.parentId === group.id).length;
  async function remove(){
    try {
      await folio.api('DELETE', `/groups/${group.id}${moveTo ? `?moveTo=${moveTo}` : ''}`);
      data.refresh('groups', 'profiles');
      toast(G.deleted(group.name));
      onDone();
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); }
  }
  return (
    <Modal kind={n ? undefined : 'bad'} title={G.deleteTitle(group.name)} onClose={onClose} foot={<>
      <Cancel />
      <Act className="btn btn-danger solid" run={() => remove()}>{n ? G.moveDelete : G.delete}</Act>
    </>}>
      {/* With profiles in it, a form: where they go first (v2 31); an empty group is a plain confirmation, Cancel first. */}
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        {n > 0 && <p className="notice warn"><Icon name="alert" /><span>{G.deleteHas(group.name, n)}</span></p>}
        {n > 0 && <SelectField label={G.moveTo} required value={moveTo} onChange={setMoveTo} searchPh={d.form.searchPh}
          options={[{ value: '', label: G.none }, ...data.groups.filter(g => g.id !== group.id).map(g => ({ value: g.id, label: g.name, dot: `gc-${g.color}` as const }))]} />}
        <p>{n ? G.deleteNote : G.deleteEmpty}{kids > 0 && ` ${G.deleteKids(kids)}`}</p>
      </div>
    </Modal>
  );
}
