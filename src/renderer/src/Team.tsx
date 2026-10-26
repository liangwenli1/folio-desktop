// The team: people with their roles and what they can see, invitations still open in the same list, and (Company)
// departments.
import { useState, type FormEvent } from 'react';
import { folio, isApiError, type Department, type Member, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, errorText, type Dict, type Lang } from './i18n';
import { Avatar, Icon, LoadFailed, Modal, MoreMenu, useToast, type IconName } from './ui';
import { Select, SelectField } from './Select';

type Dialog = { kind: 'invite' } | { kind: 'remove'; member: Member } | { kind: 'leave' } | { kind: 'dept'; dept?: Department } | null;
interface Props { d: Dict; lang: Lang; ws: Workspace; meId: string; data: WorkspaceData; onLeft(): void }

export function TeamPage({ d, lang, ws, meId, data, onLeft }: Props){
  const T = d.team;
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'members' | 'depts'>('members');
  const manager = data.role !== 'member';
  const company = ws.subscription.plan === 'company';
  const deptName = new Map(data.departments.map(x => [x.id, x.name]));
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  const close = () => setDialog(null);
  const needle = q.trim().toLowerCase();
  const people = data.members.filter(m => !needle || m.email.toLowerCase().includes(needle));
  const invites = manager ? data.invitations.filter(i => !needle || i.email.toLowerCase().includes(needle)) : [];
  // What someone sees: owners and admins everything; members their own profiles and their departments'.
  const scope = (role: Member['role'], departmentIds: string[]) => (role !== 'member' ? T.scopeAll
    : departmentIds.length ? departmentIds.map(id => deptName.get(id)).filter(Boolean).join(lang === 'zh' ? '、' : ', ') : T.scopeOwn);
  const self = data.members.find(m => m.userId === meId);

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
  // Links are stored hashed: copying one makes a new link (not emailed), and the one before stops working.
  async function copyLink(emailAddr: string, role: 'admin' | 'member', departmentIds: string[]){
    try {
      const r = await folio.api<{ link: string }>('POST', `/workspaces/${ws.id}/invitations`, { email: emailAddr, role, departmentIds, notify: false });
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
          <div className="ttl"><h1>{T.title}</h1></div>
          <label className="search">
            <Icon name="search" /><span className="sr">{T.search}</span>
            <input type="search" placeholder={T.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          {self && self.role !== 'owner' && <button className="btn btn-danger" type="button" onClick={() => setDialog({ kind: 'leave' })}>{T.leave}</button>}
          {manager && <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: 'invite' })}><Icon name="plus" />{T.invite}</button>}
        </header>

        <div className="filters">
          <div className="tabs" role="tablist" aria-label={T.title}>
            {(['members', 'depts'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{T.tabs[t]}</button>)}
          </div>
        </div>

        {tab === 'members' ? (
          <div className="tw flow">
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
                  const me = m.userId === meId, editable = manager && m.role !== 'owner' && !me;
                  return (
                    <tr key={m.userId} data-member={m.email}>
                      <td><span className="prof-cell"><Avatar text={m.email} /><span className="l1"><b>{m.email}</b>{me && <span className="muted">{T.meTag}</span>}</span></span></td>
                      <td>{editable
                        ? <span className="role-pick"><Select variant="sm" label={T.roleOf(m.email)} value={m.role} onChange={r => void setRole(m, r as 'admin' | 'member')}
                          options={(['admin', 'member'] as const).map(r => ({ value: r, label: d.roles[r] }))} /></span>
                        : <span className={`role ${m.role}`}><Icon name={ROLE_ICON[m.role]} />{d.roles[m.role]}</span>}</td>
                      <td>{scope(m.role, m.departmentIds)}</td>
                      <td><span className="dot-st run">{T.joined}</span></td>
                      <td className="act">{editable && <MoreMenu label={T.moreX(m.email)} items={[{ label: T.remove, onClick: () => setDialog({ kind: 'remove', member: m }), danger: true }]} />}</td>
                    </tr>
                  );
                })}
                {invites.map(i => (
                  <tr key={i.id} data-invitation={i.email}>
                    <td><span className="prof-cell"><Avatar text={i.email} /><span className="l1"><b>{i.email}</b></span></span></td>
                    <td><span className={`role ${i.role}`}><Icon name={ROLE_ICON[i.role]} />{d.roles[i.role]}</span></td>
                    <td>{scope(i.role, i.departmentIds)}</td>
                    <td><span className="dot-st boot" title={T.expires(day(i.expiresAt, lang))}>{T.invited}</span></td>
                    <td className="act"><MoreMenu label={T.moreX(i.email)} items={[
                      { label: T.copyLink, onClick: () => void copyLink(i.email, i.role, i.departmentIds) },
                      { label: T.resend, onClick: () => void resend(i.email, i.role, i.departmentIds) },
                      { label: T.withdraw, onClick: () => void withdraw(i.id), danger: true }
                    ]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="depts" aria-label={T.depts}>
            {data.departments.map(x => (
              <button key={x.id} type="button" className="dept" data-department={x.name} disabled={!manager || !company} onClick={() => setDialog({ kind: 'dept', dept: x })}>
                <span className="kic accent"><Icon name="team" /></span>
                <span><b>{x.name}</b><small>{T.deptSum(x.memberIds.length, x.profiles)}</small></span>
              </button>
            ))}
            {manager && (
              <button type="button" className="dept add" disabled={!company} onClick={() => setDialog({ kind: 'dept' })}>
                <span className="kic"><Icon name="plus" /></span>
                <span><b>{T.deptAdd}</b>{!company && <small className="tag">{d.plans.company}</small>}</span>
              </button>
            )}
          </section>
        )}
      </main>

      {dialog?.kind === 'invite' && <InviteDialog d={d} ws={ws} data={data} company={company} onClose={close} />}
      {dialog?.kind === 'remove' && <RemoveDialog d={d} ws={ws} data={data} member={dialog.member} meId={meId} onClose={close} />}
      {dialog?.kind === 'leave' && (
        <Modal icon="logout" tone="bad" title={T.leaveTitle(ws.name)} closeLabel={d.common.close} onClose={close} foot={<>
          <button className="btn btn-secondary" type="button" onClick={close}>{d.common.cancel}</button>
          <button className="btn btn-danger solid" type="button" onClick={() => void folio.api('POST', `/workspaces/${ws.id}/leave`).then(() => { close(); onLeft(); }, fail)}>{T.leaveDo}</button>
        </>}><p>{T.leaveLead}</p></Modal>
      )}
      {dialog?.kind === 'dept' && <DepartmentDialog d={d} ws={ws} data={data} dept={dialog.dept} onClose={close} />}
    </div>
  );
}

const ROLE_ICON: Record<Member['role'], IconName> = { owner: 'crown', admin: 'key', member: 'team' };
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
