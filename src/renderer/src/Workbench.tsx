import { useEffect, useRef, useState } from 'react';
import type { ProfileStatus, Update } from '@shared/bridge';
import { MANAGE, can, folio, type Me, type MyInvitation, type Workspace } from './api';
import { failure, useWorkspaceData, type WorkspaceData } from './data';
import { EnginesPage } from './Engines';
import { GroupsPage } from './Groups';
import { JobsPage } from './Jobs';
import { checkWhy, day, launchWhy, roleName, type Dict, type Lang } from './i18n';
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
import { AccountPage, LogoutDialog, NewWorkspaceDialog, type AccountPart } from './Account';
import { Icon, LeaveGuard, Mark, Progress, Toasts, applyInspector, useFail, useGuard, useMedia, useNotice, useToast, useView, type IconName } from './ui';
import { CommandPalette, mod, type Command } from './CommandPalette';
import { Bell, TopBar, TrailProvider, WorkspaceMenu, type Crumb, type Notice } from './TopBar';
import { Flag } from './Flag';
import { health } from './checks';

interface Props {
  d: Dict; lang: Lang; version: string; me: Me; ws: Workspace;
  onSwitch(id: string): void; onLang(l: Lang): Promise<void>; onLogout(): Promise<void>; onWorkspace(): void; onAccount(): Promise<void>;
}

type Page = 'profiles' | 'proxies' | 'extensions' | 'team' | 'sync' | 'flows' | 'tasks' | 'api' | 'engines' | 'groups' | 'activity' | 'jobs' | 'trash' | 'settings' | 'billing' | 'me';
// A new profile can start in a group picked on the Groups page.
type Dialog = { kind: 'new'; group?: string | null } | { kind: 'edit'; id: string } | { kind: 'import' } | { kind: 'proxy'; id?: string } | { kind: 'proxy-import' } | { kind: 'export-all' } | { kind: 'import-all' } | { kind: 'logout' } | { kind: 'new-ws' } | null;

export function Workbench(props: Props){
  return <Toasts><LeaveGuard><Shell {...props} /></LeaveGuard></Toasts>;
}

function Shell({ d, lang, version, me, ws, onSwitch, onLang, onLogout, onWorkspace, onAccount }: Props){
  const toast = useToast(), fail = useFail();
  const s = ws.subscription;
  const site = `/${lang}`;
  const [page, setPage] = useState<Page>('profiles');
  const [group, setGroup] = useState<GroupFilter>('all');
  // Some profiles picked from elsewhere (the ones on a proxy, or with a risk), and one of them to show the details of.
  const [only, setOnly] = useState<Set<string> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // A proxy to show the details of when the Proxies page opens (from a profile's page).
  const [proxyId, setProxyId] = useState<string | null>(null);
  // Bumped whenever a profile or a proxy is asked for by name (a toast's View), so its page opens on it even when shown,
  // and when the page shown is picked again in the sidebar, which brings it back to its list.
  const [asked, setAsked] = useState(0);
  const showProfile = (id: string) => { go('profiles'); setOpenId(id); setAsked(n => n + 1); };
  const showProxy = (id: string) => { go('proxies'); setProxyId(id); setAsked(n => n + 1); };
  // A job to show when the task center opens (from a toast about it).
  const [jobId, setJobId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const manager = can(ws.role, MANAGE), creates = can(ws.role, 'profiles.create');

  const data = useWorkspaceData(ws.id, ws.role, {
    workspace: onWorkspace,
    // Taken out of the workspace (or left it): the main process has closed its profiles; show another workspace.
    removed(){ toast(d.team.removedYou(ws.name)); onWorkspace(); },
    launchError(st: ProfileStatus){
      const p = data.profiles.find(x => x.id === st.id);
      const why = launchWhy(d, failure(st));
      toast({ title: why, detail: p?.name, tone: 'bad', action: st.error === 'kernel_missing' && p
        ? { label: d.form.download, fn: () => void data.install(p.kernel, p.kernelVersion).then(ok => { if (ok) void folio.openProfile(p.id); }) } : undefined });
    },
    // The profile opened, but some of its extensions failed their check and were left out.
    extensionErrors(st: ProfileStatus){
      const p = data.profiles.find(x => x.id === st.id);
      toast({ ...d.extensions.failedCheck(p?.name ?? '', st.extensionErrors ?? []), tone: 'bad' });
    },
    job(id){ go('jobs'); setJobId(id); }
  });
  useJobNotice(d, data);
  // Until the list loads, the count the workspace came with.
  const used = data.loaded.has('profiles') ? data.profiles.length : ws.usage.profiles;
  const editing = dialog?.kind === 'edit' ? data.profiles.find(p => p.id === dialog.id) : undefined;
  const editingProxy = dialog?.kind === 'proxy' && dialog.id ? data.proxies.find(p => p.id === dialog.id) : undefined;
  const close = () => setDialog(null);
  // Going to another page (or workspace) asks first when the page has changes not saved yet.
  const guard = useGuard();
  const go = (p: Page, then?: () => void) => guard(() => { if (p === page) setAsked(n => n + 1); setPage(p); setGroup('all'); setOnly(null); setOpenId(null); setProxyId(null); setJobId(null); then?.(); });
  // The part of Account to open on: its details from the menu, My workspaces from the workspace menu's invitations.
  const [accountPart, setAccountPart] = useState<AccountPart>('profile');
  // Proxies, the Trash and billing are for whoever administers the workspace.
  const shown: Page = !manager && (page === 'proxies' || page === 'trash' || page === 'billing') ? 'profiles' : page;

  // Invitations to this account from other workspaces, in the workspace menu, Account's My workspaces and the bell.
  const [invites, setInvites] = useState<MyInvitation[]>([]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [palette, setPalette] = useState(false);
  // A record's page puts itself after the page's name in the top bar.
  const [trail, setTrail] = useState<Crumb[] | null>(null);
  // The rail folds to its icons and opens again from the round button on its edge or from the mark (the user, 10-29),
  // kept on this computer; a window under 1024 wide always folds it, and then neither opens it.
  const [rail, setRail] = useView<'open' | 'folded'>('rail', 'open');
  const narrow = useMedia('(max-width: 1023px)');
  const turn = rail === 'folded' ? d.nav.unfold : d.nav.fold;
  const toggleRail = () => setRail(rail === 'folded' ? 'open' : 'folded');
  // What the main process knew at start never replaces news that arrived meanwhile.
  useEffect(() => { void folio.update().then(u => setUpdate(cur => cur ?? u)); applyInspector(); return folio.onUpdate(setUpdate); }, []);
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
  // The order the delivery spec gives, then the pages it does not draw, then the Trash; then the account and Platform
  // settings (the user, 10-29), the plan under those.
  const pages: [Page, IconName, string, boolean][] = [
    ['profiles', 'profiles', d.nav.profiles, true], ['proxies', 'proxies', d.nav.proxies, manager], ['engines', 'engines', d.nav.engines, true], ['groups', 'folder', d.nav.groups, true],
    ['team', 'team', d.nav.team, true], ['activity', 'activity', d.nav.activity, true], ['jobs', 'jobs', d.nav.jobs, true], ['tasks', 'tasks', d.nav.tasks, true],
    ['extensions', 'extensions', d.nav.extensions, true], ['sync', 'sync', d.nav.sync, true], ['flows', 'flows', d.nav.flows, true],
    ['api', 'api', d.nav.api, true], ['trash', 'trash', d.nav.trash, manager],
    ['me', 'user', d.account.title, true], ['settings', 'settings', d.nav.settings, true], ['billing', 'billing', d.nav.billing, manager]
  ];
  function commands(): Command[] {
    const C = d.palette, P = d.profiles;
    const proxies = new Map(data.proxies.map(p => [p.id, p]));
    const recent = [...data.profiles].sort((a, b) => Number(b.starred) - Number(a.starred) || Number(!!data.status[b.id]) - Number(!!data.status[a.id]) || Date.parse(b.lastOpenedAt ?? b.createdAt) - Date.parse(a.lastOpenedAt ?? a.createdAt));
    const profiles = recent.flatMap<Command>(p => {
      const h = health(p, proxies, data.kernels), on = data.status[p.id]?.state === 'running';
      const hint = [`#${String(p.number).padStart(4, '0')}`, h.geo?.city ?? h.geo?.countryName, on && P.st.running].filter(Boolean).join(' · ');
      const icon = <Flag country={h.geo?.country ?? null} kernel={p.kernel} />;
      const main: Command = on
        ? { id: `p:${p.id}`, group: 'profiles', label: p.name, hint, keys: `Enter ${C.switchTo}`, icon, run: () => void folio.focusProfile(p.id) }
        : { id: `p:${p.id}`, group: 'profiles', label: p.name, hint, keys: `Enter ${C.open}`, icon, run: () => void data.launch(p).then(why => { if (why) toast({ title: why === 'kernel_missing' ? d.launch.kernel_missing : d.launch.download_failed, detail: p.name, tone: 'bad' }); }) };
      return on ? [main, { id: `s:${p.id}`, group: 'profiles', label: C.stop(p.name), hint, icon, run: () => void folio.stopProfile(p.id) }] : [main];
    });
    const act = (id: string, label: string, icon: IconName, run: () => void, keys?: string): Command => ({ id, group: 'actions', label, icon: <Icon name={icon} />, run, keys });
    // A proxy opens its details (on the proxies page, for whoever may see it); a member, the team page.
    const lines: Command[] = manager ? data.proxies.map(px => ({ id: `px:${px.id}`, group: 'proxies', label: px.name, hint: `${px.host}:${px.port}`, icon: <Icon name="proxies" />, run: () => showProxy(px.id) })) : [];
    const people: Command[] = data.members.map(m => ({ id: `m:${m.userId}`, group: 'members', label: m.email, hint: roleName(d, m.role), icon: <Icon name="team" />, run: () => go('team') }));
    return [
      ...profiles, ...lines, ...people,
      ...(creates ? [act('new', C.newProfile, 'plus', () => { go('profiles'); setDialog({ kind: 'new' }); }, `${mod} N`)] : []),
      ...(manager ? [
        act('import', C.importProfiles, 'upload', () => { go('profiles'); setDialog({ kind: 'import' }); }),
        act('add-proxy', C.addProxy, 'proxies', () => setDialog({ kind: 'proxy' })),
        act('check', C.checkProxies, 'check', () => void data.check(data.proxies.map(p => p.id)))
      ] : []),
      ...me.workspaces.filter(w => w.id !== ws.id).map(w => act(`ws:${w.id}`, C.switchWs(w.name), 'team', () => guard(() => { go('profiles'); onSwitch(w.id); }))),
      act('lang', C.language, 'proxies', () => void onLang(lang === 'en' ? 'zh' : 'en')),
      ...pages.filter(([, , , ok]) => ok).map(([p, icon, label]) => ({ id: `go:${p}`, group: 'pages' as const, label, icon: <Icon name={icon} />, run: () => go(p) }))
    ];
  }
  const loadInvites = () => folio.api<{ invitations: MyInvitation[] }>('GET', '/me/invitations').then(r => setInvites(r.invitations), () => {});
  // What the bell holds (the design's in-app notices): the plan ending soon without renewing, for whoever manages the
  // workspace and has the reminder on; invitations to other workspaces; batch operations of one's own, from the last
  // week, that ended with failures; and, for everyone, how long the Trash keeps what is deleted (the user, 10-28: in
  // place of the Trash page's note). It counts as new again when that changes.
  function notices(): Notice[] {
    const T = d.top, week = 7 * 86_400_000;
    const end = s.status === 'trialing' ? s.trialEndsAt : s.cancelAtPeriodEnd ? s.currentPeriodEnd : null;
    const left = end ? Date.parse(end) - Date.now() : -1;
    const plan: Notice[] = manager && ws.settings.expiryReminder && end && left > 0 && left < week ? [{
      id: `plan:${end}`, icon: 'alert', tone: 'warn', text: s.status === 'trialing' ? T.trialEnds(day(end, lang)) : T.planEnds(d.plans[s.plan], day(end, lang)),
      actions: [{ label: s.status === 'trialing' ? T.choosePlan : T.renew, primary: true, run: () => folio.openSite(`${site}/checkout/?ws=${ws.id}`) }]
    }] : [];
    const asked: Notice[] = invites.map(i => ({
      id: `invite:${i.id}`, icon: 'mail', text: T.invited(i.inviter ?? 'Folio', i.workspaceName),
      actions: [{ label: d.team.join, primary: true, run: () => void answer(i, true) }, { label: d.team.decline, run: () => void answer(i, false) }]
    }));
    const failed: Notice[] = data.jobs.filter(j => j.startedById === me.user.id && j.status !== 'running' && j.failed > 0 && Date.now() - Date.parse(j.finishedAt ?? j.createdAt) < week).map(j => ({
      id: `job:${j.id}:${j.failed}`, icon: 'alertTri', tone: 'bad', text: T.jobFailed(d.jobs.kinds[j.kind], j.failed, j.total), when: day(j.finishedAt ?? j.createdAt, lang),
      actions: [{ label: d.states.viewTask, run: () => data.showJob(j.id) }]
    }));
    const kept: Notice = {
      id: `trash:${ws.settings.trashDays}`, icon: 'trash', text: T.trashKept(ws.settings.trashDays, manager),
      actions: manager ? [{ label: T.openTrash, run: () => go('trash') }] : []
    };
    return [...plan, ...asked, ...failed, kept];
  }
  // Asked again whenever Account shows, where they are answered.
  useEffect(() => { void loadInvites(); }, [shown === 'me']);
  useDesktopNotices(d, me, data, update, manager, { proxies: () => go('proxies'), job: id => data.showJob(id) });
  async function answer(i: MyInvitation, accept: boolean){
    try {
      await folio.api('POST', `/invitations/${i.id}/${accept ? 'accept' : 'decline'}`);
      if (accept) guard(() => { go('profiles'); onSwitch(i.workspaceId); }); else void loadInvites();
    } catch (e){ fail(e); }
  }

  // The plan is reached from Platform settings, which stays lit while it shows.
  const nav = pages.filter(([p, , , ok]) => ok && p !== 'billing');
  const runningHere = Object.values(data.status).filter(x => x.state !== 'stopped' && x.state !== 'error').length;

  return (
    <TrailProvider value={setTrail}>
    <div className={`app${rail === 'folded' || narrow ? ' mini' : ''}`}>
      <aside className="side" aria-label={d.ws.current}>
        <div className="brand">
          {narrow ? <Mark /> : <button type="button" className="brand-mark" aria-label={turn} title={turn} onClick={toggleRail}><Mark /></button>}
          <span className="brand-word">Folio</span>
        </div>

        <nav className="nav" aria-label="Main">
          {nav.map(([p, icon, label]) => (
            <NavItem key={p} icon={icon} label={label} active={shown === p || (p === 'settings' && shown === 'billing')} badge={p === 'sync' && data.sync ? d.windowSync.onBadge : undefined} onClick={() => go(p, p === 'me' ? () => setAccountPart('profile') : undefined)} />
          ))}
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
        {!narrow && <button type="button" className="rail-edge" aria-label={turn} title={turn} onClick={toggleRail}><Icon name={rail === 'folded' ? 'chevR' : 'back'} /></button>}
      </aside>

      <TopBar d={d} page={pages.find(([x]) => x === shown)?.[2] ?? ''} trail={trail} onSearch={() => setPalette(true)} onHelp={() => folio.openSite(`${site}/help/`)}>
        <Bell d={d} wsId={ws.id} notices={notices()} />
        <WorkspaceMenu d={d} me={me} ws={ws} invites={invites.length} onOpen={() => void loadInvites()} onSwitch={id => guard(() => { go('profiles'); onSwitch(id); })}
          onNew={() => setDialog({ kind: 'new-ws' })} onInvites={() => go('me', () => setAccountPart('workspaces'))}
          onAccount={() => go('me', () => setAccountPart('profile'))} onLogout={() => guard(() => setDialog({ kind: 'logout' }))} />
      </TopBar>

      {shown === 'profiles' && (
        <ProfilesPage key={asked} d={d} lang={lang} ws={ws} meId={me.user.id} data={data} group={group} setGroup={setGroup} only={only} setOnly={setOnly} openId={openId} onPalette={() => setPalette(true)}
          onNew={() => setDialog({ kind: 'new' })} onImport={() => setDialog({ kind: 'import' })}
          onEdit={id => setDialog({ kind: 'edit', id })} onTrashPage={() => go('trash')} onShowProxy={showProxy} />
      )}
      {shown === 'proxies' && <ProxiesPage key={asked} d={d} lang={lang} data={data} openId={proxyId} onAdd={() => setDialog({ kind: 'proxy' })} onEdit={id => setDialog({ kind: 'proxy', id })} onImport={() => setDialog({ kind: 'proxy-import' })}
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
        onOpenProfile={showProfile} onNewProfile={g => setDialog({ kind: 'new', group: g })} />}
      {shown === 'jobs' && <JobsPage key={jobId ?? ''} d={d} lang={lang} meId={me.user.id} data={data} openId={jobId} />}
      {shown === 'activity' && <ActivityPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'trash' && <TrashPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'settings' && <SettingsPage d={d} ws={ws} me={me} data={data} manager={manager} version={version} onSaved={onAccount}
        onExport={() => setDialog({ kind: 'export-all' })} onImport={() => setDialog({ kind: 'import-all' })} onBilling={() => go('billing')} />}
      {shown === 'me' && <AccountPage key={`${asked}:${accountPart}`} d={d} lang={lang} me={me} ws={ws} invites={invites} start={accountPart} onSaved={onAccount}
        onSwitch={id => guard(() => { go('profiles'); onSwitch(id); })} onNew={() => setDialog({ kind: 'new-ws' })} onAnswer={(i, ok) => void answer(i, ok)} onLogout={() => guard(() => setDialog({ kind: 'logout' }))} />}
      {shown === 'billing' && <BillingPage d={d} lang={lang} ws={ws} data={data} manager={manager} used={used} />}

      {(dialog?.kind === 'new' || (dialog?.kind === 'edit' && editing)) && (
        <ProfileForm d={d} lang={lang} ws={ws} meId={me.user.id} data={data} onClose={close} profile={editing}
          defaultGroup={dialog.kind === 'new' && dialog.group !== undefined ? dialog.group : group !== 'all' && group !== 'none' ? group : null}
          onDone={p => { close(); if (dialog.kind === 'new') toast({ title: d.profiles.done.created, detail: `${p.name} · #${String(p.number).padStart(4, '0')}`, action: { label: d.states.view, fn: () => showProfile(p.id) } });
            else toast({ title: d.profiles.done.saved, detail: p.name }); }} />
      )}
      {dialog?.kind === 'import' && <ProfileImportDialog d={d} ws={ws} data={data} onClose={close} />}
      {dialog?.kind === 'proxy' && (!dialog.id || editingProxy) && <ProxyForm d={d} wsId={ws.id} data={data} proxy={editingProxy} onClose={close} onShow={showProxy} />}
      {dialog?.kind === 'proxy-import' && <ProxyImportDialog d={d} wsId={ws.id} data={data} onClose={close} />}
      {dialog?.kind === 'export-all' && <ExportDialog d={d} ws={ws} onClose={close} />}
      {palette && <CommandPalette d={d} commands={commands()} onClose={() => setPalette(false)} />}
      {dialog?.kind === 'import-all' && <ImportDialog d={d} ws={ws} data={data} onClose={close} />}
      {dialog?.kind === 'new-ws' && <NewWorkspaceDialog d={d} onClose={close} onMade={id => { close(); go('profiles'); onSwitch(id); }} />}
      {dialog?.kind === 'logout' && <LogoutDialog d={d} profiles={runningHere} runs={data.active.length} sync={!!data.sync} onClose={close} onLogout={onLogout} />}
    </div>
    </TrailProvider>
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
          <div className="n-foot"><p className="n-sub">{d.states.resultsThere}</p><button type="button" className="t-act" onClick={() => data.showJob(j.id)}>{d.states.view}</button></div>
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
      <Icon name={icon} /><span className="nav-l">{label}</span>{badge && <span className="cnt on">{badge}</span>}
    </button>
  );
}

// Desktop notices the person asked for (v2 38): their batch operations finishing (with or without failures), a proxy
// that stops connecting, a new version. Each says so once; clicking one shows the window and what it is about.
function useDesktopNotices(d: Dict, me: Me, data: WorkspaceData, update: Update | null, manager: boolean, show: { proxies(): void; job(id: string): void }){
  const n = me.user.notify;
  const jobs = useRef(new Map<string, string>()), down = useRef<Set<string> | null>(null), told = useRef<string | null>(null);
  const say = (t: { title: string; body: string }, open: () => void) => {
    const x = new Notification(t.title, { body: t.body });
    x.onclick = () => { void folio.showWindow(); open(); };
  };
  useEffect(() => {
    for (const j of data.jobs){
      const before = jobs.current.get(j.id);
      jobs.current.set(j.id, j.status);
      if (before !== 'running' || j.status === 'running' || !data.mine.has(j.id)) continue;
      if (j.failed > 0 && n.taskFailed) say(d.notify.taskFailed(d.jobs.kinds[j.kind], j.failed, j.total), () => show.job(j.id));
      else if (!j.failed && j.status === 'done' && n.taskDone) say(d.notify.taskDone(d.jobs.kinds[j.kind], j.ok), () => show.job(j.id));
    }
  }, [data.jobs]);
  useEffect(() => {
    if (!manager || !data.loaded.has('proxies')) return;
    const now = new Set(data.proxies.filter(p => p.lastCheck && !p.lastCheck.ok).map(p => p.id));
    // The first list is what was already down: only lines that go down from now on are told.
    if (down.current && n.proxyDown){
      for (const p of data.proxies) if (now.has(p.id) && !down.current.has(p.id)) say(d.notify.proxyDown(p.name, checkWhy(d, p.lastCheck?.error ?? null) ?? d.proxies.states.down), show.proxies);
    }
    down.current = now;
  }, [data.proxies]);
  useEffect(() => {
    if (!update || told.current === update.version || !n.productUpdate) return;
    told.current = update.version;
    say(d.notify.productUpdate(update.version), () => {});
  }, [update?.version]);
}
