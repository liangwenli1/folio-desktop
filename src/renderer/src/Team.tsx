// The team: people and their roles, invitations still open, and (Company) departments.
import { useState, type FormEvent } from 'react';
import { folio, isApiError, type Department, type Member, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, errorText, type Dict, type Lang } from './i18n';
import { Icon, Modal, useToast } from './ui';
import { Select, SelectField } from './Select';

type Dialog = { kind: 'invite' } | { kind: 'remove'; member: Member } | { kind: 'leave' } | { kind: 'dept'; dept?: Department } | null;
interface Props { d: Dict; lang: Lang; ws: Workspace; meId: string; data: WorkspaceData; onLeft(): void }

export function TeamPage({ d, lang, ws, meId, data, onLeft }: Props){
  const T = d.team;
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const manager = data.role !== 'member';
  const company = ws.subscription.plan === 'company';
  const deptName = new Map(data.departments.map(x => [x.id, x.name]));
  const email = new Map(data.members.map(m => [m.userId, m.email]));
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  const close = () => setDialog(null);

  async function setRole(m: Member, role: 'admin' | 'member'){
    try { await folio.api('PATCH', `/workspaces/${ws.id}/members/${m.userId}`, { role }); } catch (e){ fail(e); }
    data.refresh('members');
  }
  async function resend(emailAddr: string, role: 'admin' | 'member', departmentIds: string[]){
    try {
      const r = await folio.api<{ emailed: boolean }>('POST', `/workspaces/${ws.id}/invitations`, { email: emailAddr, role, departmentIds });
      if (r.emailed) toast(T.sent(emailAddr)); else toast(T.notSent, undefined, 'bad');
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
          <div className="ttl"><h1>{T.title}</h1><p className="sub">{T.sub(data.members.length, ws.subscription.entitlements.members)}</p></div>
          <span className="sp" />
          {manager && <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: 'invite' })}><Icon name="plus" />{T.invite}</button>}
        </header>

        <div className="tw top-gap flow">
          <table>
            <thead>
              <tr>
                <th scope="col">{T.cols.person}</th><th scope="col">{T.cols.role}</th>
                {(company || data.departments.length > 0) && <th scope="col">{T.cols.departments}</th>}
                <th scope="col" className="num">{T.cols.profiles}</th><th scope="col">{T.cols.joined}</th><th className="act" scope="col" />
              </tr>
            </thead>
            <tbody>
              {data.members.map(m => {
                const self = m.userId === meId;
                return (
                  <tr key={m.userId} data-member={m.email}>
                    <td><span className="l1"><b>{m.email}</b>{self && <span className="tag">{T.you}</span>}</span></td>
                    <td>
                      {manager && m.role !== 'owner' && !self
                        ? <Select variant="cell" label={T.roleOf(m.email)} value={m.role} onChange={v => void setRole(m, v as 'admin' | 'member')}
                          options={[{ value: 'admin', label: d.roles.admin }, { value: 'member', label: d.roles.member }]} />
                        : d.roles[m.role]}
                    </td>
                    {(company || data.departments.length > 0) && <td>{m.departmentIds.map(id => <span key={id} className="tag first">{deptName.get(id)}</span>)}</td>}
                    <td className="num">{m.profiles}</td>
                    <td>{day(m.joinedAt, lang)}</td>
                    <td className="act"><span className="actin">
                      {manager && m.role !== 'owner' && !self && <button type="button" className="btn btn-xs btn-danger" aria-label={T.removeX(m.email)} onClick={() => setDialog({ kind: 'remove', member: m })}>{T.remove}</button>}
                      {self && m.role !== 'owner' && <button type="button" className="btn btn-xs btn-danger" onClick={() => setDialog({ kind: 'leave' })}>{T.leave}</button>}
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {manager && data.invitations.length > 0 && (
          <section className="team-sec" aria-label={T.pending}>
            <h2 className="sec-t">{T.pending}</h2>
            <ul className="plain-list">
              {data.invitations.map(i => (
                <li key={i.id} data-invitation={i.email}>
                  <span><b>{i.email}</b> · {d.roles[i.role]}<br /><span className="hint">{[i.invitedBy && T.invitedBy(i.invitedBy), T.expires(day(i.expiresAt, lang))].filter(Boolean).join(' · ')}</span></span>
                  <span className="sp" />
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => void resend(i.email, i.role, i.departmentIds)}>{T.resend}</button>
                  <button type="button" className="btn btn-xs btn-text" onClick={() => void withdraw(i.id)}>{T.withdraw}</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(company || data.departments.length > 0) && (
          <section className="team-sec" aria-label={T.depts}>
            <div className="sec-row">
              <h2 className="sec-t">{T.depts}</h2>
              {manager && company && <button type="button" className="btn btn-xs btn-secondary" onClick={() => setDialog({ kind: 'dept' })}><Icon name="plus" />{T.deptAdd}</button>}
            </div>
            <p className="hint">{company ? T.deptHelp : T.deptCompany}</p>
            {!data.departments.length && <p className="hint">{T.deptNone}</p>}
            <ul className="plain-list">
              {data.departments.map(x => (
                <li key={x.id} data-department={x.name}>
                  <span><b>{x.name}</b> · {T.deptProfiles(x.profiles)}<br /><span className="hint">{x.memberIds.map(id => email.get(id)).filter(Boolean).join(', ') || '—'}</span></span>
                  <span className="sp" />
                  {manager && company && <button type="button" className="btn btn-xs btn-text" onClick={() => setDialog({ kind: 'dept', dept: x })}>{d.common.edit}</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {dialog?.kind === 'invite' && <InviteDialog d={d} ws={ws} data={data} company={company} onClose={close} />}
      {dialog?.kind === 'remove' && <RemoveDialog d={d} ws={ws} data={data} member={dialog.member} meId={meId} onClose={close} />}
      {dialog?.kind === 'leave' && (
        <Modal title={T.leaveTitle(ws.name)} closeLabel={d.common.close} onClose={close} foot={<>
          <button className="btn btn-secondary" type="button" onClick={close}>{d.common.cancel}</button>
          <button className="btn btn-danger solid" type="button" onClick={() => void folio.api('POST', `/workspaces/${ws.id}/leave`).then(() => { close(); onLeft(); }, fail)}>{T.leaveDo}</button>
        </>}>
          <div className="m-body"><p>{T.leaveLead}</p></div>
        </Modal>
      )}
      {dialog?.kind === 'dept' && <DepartmentDialog d={d} ws={ws} data={data} dept={dialog.dept} onClose={close} />}
    </div>
  );
}

function InviteDialog({ d, ws, data, company, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; company: boolean; onClose(): void }){
  const T = d.team;
  const toast = useToast();
  const [emailAddr, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [depts, setDepts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; emailed: boolean; email: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent){
    e.preventDefault();
    if (!emailAddr.includes('@')){ setError(T.emailErr); return; }
    setBusy(true); setError(null);
    try {
      const r = await folio.api<{ link: string; emailed: boolean }>('POST', `/workspaces/${ws.id}/invitations`, { email: emailAddr.trim(), role, departmentIds: depts });
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
            {(['member', 'admin'] as const).map(r => (
              <label key={r} className="choice">
                <input type="radio" name="inv-role" checked={role === r} onChange={() => setRole(r)} />
                <span><b>{d.roles[r]}</b><span className="hint">{T.roleHelp[r]}</span></span>
              </label>
            ))}
          </fieldset>
          {company && data.departments.length > 0 && (
            <fieldset className="field choices">
              <legend className="label">{T.departments}</legend>
              {data.departments.map(x => (
                <label key={x.id} className="check-row">
                  <input type="checkbox" checked={depts.includes(x.id)} onChange={e => setDepts(s => (e.target.checked ? [...s, x.id] : s.filter(id => id !== x.id)))} />{x.name}
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

function DepartmentDialog({ d, ws, data, dept, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; dept?: Department; onClose(): void }){
  const T = d.team;
  const [name, setName] = useState(dept?.name ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(dept?.memberIds ?? []);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); data.refresh('members', 'profiles'); onClose(); } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); }
  };
  async function save(e: FormEvent){
    e.preventDefault();
    if (!name.trim()) return;
    await run(async () => {
      const id = dept?.id ?? (await folio.api<Department>('POST', `/workspaces/${ws.id}/departments`, { name: name.trim() })).id;
      await folio.api('PATCH', `/departments/${id}`, { ...(dept ? { name: name.trim() } : {}), memberIds });
    });
  }
  return (
    <Modal title={dept ? dept.name : T.deptAdd} closeLabel={d.common.close} onClose={onClose} foot={confirm
      ? <>
        <span className="hint sp">{T.deptDeleteConfirm(dept!.name)}</span>
        <button className="btn btn-secondary" type="button" onClick={() => setConfirm(false)}>{d.common.cancel}</button>
        <button className="btn btn-danger solid" type="button" onClick={() => void run(() => folio.api('DELETE', `/departments/${dept!.id}`))}>{T.deptDelete}</button>
      </>
      : <>
        {dept && <button className="btn btn-danger" type="button" onClick={() => setConfirm(true)}>{T.deptDelete}</button>}
        <span className="sp" />
        <button className="btn btn-secondary" type="button" onClick={onClose}>{d.common.cancel}</button>
        <button className="btn btn-primary" type="submit" form="dept-form">{d.common.save}</button>
      </>}>
      <form className="m-body" id="dept-form" onSubmit={save} noValidate>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="dept-name">{T.deptName}</label>
          <input id="dept-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus />
        </div>
        <fieldset className="field choices">
          <legend className="label">{T.deptMembers}</legend>
          {data.members.filter(m => m.role === 'member').map(m => (
            <label key={m.userId} className="check-row">
              <input type="checkbox" checked={memberIds.includes(m.userId)} onChange={e => setMemberIds(s => (e.target.checked ? [...s, m.userId] : s.filter(id => id !== m.userId)))} />{m.email}
            </label>
          ))}
        </fieldset>
      </form>
    </Modal>
  );
}
