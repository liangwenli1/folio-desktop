// The only surface the renderer gets from the main process (exposed by the preload as `window.folio`).
// The session token never leaves the main process; the renderer asks for data through `api`.

export interface ApiErrorBody { code: string; message: string; status: number }

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

export type Method = 'GET' | 'POST' | 'PATCH';

export interface AppInfo { locale: string; version: string; siteUrl: string }

export interface FolioBridge {
  login(email: string, password: string): Promise<{ user: unknown }>;
  logout(): Promise<null>;
  hasSession(): Promise<boolean>;
  api<T>(method: Method, path: string, body?: unknown): Promise<T>;
  openSite(path: string): Promise<void>;
  info(): Promise<AppInfo>;
  onFocus(cb: () => void): () => void;
}
