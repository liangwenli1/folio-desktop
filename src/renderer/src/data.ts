// Everything the workbench shows for the open workspace. Lists come from the server and are fetched again
// when the change stream says they changed (on this computer or another one); run status and engine
// downloads come from the main process.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveRun, KernelKind, KernelProgress, KernelState, ProfileStatus, WindowSync } from '@shared/bridge';
import { GROUP_COLORS } from './ui';
import { MANAGE, can, folio, isApiError, type Extension, type Flow, type Group, type Invitation, type Member, type MyRole, type Profile, type Proxy, type Role, type Task } from './api';

export type Kind = 'profiles' | 'trash' | 'groups' | 'proxies' | 'members' | 'flows' | 'tasks' | 'extensions';
export type BatchAction = 'move' | 'tag' | 'untag' | 'set-proxy' | 'assign' | 'add-extension' | 'remove-extension' | 'set-kernel' | 'set-browser' | 'trash' | 'restore' | 'purge';
export type ProfilePatch = Partial<Pick<Profile, 'name' | 'groupId' | 'tags' | 'proxyId' | 'ownerId' | 'kernelVersion' | 'fingerprint' | 'timezoneOverride' | 'localeOverride' | 'notes' | 'syncMode' | 'extensionIds'
  | 'searchEngine' | 'restoreTabs' | 'startUrl' | 'windowMode' | 'windowWidth' | 'windowHeight'>>;
export const kernelKey = (kind: KernelKind, version: string) => `${kind}-${version}`;

export interface WorkspaceData {
  role: MyRole;
  // The workspace's roles, with what each may do: the team page's picker and the scope column read them.
  roles: Role[];
  profiles: Profile[] | null; trash: Profile[] | null; groups: Group[]; proxies: Proxy[];
  // The team: everyone in it, and (for whoever manages members) invitations still open.
  members: Member[]; invitations: Invitation[];
  flows: Flow[]; tasks: Task[]; extensions: Extension[];
  // Bumped when runs change anywhere (pages showing runs fetch them again); the runs under way on this computer.
  runsSeq: number; active: ActiveRun[];
  // The window sync under way on this computer.
  sync: WindowSync | null;
  status: Record<string, ProfileStatus>; kernels: KernelState[]; progress: Record<string, KernelProgress>;
  // Why each profile's last launch on this computer failed, until it is opened again.
  failed: Record<string, string>;
  refresh(...kinds: Kind[]): void;
  // Lists whose last load failed: their table says so and offers `refresh` again, instead of an endless skeleton
  // or an empty list that looks like there is nothing there.
  loadFailed: Set<Kind>;
  // Saves an edit made to `p`; resolves false when someone else changed the profile first.
  patch(p: Profile, body: ProfilePatch): Promise<boolean>;
  batch(action: BatchAction, ids: string[], extra?: { groupId?: string | null; tag?: string; proxyId?: string | null; ownerId?: string | null; extensionId?: string; kernel?: KernelKind; kernelVersion?: string; searchEngine?: string; restoreTabs?: boolean; startUrl?: string | null }): Promise<number>;
  // The id of the group with this name, created when there is none.
  ensureGroup(name: string): Promise<string>;
  // Checks proxies two at a time; `checking` holds the ones under way.
  checking: Set<string>;
  check(ids: string[]): Promise<void>;
  install(kind: KernelKind, version: string): Promise<boolean>;
  // Opens a profile, downloading its engine first when this computer doesn't have it. Resolves with why it couldn't
  // start (the engine isn't built for this computer, or its download failed), or null once it is starting (or when the
  // download was paused).
  launch(p: Profile): Promise<'kernel_missing' | 'download_failed' | null>;
  // Deletes a downloaded engine version from this computer; reloads the list (also after an upload).
  removeKernel(kind: KernelKind, version: string): Promise<void>;
  reloadKernels(): Promise<KernelState[]>;
}

export function useWorkspaceData(wsId: string, role: MyRole, on: { workspace(): void; removed(): void; launchError(s: ProfileStatus): void; extensionErrors(s: ProfileStatus): void }): WorkspaceData {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [trash, setTrash] = useState<Profile[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roleList, setRoles] = useState<Role[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [runsSeq, setRunsSeq] = useState(0);
  const [active, setActive] = useState<ActiveRun[]>([]);
  const [sync, setSync] = useState<WindowSync | null>(null);
  const [status, setStatus] = useState<Record<string, ProfileStatus>>({});
  const [kernels, setKernels] = useState<KernelState[]>([]);
  const [progress, setProgress] = useState<Record<string, KernelProgress>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<Set<string>>(() => new Set());
  const [loadFailed, setLoadFailed] = useState<Set<Kind>>(() => new Set());
  const handlers = useRef(on);
  handlers.current = on;
  const waiting = useRef(new Map<string, (ok: boolean) => void>());
  // Downloads paused by the person: the profile that waited on one doesn't open, and that isn't an error.
  const paused = useRef<Record<string, boolean>>({});

  // `role` is a fresh object every time the workspace is fetched, so the effects below depend on this instead:
  // an unstable dependency would tear the change stream down and set it up again on every refresh.
  const manages = can(role, MANAGE);

  const refresh = useCallback((...kinds: Kind[]) => {
    const base = `/workspaces/${wsId}`;
    const mark = (k: Kind, failed: boolean) => setLoadFailed(f => (f.has(k) === failed ? f : new Set([...f].filter(x => x !== k).concat(failed ? [k] : []))));
    const run = <T>(k: Kind, path: string, set: (v: T) => void) =>
      folio.api<T>('GET', path).then(v => { set(v); mark(k, false); }).catch(() => mark(k, true));
    for (const k of kinds){
      if (k === 'profiles') void run<{ profiles: Profile[] }>(k, `${base}/profiles`, r => setProfiles(r.profiles));
      if (k === 'trash') void run<{ profiles: Profile[] }>(k, `${base}/profiles?trash=1`, r => setTrash(r.profiles));
      if (k === 'groups') void run<{ groups: Group[] }>(k, `${base}/groups`, r => setGroups(r.groups));
      if (k === 'proxies') void run<{ proxies: Proxy[] }>(k, `${base}/proxies`, r => setProxies(r.proxies));
      if (k === 'flows') void run<{ flows: Flow[] }>(k, `${base}/flows`, r => setFlows(r.flows));
      if (k === 'tasks') void run<{ tasks: Task[] }>(k, `${base}/tasks`, r => setTasks(r.tasks));
      if (k === 'extensions') void run<{ extensions: Extension[] }>(k, `${base}/extensions`, r => setExtensions(r.extensions));
      if (k === 'members'){
        void run<{ members: Member[] }>(k, `${base}/members`, r => setMembers(r.members));
        void run<{ roles: Role[] }>(k, `${base}/roles`, r => setRoles(r.roles));
        if (manages) void run<{ invitations: Invitation[] }>(k, `${base}/invitations`, r => setInvitations(r.invitations));
      }
    }
  }, [wsId, manages]);

  useEffect(() => {
    setProfiles(null); setTrash(null); setGroups([]); setProxies([]); setMembers([]); setInvitations([]); setRoles([]); setFlows([]); setTasks([]); setExtensions([]); setLoadFailed(new Set());
    refresh('profiles', 'trash', 'groups', 'proxies', 'members', 'flows', 'tasks', 'extensions');
    void folio.watch(wsId);
    return folio.onChange(c => {
      if (c.kind === 'workspace') handlers.current.workspace();
      else if (c.kind === 'removed') handlers.current.removed();
      else if (c.kind === 'profiles') refresh('profiles', 'trash', 'groups', 'extensions');
      else if (c.kind === 'runs'){ setRunsSeq(n => n + 1); refresh('tasks'); }
      else refresh(c.kind);
    });
  }, [wsId, refresh]);

  useEffect(() => {
    void folio.statuses().then(list => setStatus(Object.fromEntries(list.map(s => [s.id, s]))));
    void folio.kernels().then(setKernels);
    void folio.activeRuns().then(setActive);
    const offRuns = folio.onRuns(setActive);
    void folio.windowSync().then(setSync);
    const offSync = folio.onWindowSync(setSync);
    const offStatus = folio.onStatus(s => {
      setStatus(m => {
        const next = { ...m };
        if (s.state === 'stopped' || s.state === 'error') delete next[s.id]; else next[s.id] = s;
        return next;
      });
      setFailed(m => {
        if (s.state === 'error') return { ...m, [s.id]: s.error ?? 'launch_failed' };
        if (!(s.id in m)) return m;
        const next = { ...m }; delete next[s.id]; return next;
      });
      if (s.state === 'error') handlers.current.launchError(s);
      if (s.extensionErrors?.length) handlers.current.extensionErrors(s);
    });
    const offKernel = folio.onKernelProgress(p => {
      const key = kernelKey(p.kind, p.version);
      setProgress(m => ({ ...m, [key]: p }));
      paused.current[key] = !!p.paused;
      if (p.finished || p.error || p.paused){
        void folio.kernels().then(setKernels);
        waiting.current.get(key)?.(!!p.finished);
        waiting.current.delete(key);
      }
    });
    return () => { offStatus(); offKernel(); offRuns(); offSync(); };
  }, []);

  const patch = useCallback(async (p: Profile, body: ProfilePatch) => {
    try {
      await folio.api('PATCH', `/profiles/${p.id}`, { version: p.version, ...body });
      return true;
    } catch (e){
      if (isApiError(e) && e.code === 'stale') return false;
      throw e;
    } finally { refresh('profiles'); }
  }, [refresh]);

  const batch = useCallback(async (action: BatchAction, ids: string[], extra = {}) => {
    try {
      return (await folio.api<{ updated: number }>('POST', `/workspaces/${wsId}/profiles/batch`, { action, ids, ...extra })).updated;
    } finally { refresh('profiles', 'trash', 'groups'); }
  }, [wsId, refresh]);

  const ensureGroup = useCallback(async (name: string) => {
    const base = `/workspaces/${wsId}/groups`;
    try {
      return (await folio.api<Group>('POST', base, { name, color: GROUP_COLORS[groups.length % (GROUP_COLORS.length - 1)] })).id;
    } catch (e){
      if (!isApiError(e) || e.code !== 'group_exists') throw e;
      return (await folio.api<{ groups: Group[] }>('GET', base)).groups.find(g => g.name === name.trim())!.id;
    } finally { refresh('groups'); }
  }, [wsId, refresh, groups.length]);

  const check = useCallback(async (ids: string[]) => {
    const queue = [...new Set(ids)];
    const mark = (id: string, on: boolean) => setChecking(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    await Promise.all([0, 1].map(async () => {
      for (let id = queue.shift(); id; id = queue.shift()){
        mark(id, true);
        try { await folio.checkProxy(id); } finally { mark(id, false); }
      }
    }));
    refresh('proxies');
  }, [refresh]);

  // Resolves when the download finishes (true) or fails (false). Starting it twice shares one download.
  const install = useCallback((kind: KernelKind, version: string) => new Promise<boolean>(resolve => {
    const key = kernelKey(kind, version), before = waiting.current.get(key);
    waiting.current.set(key, ok => { before?.(ok); resolve(ok); });
    setProgress(m => ({ ...m, [key]: { kind, version, done: 0, total: 0 } }));
    void folio.installKernel(kind, version);
  }), []);

  const launch = useCallback(async (p: Profile) => {
    const k = kernels.find(x => x.kind === p.kernel && x.version === p.kernelVersion);
    if (kernels.length && !k) return 'kernel_missing' as const;
    if (k && !k.installed && !(await install(p.kernel, p.kernelVersion))) return paused.current[kernelKey(p.kernel, p.kernelVersion)] ? null : 'download_failed' as const;
    await folio.openProfile(p.id);
    return null;
  }, [kernels, install]);

  const reloadKernels = useCallback(() => folio.kernels().then(k => { setKernels(k); return k; }), []);
  const removeKernel = useCallback(async (kind: KernelKind, version: string) => {
    await folio.removeKernel(kind, version);
    setProgress(m => { const next = { ...m }; delete next[kernelKey(kind, version)]; return next; });
    await reloadKernels();
  }, [reloadKernels]);

  return { role, roles: roleList, profiles, trash, groups, proxies, members, invitations, flows, tasks, extensions, runsSeq, active, sync, status, kernels, progress, failed, checking, loadFailed, refresh, patch, batch, ensureGroup, check, install, launch, removeKernel, reloadKernels };
}
