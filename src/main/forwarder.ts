// Local proxy for one browser profile. The browser connects to 127.0.0.1 without credentials; this forwards
// to the profile's upstream proxy and handles its authentication (Chromium cannot authenticate SOCKS5 itself).
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

function connectTo(host: string, port: number, secure: boolean): Promise<Socket> {
  const sock = secure ? tls.connect({ host, port, servername: net.isIP(host) ? undefined : host }) : net.connect(port, host);
  sock.setTimeout(TIMEOUT, () => sock.destroy(new Error('timeout')));
  return once(sock, secure ? 'secureConnect' : 'connect').then(() => { sock.setTimeout(0); return sock; });
}

// Reads the proxy's reply to CONNECT; anything after the header belongs to the tunnel.
// (Not `for await`: leaving that loop early destroys the socket.)
function readConnectReply(sock: Socket){
  return new Promise<void>((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const done = (err?: Error) => {
      sock.off('data', onData); sock.off('error', done); sock.off('close', onClose);
      if (err){ sock.destroy(); reject(err); } else resolve();
    };
    const onClose = () => done(new Error('upstream closed'));
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      sock.pause();
      const status = Number(buf.subarray(0, end).toString().split(' ')[1]);
      if (status !== 200) return done(new Error(`upstream refused (${status})`));
      const rest = buf.subarray(end + 4);
      if (rest.length) sock.unshift(rest);
      done();
    };
    sock.on('data', onData); sock.once('error', done); sock.once('close', onClose);
  });
}

// A raw TCP stream to host:port through the upstream (or directly, for profiles without a proxy).
export async function openTunnel(up: Upstream | null, host: string, port: number): Promise<Socket> {
  if (!up) return connectTo(host, port, false);
  if (up.type === 'socks5'){
    const { socket } = await SocksClient.createConnection({
      proxy: { host: up.host, port: up.port, type: 5, userId: up.username ?? undefined, password: up.password ?? undefined },
      destination: { host, port }, command: 'connect', timeout: TIMEOUT
    });
    return socket;
  }
  const sock = await connectTo(up.host, up.port, up.type === 'https');
  const auth = basic(up);
  sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ''}\r\n`);
  await readConnectReply(sock);
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
      const sock = track(viaHttp ? await connectTo(up.host, up.port, up.type === 'https') : await openTunnel(up, target.hostname, Number(target.port || 80)));
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
