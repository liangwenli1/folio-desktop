// The world the demo is recorded in, all on this machine: proxies that stand for exits around the world and the example
// sites the profiles browse. Each proxy answers Folio's exit check (/net/echo) itself, after a delay like a real line's,
// with its own exit IP (documentation addresses) and place; plain-HTTP pages for *.example hosts come from here. One
// proxy never answers, for the profile that fails to open.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const geo = (country: string, countryName: string, region: string, city: string, lat: number, lon: number, timezone: string, locale: string) =>
  ({ country, countryName, region, city, lat, lon, timezone, locale });
export const EXITS = [
  { key: 'us-west', ip: '203.0.113.24', ms: 82, geo: geo('US', 'United States', 'Washington', 'Seattle', 47.61, -122.33, 'America/Los_Angeles', 'en-US') },
  { key: 'us-east', ip: '203.0.113.71', ms: 136, geo: geo('US', 'United States', 'New York', 'New York', 40.71, -74.01, 'America/New_York', 'en-US') },
  { key: 'uk', ip: '198.51.100.16', ms: 118, geo: geo('GB', 'United Kingdom', 'England', 'London', 51.51, -0.13, 'Europe/London', 'en-GB') },
  { key: 'jp', ip: '198.51.100.92', ms: 204, geo: geo('JP', 'Japan', 'Tokyo', 'Tokyo', 35.68, 139.69, 'Asia/Tokyo', 'ja-JP') },
  { key: 'de', ip: '192.0.2.45', ms: 97, geo: geo('DE', 'Germany', 'Hesse', 'Frankfurt am Main', 50.11, 8.68, 'Europe/Berlin', 'de-DE') },
  { key: 'sg', ip: '192.0.2.130', ms: 171, geo: geo('SG', 'Singapore', 'Singapore', 'Singapore', 1.29, 103.85, 'Asia/Singapore', 'en-SG') },
  { key: 'down', ip: '', ms: 0, geo: null }
] as const;
export type ExitKey = typeof EXITS[number]['key'];
// The proxies' host names, each pointing at this machine (the capture's container maps them).
export const hostOf = (key: ExitKey) => `${key}.proxy.example`;

// Each site remembers the visitor (a cookie and local storage), like a signed-in site.
const page = (title: string, body: string, accent: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<script>localStorage.setItem('visitor', 'demo')</script><style>
  *{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;color:#1d1c2b;background:#f6f6f8}
  header{display:flex;align-items:center;gap:18px;padding:14px 28px;background:#fff;border-bottom:1px solid #e6e6ec}
  .logo{font-weight:800;font-size:19px;color:${accent}}nav a{margin-right:16px;color:#55546a;text-decoration:none}
  main{max-width:1080px;margin:0 auto;padding:28px}h1{font-size:26px;margin:0 0 18px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.card{background:#fff;border:1px solid #e6e6ec;border-radius:12px;padding:14px}
  .ph{height:120px;border-radius:8px;margin-bottom:10px}.price{font-weight:700}.btn{display:inline-block;margin-top:8px;padding:7px 14px;border-radius:8px;background:${accent};color:#fff;border:0;font:inherit;cursor:pointer}
  .row{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #eee}.muted{color:#77768a}.kpi{font-size:24px;font-weight:700}
</style></head><body>${body}</body></html>`;
const SHADES = ['#f3c5a8', '#b9d7f0', '#cfe8c6', '#f2d7e6', '#e9e3c9', '#cdd0f2', '#f6d0c4', '#c8ecea'];
export const SITES: Record<string, { title: string; html: string }> = {
  'shop.example': { title: 'Everyday Goods – shop.example', html: page('Everyday Goods – shop.example', `
    <header><span class="logo">Everyday Goods</span><nav><a href="#">New</a><a href="#">Home</a><a href="#">Kitchen</a><a href="#">Outdoor</a></nav></header>
    <main><h1>New this week</h1><div class="grid">${SHADES.map((c, i) => `<div class="card"><div class="ph" style="background:${c}"></div>
      <div>${['Linen throw', 'Ceramic mug', 'Desk lamp', 'Canvas tote', 'Oak tray', 'Wool socks', 'Plant pot', 'Glass jar'][i]}</div>
      <div class="price">$${[38, 14, 46, 22, 29, 12, 18, 9][i]}.00</div><button class="btn" id="add${i}">Add to cart</button></div>`).join('')}</div></main>`, '#c2410c') },
  'mail.example': { title: 'Inbox (3) – mail.example', html: page('Inbox (3) – mail.example', `
    <header><span class="logo">Mail</span><nav><a href="#">Inbox</a><a href="#">Sent</a><a href="#">Drafts</a></nav></header>
    <main><h1>Inbox</h1>${['Your order has shipped', 'Weekly sales summary', 'New review on your listing', 'Payout scheduled', 'Return request #2291'].map((s, i) =>
      `<div class="row"><b style="width:180px">${['Orders', 'Reports', 'Reviews', 'Payments', 'Support'][i]}</b><span>${s}</span><span class="muted" style="margin-left:auto">${9 + i}:${(i * 13 + 5) % 60}</span></div>`).join('')}</main>`, '#2563eb') },
  'ads.example': { title: 'Campaigns – ads.example', html: page('Campaigns – ads.example', `
    <header><span class="logo">Ads</span><nav><a href="#">Campaigns</a><a href="#">Audiences</a><a href="#">Billing</a></nav></header>
    <main><h1>Campaigns</h1><div class="grid">${[['Spend today', '$412'], ['Clicks', '3,108'], ['Orders', '96'], ['Return on spend', '3.4×']].map(([k, v]) =>
      `<div class="card"><div class="muted">${k}</div><div class="kpi">${v}</div></div>`).join('')}</div></main>`, '#0f766e') }
};

// Starts the proxies on fixed ports from `base`, in the order of EXITS.
export async function startExits(base: number){
  const servers = await Promise.all(EXITS.map((x, i) => new Promise<http.Server>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (x.key === 'down') return; // never answers
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/net/echo'){
        return void setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ip: x.ip, geo: x.geo })); }, x.ms);
      }
      const site = SITES[url.hostname];
      res.writeHead(site ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', ...(site ? { 'set-cookie': 'session=demo; Path=/; Max-Age=2592000' } : {}) });
      res.end(site?.html ?? '<!doctype html><title>Not found</title>');
    });
    // Secure sites can't be shown from here: the browser is told the way is closed.
    server.on('connect', (_req, socket) => socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
    server.once('error', reject).listen(base + i, '0.0.0.0', () => resolve(server));
  })));
  return { ports: servers.map(s => (s.address() as AddressInfo).port), close: () => Promise.all(servers.map(s => new Promise(r => s.close(r)))) };
}
