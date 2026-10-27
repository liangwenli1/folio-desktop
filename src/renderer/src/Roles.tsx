// What each role may do (v2 17): the roles on the left (the four every workspace has, then its own, and a new one
// under them), the picked role's permissions on the right as rows to tick, in sections, with putting a built-in role
// back as it came, and saving. The owner's role has every permission and never changes; only people who manage
// members change roles.
import { useEffect, useState } from 'react';
import { folio, isApiError, type Permission, type Role, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { errorText, roleName, type Dict } from './i18n';
import { Act, Cancel, Icon, Modal, useToast } from './ui';
import { SelectField } from './Select';

type Section = 'profiles' | 'data' | 'proxies' | 'team';
const SECTIONS: [Section, Permission[]][] = [
  ['profiles', ['profiles.view', 'profiles.create', 'profiles.edit', 'profiles.open', 'profiles.delete']],
  ['data', ['cookies.import', 'cookies.export', 'profiles.export']],
  ['proxies', ['proxies.view', 'proxies.bind', 'proxies.edit']],
  ['team', ['team.manage', 'activity.view']]
];
const same = (a: Permission[], b: Permission[]) => a.length === b.length && a.every(p => b.includes(p));

export function RolesTab({ d, ws, data, manager }: { d: Dict; ws: Workspace; data: WorkspaceData; manager: boolean }){
  const P = d.rolesPage;
  const toast = useToast();
  const [cur, setCur] = useState(data.roles.find(r => r.key === 'member')?.id ?? '');
  const role = data.roles.find(r => r.id === cur) ?? data.roles[0];
  const [perms, setPerms] = useState<Permission[]>(role?.permissions ?? []);
  const [name, setName] = useState(role?.name ?? '');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  // The draft follows the picked role, and the role as saved.
  useEffect(() => { setPerms(role?.permissions ?? []); setName(role?.name ?? ''); }, [role?.id, role?.permissions.join(), role?.name]);
  if (!role) return null;
  const locked = !manager || role.key === 'owner';
  const dirty = !same(perms, role.permissions) || (!role.key && name.trim() !== role.name);
  const label = roleName(d, role);

  async function save(){
    setBusy(true);
    try {
      await folio.api('PATCH', `/roles/${role.id}`, { permissions: perms, ...(role.key ? {} : { name: name.trim() }) });
      toast(P.saved(role.key ? label : name.trim()));
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); } finally { setBusy(false); }
    data.refresh('members');
  }

  return (
    <div className="rl">
      <aside className="sec rl-list" aria-label={P.list}>
        <h3>{P.list}</h3>
        <ul>
          {data.roles.map(r => (
            <li key={r.id}>
              <button type="button" className={`rl-item${r.id === role.id ? ' cur' : ''}`} aria-pressed={r.id === role.id} onClick={() => setCur(r.id)}>
                <b>{roleName(d, r)}{r.key === 'owner' && <Icon name="lock" />}</b>
                <small>{r.key ? P.descs[r.key] : P.customOf(r.permissions.length)}</small>
                <span className="rl-n">{P.people(r.members)}</span>
              </button>
            </li>
          ))}
        </ul>
        {manager && <button type="button" className="btn btn-secondary rl-add" onClick={() => setAdding(true)}><Icon name="plus" />{P.add}</button>}
      </aside>

      <section className="sec rl-main" aria-label={label}>
        <div className="rl-head">
          <div>
            {role.key || locked ? <h2>{label}</h2>
              : <input className="rl-name" aria-label={P.name} value={name} maxLength={80} onChange={e => setName(e.target.value)} />}
            <p className="hint">{role.key ? P.descs[role.key] : P.customHint}</p>
          </div>
        </div>
        <p className="notice info"><Icon name="info" /><span>{P.note}</span></p>
        <div className="rl-perms">
          {SECTIONS.map(([s, list]) => (
            <div key={s} className="rl-sect" role="group" aria-label={P.sections[s]}>
              <h4>{P.sections[s]}</h4>
              {list.map(p => (
                <label key={p} className="rl-perm" data-permission={p}>
                  <span><b>{P.perms[p][0]}</b><small>{P.perms[p][1]}</small></span>
                  <input type="checkbox" checked={perms.includes(p)} disabled={locked} onChange={e => setPerms(x => (e.target.checked ? [...x, p] : x.filter(y => y !== p)))} />
                </label>
              ))}
            </div>
          ))}
        </div>
        {role.key === 'owner' && <p className="hint">{P.ownerNote}</p>}
        {!locked && (
          <div className="rl-foot">
            {!role.key && <button type="button" className="btn btn-text danger-t" onClick={() => setDeleting(true)}>{P.delete}</button>}
            <span className="sp" />
            {role.defaults && <button type="button" className="btn btn-secondary" disabled={same(perms, role.defaults)} onClick={() => setPerms(role.defaults!)}>{P.reset}</button>}
            <button type="button" className="btn btn-primary" aria-busy={busy || undefined} disabled={!dirty || busy || !name.trim()} onClick={() => void save()}>{P.save}</button>
          </div>
        )}
      </section>

      {adding && <NewRoleDialog d={d} ws={ws} data={data} onClose={() => setAdding(false)} onDone={id => { setAdding(false); setCur(id); }} />}
      {deleting && (
        <Modal kind="bad" title={P.deleteTitle(role.name)} onClose={() => setDeleting(false)} foot={<>
          <Cancel />
          <Act className="btn btn-danger solid" run={() => folio.api('DELETE', `/roles/${role.id}`).then(() => {
            toast(P.deleted(role.name)); setDeleting(false); setCur(''); data.refresh('members');
          }, e => { setDeleting(false); toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); })}>{P.delete}</Act>
        </>}><p>{P.deleteNote}</p></Modal>
      )}
    </div>
  );
}

// A role of the workspace's own, named, starting from another role's permissions or from none.
function NewRoleDialog({ d, ws, data, onClose, onDone }: { d: Dict; ws: Workspace; data: WorkspaceData; onClose(): void; onDone(id: string): void }){
  const P = d.rolesPage;
  const [name, setName] = useState('');
  const [from, setFrom] = useState(data.roles.find(r => r.key === 'member')?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  async function create(){
    if (!name.trim()){ setError(P.nameErr); return; }
    try {
      const r = await folio.api<Role>('POST', `/workspaces/${ws.id}/roles`, { name: name.trim(), permissions: data.roles.find(x => x.id === from)?.permissions ?? [] });
      data.refresh('members');
      onDone(r.id);
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); }
  }
  return (
    <Modal title={P.newTitle} onClose={onClose} foot={<>
      <Cancel />
      <Act className="btn btn-primary" run={() => create()}>{P.create}</Act>
    </>}>
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        <label className="field"><span>{P.name}<span className="req" aria-hidden="true">*</span></span>
          <input value={name} maxLength={80} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create(); }} /></label>
        <SelectField label={P.from} value={from} onChange={setFrom}
          options={[{ value: '', label: P.fromNone }, ...data.roles.filter(r => r.key !== 'owner').map(r => ({ value: r.id, label: roleName(d, r) }))]} />
      </div>
    </Modal>
  );
}
