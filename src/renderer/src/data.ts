// Everything the workbench shows for the open workspace. Lists come from the server and are fetched again
// when the change stream says they changed (on this computer or another one); run status and engine
// downloads come from the main process.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveRun, KernelKind, KernelProgress, KernelState, ProfileStatus, WindowSync } from '@shared/bridge';
import { GROUP_COLORS } from './ui';
import { MANAGE, can, folio, isApiError, type Extension, type Flow, type Group, type Invitation, type Job, type JobDetail, type Member, type MyRole, type Profile, type Proxy, type Role, type Task } from './api';
import { ENGINES } from './checks';
import { jobRun, retryJob, startJob, type JobRun } from './jobRun';

export type Kind = 'profiles' | 'trash' | 'groups' | 'proxies' | 'members' | 'flows' | 'tasks' | 'extensions' | 'jobs';
export type BatchAction = 'move' | 'tag' | 'untag' | 'set-proxy' | 'assign' | 'add-extension' | 'remove-extension' | 'set-kernel' | 'set-browser' | 'trash' | 'restore' | 'purge';
export type ProfilePatch = Partial<Pick<Profile, 'name' | 'groupId' | 'tags' | 'proxyId' | 'ownerId' | 'kernelVersion' | 'fingerprint' | 'timezoneOverride' | 'localeOverride' | 'notes' | 'syncMode' | 'extensionIds'
  | 'searchEngine' | 'restoreTabs' | 'startUrl' | 'windowMode' | 'windowWidth' | 'windowHeight'>>;
export const kernelKey = (kind: KernelKind, version: string) => `${kind}-${version}`;
// What a bulk edit sets (fields left out stay as they are), and whether it leaves running profiles alone. A job keeps
// it, so a retry applies the same.
export interface BulkChange { groupId?: string | null; proxyId?: string | null; kernel?: { kind: KernelKind; version: string }; startUrl?: string | null; stoppedOnly: boolean }

export interface WorkspaceData {
  role: MyRole;
  // The workspace's roles, with what each may do: the team page's picker and the scope column read them.
  roles: Role[];
  profiles: Profile[]; trash: Profile[]; groups: Group[]; proxies: Proxy[];
  // The team: everyone in it, and (for whoever manages members) invitations still open.
  members: Member[]; invitations: Invitation[];
  // Whom to ask for access: the owner's email.
  admin: string | null;
  flows: Flow[]; tasks: Task[]; extensions: Extension[];
  // Batch operations of the last while, for the task center (whoever administers the workspace sees everyone's).
  jobs: Job[];
  // Bumped when runs change anywhere (pages showing runs fetch them again); the runs under way on this computer.
  runsSeq: number; active: ActiveRun[];
  // The window sync under way on this computer.
  sync: WindowSync | null;
  status: Record<string, ProfileStatus>; kernels: KernelState[]; progress: Record<string, KernelProgress>;
  // Why each profile's last launch on this computer failed, until it is opened again.
  failed: Record<string, string>;
  refresh(...kinds: Kind[]): void;
  // Lists that have loaded since the workspace opened: until then a list shows a skeleton, not "nothing here".
  loaded: Set<Kind | 'kernels'>;
  // Lists whose last load failed, with why ('forbidden' when the role may not see it): their table says so and offers
  // `refresh` again, instead of an endless skeleton or an empty list that looks like there is nothing there.
  loadFailed: Map<Kind, string>;
  // Opens the task center, at a job when one is given.
  showJob(id: string | null): void;
  // Saves an edit made to `p`; resolves false when someone else changed the profile first.
  patch(p: Profile, body: ProfilePatch): Promise<boolean>;
  batch(action: BatchAction, ids: string[], extra?: { groupId?: string | null; tag?: string; proxyId?: string | null; ownerId?: string | null; extensionId?: string; kernel?: KernelKind; kernelVersion?: string; searchEngine?: string; restoreTabs?: boolean; startUrl?: string | null }): Promise<number>;
  // The id of the group with this name, created when there is none.
  ensureGroup(name: string): Promise<string>;
  // Checks proxies two at a time; `checking` holds the ones under way. Several at once are a job; a job being retried
  // passes itself in. Resolves with the job and how many didn't answer.
  checking: Set<string>;
  check(ids: string[], job?: JobRun): Promise<{ job: string | null; failed: number }>;
  // Downloads an engine version, as a job; resolves true once it is here.
  install(kind: KernelKind, version: string, job?: JobRun): Promise<boolean>;
  // Opens several profiles as a job, each reported once it runs or fails to start.
  openMany(ps: Profile[], job?: JobRun): Promise<JobRun | null>;
  // A bulk edit as a job: profiles skipped because they run are reported failed, so a retry reaches them once stopped.
  // Resolves with why it failed, or null.
  applyEdit(change: BulkChange, ps: Profile[], job?: JobRun): Promise<string | null>;
  // Runs a job's failed targets again (or just the ones given) on this computer, reporting to the same job; resolves
  // with the job as it ended.
  rerun(id: string, seqs?: number[]): Promise<JobDetail>;
  // Stops a job running on this computer: what it hasn't reached is canceled.
  cancel(id: string): void;
  // Jobs this computer is running now.
  mine: Set<string>;
  // Opens a profile, downloading its engine first when this computer doesn't have it. Resolves with why it couldn't
  // start (the engine isn't built for this computer, or its download failed), or null once it is starting (or when the
  // download was paused).
  launch(p: Profile): Promise<'kernel_missing' | 'download_failed' | null>;
  // Deletes a downloaded engine version from this computer; reloads the list (also after an upload).
  removeKernel(kind: KernelKind, version: string): Promise<void>;
  reloadKernels(): Promise<KernelState[]>;
}

export function useWorkspaceData(wsId: string, role: MyRole, on: { workspace(): void; removed(): void; launchError(s: ProfileStatus): void; extensionErrors(s: ProfileStatus): void; job(id: string | null): void }): WorkspaceData {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [trash, setTrash] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roleList, setRoles] = useState<Role[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runsSeq, setRunsSeq] = useState(0);
  const [active, setActive] = useState<ActiveRun[]>([]);
  const [sync, setSync] = useState<WindowSync | null>(null);
  const [status, setStatus] = useState<Record<string, ProfileStatus>>({});
  const [kernels, setKernels] = useState<KernelState[]>([]);
  const [progress, setProgress] = useState<Record<string, KernelProgress>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<Set<string>>(() => new Set());
  const [loadFailed, setLoadFailed] = useState<Map<Kind, string>>(() => new Map());
  const [loaded, setLoaded] = useState<Set<Kind | 'kernels'>>(() => new Set());
  const handlers = useRef(on);
  handlers.current = on;
  const waiting = useRef(new Map<string, (p: KernelProgress) => void>());
  // Profiles opened as part of a job, waiting to run (null) or fail (why); and what each profile is doing now.
  const opening = useRef(new Map<string, (error: string | null) => void>());
  const live = useRef<Record<string, ProfileStatus['state']>>({});
  // How to stop each job this computer is running.
  const stops = useRef(new Map<string, () => void>());
  const [mine, setMine] = useState<Set<string>>(() => new Set());
  const own = (id: string, stop: () => void) => { stops.current.set(id, stop); setMine(s => new Set(s).add(id)); };
  const done = (id: string) => { stops.current.delete(id); setMine(s => { const n = new Set(s); n.delete(id); return n; }); };
  // Downloads paused by the person: the profile that waited on one doesn't open, and that isn't an error.
  const paused = useRef<Record<string, boolean>>({});

  // `role` is a fresh object every time the workspace is fetched, so the effects below depend on this instead:
  // an unstable dependency would tear the change stream down and set it up again on every refresh.
  const manages = can(role, MANAGE);

  const refresh = useCallback((...kinds: Kind[]) => {
    const base = `/workspaces/${wsId}`;
    const mark = (k: Kind, why: string | null) => setLoadFailed(f => {
      if ((f.get(k) ?? null) === why) return f;
      const n = new Map(f);
      if (why) n.set(k, why); else n.delete(k);
      return n;
    });
    const run = <T>(k: Kind, path: string, set: (v: T) => void) =>
      folio.api<T>('GET', path).then(v => { set(v); mark(k, null); setLoaded(l => (l.has(k) ? l : new Set(l).add(k))); }).catch(e => mark(k, isApiError(e) ? e.code : 'internal'));
    for (const k of kinds){
      if (k === 'profiles') void run<{ profiles: Profile[] }>(k, `${base}/profiles`, r => setProfiles(r.profiles));
      if (k === 'trash') void run<{ profiles: Profile[] }>(k, `${base}/profiles?trash=1`, r => setTrash(r.profiles));
      if (k === 'groups') void run<{ groups: Group[] }>(k, `${base}/groups`, r => setGroups(r.groups));
      if (k === 'proxies') void run<{ proxies: Proxy[] }>(k, `${base}/proxies`, r => setProxies(r.proxies));
      if (k === 'flows') void run<{ flows: Flow[] }>(k, `${base}/flows`, r => setFlows(r.flows));
      if (k === 'tasks') void run<{ tasks: Task[] }>(k, `${base}/tasks`, r => setTasks(r.tasks));
      if (k === 'extensions') void run<{ extensions: Extension[] }>(k, `${base}/extensions`, r => setExtensions(r.extensions));
      if (k === 'jobs') void run<{ jobs: Job[] }>(k, `${base}/jobs`, r => setJobs(r.jobs));
      if (k === 'members'){
        void run<{ members: Member[] }>(k, `${base}/members`, r => setMembers(r.members));
        void run<{ roles: Role[] }>(k, `${base}/roles`, r => setRoles(r.roles));
        if (manages) void run<{ invitations: Invitation[] }>(k, `${base}/invitations`, r => setInvitations(r.invitations));
      }
    }
  }, [wsId, manages]);

  useEffect(() => {
    setProfiles([]); setTrash([]); setGroups([]); setProxies([]); setMembers([]); setInvitations([]); setRoles([]); setFlows([]); setTasks([]); setExtensions([]); setJobs([]); setLoadFailed(new Map()); setLoaded(new Set());
    refresh('profiles', 'trash', 'groups', 'proxies', 'members', 'flows', 'tasks', 'extensions', 'jobs');
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
    void folio.kernels().then(k => { setKernels(k); setLoaded(l => new Set(l).add('kernels')); });
    void folio.activeRuns().then(setActive);
    const offRuns = folio.onRuns(setActive);
    void folio.windowSync().then(setSync);
    const offSync = folio.onWindowSync(setSync);
    const offStatus = folio.onStatus(s => {
      live.current[s.id] = s.state;
      const waiter = opening.current.get(s.id);
      if (waiter && (s.state === 'running' || s.state === 'error' || s.state === 'stopped')){
        opening.current.delete(s.id);
        waiter(s.state === 'running' ? null : s.error ?? 'launch_failed');
      }
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
        waiting.current.get(key)?.(p);
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

  const check = useCallback(async (ids: string[], run?: JobRun) => {
    const queue = [...new Set(ids)];
    const mark = (id: string, on: boolean) => setChecking(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    const job = run ?? (queue.length > 1 ? await startJob(wsId, 'proxy.check', queue.map(id => ({ targetId: id, name: proxies.find(x => x.id === id)?.name ?? id }))) : null);
    let canceled = false, failed = 0;
    if (job) own(job.id, () => { canceled = true; queue.length = 0; });
    await Promise.all([0, 1].map(async () => {
      for (let id = queue.shift(); id; id = queue.shift()){
        mark(id, true);
        try {
          const r = await folio.checkProxy(id);
          if (!r.ok) failed++;
          await job?.report(id, r.ok ? null : r.error ?? 'failed');
        } catch { failed++; await job?.report(id, 'failed'); } finally { mark(id, false); }
      }
    }));
    if (job){ await job.finish(canceled); done(job.id); }
    refresh('proxies');
    return { job: job?.id ?? null, failed };
  }, [refresh, wsId, proxies]);

  // Resolves when the download finishes (true) or fails or is paused (false). Starting it twice shares one download,
  // and its job; a paused download's job is canceled.
  const install = useCallback((kind: KernelKind, version: string, run?: JobRun) => new Promise<boolean>(resolve => {
    const key = kernelKey(kind, version), before = waiting.current.get(key);
    const job = before ? null : run ? Promise.resolve(run) : startJob(wsId, 'kernel.download', [{ targetId: key, name: `${ENGINES[kind]} ${version}` }], { kind, version });
    void job?.then(j => { if (j) own(j.id, () => void folio.pauseKernel(kind, version)); });
    waiting.current.set(key, p => {
      before?.(p); resolve(!!p.finished);
      void job?.then(async j => {
        if (!j) return;
        if (!p.paused) await j.report(key, p.finished ? null : p.error ?? 'download_failed');
        await j.finish(!!p.paused); done(j.id);
      });
    });
    setProgress(m => ({ ...m, [key]: { kind, version, done: 0, total: 0 } }));
    void folio.installKernel(kind, version);
  }), [wsId]);

  // Why a profile couldn't start, 'paused' when its engine's download was paused, or null once it is starting.
  const start = useCallback(async (p: Profile) => {
    const k = kernels.find(x => x.kind === p.kernel && x.version === p.kernelVersion);
    if (kernels.length && !k) return 'kernel_missing' as const;
    if (k && !k.installed && !(await install(p.kernel, p.kernelVersion))) return paused.current[kernelKey(p.kernel, p.kernelVersion)] ? 'paused' as const : 'download_failed' as const;
    await folio.openProfile(p.id);
    return null;
  }, [kernels, install]);
  const launch = useCallback(async (p: Profile) => { const w = await start(p); return w === 'paused' ? null : w; }, [start]);

  const openMany = useCallback(async (ps: Profile[], run?: JobRun) => {
    const job = run ?? await startJob(wsId, 'profile.open', ps.map(p => ({ targetId: p.id, name: p.name })));
    let canceled = false;
    if (job) own(job.id, () => { canceled = true; });
    await Promise.all(ps.map(async p => {
      // Already open here: nothing to wait for.
      if (live.current[p.id] === 'running') return job?.report(p.id, null);
      // Waiting begins before the launch, so a status that comes quickly is not missed; a launch that never says
      // anything gives up after five minutes.
      const ran = new Promise<string | null>(resolve => {
        opening.current.set(p.id, resolve);
        setTimeout(() => { if (opening.current.get(p.id) === resolve){ opening.current.delete(p.id); resolve('launch_failed'); } }, 300_000);
      });
      const why = canceled ? 'canceled' : await start(p);
      if (why) opening.current.delete(p.id);
      // Why it didn't start shows where a failed launch does (the batch tray, the list).
      if (why && why !== 'canceled' && why !== 'paused') setFailed(m => ({ ...m, [p.id]: why }));
      if (why !== 'canceled') await job?.report(p.id, why ?? await ran);
    }));
    if (job){ await job.finish(canceled); done(job.id); }
    return job;
  }, [wsId, start]);

  const applyEdit = useCallback(async (change: BulkChange, ps: Profile[], run?: JobRun) => {
    const job = run ?? await startJob(wsId, 'profile.edit', ps.map(p => ({ targetId: p.id, name: p.name })), { ...change });
    const busy = change.stoppedOnly ? ps.filter(p => live.current[p.id] && live.current[p.id] !== 'stopped' && live.current[p.id] !== 'error') : [];
    const go = ps.filter(p => !busy.includes(p)), ids = go.map(p => p.id);
    let error: string | null = null;
    try {
      if (ids.length && change.groupId !== undefined) await batch('move', ids, { groupId: change.groupId });
      if (ids.length && change.proxyId !== undefined) await batch('set-proxy', ids, { proxyId: change.proxyId });
      const sameKind = change.kernel ? go.filter(p => p.kernel === change.kernel!.kind).map(p => p.id) : [];
      if (change.kernel && sameKind.length) await batch('set-kernel', sameKind, { kernel: change.kernel.kind, kernelVersion: change.kernel.version });
      if (ids.length && change.startUrl !== undefined) await batch('set-browser', ids, { startUrl: change.startUrl });
    } catch (e){ error = isApiError(e) ? e.code : 'internal'; }
    for (const p of busy) await job?.report(p.id, 'running');
    for (const id of ids) await job?.report(id, error);
    await job?.finish();
    return error;
  }, [wsId, batch]);

  const rerun = useCallback(async (id: string, seqs?: number[]) => {
    const j = await retryJob(id, seqs);
    const run = jobRun(j), ids = j.items.filter(i => i.status === 'pending' && i.targetId).map(i => i.targetId!);
    const found = profiles.filter(p => ids.includes(p.id));
    // Profiles deleted since can't be reached any more.
    if (j.kind === 'profile.open' || j.kind === 'profile.edit'){
      for (const gone of ids.filter(x => !found.some(p => p.id === x))) await run.report(gone, 'gone');
    }
    if (j.kind === 'proxy.check') await check(ids, run);
    else if (j.kind === 'profile.open') await openMany(found, run);
    else if (j.kind === 'profile.edit') await applyEdit(j.detail as unknown as BulkChange, found, run);
    else if (j.kind === 'kernel.download') await install(j.detail.kind as KernelKind, String(j.detail.version), run);
    else await run.finish();
    return folio.api<JobDetail>('GET', `/jobs/${id}`);
  }, [profiles, check, openMany, applyEdit, install]);

  const cancel = useCallback((id: string) => { stops.current.get(id)?.(); }, []);
  const showJob = useCallback((id: string | null) => handlers.current.job(id), []);

  const reloadKernels = useCallback(() => folio.kernels().then(k => { setKernels(k); return k; }), []);
  const removeKernel = useCallback(async (kind: KernelKind, version: string) => {
    await folio.removeKernel(kind, version);
    setProgress(m => { const next = { ...m }; delete next[kernelKey(kind, version)]; return next; });
    await reloadKernels();
  }, [reloadKernels]);

  return {
    role, roles: roleList, profiles, trash, groups, proxies, members, invitations, flows, tasks, extensions, jobs, runsSeq, active, sync, status, kernels, progress, failed,
    admin: members.find(m => m.role.key === 'owner')?.email ?? null, checking, loadFailed, loaded, showJob, refresh, patch, batch, ensureGroup, check, install, launch, openMany, applyEdit, rerun, cancel, mine, removeKernel, reloadKernels
  };
}
