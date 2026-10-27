import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { TunnelError, openTunnel, probe, startForwarder, type Upstream } from '../../src/main/forwarder';
import { startHttpProxy, startSocks5, startTarget } from '../fixtures/proxies';

let target: Awaited<ReturnType<typeof startTarget>>;
beforeAll(async () => { target = await startTarget(); });
afterAll(async () => { await target.close(); });

// A plain-HTTP request through the forwarder, the way a browser sends it.
function viaProxy(port: number, url: string){
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, headers: { host: new URL(url).host } }, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject); req.end();
  });
}

// A CONNECT tunnel through the forwarder, as for HTTPS.
function tunnel(port: number, host: string, targetPort: number){
  return new Promise<string>((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`CONNECT ${host}:${targetPort} HTTP/1.1\r\nHost: ${host}:${targetPort}\r\n\r\n`));
    let data = '';
    s.on('data', c => {
      data += c;
      if (data.includes('200 Connection Established') && !data.includes('hello')) s.write(`GET /tunnel HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
      if (data.includes('502')) { s.destroy(); resolve(data); }
    });
    s.on('end', () => resolve(data)); s.on('error', reject);
  });
}

describe.each([
  ['SOCKS5', startSocks5, 'socks5'],
  ['HTTP', startHttpProxy, 'http']
] as const)('forwarding through a %s proxy with a password', (_name, start, type) => {
  it('passes plain requests and tunnels, and records them upstream', async () => {
    const proxy = await start('alice', 's3cret');
    const up: Upstream = { type, host: '127.0.0.1', port: proxy.port, username: 'alice', password: 's3cret' };
    const fwd = await startForwarder(up);
    const plain = await viaProxy(fwd.port, `http://127.0.0.1:${target.port}/plain?x=1`);
    expect(plain).toEqual({ status: 200, body: 'hello GET /plain?x=1' });
    expect(await tunnel(fwd.port, '127.0.0.1', target.port)).toContain('hello GET /tunnel');
    expect(proxy.seen.length).toBe(2);
    await fwd.close(); await proxy.close();
  });

  it('answers 502 when the password is wrong', async () => {
    const proxy = await start('alice', 's3cret');
    const fwd = await startForwarder({ type, host: '127.0.0.1', port: proxy.port, username: 'alice', password: 'wrong' });
    expect((await viaProxy(fwd.port, `http://127.0.0.1:${target.port}/`)).status).toBe(502);
    expect(await tunnel(fwd.port, '127.0.0.1', target.port)).toContain('502');
    await fwd.close(); await proxy.close();
  });
});

describe('profiles without a proxy', () => {
  it('connect directly', async () => {
    const fwd = await startForwarder(null);
    expect((await viaProxy(fwd.port, `http://127.0.0.1:${target.port}/direct`)).body).toBe('hello GET /direct');
    await fwd.close();
  });
});

// An echo like Cloudflare's trace: the caller's address. `/broken` answers 500 and `/blank` no address at all.
async function startEcho(){
  const server = http.createServer((req, res) => {
    if (req.url === '/broken'){ res.writeHead(500); return res.end(); }
    res.end(req.url === '/blank' ? 'ts=1\n' : `ip=${(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')}\n`);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { url: (path = '/') => new URL(`http://127.0.0.1:${(server.address() as net.AddressInfo).port}${path}`), close: () => new Promise<void>(r => server.close(() => r())) };
}
// Accepts connections and never says a word.
async function startSilent(){
  const sockets = new Set<net.Socket>();
  const server = net.createServer(s => { sockets.add(s); s.on('error', () => {}); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { port: (server.address() as net.AddressInfo).port, close: () => new Promise<void>(r => { sockets.forEach(s => s.destroy()); server.close(() => r()); }) };
}
const closedPort = async () => { const s = net.createServer(); await new Promise<void>(r => s.listen(0, '127.0.0.1', () => r())); const { port } = s.address() as net.AddressInfo; await new Promise(r => s.close(r)); return port; };
const reason = (p: Promise<unknown>) => p.then(() => 'opened', (e: unknown) => (e instanceof TunnelError ? e.reason : String(e)));

describe('checking a proxy', () => {
  let echo: Awaited<ReturnType<typeof startEcho>>;
  beforeAll(async () => { echo = await startEcho(); });
  afterAll(async () => { await echo.close(); });

  it.each([['SOCKS5', startSocks5, 'socks5'], ['HTTP', startHttpProxy, 'http']] as const)('through %s, reports the exit IP, or why it was turned away', async (_name, start, type) => {
    const proxy = await start('alice', 's3cret');
    const up = (password: string): Upstream => ({ type, host: '127.0.0.1', port: proxy.port, username: 'alice', password });
    const ok = await probe(up('s3cret'), echo.url());
    expect(ok).toMatchObject({ ok: true, ip: '127.0.0.1' });
    expect(await probe(up('wrong'), echo.url())).toEqual({ ok: false, error: 'proxy_auth' });
    expect(await probe(up('s3cret'), echo.url('/broken'))).toEqual({ ok: false, error: 'http_500' });
    expect(await probe(up('s3cret'), echo.url('/blank'))).toEqual({ ok: false, error: 'no_ip' });
    // A tunnel through an HTTP proxy (as for an HTTPS echo) says the same about the password.
    expect(await reason(openTunnel(up('wrong'), '127.0.0.1', target.port))).toBe('proxy_auth');
    await proxy.close();
  });

  it('tells a proxy it cannot reach from one that is not what was chosen, or that cannot reach the echo', async () => {
    const socks = await startSocks5('alice', 's3cret'), web = await startHttpProxy('alice', 's3cret'), silent = await startSilent();
    const up = (type: Upstream['type'], port: number, host = '127.0.0.1'): Upstream => ({ type, host, port, username: 'alice', password: 's3cret' });
    expect(await probe(up('socks5', await closedPort()), echo.url())).toEqual({ ok: false, error: 'proxy_unreachable' });
    expect(await probe(up('socks5', 1080, 'no-such-host.invalid'), echo.url())).toEqual({ ok: false, error: 'proxy_unreachable' });
    // SOCKS5 chosen for an HTTP proxy and the other way round; a proxy that never answers the greeting.
    expect(await probe(up('socks5', web.port), echo.url())).toEqual({ ok: false, error: 'proxy_protocol' });
    expect(await reason(openTunnel(up('http', socks.port), '127.0.0.1', target.port))).toBe('proxy_protocol');
    expect(await probe(up('socks5', silent.port), echo.url(), 1500)).toEqual({ ok: false, error: 'proxy_protocol' });
    // Through a proxy that answered, a destination that can't be reached is the destination's fault.
    expect(await probe(up('socks5', socks.port), new URL(`http://127.0.0.1:${await closedPort()}/`))).toEqual({ ok: false, error: 'target_refused' });
    await socks.close(); await web.close(); await silent.close();
  });
});
