// Small upstream proxies and a target server for tests: an HTTP proxy and a SOCKS5 proxy, both with
// username/password auth, that record what they forwarded.
import http from 'node:http';
import net, { type AddressInfo, type Socket } from 'node:net';

export interface Upstream { port: number; seen: string[]; close(): Promise<void> }
const listen = (server: net.Server) => new Promise<number>(r => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)));
const closer = (server: net.Server, sockets: Set<Socket>) => () => new Promise<void>(r => { sockets.forEach(s => s.destroy()); server.close(() => r()); });

export async function startTarget(){
  const server = http.createServer((req, res) => res.end(`hello ${req.method} ${req.url}`));
  const port = await listen(server);
  return { port, close: () => new Promise<void>(r => server.close(() => r())) };
}

export async function startHttpProxy(user: string, pass: string): Promise<Upstream> {
  const seen: string[] = [], sockets = new Set<Socket>();
  const want = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  const server = http.createServer((req, res) => {
    if (req.headers['proxy-authorization'] !== want){ res.writeHead(407); return res.end(); }
    const u = new URL(req.url!);
    seen.push(`GET ${u.host}`);
    const out = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method }, r => { res.writeHead(r.statusCode!, r.headers); r.pipe(res); });
    req.pipe(out);
  });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.on('connect', (req, client: Socket) => {
    if (req.headers['proxy-authorization'] !== want){ client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
    seen.push(`CONNECT ${req.url}`);
    const [h, p] = req.url!.split(':');
    const remote = net.connect(Number(p), h, () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); remote.pipe(client); client.pipe(remote); });
    remote.on('error', () => client.destroy());
  });
  return { port: await listen(server), seen, close: closer(server, sockets) };
}

// SOCKS5 with RFC 1929 username/password, CONNECT only.
export async function startSocks5(user: string, pass: string): Promise<Upstream> {
  const seen: string[] = [], sockets = new Set<Socket>();
  const server = net.createServer(client => {
    sockets.add(client); client.on('close', () => sockets.delete(client)); client.on('error', () => {});
    let stage = 0, buf = Buffer.alloc(0);
    client.on('data', function onData(chunk){
      buf = Buffer.concat([buf, chunk]);
      if (stage === 0 && buf.length >= 2 && buf.length >= 2 + buf[1]){
        buf = buf.subarray(2 + buf[1]); stage = 1; client.write(Buffer.from([5, 2]));
      }
      if (stage === 1 && buf.length >= 2){
        const ul = buf[1], pl = buf[2 + ul];
        if (buf.length < 3 + ul + pl) return;
        const ok = buf.subarray(2, 2 + ul).toString() === user && buf.subarray(3 + ul, 3 + ul + pl).toString() === pass;
        buf = buf.subarray(3 + ul + pl);
        client.write(Buffer.from([1, ok ? 0 : 1]));
        if (!ok) return void client.end();
        stage = 2;
      }
      if (stage === 2 && buf.length >= 7){
        let host: string, i: number;
        if (buf[3] === 1){ host = Array.from(buf.subarray(4, 8)).join('.'); i = 8; }
        else if (buf[3] === 3){ host = buf.subarray(5, 5 + buf[4]).toString(); i = 5 + buf[4]; }
        else return void client.end();
        if (buf.length < i + 2) return;
        const port = buf.readUInt16BE(i);
        stage = 3; client.off('data', onData);
        seen.push(`${host}:${port}`);
        const remote = net.connect(port, host, () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          const rest = buf.subarray(i + 2);
          if (rest.length) remote.write(rest);
          remote.pipe(client); client.pipe(remote);
        });
        remote.on('error', () => client.destroy());
      }
    });
  });
  return { port: await listen(server), seen, close: closer(server, sockets) };
}
