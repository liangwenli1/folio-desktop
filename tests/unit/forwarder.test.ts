import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { startForwarder, type Upstream } from '../../src/main/forwarder';
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
