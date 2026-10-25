// Checks a proxy the way a profile will use it: through a local forwarder, then the proxy, to the server's
// /net/echo, which reports the exit IP and its location. The result is stored on the server for the team.
import { randomUUID } from 'node:crypto';
import { session } from 'electron';
import { API_URL, api } from './api';
import { getToken } from './session';
import { startForwarder, type Upstream } from './forwarder';
import type { CheckResult, Geo, ProxyDraft } from '../shared/bridge';

export interface ProxySecret extends Upstream { id: string }

const TIMEOUT = 10_000;

export async function echoThrough(up: Upstream | null): Promise<CheckResult> {
  const fwd = await startForwarder(up);
  // A throwaway session whose only route out is the forwarder, including for loopback addresses.
  const ses = session.fromPartition(`folio-check-${randomUUID()}`, { cache: false });
  await ses.setProxy({ proxyRules: `http=127.0.0.1:${fwd.port};https=127.0.0.1:${fwd.port}`, proxyBypassRules: '<-loopback>' });
  const started = Date.now();
  try {
    const res = await ses.fetch(`${API_URL}/net/echo`, { headers: { authorization: `Bearer ${getToken()}` }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return { ok: false, ms: null, ip: null, geo: null, error: `HTTP ${res.status}` };
    const body = await res.json() as { ip: string; geo: Geo | null };
    return { ok: true, ms: Date.now() - started, ip: body.ip, geo: body.geo, error: null };
  } catch (e){
    const timedOut = (e as Error).name === 'TimeoutError';
    return { ok: false, ms: null, ip: null, geo: null, error: timedOut ? 'timeout' : 'unreachable' };
  } finally {
    await fwd.close();
    await ses.clearStorageData().catch(() => {});
  }
}

export async function checkProxy(p: ProxySecret){
  const result = await echoThrough(p);
  await api('POST', `/proxies/${p.id}/check`, result);
  return result;
}

export async function checkById(id: string): Promise<CheckResult> {
  const r = await api<ProxySecret>('GET', `/proxies/${id}/credentials`);
  if (!r.ok) return { ok: false, ms: null, ip: null, geo: null, error: r.error.code };
  return checkProxy(r.data);
}

// Details typed into the proxy form, checked before they are saved; nothing is recorded. `passwordOf` uses a saved
// proxy's password, which the form never sees.
export async function tryProxy({ type, host, port, username, password, passwordOf }: ProxyDraft): Promise<CheckResult> {
  if (passwordOf){
    const r = await api<ProxySecret>('GET', `/proxies/${passwordOf}/credentials`);
    if (!r.ok) return { ok: false, ms: null, ip: null, geo: null, error: r.error.code };
    password = r.data.password;
  }
  return echoThrough({ type, host: String(host), port: Number(port), username, password });
}

// Background health check of every proxy in a workspace, two at a time.
export async function checkWorkspace(workspaceId: string){
  const r = await api<{ proxies: { id: string }[] }>('GET', `/workspaces/${workspaceId}/proxies`);
  if (!r.ok) return;
  const queue = [...r.data.proxies];
  await Promise.all([0, 1].map(async () => { for (let p = queue.shift(); p; p = queue.shift()) await checkById(p.id); }));
}
