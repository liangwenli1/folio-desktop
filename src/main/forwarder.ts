// Tunnels through a profile's upstream proxy. The local forwarder: the browser connects to 127.0.0.1 without
// credentials, and this forwards to the upstream and handles its authentication (Chromium cannot authenticate SOCKS5
// itself). The probe: what a proxy check sees through the same tunnels, an IP echo's answer or the step that failed.
// Pure Node, no Electron, so it is unit-tested directly.
import http, { type IncomingHttpHeaders } from 'node:http';
import net, { type Socket } from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
import { SocksClient } from 'socks';

export interface Upstream { type: 'http' | 'https' | 'socks5'; host: string; port: number; username: string | null; password: string | null }
export interface Forwarder { port: number; close(): Promise<void> }

const TIMEOUT = 10_000;
const basic = (u: Upstream) => (u.username ? `Basic ${Buffer.from(`${u.username}:${u.password ?? ''}`).toString('base64')}` : null);

// Why a tunnel wasn't opened: the proxy can't be reached or didn't take the connection in time, turned the
// credentials down, didn't answer in the protocol chosen, or wouldn't (or couldn't, in time) reach the destination.
export type TunnelFailure = 'proxy_unreachable' | 'proxy_timeout' | 'proxy_auth' | 'proxy_protocol' | 'target_refused' | 'target_timeout';
export class TunnelError extends Error { constructor(readonly reason: TunnelFailure){ super(reason); } }

function connectTo(host: string, port: number, secure: boolean, timeout = TIMEOUT): Promise<Socket> {
  const sock = secure ? tls.connect({ host, port, servername: net.isIP(host) ? undefined : host }) : net.connect(port, host);
  sock.setTimeout(timeout, () => sock.destroy(new Error('timeout')));
  return once(sock, secure ? 'secureConnect' : 'connect').then(() => { sock.setTimeout(0); return sock; });
}

// The upstream itself: refused or unknown, silent, or (an HTTPS proxy) no TLS where TLS was expected.
async function reach(up: Upstream, timeout = TIMEOUT){
  try { return await connectTo(up.host, up.port, up.type === 'https', timeout); }
  catch (e){
    const code = (e as NodeJS.ErrnoException).code ?? '';
    throw new TunnelError((e as Error).message === 'timeout' ? 'proxy_timeout' : code.startsWith('ERR_SSL') || code === 'EPROTO' ? 'proxy_protocol' : 'proxy_unreachable');
  }
}

// Reads the proxy's reply to CONNECT; anything after the header belongs to the tunnel. A proxy that answers only after
// reaching the destination may stay silent a while: past the time limit, the destination is too slow.
// (Not `for await`: leaving that loop early destroys the socket.)
function readConnectReply(sock: Socket, timeout: number){
  return new Promise<void>((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const done = (err?: TunnelError) => {
      clearTimeout(timer); sock.off('data', onData); sock.off('error', onError); sock.off('close', onClose);
      if (err){ sock.destroy(); reject(err); } else resolve();
    };
    const timer = setTimeout(() => done(new TunnelError('target_timeout')), timeout);
    const onError = () => done(new TunnelError('proxy_protocol'));
    const onClose = () => done(new TunnelError('proxy_protocol'));
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      sock.pause();
      const head = buf.subarray(0, end).toString();
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1];
      if (!status) return done(new TunnelError('proxy_protocol'));
      if (status === '407') return done(new TunnelError('proxy_auth'));
      if (status !== '200') return done(new TunnelError('target_refused'));
      const rest = buf.subarray(end + 4);
      if (rest.length) sock.unshift(rest);
      done();
    };
    sock.on('data', onData); sock.once('error', onError); sock.once('close', onClose);
  });
}

// The SOCKS library's failures: the credentials, or a destination the proxy turned down or couldn't reach. Once the
// proxy has answered the greeting, silence or hanging up is about the destination too; before that, and anything
// else, it isn't SOCKS5 talking (or this computer isn't one it serves).
function socksFailure(message: string, heard: number): TunnelFailure {
  if (/Authentication failed|no accepted authentication/.test(message)) return 'proxy_auth';
  if (message.startsWith('Socks5 proxy rejected connection')) return 'target_refused';
  if (heard > 0 && message === 'Proxy connection timed out') return 'target_timeout';
  if (heard > 0 && message === 'Socket closed') return 'target_refused';
  return 'proxy_protocol';
}

// A raw TCP stream to host:port through the upstream (or directly, for profiles without a proxy). `timeout` bounds each
// step: reaching the proxy, and its answer.
export async function openTunnel(up: Upstream | null, host: string, port: number, timeout = TIMEOUT): Promise<Socket> {
  if (!up) return connectTo(host, port, false, timeout);
  const sock = await reach(up, timeout);
  if (up.type === 'socks5'){
    try {
      const { socket } = await SocksClient.createConnection({
        proxy: { host: up.host, port: up.port, type: 5, userId: up.username ?? undefined, password: up.password ?? undefined },
        destination: { host, port }, command: 'connect', timeout, existing_socket: sock
      });
      return socket;
    } catch (e){
      sock.destroy();
      throw new TunnelError(socksFailure((e as Error).message, sock.bytesRead));
    }
  }
  const auth = basic(up);
  sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ''}\r\n`);
  await readConnectReply(sock, timeout);
  return sock;
}

const HOP = ['proxy-authorization', 'proxy-connection', 'connection', 'keep-alive'];
const clean = (h: IncomingHttpHeaders) => Object.fromEntries(Object.entries(h).filter(([k]) => !HOP.includes(k)));

export function startForwarder(up: Upstream | null): Promise<Forwarder> {
  const sockets = new Set<Socket>();
  const track = (s: Socket) => { sockets.add(s); s.once('close', () => sockets.delete(s)); return s; };

  // Plain-HTTP requests arrive in absolute form. HTTP(S) upstreams get them as-is; SOCKS goes through a tunnel.
  const server = http.createServer(async (req, res) => {
    const fail = () => { if (!res.headersSent) res.writeHead(502); res.end(); };
    try {
      const target = new URL(req.url ?? '');
      const viaHttp = up && up.type !== 'socks5';
      const sock = track(viaHttp ? await reach(up) : await openTunnel(up, target.hostname, Number(target.port || 80)));
      const auth = viaHttp ? basic(up) : null;
      const out = http.request({
        method: req.method, path: viaHttp ? target.href : target.pathname + target.search,
        headers: { ...clean(req.headers), ...(auth ? { 'proxy-authorization': auth } : {}) },
        createConnection: () => sock
      }, r => {
        // A 407 from the upstream must not reach the browser, which would ask the user for proxy credentials.
        if (r.statusCode === 407){ r.resume(); return fail(); }
        res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res);
      });
      out.on('error', fail);
      req.pipe(out);
    } catch { fail(); }
  });

  server.on('connect', async (req, client: Socket, head: Buffer) => {
    track(client);
    client.on('error', () => client.destroy());
    const i = (req.url ?? '').lastIndexOf(':');
    try {
      const remote = track(await openTunnel(up, (req.url ?? '').slice(0, i).replace(/^\[|\]$/g, ''), Number((req.url ?? '').slice(i + 1))));
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) remote.write(head);
      remote.on('error', () => client.destroy());
      client.on('error', () => remote.destroy());
      remote.pipe(client);
      client.pipe(remote);
    } catch {
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      port: (server.address() as net.AddressInfo).port,
      close: () => new Promise<void>(done => { sockets.forEach(s => s.destroy()); server.close(() => done()); })
    }));
  });
}

// What a check of the upstream finds: the exit IP an echo reports through it and how long that took, or the step that
// failed. An HTTPS echo is reached through a tunnel, as a profile's secure pages are; a plain-HTTP one (tests, the demo)
// is asked the way a browser asks an HTTP proxy for a plain page, in absolute form. The echo answers like Cloudflare's
// trace (`ip=…`) or ipify (`{"ip":"…"}`).
export type ProbeFailure = TunnelFailure | 'tls' | 'no_ip' | `http_${number}`;
export type Probe = { ok: true; ip: string; ms: number } | { ok: false; error: ProbeFailure };

export async function probe(up: Upstream | null, echo: URL, timeout = 15_000): Promise<Probe> {
  const started = Date.now();
  const left = () => Math.max(1, timeout - (Date.now() - started));
  // Each step of the tunnel ends a little before the check does, so a step's own failure is the one reported.
  const step = () => Math.min(TIMEOUT, Math.max(1, left() - 200));
  const secure = echo.protocol === 'https:';
  const absolute = !secure && !!up && up.type !== 'socks5';
  let sock: Socket | null = null;
  try {
    sock = await within(absolute ? reach(up, step()) : openTunnel(up, echo.hostname, Number(echo.port || (secure ? 443 : 80)), step()), left(), 'proxy_timeout');
    if (secure) sock = await within(handshake(sock, echo.hostname), left(), 'target_timeout');
    const auth = absolute ? basic(up) : null;
    const { status, body } = await within(get(sock, absolute ? echo.href : echo.pathname + echo.search, echo.host, auth), left(), 'target_timeout');
    if (status === 407 && absolute) return { ok: false, error: 'proxy_auth' };
    if (status !== 200) return { ok: false, error: absolute && status >= 502 && status <= 504 ? 'target_refused' : `http_${status}` };
    const ip = /(?:^|\n)ip=(\S+)/.exec(body)?.[1] ?? /"ip"\s*:\s*"([^"]+)"/.exec(body)?.[1];
    return ip && net.isIP(ip) ? { ok: true, ip, ms: Date.now() - started } : { ok: false, error: 'no_ip' };
  } catch (e){
    return { ok: false, error: e instanceof TunnelError ? e.reason : (e as Error).message === 'tls' ? 'tls' : absolute ? 'proxy_protocol' : 'target_refused' };
  } finally { sock?.destroy(); }
}

// A step that must finish within what is left of the check; one that finishes late has its socket closed.
function within<T extends Socket | object>(step: Promise<T>, ms: number, late: TunnelFailure): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    step.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new TunnelError(late)); void step.then(s => { if (s instanceof net.Socket) s.destroy(); }, () => {}); }, ms); })
  ]);
}

function handshake(sock: Socket, servername: string){
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const s = tls.connect({ socket: sock, servername });
    s.once('secureConnect', () => resolve(s));
    s.once('error', () => { s.destroy(); reject(new Error('tls')); });
  });
}

function get(sock: Socket, path: string, host: string, auth: string | null){
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ path, headers: { host, 'user-agent': 'Folio', accept: '*/*', connection: 'close', ...(auth ? { 'proxy-authorization': auth } : {}) }, createConnection: () => sock }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { if (body.length < 65_536) body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}
