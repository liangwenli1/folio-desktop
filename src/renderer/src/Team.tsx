// The team: the people in the workspace with their role, the groups they reach and when they last used Folio; the
// invitations still waiting; and what each role may do. The seats taken are said under the list.
import { useState } from 'react';
import { MANAGE, can, folio, isApiError, type Group, type Invitation, type Member, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { dayLabel, time } from './Activity';
import { day, errorText, roleName, type Dict, type Lang } from './i18n';
import { Act, Cancel, Empty, Flt, Icon, ListFailed, Modal, MoreMenu, PartialFailed, SkelRows, Tabs, useChanged, useFail, useToast } from './ui';
import { Select, SelectField } from './Select';
import { RolesTab } from './Roles';

type Tab = 'members' | 'invites' | 'roles';
type Dialog = { kind: 'invite' } | { kind: 'access'; member: Member } | { kind: 'remove'; member: Member } | { kind: 'leave' } | null;
interface Props { d: Dict; lang: Lang; ws: Workspace; meId: string; data: WorkspaceData; onLeft(): void }
const DAY = 86_400_000;

export function TeamPage({ d, lang, ws, meId, data, onLeft }: Props){
  const T = d.team;
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('members');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState('');
  const [roleId, setRoleId] = useState('all');
  const manager = can(data.role, MANAGE);
  const company = ws.subscription.plan === 'company';
  const limit = ws.subscription.entitlements.members;
  const fail = useFail();
  const close = () => setDialog(null);
  const needle = q.trim().toLowerCase();
  const people = data.members.filter(m => (!needle || m.email.toLowerCase().includes(needle)) && (roleId === 'all' || m.role.id === roleId));
  const invites = manager ? data.invitations.filter(i => !needle || i.email.toLowerCase().includes(needle)) : [];
  // Seats go to the people in the workspace and the invitations still open.
  const seats = data.members.length + data.invitations.length;
  const scope = (role: Member['role'], groupIds: string[]) => scopeOf(d, lang, data, role, groupIds);
  const self = data.members.find(m => m.userId === meId);

  // Sending an invitation again (or copying its link, which makes a new one) keeps its role, groups and how long it lasts.
  const again = (i: Invitation, notify: boolean) => folio.api<{ link: string; emailed: boolean }>('POST', `/workspaces/${ws.id}/invitations`, {
    email: i.email, roleId: i.role.id, groupIds: i.groupIds, notify, days: validity(i)
  });
  async function resend(i: Invitation){
    try { const r = await again(i, true); if (r.emailed) toast(T.sent(i.email)); else toast({ ...T.notSent, tone: 'bad' }); } catch (e){ fail(e); }
    data.refresh('members');
  }
  // Links are stored hashed: copying one makes a new link (not emailed), and the one before stops working.
  async function copyLink(i: Invitation){
    try { const r = await again(i, false); await navigator.clipboard.writeText(r.link); toast(T.copiedNew); } catch (e){ fail(e); }
    data.refresh('members');
  }
  async function withdraw(id: string){
    try { await folio.api('DELETE', `/invitations/${id}`); toast({ title: T.withdrawn }); } catch (e){ fail(e); }
    data.refresh('members');
  }

  const tabs: Tab[] = manager ? ['members', 'invites', 'roles'] : ['members', 'roles'];
  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{T.title}</h1></div>
          <span className="sp" />
          {self && self.role.key !== 'owner' && <button className="btn btn-secondary" type="button" onClick={() => setDialog({ kind: 'leave' })}>{T.leave}</button>}
          {manager && <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: 'invite' })}><Icon name="plus" />{T.invite}</button>}
        </header>

        <Tabs className="page-tabs" label={T.title} value={tab} tabs={tabs} name={t => T.tabs[t]} count={t => (t === 'members' ? data.members.length : t === 'invites' ? data.invitations.length : null)} onChange={setTab} />

        {tab === 'members' && (
            <section className="list-card" aria-label={T.tabs.members}>
              <div className="filters">
                <Flt label={T.filterLabels.keyword} grow>
                  <label className="search"><Icon name="search" /><span className="sr">{T.search}</span>
                    <input type="search" placeholder={T.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
                </Flt>
                <Flt label={T.filterLabels.role}><span className="grp-pick"><Select label={T.role} value={roleId} onChange={setRoleId}
                  options={[{ value: 'all', label: T.allRoles }, ...data.roles.map(r => ({ value: r.id, label: roleName(d, r) }))]} /></span></Flt>
                <button type="button" className="btn btn-secondary flt-reset" disabled={!q && roleId === 'all'} onClick={() => { setQ(''); setRoleId('all'); }}>{d.profiles.reset}</button>
              </div>
              {data.loaded.has('members') && <PartialFailed d={d} data={data} kinds={['groups']} />}
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{T.cols.person}</th><th scope="col">{T.cols.role}</th><th scope="col">{T.cols.scope}</th><th className="mid" scope="col">{T.cols.status}</th>
                      <th className="mid" scope="col">{T.cols.active}</th><th className="act" scope="col">{T.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.loadFailed.has('members') && <tr className="empty"><td colSpan={7}><ListFailed d={d} data={data} kind="members" /></td></tr>}
                    {!data.loaded.has('members') && !data.loadFailed.has('members') && <SkelRows cols={7} />}
                    {data.loaded.has('members') && !people.length && !data.loadFailed.has('members') && <tr className="empty"><td colSpan={7}>
                      <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setRoleId('all'); }}>{d.states.clear}</button>
                      </Empty>
                    </td></tr>}
                    {people.map(m => {
                      const me = m.userId === meId, editable = manager && m.role.key !== 'owner' && !me;
                      return (
                        <tr key={m.userId} data-member={m.email}>
                          <td><span className="l1"><b>{m.email}{me && <span className="muted"> {T.meTag}</span>}</b></span></td>
                          <td>{roleName(d, m.role)}</td>
                          <td className="tm-scope">{scope(m.role, m.groupIds)}</td>
                          <td className="mid"><span className="dot-st run">{T.joined}</span></td>
                          <td className="nowrap mid">{m.lastActiveAt ? `${dayLabel(m.lastActiveAt, d, lang)} ${time(m.lastActiveAt, lang)}` : '—'}</td>
                          <td className="act">{m.role.key === 'owner' ? <span className="muted">{T.protectedTag}</span>
                            : editable && <button type="button" className="btn btn-sm btn-text accent" aria-label={T.editAccess} onClick={() => setDialog({ kind: 'access', member: m })}>{T.access}</button>}</td>
                          <td className="more">{editable && <MoreMenu label={T.moreX(m.email)} items={[{ label: T.remove, onClick: () => setDialog({ kind: 'remove', member: m }), danger: true }]} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="list-foot">{d.profiles.page.total(people.length)} · <span data-testid="seats">{T.seatsOf(seats, limit)}</span></p>
            </section>
        )}

        {tab === 'invites' && (
          <section className="sec tm-main tm-solo" aria-label={T.tabs.invites}>
            <div className="filters inline">
              <label className="search"><Icon name="search" /><span className="sr">{T.search}</span>
                <input type="search" placeholder={T.search} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
            </div>
            <div className="tw flow">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{T.email}</th><th scope="col">{T.cols.role}</th><th scope="col">{T.cols.scope}</th><th scope="col">{T.cols.invitedBy}</th>
                    <th className="mid" scope="col">{T.cols.expires}</th><th className="act" scope="col">{T.cols.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.loaded.has('members') && <SkelRows cols={6} rows={2} />}
                  {data.loaded.has('members') && !invites.length && <tr className="empty"><td colSpan={6}><Empty icon="mail" title={T.noInvites} text={T.noInvitesText}>
                    {manager && <button className="btn btn-primary btn-sm" type="button" onClick={() => setDialog({ kind: 'invite' })}><Icon name="plus" />{T.invite}</button>}
                  </Empty></td></tr>}
                  {invites.map(i => (
                    <tr key={i.id} data-invitation={i.email}>
                      <td><b>{i.email}</b></td>
                      <td>{roleName(d, i.role)}</td>
                      <td className="tm-scope">{scope(i.role, i.groupIds)}</td>
                      <td className="ellip">{i.invitedBy ?? '—'}</td>
                      <td className="mid"><span className="dot-st warn">{day(i.expiresAt, lang)}</span></td>
                      <td className="act"><MoreMenu label={T.moreX(i.email)} items={[
                        { label: T.copyLink, onClick: () => void copyLink(i) },
                        { label: T.resend, onClick: () => void resend(i) },
                        { label: T.withdraw, onClick: () => void withdraw(i.id), danger: true }
                      ]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'roles' && <RolesTab d={d} ws={ws} data={data} manager={manager} />}
      </main>

      {dialog?.kind === 'invite' && <InviteDialog d={d} ws={ws} data={data} company={company} seats={seats} limit={limit} onClose={close} />}
      {dialog?.kind === 'access' && <AccessDialog d={d} ws={ws} data={data} company={company} member={dialog.member} onClose={close} />}
      {dialog?.kind === 'remove' && <RemoveDialog d={d} ws={ws} data={data} member={dialog.member} meId={meId} onClose={close} />}
      {dialog?.kind === 'leave' && (
        <Modal kind="bad" title={T.leaveTitle(ws.name)} onClose={close} foot={<>
          <Cancel />
          <Act className="btn btn-danger solid" run={() => folio.api('POST', `/workspaces/${ws.id}/leave`).then(() => { close(); onLeft(); }, fail)}>{T.leaveDo}</Act>
        </>}><p>{T.leaveLead}</p></Modal>
      )}
    </div>
  );
}

// How many days an invitation was made to last.
const validity = (i: Invitation) => {
  const n = Math.round((Date.parse(i.expiresAt) - Date.parse(i.createdAt)) / DAY);
  return ([1, 3, 7, 30] as const).find(x => x === n) ?? 7;
};

// What someone reaches: everything if their role administers the workspace; otherwise their own profiles and the
// groups they are authorised for.
function scopeOf(d: Dict, lang: Lang, data: WorkspaceData, role: Member['role'], groupIds: string[]){
  const T = d.team;
  if (data.roles.find(r => r.id === role.id)?.permissions.includes(MANAGE)) return T.scopeAll;
  const names = groupIds.map(id => data.groups.find(g => g.id === id)?.name).filter(Boolean);
  return names.length ? names.join(lang === 'zh' ? '、' : ', ') : T.scopeOwn;
}

// The group tree to tick groups in. A group that takes in its parent's people is reached through a ticked parent, so
// it shows ticked and can't be unticked on its own.
function GroupChecks({ d, groups, value, onChange, label }: { d: Dict; groups: Group[]; value: string[]; onChange(ids: string[]): void; label: string }){
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const kids = (id: string | null) => groups.filter(g => g.parentId === id);
  const viaParent = (g: Group): boolean => !!g.parentId && g.inheritMembers && (value.includes(g.parentId) || viaParent(groups.find(x => x.id === g.parentId)!));
  const node = (g: Group, depth: number) => {
    const below = kids(g.id), open = !folded.has(g.id), implied = viaParent(g);
    return (
      <li key={g.id}>
        <div className="gc-row" style={{ paddingLeft: depth * 20 }}>
          {below.length
            ? <button type="button" className="gt-fold" aria-label={open ? d.groups.collapse(g.name) : d.groups.expand(g.name)}
                onClick={() => setFolded(s => { const n = new Set(s); if (open) n.add(g.id); else n.delete(g.id); return n; })}><Icon name={open ? 'chev' : 'chevR'} /></button>
            : <span className="gt-fold" />}
          <label className="check-row">
            <input type="checkbox" checked={implied || value.includes(g.id)} disabled={implied}
              onChange={e => onChange(e.target.checked ? [...value, g.id] : value.filter(id => id !== g.id))} />
            <span className={`sq gc-${g.color}`} aria-hidden="true" />{g.name}{implied && <small className="muted">{d.team.viaParent}</small>}
          </label>
        </div>
        {below.length > 0 && open && <ul>{below.map(c => node(c, depth + 1))}</ul>}
      </li>
    );
  };
  if (!groups.length) return <p className="hint">{d.team.noGroups}</p>;
  return <ul className="gc-tree" role="group" aria-label={label}>{kids(null).map(g => node(g, 0))}</ul>;
}

// Inviting up to ten people at once: their role, the groups they will reach (Company) and how long the link works.
function InviteDialog({ d, ws, data, company, seats, limit, onClose }: {
  d: Dict; ws: Workspace; data: WorkspaceData; company: boolean; seats: number; limit: number | null; onClose(): void;
}){
  const T = d.team;
  const toast = useToast();
  const givable = data.roles.filter(r => r.key !== 'owner');
  const [emails, setEmails] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [roleId, setRoleId] = useState((givable.find(r => r.key === 'member') ?? givable[0])?.id ?? '');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [days, setDays] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ email: string; link: string; emailed: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const role = givable.find(r => r.id === roleId);
  const all = role?.permissions.includes(MANAGE) ?? false;
  // Typed addresses go in on Enter, a comma, a space or leaving the field.
  function take(text: string){
    const parts = text.split(/[\s,;，；]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const bad = parts.find(p => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p));
    if (bad){ setError(T.emailBad(bad)); setTyped(bad); return; }
    const next = [...new Set([...emails, ...parts])];
    if (next.length > 10){ setError(T.tooMany); return; }
    setEmails(next); setTyped(''); setError(null);
  }
  async function send(){
    const list = typed.trim() ? [...new Set([...emails, typed.trim().toLowerCase()])] : emails;
    if (!list.length){ setError(T.emailErr); return; }
    if (list.some(p => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p))){ setError(T.emailBad(list.find(p => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p))!)); return; }
    setBusy(true); setError(null);
    const done: { email: string; link: string; emailed: boolean }[] = [];
    try {
      for (const email of list) done.push({ email, ...await folio.api<{ link: string; emailed: boolean }>('POST', `/workspaces/${ws.id}/invitations`, { email, roleId, groupIds: all ? [] : groupIds, days: Number(days) }) });
      setResults(done);
    } catch (e){
      setError(errorText(d, isApiError(e) ? e.code : 'internal'));
      if (done.length) setResults(done);
    } finally { setBusy(false); data.refresh('members'); }
  }
  const after = seats + emails.length + (typed.trim() ? 1 : 0);
  // Once sent there is nothing left to lose.
  const changed = useChanged({ emails: emails.join(), typed, roleId, groups: groupIds.join(), days });

  return (
    <Modal wide title={T.inviteTitle} onClose={onClose} busy={busy} dirty={!results && changed} foot={results
      ? <button className="btn btn-primary" type="button" onClick={onClose}>{T.done}</button>
      : <>
        {limit !== null && <span className={`hint${after > limit ? ' bad-t' : ''}`}>{T.seatsAfter(after, limit)}</span>}
        <span className="sp" />
        <Cancel />
        <button className="btn btn-primary" type="button" aria-busy={busy || undefined} disabled={busy || !roleId} onClick={() => void send()}>{T.send}</button>
      </>}>
      {results ? (
        <div className="m-body" role="status">
          {error && <p className="notice error" role="alert">{error}</p>}
          <ul className="inv-results">
            {results.map(r => (
              <li key={r.email}>
                <span><Icon name={r.emailed ? 'check' : 'mail'} /><b>{r.email}</b><small>{r.emailed ? T.sentShort : T.notSentShort}</small></span>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => void navigator.clipboard.writeText(r.link).then(() => toast({ title: T.copied }))}>{T.copyLink}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="m-body inv">
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="field">
            <label htmlFor="inv-email">{T.emails}<span className="req" aria-hidden="true">*</span></label>
            <div className="chips-in">
              {emails.map(e => <span key={e} className="chip">{e}<button type="button" aria-label={T.removeEmail(e)} onClick={() => setEmails(s => s.filter(x => x !== e))}><Icon name="x" /></button></span>)}
              <input id="inv-email" type="email" value={typed} autoFocus autoComplete="off" placeholder={emails.length ? '' : T.emailsPh}
                onChange={e => { const v = e.target.value; if (/[,;，；\s]$/.test(v)) take(v); else setTyped(v); }}
                onKeyDown={e => { if (e.key === 'Enter' && typed.trim()){ e.preventDefault(); take(typed); } else if (e.key === 'Backspace' && !typed && emails.length) setEmails(s => s.slice(0, -1)); }}
                onBlur={() => { if (typed.trim()) take(typed); }} />
            </div>
            <p className="hint">{T.emailsHint}</p>
          </div>
          <SelectField label={T.role} value={roleId} onChange={setRoleId} required
            options={givable.map(r => ({ value: r.id, label: roleName(d, r), hint: r.key ? undefined : T.roleActions(r.permissions.length) }))} />
          {!all && (
            <div className="field">
              <span className="label">{T.groupAccess}</span>
              {company ? <GroupChecks d={d} groups={data.groups} value={groupIds} onChange={setGroupIds} label={T.groupAccess} /> : <p className="notice info">{d.groups.companyOnly}</p>}
            </div>
          )}
          <div className="pi-notes">
            <p><Icon name="info" /><b>{T.summaryTitle}</b></p>
            <p className="hint">{all ? T.summaryAll : groupIds.length ? T.summaryGroups(groupIds.length) : T.summaryOwn}</p>
          </div>
          <SelectField label={T.validity} value={days} onChange={setDays} options={['1', '3', '7', '30'].map(n => ({ value: n, label: T.days(Number(n)) }))} />
        </div>
      )}
    </Modal>
  );
}

// Someone's role and (Company) the groups they reach. The role is theirs across the workspace.
function AccessDialog({ d, ws, data, company, member, onClose }: { d: Dict; ws: Workspace; data: WorkspaceData; company: boolean; member: Member; onClose(): void }){
  const T = d.team;
  const toast = useToast();
  const givable = data.roles.filter(r => r.key !== 'owner');
  const [roleId, setRoleId] = useState(member.role.id);
  const [groupIds, setGroupIds] = useState(member.groupIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const all = givable.find(r => r.id === roleId)?.permissions.includes(MANAGE) ?? false;
  const changedGroups = groupIds.length !== member.groupIds.length || groupIds.some(id => !member.groupIds.includes(id));
  async function save(){
    setBusy(true); setError(null);
    try {
      await folio.api('PATCH', `/workspaces/${ws.id}/members/${member.userId}`, {
        ...(roleId !== member.role.id ? { roleId } : {}), ...(company && changedGroups ? { groupIds } : {})
      });
      toast({ title: T.saved, detail: member.email });
      data.refresh('members', 'groups');
      onClose();
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setBusy(false); }
  }
  return (
    <Modal title={T.accessTitle(member.email)} sub={T.accessSub} onClose={onClose} busy={busy} foot={<>
      <Cancel />
      <button className="btn btn-primary" type="button" aria-busy={busy || undefined} disabled={busy || (roleId === member.role.id && !changedGroups)} onClick={() => void save()}>{d.common.save}</button>
    </>}>
      <div className="m-body inv">
        {error && <p className="notice error" role="alert">{error}</p>}
        <SelectField label={T.role} value={roleId} onChange={setRoleId} options={givable.map(r => ({ value: r.id, label: roleName(d, r) }))} />
        <div className="field">
          <span className="label">{T.groupAccess}</span>
          {all ? <p className="hint">{T.summaryAll}</p>
            : company ? <GroupChecks d={d} groups={data.groups} value={groupIds} onChange={setGroupIds} label={T.groupAccess} />
            : <p className="notice info">{d.groups.companyOnly}</p>}
        </div>
      </div>
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
    <Modal title={T.removeTitle(member.email)} onClose={onClose} foot={<>
      <Cancel />
      <Act className="btn btn-danger solid" disabled={!heir} title={heir ? undefined : T.heirNeeded} run={() => remove()}>{T.removeDo}</Act>
    </>}>
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        <p>{T.removeLead}</p>
        <SelectField label={T.heir} value={heir} onChange={setHeir} options={others.map(m => ({ value: m.userId, label: m.email }))} searchPh={d.form.searchPh} />
      </div>
    </Modal>
  );
}

