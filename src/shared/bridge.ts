// The only surface the renderer gets from the main process (exposed by the preload as `window.folio`).
// The session token and proxy passwords never leave the main process.
import type { components } from './api-schema';

export interface ApiErrorBody { code: string; message: string; status: number }
export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface AppInfo { locale: string; version: string; siteUrl: string; platform: string }

export type KernelKind = 'chromium' | 'firefox';
export type Os = 'windows' | 'macos' | 'linux';
// Chromium's `canvas` and `webgl` 'real' show this computer's own values instead of the seed's; Firefox's `webrtc` 'block'
// turns WebRTC off instead of showing the proxy's exit IP. Left out, they are the defaults.
export type Fingerprint =
  | { kind: 'chromium'; seed: number; hardwareConcurrency: number; canvas?: 'noise' | 'real'; webgl?: 'spoof' | 'real' }
  | { kind: 'firefox'; config: Record<string, unknown>; webrtc?: 'replace' | 'block' };
// What a new Firefox identity is drawn to: an exact screen and a GPU it has records of. Chromium takes neither.
export interface FingerprintAsk { screen?: [number, number] | null; gpu?: [string, string] | null }

export interface Geo { country: string; countryName: string; region: string | null; city: string | null; lat: number; lon: number; timezone: string; locale: string }
export interface CheckResult { ok: boolean; ms: number | null; ip: string | null; geo: Geo | null; error: string | null }
export interface ProxyDraft { type: 'http' | 'https' | 'socks5'; host: string; port: number; username: string | null; password: string | null; passwordOf?: string }

export interface ProfileStatus {
  id: string; state: 'starting' | 'restoring' | 'running' | 'saving' | 'stopped' | 'error';
  // While it starts: checking the proxy, restoring sign-ins, starting the browser.
  stage?: 'proxy' | 'restore' | 'launch';
  error?: string; startedAt?: number; usedBackup?: boolean; exitIp?: string | null; exitGeo?: Geo | null;
  // Extensions that failed their check (signature or hash) and were not installed, by name.
  extensionErrors?: string[];
}
// An engine version for this computer: in Folio's catalog (`available`), downloaded here (`installed`), or both. `size`
// is the package's, when the catalog knows it; `recommended` is the version new profiles get.
// What a site can read from inside a profile's browser, gathered by its self-check page.
export interface CheckupFacts { ips: string[]; timezone: string; language: string; userAgent: string; canvas: string; webgl: string | null }
export interface KernelState {
  kind: KernelKind; version: string; installed: boolean; available: boolean; recommended: boolean; size: number | null;
  // From the catalog, for the engines page's history: what the admin said about it, when it was added, when it became recommended.
  note: string | null; addedAt: string | null; recommendedAt: string | null;
}
// Background downloads of new recommended versions, and whether they wait until no profile is open.
export interface KernelSettings { autoDownload: boolean; idleOnly: boolean }
// A platform admin's upload of a new engine version: reading the file for its sha256, then sending it.
export interface KernelUpload { stage: 'hash' | 'upload'; done: number; total: number }
export interface KernelProgress { kind: KernelKind; version: string; done: number; total: number; error?: string; finished?: boolean; paused?: boolean }
export interface ImportPreview { workspace: string; exportedAt: string; profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }
export interface Change { kind: 'profiles' | 'proxies' | 'groups' | 'workspace' | 'members' | 'removed' | 'flows' | 'tasks' | 'runs' | 'extensions'; ids?: string[] }
export type ExtensionSource = { file: Uint8Array } | { store: string };
// The window sync under way: the leader and every window in it. `coords`: a follower didn't have the element the
// leader clicked (`label`, what it said) and got the click at the same place in its window; `failed`: something
// couldn't be repeated there.
export type SyncIssue = 'coords' | 'failed';
export interface WindowSync { leader: string; members: { id: string; issue: null | SyncIssue; label?: string | null }[] }
// What the followers repeat (navigation and tabs always), and the random pause before each repeat, in seconds.
// Kept on this computer.
export interface SyncOptions { click: boolean; typing: boolean; scroll: boolean; delay: [number, number] }
// One thing the leader did, as the recent sync log shows it: how many followers repeated it cleanly out of `of`, and
// what went wrong in the others. Consecutive typing or scrolling makes one entry.
export type SyncAction =
  | { t: 'click'; label: string | null } | { t: 'text'; text: string } | { t: 'key'; key: string } | { t: 'scroll'; px: number }
  | { t: 'goto'; url: string } | { t: 'tab'; tab: 'open' | 'close' | 'switch'; n: number };
export interface SyncLogEntry { id: number; at: number; action: SyncAction; of: number; ok: number; problems: { id: string; issue: SyncIssue; label: string | null }[] }
// Tiling the synced windows: how many moved, and why the others didn't (`unsupported`: Firefox on Linux;
// `permission`: macOS hasn't allowed Folio to move other apps' windows).
export interface Tiled { moved: number; missed: number; why: null | 'unsupported' | 'permission' | 'failed' }
// Where a script connects to a profile opened through the local API.
export interface Debugging { protocol: 'cdp' | 'webdriver-bidi'; wsEndpoint: string; debuggerAddress?: string }
export interface ApiToken { id: string; name: string; workspaceId: string; createdAt: string; lastUsedAt: string | null }
// A request a script made to the local API, and which token it came with.
export interface ApiCall { at: number; method: string; path: string; status: number; token: string | null }
// The local API's settings on this computer; `error` is why it isn't listening (the port is taken); `calls`, the last 50.
export interface LocalApi { enabled: boolean; port: number; listening: boolean; error: string | null; tokens: ApiToken[]; calls: ApiCall[] }
// A task run under way on this computer, and the profiles a finished run found signed out.
export interface ActiveRun { runId: string; taskId: string }
// A newer Folio: `installs` (Windows) when it is downloaded and installs on restart; otherwise (macOS) it is out and
// is downloaded from the site.
export interface Update { version: string; installs: boolean }
export interface SignedOut { taskId: string; runId: string; task: string; profiles: string[] }
// Words the main process shows itself (the tray menu, the note on closing to the tray), in the workbench's language.
export interface Labels { open: string; quit: string; background: string }

export type Step = components['schemas']['Step'];
// `too_long`: a task's profile ran past the task's time limit; `signed_out`: a sign-in check found it signed out.
export interface FlowError { code: 'timeout' | 'navigation' | 'script' | 'variable' | 'no_item' | 'closed' | 'stopped' | 'failed' | 'too_long' | 'signed_out'; message: string }
// One line of a run's log: the step's place in the flow ("3.1" is the first step inside step 3), what it acted
// on, how long it took, and what it found (an extracted value, the branch taken, the loop's count).
export interface FlowLog { path: string; type: Step['type']; target: string; ms: number | null; value?: string; error?: FlowError }
export interface FlowResult { ok: boolean; error?: FlowError; launchError?: string; data: Record<string, string>; screenshots: string[] }
// A trial run's progress, by the token tryFlow returned.
export interface FlowEvent { token: string; log?: FlowLog; done?: FlowResult }

export interface FolioBridge {
  login(email: string, password: string): Promise<{ user: unknown }>;
  logout(): Promise<null>;
  hasSession(): Promise<boolean>;
  api<T>(method: Method, path: string, body?: unknown): Promise<T>;
  openSite(path: string): Promise<void>;
  // Asks where to save a file the app made (an export) and writes it; null when the person cancels.
  saveFile(defaultName: string, content: string): Promise<string | null>;
  // Cookie files: export asks for a file (one profile) or a folder (several); import reads JSON or cookies.txt text.
  exportCookies(profiles: { id: string; name: string; number: number }[], format: 'json' | 'netscape'): Promise<{ saved: number; failed: { name: string; code: string }[]; path: string } | null>;
  importCookies(id: string, text: string): Promise<{ count: number }>;
  // A whole workspace in a passphrase-protected .folio file. Import is three steps: pick the file, unlock it
  // (to show what is inside), then bring it into a workspace.
  exportWorkspace(workspaceId: string, passphrase: string): Promise<{ path: string; profiles: number } | null>;
  pickImport(): Promise<{ token: string; name: string } | null>;
  unlockImport(token: string, passphrase: string): Promise<ImportPreview>;
  runImport(token: string, workspaceId: string): Promise<{ profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }>;
  info(): Promise<AppInfo>;
  onFocus(cb: () => void): () => void;

  watch(workspaceId: string | null): Promise<void>;
  onChange(cb: (c: Change) => void): () => void;

  openProfile(id: string): Promise<void>;
  stopProfile(id: string): Promise<void>;
  focusProfile(id: string): Promise<void>;
  // Opens the self-check page in the profile's browser (opening the profile if needed) and reads what it found.
  // `exitIp` and `exitGeo`: where the browser went out when it opened, which the time zone and language follow.
  checkup(id: string): Promise<{ facts: CheckupFacts; exitIp: string | null; exitGeo: Geo | null }>;
  statuses(): Promise<ProfileStatus[]>;
  onStatus(cb: (s: ProfileStatus) => void): () => void;

  // Runs a flow once on a profile (opening it when it is not open), in a new tab left open afterwards.
  tryFlow(profileId: string, steps: Step[], vars: Record<string, string>): Promise<string>;
  stopFlow(token: string): Promise<void>;
  onFlow(cb: (e: FlowEvent) => void): () => void;
  // Runs a task on this computer (all its profiles the person sees, or some of them again).
  runTask(taskId: string, trigger: 'manual' | 'rerun', profileIds?: string[]): Promise<{ runId: string }>;
  stopRun(runId: string): Promise<void>;
  activeRuns(): Promise<ActiveRun[]>;
  onRuns(cb: (runs: ActiveRun[]) => void): () => void;
  onSignedOut(cb: (e: SignedOut) => void): () => void;
  // A newer version of Folio, and restarting into it (Windows; open profiles are saved and closed first).
  update(): Promise<Update | null>;
  onUpdate(cb: (u: Update) => void): () => void;
  installUpdate(): Promise<void>;
  // Starting Folio, minimized, when the computer starts (Windows and macOS only), so schedules run on time.
  startup(): Promise<{ supported: boolean; enabled: boolean }>;
  setStartup(on: boolean): Promise<void>;
  setLabels(labels: Labels): Promise<void>;
  // Window sync: the first profile leads (they open first if they aren't open), and the others follow.
  startWindowSync(ids: string[], leader?: string): Promise<WindowSync | null>;
  stopWindowSync(): Promise<void>;
  setSyncLeader(id: string): Promise<WindowSync | null>;
  syncGoto(url: string): Promise<void>;
  windowSync(): Promise<WindowSync | null>;
  // Lays the synced windows out in a grid on the screen Folio is on, the leader top left.
  tileWindows(): Promise<Tiled | null>;
  onWindowSync(cb: (s: WindowSync | null) => void): () => void;
  syncOptions(): Promise<SyncOptions>;
  setSyncOptions(change: Partial<SyncOptions>): Promise<SyncOptions>;
  // The last 50 things repeated in this sync, newest first, and each change to them.
  syncLog(): Promise<SyncLogEntry[]>;
  onSyncLog(cb: (log: SyncLogEntry[]) => void): () => void;
  // Small pictures of the synced windows (by profile id, as data URLs) every 2 s, while asked for.
  watchSyncThumbs(on: boolean): Promise<void>;
  onSyncThumbs(cb: (thumbs: Record<string, string>) => void): () => void;
  // The local API: turn it on or off, change its port, and make or revoke tokens (a new token is shown once).
  localApi(): Promise<LocalApi>;
  setLocalApi(change: { enabled?: boolean; port?: number }): Promise<LocalApi>;
  createApiToken(name: string, workspaceId: string): Promise<{ token: string; api: LocalApi }>;
  revokeApiToken(id: string): Promise<LocalApi>;
  onLocalApi(cb: (api: LocalApi) => void): () => void;
  showWindow(): Promise<void>;
  // Adds an extension to the workspace's library, or a new version to one already there: from a file the person
  // picked, or downloaded from the Chrome Web Store (id or link) or addons.mozilla.org (link or slug).
  addExtension(workspaceId: string, kernel: KernelKind, from: ExtensionSource): Promise<{ id: string; name: string }>;
  updateExtension(id: string, kernel: KernelKind, from: ExtensionSource): Promise<{ id: string; name: string }>;
  // Shows a screenshot a flow took (a full path, or one relative to the screenshots folder) in the file manager.
  showFile(path: string): Promise<void>;

  checkProxy(id: string): Promise<CheckResult>;
  // Checks what is typed into the proxy form, without saving it.
  tryProxy(draft: ProxyDraft): Promise<CheckResult>;
  // For the given engine version (the recommended one by default); Firefox needs that version installed.
  newFingerprint(kind: KernelKind, os: Os, version?: string, ask?: FingerprintAsk): Promise<{ fingerprint: Fingerprint; kernelVersion: string }>;
  // The GPUs a Firefox identity can claim on this system, as [vendor, renderer].
  firefoxGpus(os: Os): Promise<[string, string][]>;
  kernels(): Promise<KernelState[]>;
  installKernel(kind: KernelKind, version: string): Promise<void>;
  removeKernel(kind: KernelKind, version: string): Promise<void>;
  // Pausing a download keeps what it got; installing again carries on from there.
  pauseKernel(kind: KernelKind, version: string): Promise<void>;
  kernelUsage(): Promise<{ path: string; bytes: number }>;
  kernelSettings(): Promise<KernelSettings>;
  setKernelSettings(change: Partial<KernelSettings>): Promise<KernelSettings>;
  onKernelProgress(cb: (p: KernelProgress) => void): () => void;
  // Platform admins: pick an engine package, then add it to the catalog as a version for a platform.
  pickKernelFile(): Promise<{ token: string; name: string; size: number } | null>;
  uploadKernel(token: string, meta: { kind: KernelKind; version: string; platform: string; note: string }): Promise<null>;
  onKernelUpload(cb: (u: KernelUpload) => void): () => void;
}
