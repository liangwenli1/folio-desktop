import { useEffect, useState } from 'react';
import type { ProfileStatus, Update } from '@shared/bridge';
import { MANAGE, can, folio, isApiError, type Me, type MyInvitation, type Workspace } from './api';
import { useWorkspaceData, type WorkspaceData } from './data';
import { EnginesPage } from './Engines';
import { GroupsPage } from './Groups';
import { JobsPage } from './Jobs';
import { LANG_NAMES, errorText, roleName, type Dict, type Lang } from './i18n';
import { planStatus } from './plan';
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
import { SettingsPage } from './Settings';
import { BillingPage } from './Billing';
import { Icon, Mark, Progress, Switch, Toasts, useNotice, useOutsideClose, useToast, type IconName } from './ui';
import { CommandPalette, mod, type Command } from './CommandPalette';
import { Flag } from './Flag';
import { health } from './checks';

interface Props {
  d: Dict; lang: Lang; version: string; me: Me; ws: Workspace;
  onSwitch(id: string): void; onLang(l: Lang): Promise<void>; onLogout(): Promise<void>; onWorkspace(): void;
}

type Page = 'profiles' | 'proxies' | 'extensions' | 'team' | 'sync' | 'flows' | 'tasks' | 'api' | 'engines' | 'groups' | 'activity' | 'jobs' | 'trash' | 'settings' | 'billing';
// A new profile can start in a group picked on the Groups page.
type Dialog = { kind: 'new'; group?: string | null } | { kind: 'edit'; id: string } | { kind: 'import' } | { kind: 'proxy'; id?: string } | { kind: 'proxy-import' } | { kind: 'export-all' } | { kind: 'import-all' } | null;

export function Workbench(props: Props){
  return <Toasts><Shell {...props} /></Toasts>;
}

function Shell({ d, lang, version, me, ws, onSwitch, onLang, onLogout, onWorkspace }: Props){
  const toast = useToast();
  const s = ws.subscription;
  const site = `/${lang}`;
  const [page, setPage] = useState<Page>('profiles');
  const [group, setGroup] = useState<GroupFilter>('all');
  // Some profiles picked from elsewhere (the ones on a proxy, or with a risk), and one of them to show the details of.
  const [only, setOnly] = useState<Set<string> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // A proxy to show the details of when the Proxies page opens (from a profile's page).
  const [proxyId, setProxyId] = useState<string | null>(null);
  // A job to show when the task center opens (from a toast about it).
  const [jobId, setJobId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const wsRef = useOutsideClose(wsOpen, () => setWsOpen(false));
  const userRef = useOutsideClose(userOpen, () => setUserOpen(false));
  const manager = can(ws.role, MANAGE), creates = can(ws.role, 'profiles.create');
  const limit = s.entitlements.profiles;

  const data = useWorkspaceData(ws.id, ws.role, {
    workspace: onWorkspace,
    // Taken out of the workspace (or left it): the main process has closed its profiles; show another workspace.
    removed(){ toast(d.team.removedYou(ws.name)); onWorkspace(); },
    launchError(st: ProfileStatus){
      const p = data.profiles?.find(x => x.id === st.id);
      const why = d.launch[st.error ?? ''] ?? d.launch.launch_failed;
      toast(p ? d.profiles.done.failed(p.name, why) : why, st.error === 'kernel_missing' && p
        ? { label: d.form.download, fn: () => void data.install(p.kernel, p.kernelVersion).then(ok => { if (ok) void folio.openProfile(p.id); }) } : undefined, 'bad');
    },
    // The profile opened, but some of its extensions failed their check and were left out.
    extensionErrors(st: ProfileStatus){
      const p = data.profiles?.find(x => x.id === st.id);
      toast(d.extensions.failedCheck(p?.name ?? '', st.extensionErrors ?? []), undefined, 'bad');
    },
    job(id){ go('jobs'); setJobId(id); }
  });
  useJobNotice(d, data);
  const used = data.profiles?.length ?? ws.usage.profiles;
  const editing = dialog?.kind === 'edit' ? data.profiles?.find(p => p.id === dialog.id) : undefined;
  const editingProxy = dialog?.kind === 'proxy' && dialog.id ? data.proxies.find(p => p.id === dialog.id) : undefined;
  const close = () => setDialog(null);
  const go = (p: Page) => { setPage(p); setGroup('all'); setOnly(null); setOpenId(null); setProxyId(null); setJobId(null); };
  // Proxies, the Trash and billing are for whoever administers the workspace.
  const shown: Page = !manager && (page === 'proxies' || page === 'trash' || page === 'billing') ? 'profiles' : page;

  // Invitations to this account from other workspaces, in the workspace menu.
  const [invites, setInvites] = useState<MyInvitation[]>([]);
  const [startup, setStartup] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [palette, setPalette] = useState(false);
  useEffect(() => { void folio.update().then(setUpdate); return folio.onUpdate(setUpdate); }, []);
  useEffect(() => { void folio.startup().then(setStartup); }, [userOpen]);
  // What the main process shows itself follows the workbench's language.
  useEffect(() => { void folio.setLabels(d.tray); }, [d]);
  // A run found profiles signed out: a desktop notification that opens the run.
  useEffect(() => folio.onSignedOut(e => {
    const n = new Notification(d.notify.signedOut(e.task, e.profiles).title, { body: d.notify.signedOut(e.task, e.profiles).body });
    n.onclick = () => { void folio.showWindow(); setPage('tasks'); setFocus({ taskId: e.taskId, runId: e.runId }); };
  }), [d]);
  // Ctrl+K (⌘K) opens the command palette anywhere; Ctrl+N (⌘N) a new profile when no dialog is open (and the role
  // may create one).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === 'k'){ e.preventDefault(); setPalette(o => !o); }
      else if (creates && e.key.toLowerCase() === 'n' && !document.querySelector('.modal')){ e.preventDefault(); setPalette(false); go('profiles'); setDialog({ kind: 'new' }); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [creates]);
  // The order the delivery spec gives, then the pages it does not draw, then the Trash.
  const pages: [Page, IconName, string, boolean][] = [
    ['profiles', 'profiles', d.nav.profiles, true], ['proxies', 'proxies', d.nav.proxies, manager], ['engines', 'engines', d.nav.engines, true], ['groups', 'folder', d.nav.groups, true],
    ['team', 'team', d.nav.team, true], ['activity', 'activity', d.nav.activity, true], ['jobs', 'jobs', d.nav.jobs, true], ['tasks', 'tasks', d.nav.tasks, true],
    ['extensions', 'extensions', d.nav.extensions, true], ['sync', 'sync', d.nav.sync, true], ['flows', 'flows', d.nav.flows, true],
    ['api', 'api', d.nav.api, true], ['trash', 'trash', d.nav.trash, manager],
    ['settings', 'settings', d.nav.settings, true], ['billing', 'billing', d.nav.billing, manager]
  ];
  function commands(): Command[] {
    const C = d.palette, P = d.profiles;
    const proxies = new Map(data.proxies.map(p => [p.id, p]));
    const recent = [...(data.profiles ?? [])].sort((a, b) => Number(b.starred) - Number(a.starred) || Number(!!data.status[b.id]) - Number(!!data.status[a.id]) || Date.parse(b.lastOpenedAt ?? b.createdAt) - Date.parse(a.lastOpenedAt ?? a.createdAt));
    const profiles = recent.flatMap<Command>(p => {
      const h = health(p, proxies, data.kernels), on = data.status[p.id]?.state === 'running';
      const hint = [`#${String(p.number).padStart(4, '0')}`, h.geo?.city ?? h.geo?.countryName, on && P.st.running].filter(Boolean).join(' · ');
      const icon = <Flag country={h.geo?.country ?? null} kernel={p.kernel} />;
      const main: Command = on
        ? { id: `p:${p.id}`, group: 'profiles', label: p.name, hint, keys: `Enter ${C.switchTo}`, icon, run: () => void folio.focusProfile(p.id) }
        : { id: `p:${p.id}`, group: 'profiles', label: p.name, hint, keys: `Enter ${C.open}`, icon, run: () => void data.launch(p).then(why => { if (why) toast(why === 'kernel_missing' ? d.launch.kernel_missing : d.launch.download_failed, undefined, 'bad'); }) };
      return on ? [main, { id: `s:${p.id}`, group: 'profiles', label: C.stop(p.name), hint, icon, run: () => void folio.stopProfile(p.id) }] : [main];
    });
    const act = (id: string, label: string, icon: IconName, run: () => void, keys?: string): Command => ({ id, group: 'actions', label, icon: <Icon name={icon} />, run, keys });
    return [
      ...profiles,
      ...(creates ? [act('new', C.newProfile, 'plus', () => { go('profiles'); setDialog({ kind: 'new' }); }, `${mod} N`)] : []),
      ...(manager ? [
        act('import', C.importProfiles, 'upload', () => { go('profiles'); setDialog({ kind: 'import' }); }),
        act('add-proxy', C.addProxy, 'proxies', () => setDialog({ kind: 'proxy' })),
        act('check', C.checkProxies, 'check', () => void data.check(data.proxies.map(p => p.id)))
      ] : []),
      ...me.workspaces.filter(w => w.id !== ws.id).map(w => act(`ws:${w.id}`, C.switchWs(w.name), 'team', () => { go('profiles'); onSwitch(w.id); })),
      act('lang', C.language, 'proxies', () => void onLang(lang === 'en' ? 'zh' : 'en')),
      ...pages.filter(([, , , ok]) => ok).map(([p, icon, label]) => ({ id: `go:${p}`, group: 'pages' as const, label, icon: <Icon name={icon} />, run: () => go(p) }))
    ];
  }
  const loadInvites = () => folio.api<{ invitations: MyInvitation[] }>('GET', '/me/invitations').then(r => setInvites(r.invitations), () => {});
  useEffect(() => { void loadInvites(); }, [wsOpen]);
  async function answer(i: MyInvitation, accept: boolean){
    try {
      await folio.api('POST', `/invitations/${i.id}/${accept ? 'accept' : 'decline'}`);
      setWsOpen(false);
      if (accept){ go('profiles'); onSwitch(i.workspaceId); } else void loadInvites();
    } catch (e){ toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad'); }
  }

  const accountPanel = (
      <section className="account" role="dialog" aria-label={d.user.account}>
        <header className="acc-h">
          <span className="av lg" aria-hidden="true">{me.user.email.slice(0, 1).toUpperCase()}</span>
          <div><b>{me.user.email}</b><small>{ws.name} · {roleName(d, ws.role)}</small></div>
          <button className="btn btn-sm btn-secondary" type="button" onClick={() => folio.openSite(`${site}/account/`)}>{d.user.manage}<Icon name="chevR" /></button>
        </header>
        <div className="acc-two">
          <section aria-label={d.user.teams}>
            <p className="acc-t">{d.user.teams}</p>
            <ul className="acc-list" role="listbox" aria-label={d.ws.switch}>
              <WorkspaceItems d={d} me={me} ws={ws} invites={invites} onPick={w => { setUserOpen(false); go('profiles'); onSwitch(w); }} onAnswer={answer} />
            </ul>
            {/* The plan itself lives on the Plan & billing page; this is the way to it. */}
            {manager && (
              <div className="acc-plan">
                <b>{d.plans[s.plan]}</b>
                <span>{[d.plan.usage(used, limit), planStatus(s, d, lang)].filter(Boolean).join(' · ')}</span>
                <button className="linkish" type="button" onClick={() => { setUserOpen(false); go('billing'); }}>{d.nav.billing} ›</button>
              </div>
            )}
          </section>
          <section aria-label={d.user.settings}>
            <p className="acc-t">{d.user.settings}</p>
            <div className="acc-row">
              <span><Icon name="proxies" />{d.user.language}</span>
              <div className="seg fill">
                {(['zh', 'en'] as const).map(l => (
                  <button key={l} type="button" aria-pressed={lang === l} onClick={() => { setUserOpen(false); void onLang(l); }}>{LANG_NAMES[l]}</button>
                ))}
              </div>
            </div>
            {startup?.supported && (
              <div className="acc-switch">
                <Switch label={d.user.startup} checked={startup.enabled} onChange={on => void folio.setStartup(on).then(() => folio.startup()).then(setStartup)} />
                <p className="hint">{d.user.startupHint}</p>
              </div>
            )}
            {manager && <>
              <p className="acc-t">{d.user.data}</p>
              <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); setDialog({ kind: 'export-all' }); }}><Icon name="upload" />{d.user.exportAll}</button>
              <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); setDialog({ kind: 'import-all' }); }}><Icon name="download" />{d.user.importAll}</button>
            </>}
          </section>
        </div>
        <footer className="acc-f">
          <span>Folio {version}</span>
          <button className="menu-item" type="button" role="menuitem" onClick={() => { setUserOpen(false); void onLogout(); }}><Icon name="logout" />{d.user.logout}</button>
        </footer>
      </section>
  );

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
              <WorkspaceItems d={d} me={me} ws={ws} invites={invites} onPick={w => { setWsOpen(false); go('profiles'); onSwitch(w); }} onAnswer={answer} />
            </ul>
          )}
        </div>

        <nav className="nav" aria-label="Main">
          <NavItem icon="profiles" label={d.nav.profiles} active={shown === 'profiles'} onClick={() => go('profiles')} />
          {manager && <NavItem icon="proxies" label={d.nav.proxies} active={shown === 'proxies'} onClick={() => go('proxies')} />}
          <NavItem icon="engines" label={d.nav.engines} active={shown === 'engines'} onClick={() => go('engines')} />
          <NavItem icon="folder" label={d.nav.groups} active={shown === 'groups'} onClick={() => go('groups')} />
          <NavItem icon="team" label={d.nav.team} active={shown === 'team'} onClick={() => go('team')} />
          <NavItem icon="activity" label={d.nav.activity} active={shown === 'activity'} onClick={() => go('activity')} />
          <NavItem icon="jobs" label={d.nav.jobs} active={shown === 'jobs'} onClick={() => go('jobs')} />
          <NavItem icon="tasks" label={d.nav.tasks} active={shown === 'tasks'} onClick={() => go('tasks')} />
          <NavItem icon="extensions" label={d.nav.extensions} active={shown === 'extensions'} onClick={() => go('extensions')} />
          <NavItem icon="sync" label={d.nav.sync} badge={data.sync ? d.windowSync.onBadge : undefined} active={shown === 'sync'} onClick={() => go('sync')} />
          <NavItem icon="flows" label={d.nav.flows} active={shown === 'flows'} onClick={() => go('flows')} />
          <NavItem icon="api" label={d.nav.api} active={shown === 'api'} onClick={() => go('api')} />
          {manager && <NavItem icon="trash" label={d.nav.trash} active={shown === 'trash'} onClick={() => go('trash')} />}
        </nav>

        {update && (
          <section className="update" role="status" aria-label={update.installs ? d.update.ready(update.version) : d.update.out(update.version)}>
            <p><b>{update.installs ? d.update.ready(update.version) : d.update.out(update.version)}</b></p>
            {update.installs ? <>
              <button className="btn btn-sm btn-primary" type="button" onClick={() => void folio.installUpdate()}>{d.update.restart}</button>
              <p className="muted">{d.update.restartNote}</p>
            </> : <button className="btn btn-sm btn-secondary" type="button" onClick={() => folio.openSite(`${site}/download/`)}>{d.update.download}</button>}
          </section>
        )}

        <nav className="nav foot-nav" aria-label={d.nav.more}>
          <NavItem icon="help" label={d.nav.help} active={false} onClick={() => folio.openSite(`${site}/docs/`)} />
          <NavItem icon="settings" label={d.nav.settings} active={shown === 'settings'} onClick={() => go('settings')} />
          {manager && <NavItem icon="billing" label={d.nav.billing} active={shown === 'billing'} onClick={() => go('billing')} />}
        </nav>

        <div className="me-wrap" ref={userRef}>
          <button className="me" type="button" aria-haspopup="dialog" aria-expanded={userOpen} aria-label={d.user.account} onClick={() => setUserOpen(o => !o)}>
            <span className="av" aria-hidden="true">{me.user.email.slice(0, 1).toUpperCase()}</span>
            <span className="me-who"><b>{me.user.email}</b><small>{roleName(d, ws.role)}</small></span>
            {invites.length > 0 && <span className="dot" aria-label={d.team.invites} />}
            <Icon name="chev" />
          </button>
          {userOpen && accountPanel}
        </div>
      </aside>

      {/* On Windows and macOS this strip is the title bar: it is what the window is dragged by. */}
      <header className="top" />

      {shown === 'profiles' && (
        <ProfilesPage d={d} lang={lang} ws={ws} data={data} group={group} setGroup={setGroup} only={only} setOnly={setOnly} openId={openId} onPalette={() => setPalette(true)}
          onNew={() => setDialog({ kind: 'new' })} onImport={() => setDialog({ kind: 'import' })}
          onEdit={id => setDialog({ kind: 'edit', id })} onTrashPage={() => go('trash')} onShowProxy={id => { go('proxies'); setProxyId(id); }} />
      )}
      {shown === 'proxies' && <ProxiesPage d={d} lang={lang} data={data} openId={proxyId} onAdd={() => setDialog({ kind: 'proxy' })} onEdit={id => setDialog({ kind: 'proxy', id })} onImport={() => setDialog({ kind: 'proxy-import' })}
        onShowProfiles={(ids, open) => { go('profiles'); setOnly(new Set(ids)); setOpenId(open ?? null); }} />}
      {shown === 'team' && <TeamPage d={d} lang={lang} ws={ws} meId={me.user.id} data={data} onLeft={onWorkspace} />}
      {shown === 'extensions' && <ExtensionsPage d={d} ws={ws} data={data} />}
      {shown === 'sync' && <WindowSyncPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'flows' && <FlowsPage d={d} wsId={ws.id} meId={me.user.id} data={data} />}
      {shown === 'tasks' && <TasksPage d={d} lang={lang} ws={ws} data={data} focus={focus} />}
      {shown === 'api' && <ApiPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'engines' && <EnginesPage d={d} ws={ws} data={data} admin={me.admin} manager={manager}
        onShowProfiles={ids => { go('profiles'); setOnly(new Set(ids)); }} />}
      {shown === 'groups' && <GroupsPage d={d} lang={lang} ws={ws} meId={me.user.id} data={data}
        onOpenProfile={id => { go('profiles'); setOpenId(id); }} onNewProfile={g => setDialog({ kind: 'new', group: g })} />}
      {shown === 'jobs' && <JobsPage key={jobId ?? ''} d={d} lang={lang} meId={me.user.id} data={data} openId={jobId} />}
      {shown === 'activity' && <ActivityPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'trash' && <TrashPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'settings' && <SettingsPage d={d} ws={ws} data={data} manager={manager} />}
      {shown === 'billing' && <BillingPage d={d} lang={lang} ws={ws} data={data} manager={manager} used={used} />}

      {(dialog?.kind === 'new' || (dialog?.kind === 'edit' && editing)) && (
        <ProfileForm d={d} lang={lang} ws={ws} data={data} onClose={close} profile={editing}
          defaultGroup={dialog.kind === 'new' && dialog.group !== undefined ? dialog.group : group !== 'all' && group !== 'none' ? group : null}
          onDone={p => { close(); toast(dialog.kind === 'new' ? d.profiles.done.created(p.name) : d.profiles.done.saved); }} />
      )}
      {dialog?.kind === 'import' && <ProfileImportDialog d={d} ws={ws} data={data} onClose={close} />}
      {dialog?.kind === 'proxy' && (!dialog.id || editingProxy) && <ProxyForm d={d} wsId={ws.id} data={data} proxy={editingProxy} onClose={close} />}
      {dialog?.kind === 'proxy-import' && <ProxyImportDialog d={d} wsId={ws.id} data={data} onClose={close} />}
      {dialog?.kind === 'export-all' && <ExportDialog d={d} ws={ws} onClose={close} />}
      {palette && <CommandPalette d={d} commands={commands()} onClose={() => setPalette(false)} />}
      {dialog?.kind === 'import-all' && <ImportDialog d={d} ws={ws} data={data} onClose={close} />}
    </div>
  );
}

// A check of many proxies under way here (the design's "processing" notice): how far it has got, and where the
// results will be. It goes when the check ends (the page that started it says how it went), or when closed.
function useJobNotice(d: Dict, data: WorkspaceData){
  const notice = useNotice();
  const [closed, setClosed] = useState<string | null>(null);
  const j = data.jobs.find(x => x.kind === 'proxy.check' && x.status === 'running' && x.total > 5 && data.mine.has(x.id) && x.id !== closed);
  const done = j ? j.ok + j.failed + j.canceled : 0;
  useEffect(() => {
    notice(j && (
      <div className="toast notice" role="status" aria-label={d.states.underway(d.jobs.kinds[j.kind])}>
        <span className="t-ic" aria-hidden="true"><span className="spin" /></span>
        <div className="n-body">
          <p className="n-t"><b>{d.states.underway(d.jobs.kinds[j.kind])}</b><small>{done} / {j.total}</small></p>
          <Progress done={done} total={j.total} />
          <div className="n-foot"><p className="n-sub">{d.states.resultsThere}</p><button type="button" onClick={() => data.showJob(j.id)}>{d.states.viewTask}</button></div>
        </div>
        <button type="button" className="t-x" aria-label={d.common.close} title={d.common.close} onClick={() => setClosed(j.id)}><Icon name="x" /></button>
      </div>
    ));
  }, [j?.id, j?.total, done, d]);
  useEffect(() => () => notice(null), [notice]);
}

function NavItem({ icon, label, badge, active, onClick }: { icon: IconName; label: string; badge?: string; active: boolean; onClick(): void }){
  return (
    <button className={`nav-i${active ? ' active' : ''}`} type="button" aria-current={active ? 'page' : undefined} title={label} onClick={onClick}>
      <span className="ni"><Icon name={icon} /></span><span className="nav-l">{label}</span>{badge && <span className="cnt on">{badge}</span>}
    </button>
  );
}

// The workspaces this account is in, and invitations to others: in the sidebar's switcher and the account panel.
function WorkspaceItems({ d, me, ws, invites, onPick, onAnswer }: { d: Dict; me: Me; ws: Workspace; invites: MyInvitation[]; onPick(id: string): void; onAnswer(i: MyInvitation, accept: boolean): void }){
  return <>
    {me.workspaces.map(w => (
      <li key={w.id} role="option" aria-selected={w.id === ws.id} className="ws-item">
        <button type="button" className="acc-ws" aria-current={w.id === ws.id} onClick={() => onPick(w.id)}>
          <span className="ws-av" aria-hidden="true">{[...w.name][0]?.toUpperCase()}</span>
          <span><b>{w.name}</b><small>{d.plans[w.plan]} · {roleName(d, w.role)}</small></span>
          {w.id === ws.id && <Icon name="check" />}
        </button>
      </li>
    ))}
    {invites.length > 0 && <li className="menu-t" role="presentation">{d.team.invites}</li>}
    {invites.map(i => (
      <li key={i.id} role="presentation" className="invite-item" data-invite={i.workspaceName}>
        <span><span>{i.workspaceName}</span><small>{d.team.from(i.inviter ?? 'Folio', roleName(d, i.role))}</small></span>
        <span className="invite-acts">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onAnswer(i, true)}>{d.team.join}</button>
          <button type="button" className="btn btn-sm btn-text" onClick={() => onAnswer(i, false)}>{d.team.decline}</button>
        </span>
      </li>
    ))}
  </>;
}
