// The team: people with their roles and what they can see, and invitations still open in the same list. Which groups
// each of them is authorised for is set on the Groups page.
import { useState, type FormEvent } from 'react';
import { MANAGE, can, folio, isApiError, type Member, type Role, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, errorText, roleName, type Dict, type Lang } from './i18n';
import { Avatar, Icon, LoadFailed, Modal, MoreMenu, useToast, type IconName } from './ui';
import { Select, SelectField } from './Select';

type Dialog = { kind: 'invite' } | { kind: 'remove'; member: Member } | { kind: 'leave' } | null;
interface Props { d: Dict; lang: Lang; ws: Workspace; meId: string; data: WorkspaceData; onLeft(): void }

export function TeamPage({ d, lang, ws, meId, data, onLeft }: Props){
  const T = d.team;
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState('');
  const manager = can(data.role, MANAGE);
  const company = ws.subscription.plan === 'company';
  const groupName = new Map(data.groups.map(g => [g.id, g.name]));
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  const close = () => setDialog(null);
  const needle = q.trim().toLowerCase();
  const people = data.members.filter(m => !needle || m.email.toLowerCase().includes(needle));
  const invites = manager ? data.invitations.filter(i => !needle || i.email.toLowerCase().includes(needle)) : [];
  // What someone sees: everything if their role administers the workspace; otherwise their own profiles and
  // the groups they are authorised for.
  const seesAll = (role: Member['role']) => data.roles.find(r => r.id === role.id)?.permissions.includes(MANAGE) ?? false;
  const scope = (role: Member['role'], groupIds: string[]) => (seesAll(role) ? T.scopeAll
    : groupIds.length ? groupIds.map(id => groupName.get(id)).filter(Boolean).join(lang === 'zh' ? '、' : ', ') : T.scopeOwn);
  // Every role but the owner's can be given out.
  const givable = data.roles.filter(r => r.key !== 'owner');
  const self = data.members.find(m => m.userId === meId);

  async function setRole(m: Member, roleId: string){
    try { await folio.api('PATCH', `/workspaces/${ws.id}/members/${m.userId}`, { roleId }); } catch (e){ fail(e); }
    data.refresh('members');
  }
  async function resend(emailAddr: string, roleId: string, groupIds: string[]){
    try {
      const r = await folio.api<{ emailed: boolean }>('POST', `/workspaces/${ws.id}/invitations`, { email: emailAddr, roleId, groupIds });
      if (r.emailed) toast(T.sent(emailAddr)); else toast(T.notSent, undefined, 'bad');
    } catch (e){ fail(e); }
    data.refresh('members');
  }
  // Links are stored hashed: copying one makes a new link (not emailed), and the one before stops working.
  async function copyLink(emailAddr: string, roleId: string, groupIds: string[]){
    try {
      const r = await folio.api<{ link: string }>('POST', `/workspaces/${ws.id}/invitations`, { email: emailAddr, roleId, groupIds, notify: false });
      await navigator.clipboard.writeText(r.link);
      toast(T.copiedNew);
    } catch (e){ fail(e); }
    data.refresh('members');
  }
  async function withdraw(id: string){
    try { await folio.api('DELETE', `/invitations/${id}`); toast(T.withdrawn); } catch (e){ fail(e); }
    data.refresh('members');
  }

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{T.title}</h1><p className="sub">{T.lead}</p></div>
          <label className="search">
            <Icon name="search" /><span className="sr">{T.search}</span>
            <input type="search" placeholder={T.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          {self && self.role.key !== 'owner' && <button className="btn btn-danger" type="button" onClick={() => setDialog({ kind: 'leave' })}>{T.leave}</button>}
          {manager && <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: 'invite' })}><Icon name="plus" />{T.invite}</button>}
        </header>

        <div className="tw flow top-gap">
          <table>
            <thead>
              <tr>
                <th scope="col">{T.cols.person}</th><th scope="col">{T.cols.role}</th><th scope="col">{T.cols.scope}</th><th scope="col">{T.cols.status}</th>
                <th className="act" scope="col">{d.profiles.cols.actions}</th>
              </tr>
            </thead>
            <tbody>
              {data.loadFailed.has('members') && <tr className="empty"><td colSpan={5}><LoadFailed d={d} onRetry={() => data.refresh('members')} /></td></tr>}
              {people.map(m => {
                const me = m.userId === meId, editable = manager && m.role.key !== 'owner' && !me;
                return (
                  <tr key={m.userId} data-member={m.email}>
                    <td><span className="prof-cell"><Avatar text={m.email} /><span className="l1"><b>{m.email}</b>{me && <span className="muted">{T.meTag}</span>}</span></span></td>
                    <td>{editable
                      ? <span className="role-pick"><Select variant="sm" label={T.roleOf(m.email)} value={m.role.id} onChange={r => void setRole(m, r)}
                        options={givable.map(r => ({ value: r.id, label: roleName(d, r) }))} /></span>
                      : <span className={`role ${m.role.key ?? 'custom'}`}><Icon name={roleIcon(m.role)} />{roleName(d, m.role)}</span>}</td>
                    <td>{scope(m.role, m.groupIds)}</td>
                    <td><span className="dot-st run">{T.joined}</span></td>
                    <td className="act">{editable && <MoreMenu label={T.moreX(m.email)} items={[{ label: T.remove, onClick: () => setDialog({ kind: 'remove', member: m }), danger: true }]} />}</td>
                  </tr>
                );
              })}
              {invites.map(i => (
                <tr key={i.id} data-invitation={i.email}>
                  <td><span className="prof-cell"><Avatar text={i.email} /><span className="l1"><b>{i.email}</b></span></span></td>
                  <td><span className={`role ${i.role.key ?? 'custom'}`}><Icon name={roleIcon(i.role)} />{roleName(d, i.role)}</span></td>
                  <td>{scope(i.role, i.groupIds)}</td>
                  <td><span className="dot-st boot" title={T.expires(day(i.expiresAt, lang))}>{T.invited}</span></td>
                  <td className="act"><MoreMenu label={T.moreX(i.email)} items={[
                    { label: T.copyLink, onClick: () => void copyLink(i.email, i.role.id, i.groupIds) },
                    { label: T.resend, onClick: () => void resend(i.email, i.role.id, i.groupIds) },
                    { label: T.withdraw, onClick: () => void withdraw(i.id), danger: true }
                  ]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {dialog?.kind === 'invite' && <InviteDialog d={d} ws={ws} data={data} company={company} onClose={close} />}
      {dialog?.kind === 'remove' && <RemoveDialog d={d} ws={ws} data={data} member={dialog.member} meId={meId} onClose={close} />}
      {dialog?.kind === 'leave' && (
        <Modal icon="logout" tone="bad" title={T.leaveTitle(ws.name)} closeLabel={d.common.close} onClose={close} foot={<>
          <button className="btn btn-secondary" type="button" onClick={close}>{d.common.cancel}</button>
          <button className="btn btn-danger solid" type="button" onClick={() => void folio.api('POST', `/workspaces/${ws.id}/leave`).then(() => { close(); onLeft(); }, fail)}>{T.leaveDo}</button>
        </>}><p>{T.leaveLead}</p></Modal>
      )}
    </div>
  );
}

const ROLE_ICON: Record<string, IconName> = { owner: 'crown', admin: 'key', member: 'team', viewer: 'eye' };
const roleIcon = (r: Member['role']): IconName => ROLE_ICON[r.key ?? ''] ?? 'team';
function InviteDialog({ d, ws, data, company, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; company: boolean; onClose(): void }){
  const T = d.team;
  const toast = useToast();
  const [emailAddr, setEmail] = useState('');
  const givable = data.roles.filter(r => r.key !== 'owner');
  const [roleId, setRoleId] = useState('');
  const role = givable.find(r => r.id === roleId) ?? givable.find(r => r.key === 'member') ?? givable[0];
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; emailed: boolean; email: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent){
    e.preventDefault();
    if (!emailAddr.includes('@')){ setError(T.emailErr); return; }
    setBusy(true); setError(null);
    try {
      const r = await folio.api<{ link: string; emailed: boolean }>('POST', `/workspaces/${ws.id}/invitations`, { email: emailAddr.trim(), roleId: role.id, groupIds });
      setResult({ ...r, email: emailAddr.trim() });
      data.refresh('members');
    } catch (err){ setError(errorText(d, isApiError(err) ? err.code : 'internal')); } finally { setBusy(false); }
  }

  return (
    <Modal title={T.inviteTitle} closeLabel={d.common.close} onClose={onClose} foot={result
      ? <button className="btn btn-primary" type="button" onClick={onClose}>{T.done}</button>
      : <>
        <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
        <button className="btn btn-primary" type="submit" form="invite-form" disabled={busy}>{T.send}</button>
      </>}>
      {result ? (
        <div className="m-body" role="status">
          <p>{result.emailed ? T.sent(result.email) : T.notSent}</p>
          <div className="field">
            <label htmlFor="inv-link">{T.link}</label>
            <div className="pxcheck">
              <input id="inv-link" className="mono-in" readOnly value={result.link} onFocus={e => e.target.select()} />
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void navigator.clipboard.writeText(result.link).then(() => toast(T.copied))}>{T.copyLink}</button>
            </div>
          </div>
        </div>
      ) : (
        <form className="m-body" id="invite-form" onSubmit={submit} noValidate>
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="field">
            <label htmlFor="inv-email">{T.email}</label>
            <input id="inv-email" type="email" value={emailAddr} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="off" />
          </div>
          <fieldset className="field choices">
            <legend className="label">{T.role}</legend>
            {givable.map(r => (
              <label key={r.id} className="choice">
                <input type="radio" name="inv-role" checked={role?.id === r.id} onChange={() => setRoleId(r.id)} />
                <span><b>{roleName(d, r)}</b><span className="hint">{(r.key && T.roleHelp[r.key]) || T.roleActions(r.permissions.length)}</span></span>
              </label>
            ))}
          </fieldset>
          {company && data.groups.length > 0 && (
            <fieldset className="field choices">
              <legend className="label">{T.groupAccess}</legend>
              {data.groups.map(g => (
                <label key={g.id} className="check-row">
                  <input type="checkbox" checked={groupIds.includes(g.id)} onChange={e => setGroupIds(s => (e.target.checked ? [...s, g.id] : s.filter(id => id !== g.id)))} />{g.name}
                </label>
              ))}
            </fieldset>
          )}
        </form>
      )}
    </Modal>
  );
}

function RemoveDialog({ d, ws, data, member, meId, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; member: Member; meId: string; onClose(): void }){
  const T = d.team;
  const toast = useToast();
  const others = data.members.filter(m => m.userId !== member.userId);
  const [heir, setHeir] = useState(others.some(m => m.userId === meId) ? meId : others[0]?.userId ?? '');
  const [error, setError] = useState<string | null>(null);
  async function remove(){
    try {
      await folio.api('DELETE', `/workspaces/${ws.id}/members/${member.userId}?transferTo=${heir}`);
      toast(T.removed(member.email));
      data.refresh('members', 'profiles');
      onClose();
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); }
  }
  return (
    <Modal title={T.removeTitle(member.email)} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
      <button className="btn btn-danger solid" type="button" disabled={!heir} onClick={() => void remove()}>{T.removeDo}</button>
    </>}>
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        <p>{T.removeLead}</p>
        <SelectField label={T.heir} value={heir} onChange={setHeir} options={others.map(m => ({ value: m.userId, label: m.email }))} searchPh={d.form.searchPh} />
      </div>
    </Modal>
  );
}
