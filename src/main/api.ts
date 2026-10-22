// Calls folio-server on behalf of the renderer, adding the bearer token.
// Uses Electron's net stack, so system proxy settings apply.
import { net } from 'electron';
import { hostname } from 'node:os';
import type { ApiResult, Method } from '../shared/bridge';
import { clearToken, getToken, setToken } from './session';

export const API_URL = process.env.FOLIO_API_URL ?? 'http://localhost:47110';

// JSON both ways, except saved sign-in state, which travels as bytes (a Buffer body, an octet-stream answer), and
// exports, which come back as text (CSV).
async function call<T>(method: Method | 'PUT', path: string, body?: unknown, withToken = true): Promise<ApiResult<T>> {
  const token = getToken();
  const bytes = Buffer.isBuffer(body);
  let res: Response;
  try {
    res = await net.fetch(API_URL + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': bytes ? 'application/octet-stream' : 'application/json' }),
        ...(withToken && token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : bytes ? new Uint8Array(body as Buffer) : JSON.stringify(body)
    });
  } catch {
    return { ok: false, error: { code: 'network', message: 'Cannot reach Folio', status: 0 } };
  }
  const type = res.headers.get('content-type') ?? '';
  const data = res.status === 204 ? null
    : res.ok && type === 'application/octet-stream' ? Buffer.from(await res.arrayBuffer())
    : res.ok && type.startsWith('text/') ? await res.text()
    : await res.json().catch(() => null);
  if (!res.ok){
    if (res.status === 401 && withToken) await clearToken();
    return { ok: false, error: { code: data?.error?.code ?? 'internal', message: data?.error?.message ?? res.statusText, status: res.status } };
  }
  return { ok: true, data: data as T };
}

export async function login(email: string, password: string){
  const r = await call<{ user: unknown; token: string }>('POST', '/auth/login', { email, password, client: 'desktop', deviceName: hostname() }, false);
  if (!r.ok) return r;
  await setToken(r.data.token);
  return { ok: true as const, data: { user: r.data.user } };
}

export async function logout(){
  if (getToken()) await call('POST', '/auth/logout');
  await clearToken();
  return { ok: true as const, data: null };
}

// For the main process's own use (launching, locks, saved state, proxy checks).
export const api = <T = unknown>(method: Method | 'PUT', path: string, body?: unknown) => call<T>(method, path, body);

// Proxy passwords, saved sign-in state and the locks around it stay in the main process.
// Starting a task run returns its variables (which may hold passwords); the reports are the runner's alone.
const MAIN_ONLY = [
  /^\/profiles\/[^/]+\/launch$/, /^\/proxies\/[^/]+\/credentials$/, /^\/profiles\/[^/]+\/(data|lock|lock\/renew)$/,
  /^\/tasks\/[^/]+\/runs$/, /^\/runs\/[^/]+\/(items\/[^/]+|heartbeat|finish)$/
];

// What the renderer may call through the bridge.
export function forRenderer(method: Method, path: string, body?: unknown){
  const bare = path.split('?')[0];
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method) || !path.startsWith('/') || path.startsWith('//') || MAIN_ONLY.some(r => r.test(bare))){
    return Promise.resolve<ApiResult>({ ok: false, error: { code: 'forbidden', message: 'Not available here', status: 403 } });
  }
  return call(method, path, body);
}
