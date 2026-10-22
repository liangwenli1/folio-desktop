// The only surface the renderer gets from the main process (exposed by the preload as `window.folio`).
// The session token and proxy passwords never leave the main process.
import type { components } from './api-schema';

export interface ApiErrorBody { code: string; message: string; status: number }
export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };
export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export interface AppInfo { locale: string; version: string; siteUrl: string; platform: string }

export type KernelKind = 'chromium' | 'firefox';
export type Os = 'windows' | 'macos' | 'linux';
export type Fingerprint =
  | { kind: 'chromium'; seed: number; hardwareConcurrency: number }
  | { kind: 'firefox'; config: Record<string, unknown> };

export interface Geo { country: string; countryName: string; region: string | null; city: string | null; lat: number; lon: number; timezone: string; locale: string }
export interface CheckResult { ok: boolean; ms: number | null; ip: string | null; geo: Geo | null; error: string | null }

export interface ProfileStatus {
  id: string; state: 'starting' | 'restoring' | 'running' | 'saving' | 'stopped' | 'error';
  error?: string; startedAt?: number; usedBackup?: boolean; exitIp?: string | null; exitGeo?: Geo | null;
}
export interface KernelState { kind: KernelKind; version: string; installed: boolean; sizeHint: string }
export interface KernelProgress { kind: KernelKind; version: string; done: number; total: number; error?: string; finished?: boolean }
export interface ImportPreview { workspace: string; exportedAt: string; profiles: number; proxies: number; groups: number; signedIn: number }
export interface Change { kind: 'profiles' | 'proxies' | 'groups' | 'workspace' | 'members' | 'removed' | 'flows'; ids?: string[] }

export type Step = components['schemas']['Step'];
export interface FlowError { code: 'timeout' | 'navigation' | 'script' | 'variable' | 'no_item' | 'closed' | 'stopped' | 'failed'; message: string }
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
  runImport(token: string, workspaceId: string): Promise<{ profiles: number; proxies: number; groups: number; signedIn: number }>;
  info(): Promise<AppInfo>;
  onFocus(cb: () => void): () => void;

  watch(workspaceId: string | null): Promise<void>;
  onChange(cb: (c: Change) => void): () => void;

  openProfile(id: string): Promise<void>;
  stopProfile(id: string): Promise<void>;
  statuses(): Promise<ProfileStatus[]>;
  onStatus(cb: (s: ProfileStatus) => void): () => void;

  // Runs a flow once on a profile (opening it when it is not open), in a new tab left open afterwards.
  tryFlow(profileId: string, steps: Step[], vars: Record<string, string>): Promise<string>;
  stopFlow(token: string): Promise<void>;
  onFlow(cb: (e: FlowEvent) => void): () => void;
  // Shows a screenshot a flow took in the system's file manager.
  showFile(path: string): Promise<void>;

  checkProxy(id: string): Promise<CheckResult>;
  // Uses the newest engine version for this platform; Firefox needs that engine installed.
  newFingerprint(kind: KernelKind, os: Os): Promise<{ fingerprint: Fingerprint; kernelVersion: string }>;
  kernels(): Promise<KernelState[]>;
  installKernel(kind: KernelKind, version: string): Promise<void>;
  onKernelProgress(cb: (p: KernelProgress) => void): () => void;
}
