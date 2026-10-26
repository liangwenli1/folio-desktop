// What each role may do: the roles on the left (the four every workspace has, then its own, and a new one), the
// picked role's permissions on the right in sections, with putting a built-in role back as it came, and saving. The
// owner's role has every permission and never changes; only people who manage members change roles.
import { Fragment, useEffect, useState } from 'react';
import { folio, isApiError, type Permission, type Role, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { errorText, roleName, type Dict } from './i18n';
import { Icon, Modal, Switch, useToast } from './ui';
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
        <div className="sec-row"><h3>{P.list}</h3>{manager && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAdding(true)}><Icon name="plus" />{P.add}</button>}</div>
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
      </aside>

      <section className="sec rl-main" aria-label={label}>
        <div className="rl-head">
          <div>
            {role.key || locked ? <h2>{label}</h2>
              : <input className="rl-name" aria-label={P.name} value={name} maxLength={80} onChange={e => setName(e.target.value)} />}
            <p className="hint">{role.key ? P.descs[role.key] : P.customHint}</p>
          </div>
          <span className="sp" />
          <p className="notice info rl-note"><Icon name="info" />{P.note}</p>
        </div>
        <div className="tw dense rl-t">
          <table>
            <thead><tr><th scope="col">{P.col}</th><th scope="col">{P.what}</th><th className="act" scope="col">{P.allow}</th></tr></thead>
            <tbody>
              {SECTIONS.map(([s, list]) => (
                <Fragment key={s}>
                  <tr className="sect"><td colSpan={3}>{P.sections[s]}</td></tr>
                  {list.map(p => (
                    <tr key={p} data-permission={p}>
                      <td><b>{P.perms[p][0]}</b></td>
                      <td className="muted">{P.perms[p][1]}</td>
                      <td className="act"><Switch label={P.perms[p][0]} hideLabel checked={perms.includes(p)} disabled={locked}
                        onChange={on => setPerms(x => (on ? [...x, p] : x.filter(y => y !== p)))} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {role.key === 'owner' && <p className="hint">{P.ownerNote}</p>}
        {!locked && (
          <div className="rl-foot">
            {!role.key && <button type="button" className="btn btn-text gp-del" onClick={() => setDeleting(true)}>{P.delete}</button>}
            <span className="sp" />
            {role.defaults && <button type="button" className="btn btn-secondary" disabled={same(perms, role.defaults)} onClick={() => setPerms(role.defaults!)}>{P.reset}</button>}
            <button type="button" className="btn btn-primary" disabled={!dirty || busy || !name.trim()} onClick={() => void save()}>{P.save}</button>
          </div>
        )}
      </section>

      {adding && <NewRoleDialog d={d} ws={ws} data={data} onClose={() => setAdding(false)} onDone={id => { setAdding(false); setCur(id); }} />}
      {deleting && (
        <Modal icon="trash" tone="bad" title={P.deleteTitle(role.name)} closeLabel={d.common.close} onClose={() => setDeleting(false)} foot={<>
          <button type="button" className="btn btn-secondary" onClick={() => setDeleting(false)}>{d.common.cancel}</button>
          <button type="button" className="btn btn-danger solid" onClick={() => void folio.api('DELETE', `/roles/${role.id}`).then(() => {
            toast(P.deleted(role.name)); setDeleting(false); setCur(''); data.refresh('members');
          }, e => { setDeleting(false); toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); })}>{P.delete}</button>
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
    <Modal title={P.newTitle} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button type="button" className="btn btn-secondary" onClick={onClose}>{d.common.cancel}</button>
      <button type="button" className="btn btn-primary" onClick={() => void create()}>{P.create}</button>
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
