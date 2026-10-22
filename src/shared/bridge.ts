// The only surface the renderer gets from the main process (exposed by the preload as `window.folio`).
// The session token and proxy passwords never leave the main process.

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
export interface Change { kind: 'profiles' | 'proxies' | 'groups' | 'workspace' | 'members' | 'removed'; ids?: string[] }

export interface FolioBridge {
  login(email: string, password: string): Promise<{ user: unknown }>;
  logout(): Promise<null>;
  hasSession(): Promise<boolean>;
  api<T>(method: Method, path: string, body?: unknown): Promise<T>;
  openSite(path: string): Promise<void>;
  info(): Promise<AppInfo>;
  onFocus(cb: () => void): () => void;

  watch(workspaceId: string | null): Promise<void>;
  onChange(cb: (c: Change) => void): () => void;

  openProfile(id: string): Promise<void>;
  stopProfile(id: string): Promise<void>;
  statuses(): Promise<ProfileStatus[]>;
  onStatus(cb: (s: ProfileStatus) => void): () => void;

  checkProxy(id: string): Promise<CheckResult>;
  // Uses the newest engine version for this platform; Firefox needs that engine installed.
  newFingerprint(kind: KernelKind, os: Os): Promise<{ fingerprint: Fingerprint; kernelVersion: string }>;
  kernels(): Promise<KernelState[]>;
  installKernel(kind: KernelKind, version: string): Promise<void>;
  onKernelProgress(cb: (p: KernelProgress) => void): () => void;
}
