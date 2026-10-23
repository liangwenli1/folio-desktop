import { useEffect, useState, type FormEvent } from 'react';
import type { ProfileStatus, Update } from '@shared/bridge';
import { folio, isApiError, type Me, type MyInvitation, type Workspace } from './api';
import { useWorkspaceData, type WorkspaceData } from './data';
import { EnginesDialog } from './Engines';
import { errorText, type Dict, type Lang } from './i18n';
import { isPaid, planStatus } from './plan';
import { ProfileForm } from './ProfileForm';
import { ProfileImportDialog } from './ProfileImport';
import { ProfilesPage, type GroupFilter } from './Profiles';
import { ProxiesPage, ProxyForm, ProxyImportDialog } from './Proxies';
import { TeamPage } from './Team';
import { FlowsPage } from './Flows';
import { TasksPage, type Focus } from './Tasks';
import { ApiPage } from './LocalApi';
import { ExtensionsPage } from './Extensions';
import { WindowSyncPage } from './WindowSync';
import { ActivityPage } from './Activity';
import { ExportDialog, ImportDialog } from './Transfer';
import { TrashPage } from './Trash';
import { Icon, Mark, Toasts, useOutsideClose, useToast, type IconName } from './ui';

interface Props {
  d: Dict; lang: Lang; me: Me; ws: Workspace;
  onSwitch(id: string): void; onLang(l: Lang): Promise<void>; onLogout(): Promise<void>; onWorkspace(): void;
}

type Page = 'profiles' | 'proxies' | 'extensions' | 'team' | 'sync' | 'flows' | 'tasks' | 'api' | 'activity' | 'trash';
type Dialog = { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'import' } | { kind: 'proxy'; id?: string } | { kind: 'proxy-import' } | { kind: 'engines' } | { kind: 'export-all' } | { kind: 'import-all' } | null;

export function Workbench(props: Props){
  return <Toasts><Shell {...props} /></Toasts>;
}

function Shell({ d, lang, me, ws, onSwitch, onLang, onLogout, onWorkspace }: Props){
  const toast = useToast();
  const s = ws.subscription;
  const site = `/${lang}`;
  const [page, setPage] = useState<Page>('profiles');
  const [group, setGroup] = useState<GroupFilter>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const wsRef = useOutsideClose(wsOpen, () => setWsOpen(false));
  const userRef = useOutsideClose(userOpen, () => setUserOpen(false));
  const manager = ws.role !== 'member';
  const limit = s.entitlements.profiles;
  const initials = me.user.email.slice(0, 2).toUpperCase();

  const data = useWorkspaceData(ws.id, ws.role, {
    workspace: onWorkspace,
    // Taken out of the workspace (or left it): the main process has closed its profiles; show another workspace.
    removed(){ toast(d.team.removedYou(ws.name)); onWorkspace(); },
    launchError(st: ProfileStatus){
      const p = data.profiles?.find(x => x.id === st.id);
      const why = d.launch[st.error ?? ''] ?? d.launch.launch_failed;
      toast(p ? d.profiles.done.failed(p.name, why) : why, st.error === 'kernel_missing' && p
        ? { label: d.form.download, fn: () => void data.install(p.kernel, p.kernelVersion).then(ok => { if (ok) void folio.openProfile(p.id); }) } : undefined);
    },
    // The profile opened, but some of its extensions failed their check and were left out.
    extensionErrors(st: ProfileStatus){
      const p = data.profiles?.find(x => x.id === st.id);
      toast(d.extensions.failedCheck(p?.name ?? '', st.extensionErrors ?? []));
    }
  });
  const used = data.profiles?.length ?? ws.usage.profiles;
  const editing = dialog?.kind === 'edit' ? data.profiles?.find(p => p.id === dialog.id) : undefined;
  const editingProxy = dialog?.kind === 'proxy' && dialog.id ? data.proxies.find(p => p.id === dialog.id) : undefined;
  const close = () => setDialog(null);
  const go = (p: Page, g: GroupFilter = 'all') => { setPage(p); setGroup(g); };
  // Proxies and the Trash are for owners and admins.
  const shown: Page = !manager && (page === 'proxies' || page === 'trash') ? 'profiles' : page;

  // Invitations to this account from other workspaces, in the workspace menu.
  const [invites, setInvites] = useState<MyInvitation[]>([]);
  const [startup, setStartup] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  useEffect(() => { void folio.update().then(setUpdate); return folio.onUpdate(setUpdate); }, []);
  useEffect(() => { void folio.startup().then(setStartup); }, [userOpen]);
  // What the main process shows itself follows the workbench's language.
  useEffect(() => { void folio.setLabels(d.tray); }, [d]);
  // A run found profiles signed out: a desktop notification that opens the run.
  useEffect(() => folio.onSignedOut(e => {
    const n = new Notification(d.notify.signedOut(e.task, e.profiles).title, { body: d.notify.signedOut(e.task, e.profiles).body });
    n.onclick = () => { void folio.showWindow(); setPage('tasks'); setFocus({ taskId: e.taskId, runId: e.runId }); };
  }), [d]);
  const loadInvites = () => folio.api<{ invitations: MyInvitation[] }>('GET', '/me/invitations').then(r => setInvites(r.invitations), () => {});
  useEffect(() => { void loadInvites(); }, [wsOpen]);
  async function answer(i: MyInvitation, accept: boolean){
    try {
      await folio.api('POST', `/invitations/${i.id}/${accept ? 'accept' : 'decline'}`);
      setWsOpen(false);
      if (accept){ go('profiles'); onSwitch(i.workspaceId); } else void loadInvites();
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal')); }
  }

  return (
    <div className="app">
      <aside className="side" aria-label={d.ws.current}>
        <div className="brand"><Mark /><span className="brand-word">Folio</span></div>

        <div className="ws-wrap" ref={wsRef}>
          <button className="ws" type="button" aria-haspopup="listbox" aria-expanded={wsOpen} onClick={() => setWsOpen(o => !o)} title={d.ws.switch}>
            <span><b data-testid="ws-name">{ws.name}</b><small data-testid="ws-plan">{d.plans[s.plan]}</small></span>
            {invites.length > 0 && <span className="dot" aria-label={d.team.invites} />}
            <Icon name="chev" />
          </button>
          {wsOpen && (
            <ul className="menu" role="listbox" aria-label={d.ws.switch}>
              {me.workspaces.map(w => (
                <li key={w.id} role="option" aria-selected={w.id === ws.id}>
                  <button type="button" onClick={() => { setWsOpen(false); go('profiles'); onSwitch(w.id); }}>
                    <span>{w.name}</span><small>{d.plans[w.plan]} · {d.roles[w.role]}</small>
                  </button>
                </li>
              ))}
              {invites.length > 0 && <li className="menu-t" role="presentation">{d.team.invites}</li>}
              {invites.map(i => (
                <li key={i.id} role="presentation" className="invite-item" data-invite={i.workspaceName}>
                  <span><span>{i.workspaceName}</span><small>{d.team.from(i.inviter ?? 'Folio', d.roles[i.role])}</small></span>
                  <span className="invite-acts">
                    <button type="button" className="btn btn-xs btn-primary" onClick={() => void answer(i, true)}>{d.team.join}</button>
                    <button type="button" className="btn btn-xs btn-text" onClick={() => void answer(i, false)}>{d.team.decline}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="nav" aria-label="Main">
          <NavItem icon="profiles" label={d.nav.profiles} count={used} active={page === 'profiles' && group === 'all'} onClick={() => go('profiles')} />
          {manager && <NavItem icon="proxies" label={d.nav.proxies} count={data.proxies.length} active={shown === 'proxies'} onClick={() => go('proxies')} />}
          <NavItem icon="extensions" label={d.nav.extensions} count={data.extensions.length || undefined} active={shown === 'extensions'} onClick={() => go('extensions')} />
          <NavItem icon="team" label={d.nav.team} count={data.members.length || undefined} active={shown === 'team'} onClick={() => go('team')} />
          <NavItem icon="sync" label={d.nav.sync} badge={data.sync ? d.windowSync.onBadge : undefined} active={shown === 'sync'} onClick={() => go('sync')} />
          <NavItem icon="flows" label={d.nav.flows} count={data.flows.length || undefined} active={shown === 'flows'} onClick={() => go('flows')} />
          <NavItem icon="tasks" label={d.nav.tasks} count={data.active.length || data.tasks.length || undefined} active={shown === 'tasks'} onClick={() => go('tasks')} />
          <NavItem icon="api" label={d.nav.api} active={shown === 'api'} onClick={() => go('api')} />
          <NavItem icon="activity" label={d.nav.activity} active={shown === 'activity'} onClick={() => go('activity')} />
          {manager && <NavItem icon="trash" label={d.nav.trash} count={data.trash?.length || undefined} active={shown === 'trash'} onClick={() => go('trash')} />}
        </nav>

        <Groups d={d} data={data} manager={manager} group={shown === 'profiles' ? group : null} onPick={g => go('profiles', g)} />

        {update && (
          <section className="update" role="status" aria-label={update.installs ? d.update.ready(update.version) : d.update.out(update.version)}>
            <p><b>{update.installs ? d.update.ready(update.version) : d.update.out(update.version)}</b></p>
            {update.installs ? <>
              <button className="btn btn-xs btn-primary" type="button" onClick={() => void folio.installUpdate()}>{d.update.restart}</button>
              <p className="muted">{d.update.restartNote}</p>
            </> : <button className="btn btn-xs btn-secondary" type="button" onClick={() => folio.openSite(`${site}/download/`)}>{d.update.download}</button>}
          </section>
        )}

        <section className="plan" aria-label={d.plans[s.plan]}>
          <p><b data-testid="plan-name">{d.plans[s.plan]}</b></p>
          {planStatus(s, d, lang) && <p className="muted" data-testid="plan-status">{planStatus(s, d, lang)}</p>}
          <p data-testid="plan-usage">{d.plan.usage(used, limit)}</p>
          <span className="meter"><i style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></span>
          {manager && (
            <div className="plan-actions">
              <button className="linkish" type="button" data-testid="plan-buy" onClick={() => folio.openSite(`${site}/checkout/?ws=${ws.id}`)}>
                {isPaid(s) ? d.plan.addProfiles : d.plan.upgrade}
              </button>
              <button className="linkish muted" type="button" onClick={() => folio.openSite(`${site}/account/?ws=${ws.id}`)}>{d.plan.manage}</button>
            </div>
          )}
        </section>

        <div className="me-wrap" ref={userRef}>
          <button className="me" type="button" aria-haspopup="menu" aria-expanded={userOpen} onClick={() => setUserOpen(o => !o)}>
            <span className="av" aria-hidden="true">{initials}</span>
            <span className="me-text"><b>{me.user.email}</b><small>{d.roles[ws.role]}</small></span>
          </button>
          {userOpen && (
            <div className="menu up" role="menu">
              <div className="menu-row">
                <span>{d.user.language}</span>
                <div className="seg">
                  {(['en', 'zh'] as const).map(l => (
                    <button key={l} type="button" aria-pressed={lang === l} onClick={() => { setUserOpen(false); void onLang(l); }}>{l === 'en' ? 'English' : '简体中文'}</button>
                  ))}
                </div>
              </div>
              <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); setDialog({ kind: 'engines' }); }}>{d.user.engines}</button>
              {startup?.supported && (
                <button className="menu-item menu-check" type="button" role="menuitemcheckbox" aria-checked={startup.enabled}
                  onClick={() => void folio.setStartup(!startup.enabled).then(() => folio.startup()).then(setStartup)}>{d.user.startup}</button>
              )}
              {manager && <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); setDialog({ kind: 'export-all' }); }}>{d.user.exportAll}</button>}
              {manager && <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); setDialog({ kind: 'import-all' }); }}>{d.user.importAll}</button>}
              <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); void onLogout(); }}>{d.user.logout}</button>
            </div>
          )}
        </div>
      </aside>

      {shown === 'profiles' && (
        <ProfilesPage d={d} lang={lang} ws={ws} data={data} group={group} setGroup={setGroup}
          onNew={() => setDialog({ kind: 'new' })} onImport={() => setDialog({ kind: 'import' })}
          onEdit={id => setDialog({ kind: 'edit', id })} onAddProxy={() => setDialog({ kind: 'proxy' })} />
      )}
      {shown === 'proxies' && <ProxiesPage d={d} data={data} onAdd={() => setDialog({ kind: 'proxy' })} onEdit={id => setDialog({ kind: 'proxy', id })} onImport={() => setDialog({ kind: 'proxy-import' })} />}
      {shown === 'team' && <TeamPage d={d} lang={lang} ws={ws} meId={me.user.id} data={data} onLeft={onWorkspace} />}
      {shown === 'extensions' && <ExtensionsPage d={d} ws={ws} data={data} />}
      {shown === 'sync' && <WindowSyncPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'flows' && <FlowsPage d={d} wsId={ws.id} meId={me.user.id} data={data} />}
      {shown === 'tasks' && <TasksPage d={d} lang={lang} ws={ws} meId={me.user.id} data={data} focus={focus} />}
      {shown === 'api' && <ApiPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'activity' && <ActivityPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'trash' && <TrashPage d={d} lang={lang} ws={ws} data={data} />}

      {(dialog?.kind === 'new' || (dialog?.kind === 'edit' && editing)) && (
        <ProfileForm d={d} wsId={ws.id} data={data} onClose={close} profile={editing}
          defaultGroup={group !== 'all' && group !== 'none' ? group : null}
          onDone={p => { close(); toast(dialog.kind === 'new' ? d.profiles.done.created(p.name) : d.profiles.done.saved); }} />
      )}
      {dialog?.kind === 'import' && <ProfileImportDialog d={d} ws={ws} data={data} onClose={close} />}
      {dialog?.kind === 'proxy' && (!dialog.id || editingProxy) && <ProxyForm d={d} wsId={ws.id} data={data} proxy={editingProxy} onClose={close} />}
      {dialog?.kind === 'proxy-import' && <ProxyImportDialog d={d} wsId={ws.id} data={data} onClose={close} />}
      {dialog?.kind === 'engines' && <EnginesDialog d={d} data={data} onClose={close} />}
      {dialog?.kind === 'export-all' && <ExportDialog d={d} ws={ws} onClose={close} />}
      {dialog?.kind === 'import-all' && <ImportDialog d={d} ws={ws} data={data} onClose={close} />}
    </div>
  );
}

function NavItem({ icon, label, count, badge, active, onClick }: { icon: IconName; label: string; count?: number; badge?: string; active: boolean; onClick(): void }){
  return (
    <button className={`nav-i${active ? ' active' : ''}`} type="button" aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Icon name={icon} />{label}{count !== undefined && <span className="cnt">{count}</span>}{badge && <span className="cnt on">{badge}</span>}
    </button>
  );
}

// Groups in the sidebar: filter the profile list, add, rename and delete.
function Groups({ d, data, manager, group, onPick }: { d: Dict; data: WorkspaceData; manager: boolean; group: GroupFilter | null; onPick(g: GroupFilter): void }){
  const toast = useToast();
  const G = d.groups;
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState('');
  const menuRef = useOutsideClose(!!menu, () => setMenu(null));
  const ungrouped = (data.profiles ?? []).filter(p => !p.groupId).length;
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'));

  async function save(e: FormEvent){
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      if (renaming) await folio.api('PATCH', `/groups/${renaming}`, { name: n });
      else await data.ensureGroup(n);
      setAdding(false); setRenaming(null); setName('');
    } catch (err){ fail(err); }
    data.refresh('groups');
  }
  async function remove(id: string){
    setConfirm(null);
    try { await folio.api('DELETE', `/groups/${id}`); } catch (err){ fail(err); }
    if (group === id) onPick('all');
    data.refresh('groups', 'profiles');
  }
  const form = (
    <form className="grp-form" onSubmit={save}>
      <input aria-label={G.namePh} placeholder={G.namePh} value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus
        onKeyDown={e => { if (e.key === 'Escape'){ setAdding(false); setRenaming(null); } }} />
    </form>
  );

  return (
    <div className="groups">
      <div className="grp-t-row">
        <p className="grp-t">{G.title}</p>
        {manager && <button type="button" className="grp-add" aria-label={G.add} title={G.add} onClick={() => { setAdding(true); setRenaming(null); setName(''); }}>+</button>}
      </div>
      <div className="nav">
        {data.groups.map(g => renaming === g.id ? <div key={g.id}>{form}</div> : (
          <div key={g.id} className="grp-item" ref={menu === g.id ? menuRef : undefined}>
            <button type="button" className={`nav-i${group === g.id ? ' active' : ''}`} aria-current={group === g.id ? 'true' : undefined} onClick={() => onPick(g.id)}>
              <span className="sq" aria-hidden="true" />{g.name}<span className="cnt">{g.profiles}</span>
            </button>
            {manager && <button type="button" className="grp-more" aria-label={G.more(g.name)} aria-expanded={menu === g.id} onClick={() => setMenu(m => (m === g.id ? null : g.id))}>⋯</button>}
            {menu === g.id && (
              <div className="menu" role="menu">
                <button className="menu-item" type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming(g.id); setName(g.name); }}>{G.rename}</button>
                <button className="menu-item" type="button" role="menuitem" onClick={() => { setMenu(null); setConfirm(g.id); }}>{G.delete}</button>
              </div>
            )}
            {confirm === g.id && (
              <div className="grp-confirm" role="alertdialog" aria-label={G.deleteConfirm(g.name)}>
                <p>{G.deleteConfirm(g.name)}</p>
                <div><button type="button" className="btn btn-xs btn-text" onClick={() => setConfirm(null)}>{d.common.cancel}</button>
                  <button type="button" className="btn btn-xs btn-danger solid" onClick={() => void remove(g.id)}>{G.delete}</button></div>
              </div>
            )}
          </div>
        ))}
        {data.groups.length > 0 && ungrouped > 0 && (
          <button type="button" className={`nav-i${group === 'none' ? ' active' : ''}`} onClick={() => onPick('none')}>
            <span className="sq" aria-hidden="true" />{G.none}<span className="cnt">{ungrouped}</span>
          </button>
        )}
        {adding && form}
      </div>
    </div>
  );
}
