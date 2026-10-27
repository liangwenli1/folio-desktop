// Checks a proxy the way a profile will use it: through the forwarder's tunnels to a public IP echo, which reports the
// exit IP; the server then places it (DB-IP). A failure names the step that failed. The result is stored on the server
// for the team.
import { api } from './api';
import { probe, type ProbeFailure, type Upstream } from './forwarder';
import type { CheckResult, Geo, ProxyDraft } from '../shared/bridge';

export interface ProxySecret extends Upstream { id: string }

// Cloudflare's trace, then ipify when the first can't be reached through the proxy. Tests and the demo point the check
// at their own echo (FOLIO_ECHO_URLS, comma-separated).
const ECHOES = (process.env.FOLIO_ECHO_URLS ?? 'https://www.cloudflare.com/cdn-cgi/trace,https://api.ipify.org/?format=json').split(',').map(u => new URL(u));
const TIMEOUT = 15_000;
// The proxy's own failures: another echo would fare no better.
const OWN = new Set<ProbeFailure>(['proxy_unreachable', 'proxy_timeout', 'proxy_auth', 'proxy_protocol']);

export async function echoThrough(up: Upstream | null): Promise<CheckResult> {
  const started = Date.now();
  let error: ProbeFailure = 'proxy_timeout';
  for (const echo of ECHOES){
    const left = TIMEOUT - (Date.now() - started);
    if (left <= 0) break;
    const r = await probe(up, echo, left);
    if (r.ok){
      const at = await api<{ geo: Geo | null }>('GET', `/net/locate?ip=${encodeURIComponent(r.ip)}`);
      return { ok: true, ms: r.ms, ip: r.ip, geo: at.ok ? at.data.geo : null, error: null };
    }
    error = r.error;
    if (OWN.has(error)) break;
  }
  return { ok: false, ms: null, ip: null, geo: null, error };
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
