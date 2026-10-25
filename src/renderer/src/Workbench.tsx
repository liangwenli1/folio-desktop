import { useEffect, useState, type FormEvent } from 'react';
import type { ProfileStatus, Update } from '@shared/bridge';
import { folio, isApiError, type Me, type MyInvitation, type Workspace } from './api';
import { useWorkspaceData, type WorkspaceData } from './data';
import { EnginesPage } from './Engines';
import { LANG_NAMES, errorText, type Dict, type Lang } from './i18n';
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
import { GROUP_COLORS, Icon, Mark, Switch, Toasts, useOutsideClose, useToast, type GroupColor, type IconName } from './ui';
import { CommandPalette, mod, type Command } from './CommandPalette';
import { Flag } from './Flag';
import { health } from './checks';

interface Props {
  d: Dict; lang: Lang; version: string; me: Me; ws: Workspace;
  onSwitch(id: string): void; onLang(l: Lang): Promise<void>; onLogout(): Promise<void>; onWorkspace(): void;
}

type Page = 'profiles' | 'proxies' | 'extensions' | 'team' | 'sync' | 'flows' | 'tasks' | 'api' | 'engines' | 'activity' | 'trash';
type Dialog = { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'import' } | { kind: 'proxy'; id?: string } | { kind: 'proxy-import' } | { kind: 'export-all' } | { kind: 'import-all' } | null;

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
  const [dialog, setDialog] = useState<Dialog>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const wsRef = useOutsideClose(wsOpen, () => setWsOpen(false));
  const userRef = useOutsideClose(userOpen, () => setUserOpen(false));
  const manager = ws.role !== 'member';
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
    }
  });
  const used = data.profiles?.length ?? ws.usage.profiles;
  const editing = dialog?.kind === 'edit' ? data.profiles?.find(p => p.id === dialog.id) : undefined;
  const editingProxy = dialog?.kind === 'proxy' && dialog.id ? data.proxies.find(p => p.id === dialog.id) : undefined;
  const close = () => setDialog(null);
  const go = (p: Page, g: GroupFilter = 'all') => { setPage(p); setGroup(g); setOnly(null); setOpenId(null); };
  // Proxies and the Trash are for owners and admins.
  const shown: Page = !manager && (page === 'proxies' || page === 'trash') ? 'profiles' : page;

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
  // Ctrl+K (⌘K) opens the command palette anywhere; Ctrl+N (⌘N) a new profile when no dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === 'k'){ e.preventDefault(); setPalette(o => !o); }
      else if (e.key.toLowerCase() === 'n' && !document.querySelector('.modal')){ e.preventDefault(); setPalette(false); go('profiles'); setDialog({ kind: 'new' }); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const pages: [Page, IconName, string, boolean][] = [
    ['profiles', 'profiles', d.nav.profiles, true], ['proxies', 'proxies', d.nav.proxies, manager], ['extensions', 'extensions', d.nav.extensions, true],
    ['team', 'team', d.nav.team, true], ['sync', 'sync', d.nav.sync, true], ['flows', 'flows', d.nav.flows, true], ['tasks', 'tasks', d.nav.tasks, true],
    ['api', 'api', d.nav.api, true], ['engines', 'engines', d.nav.engines, true], ['activity', 'activity', d.nav.activity, true], ['trash', 'trash', d.nav.trash, manager]
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
      act('new', C.newProfile, 'plus', () => { go('profiles'); setDialog({ kind: 'new' }); }, `${mod} N`),
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
          <NavItem icon="profiles" label={d.nav.profiles} active={page === 'profiles' && group === 'all'} onClick={() => go('profiles')} />
          {manager && <NavItem icon="proxies" label={d.nav.proxies} active={shown === 'proxies'} onClick={() => go('proxies')} />}
          <NavItem icon="extensions" label={d.nav.extensions} active={shown === 'extensions'} onClick={() => go('extensions')} />
          <NavItem icon="team" label={d.nav.team} active={shown === 'team'} onClick={() => go('team')} />
          <NavItem icon="sync" label={d.nav.sync} badge={data.sync ? d.windowSync.onBadge : undefined} active={shown === 'sync'} onClick={() => go('sync')} />
          <NavItem icon="flows" label={d.nav.flows} active={shown === 'flows'} onClick={() => go('flows')} />
          <NavItem icon="tasks" label={d.nav.tasks} active={shown === 'tasks'} onClick={() => go('tasks')} />
          <NavItem icon="api" label={d.nav.api} active={shown === 'api'} onClick={() => go('api')} />
          <NavItem icon="engines" label={d.nav.engines} active={shown === 'engines'} onClick={() => go('engines')} />
          <NavItem icon="activity" label={d.nav.activity} active={shown === 'activity'} onClick={() => go('activity')} />
          {manager && <NavItem icon="trash" label={d.nav.trash} active={shown === 'trash'} onClick={() => go('trash')} />}
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
          <b data-testid="plan-name">{d.plans[s.plan]}</b>
          <span data-testid="plan-usage">{d.plan.usage(used, limit)}</span>
          {planStatus(s, d, lang) && <span data-testid="plan-status">{planStatus(s, d, lang)}</span>}
          <span className="meter"><i style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></span>
        </section>
      </aside>

      <header className="top">
        <div className="me-wrap" ref={userRef}>
          <button className="me" type="button" aria-haspopup="dialog" aria-expanded={userOpen} aria-label={d.user.account} onClick={() => setUserOpen(o => !o)}>
            <span className="av" aria-hidden="true">{me.user.email.slice(0, 1).toUpperCase()}</span>{me.user.email}
            {invites.length > 0 && <span className="dot" aria-label={d.team.invites} />}
            <Icon name="chev" />
          </button>
          {userOpen && (
            <section className="account" role="dialog" aria-label={d.user.account}>
              <header className="acc-h">
                <span className="av lg" aria-hidden="true">{me.user.email.slice(0, 1).toUpperCase()}</span>
                <div><b>{me.user.email}</b><small>{ws.name} · {d.roles[ws.role]}</small></div>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => folio.openSite(`${site}/account/`)}>{d.user.manage}<Icon name="chevR" /></button>
              </header>
              <div className="acc-two">
                <section aria-label={d.user.teams}>
                  <p className="acc-t">{d.user.teams}</p>
                  <ul className="acc-list" role="listbox" aria-label={d.ws.switch}>
                    <WorkspaceItems d={d} me={me} ws={ws} invites={invites} onPick={w => { setUserOpen(false); go('profiles'); onSwitch(w); }} onAnswer={answer} />
                  </ul>
                  <div className="acc-plan">
                    <b>{d.plans[s.plan]}</b>
                    <span>{[d.plan.usage(used, limit), planStatus(s, d, lang)].filter(Boolean).join(' · ')}</span>
                    <span className="meter"><i style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></span>
                    {manager && <>
                      <button className="linkish" type="button" data-testid="plan-buy" onClick={() => folio.openSite(`${site}/checkout/?ws=${ws.id}`)}>
                        {isPaid(s) ? d.plan.addProfiles : d.plan.upgrade} ›
                      </button>
                      <button className="linkish" type="button" onClick={() => folio.openSite(`${site}/account/?ws=${ws.id}`)}>{d.plan.manage} ›</button>
                    </>}
                  </div>
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
          )}
        </div>
      </header>

      {shown === 'profiles' && (
        <ProfilesPage d={d} lang={lang} ws={ws} data={data} group={group} setGroup={setGroup} only={only} setOnly={setOnly} openId={openId} onPalette={() => setPalette(true)}
          onNew={() => setDialog({ kind: 'new' })} onImport={() => setDialog({ kind: 'import' })}
          onEdit={id => setDialog({ kind: 'edit', id })} onAddProxy={() => setDialog({ kind: 'proxy' })} />
      )}
      {shown === 'proxies' && <ProxiesPage d={d} lang={lang} data={data} onAdd={() => setDialog({ kind: 'proxy' })} onEdit={id => setDialog({ kind: 'proxy', id })} onImport={() => setDialog({ kind: 'proxy-import' })}
        onShowProfiles={(ids, open) => { go('profiles'); setOnly(new Set(ids)); setOpenId(open ?? null); }} />}
      {shown === 'team' && <TeamPage d={d} lang={lang} ws={ws} meId={me.user.id} data={data} onLeft={onWorkspace} />}
      {shown === 'extensions' && <ExtensionsPage d={d} ws={ws} data={data} />}
      {shown === 'sync' && <WindowSyncPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'flows' && <FlowsPage d={d} wsId={ws.id} meId={me.user.id} data={data} />}
      {shown === 'tasks' && <TasksPage d={d} lang={lang} ws={ws} data={data} focus={focus} />}
      {shown === 'api' && <ApiPage d={d} lang={lang} ws={ws} data={data} />}
      {shown === 'engines' && <EnginesPage d={d} data={data} admin={me.admin} />}
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
      {dialog?.kind === 'export-all' && <ExportDialog d={d} ws={ws} onClose={close} />}
      {palette && <CommandPalette d={d} commands={commands()} onClose={() => setPalette(false)} />}
      {dialog?.kind === 'import-all' && <ImportDialog d={d} ws={ws} data={data} onClose={close} />}
    </div>
  );
}

function NavItem({ icon, label, badge, active, onClick }: { icon: IconName; label: string; badge?: string; active: boolean; onClick(): void }){
  return (
    <button className={`nav-i${active ? ' active' : ''}`} type="button" aria-current={active ? 'page' : undefined} onClick={onClick}>
      <span className="ni"><Icon name={icon} /></span>{label}{badge && <span className="cnt on">{badge}</span>}
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
          <span><b>{w.name}</b><small>{d.plans[w.plan]} · {d.roles[w.role]}</small></span>
          {w.id === ws.id && <Icon name="check" />}
        </button>
      </li>
    ))}
    {invites.length > 0 && <li className="menu-t" role="presentation">{d.team.invites}</li>}
    {invites.map(i => (
      <li key={i.id} role="presentation" className="invite-item" data-invite={i.workspaceName}>
        <span><span>{i.workspaceName}</span><small>{d.team.from(i.inviter ?? 'Folio', d.roles[i.role])}</small></span>
        <span className="invite-acts">
          <button type="button" className="btn btn-xs btn-primary" onClick={() => onAnswer(i, true)}>{d.team.join}</button>
          <button type="button" className="btn btn-xs btn-text" onClick={() => onAnswer(i, false)}>{d.team.decline}</button>
        </span>
      </li>
    ))}
  </>;
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
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');

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
  async function recolor(id: string, color: GroupColor){
    try { await folio.api('PATCH', `/groups/${id}`, { color }); } catch (err){ fail(err); }
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
              <span className={`sq gc-${g.color}`} aria-hidden="true" />{g.name}
            </button>
            {manager && <button type="button" className="grp-more" aria-label={G.more(g.name)} aria-expanded={menu === g.id} onClick={() => setMenu(m => (m === g.id ? null : g.id))}>⋯</button>}
            {menu === g.id && (
              <div className="menu" role="menu">
                <button className="menu-item" type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming(g.id); setName(g.name); }}>{G.rename}</button>
                <div className="swatches" role="group" aria-label={G.color}>
                  {GROUP_COLORS.map(c => <button key={c} type="button" className={`sw gc-${c}`} aria-label={G.colors[c]} title={G.colors[c]} aria-pressed={g.color === c} onClick={() => { setMenu(null); void recolor(g.id, c); }} />)}
                </div>
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
            <span className="sq" aria-hidden="true" />{G.none}
          </button>
        )}
        {adding && form}
      </div>
    </div>
  );
}
