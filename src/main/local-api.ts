// The local API: an HTTP server on this computer only (127.0.0.1), off until turned on, for scripts that open
// profiles and take them over with their own automation tools. Requests carry a token made in the workbench;
// tokens live on this computer (only their sha256 is kept), belong to the account and workspace they were made in,
// and act with that person's access. Free and Studio allow 60 requests a minute, Company is unthrottled; what a
// script then sends to the browser over CDP or WebDriver BiDi does not pass through here.
import { app } from 'electron';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { me } from './account';
import { api } from './api';
import { debugOf, isRunning, open, stop } from './launcher';
import { runTask } from './runs';
import type { ApiCall, ApiToken, LocalApi } from '../shared/bridge';

interface Stored extends ApiToken { userId: string; hash: string }
interface Settings { enabled: boolean; port: number; tokens: Stored[] }
interface Listed { id: string; number: number; name: string; kernel: 'chromium' | 'firefox' }

const DEFAULT_PORT = 47210, LIMIT = 60, WINDOW_MS = 60_000, PLAN_MS = 60_000;
const file = () => join(app.getPath('userData'), 'local-api.json');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

let settings: Settings = { enabled: false, port: DEFAULT_PORT, tokens: [] };
let server: Server | null = null, error: string | null = null;
const hits: number[] = [];
// The last 50 requests, newest first, for the page; it hears of each one.
const calls: ApiCall[] = [];
let heard: () => void = () => {};
export const onLocalApi = (fn: typeof heard) => { heard = fn; };
const plans = new Map<string, { company: boolean; at: number }>();

export async function loadLocalApi(){
  settings = { ...settings, ...JSON.parse(await readFile(file(), 'utf8').catch(() => '{}')) };
  if (settings.enabled) await listen();
}
const save = () => writeFile(file(), JSON.stringify(settings, null, 2));

export async function localApi(): Promise<LocalApi> {
  const who = await me();
  return {
    enabled: settings.enabled, port: settings.port, listening: !!server, error,
    tokens: settings.tokens.filter(t => t.userId === who?.id).map(({ userId: _u, hash: _h, ...t }) => t), calls
  };
}

export async function setLocalApi(change: { enabled?: boolean; port?: number }){
  if (change.port !== undefined && Number.isInteger(change.port) && change.port >= 1024 && change.port <= 65535) settings.port = change.port;
  if (change.enabled !== undefined) settings.enabled = !!change.enabled;
  await save();
  if (settings.enabled) await listen(); else await close();
  return localApi();
}

export async function createApiToken(name: string, workspaceId: string){
  const who = await me();
  if (!who) throw new Error('unauthenticated');
  const token = `folio_${randomBytes(24).toString('base64url')}`;
  settings.tokens.push({ id: randomUUID(), name: name.trim().slice(0, 60) || 'Token', workspaceId, userId: who.id, hash: sha256(token), createdAt: new Date().toISOString(), lastUsedAt: null });
  await save();
  return { token, api: await localApi() };
}

export async function revokeApiToken(id: string){
  settings.tokens = settings.tokens.filter(t => t.id !== id);
  await save();
  return localApi();
}

async function close(){
  const s = server;
  server = null;
  if (s) await new Promise<void>(r => s.close(() => r()));
}
async function listen(){
  await close();
  error = null;
  const s = createServer((req, res) => {
    res.on('finish', () => {
      const raw = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      calls.unshift({ at: Date.now(), method: req.method ?? '', path: (req.url ?? '').split('?')[0], status: res.statusCode, token: (raw && settings.tokens.find(t => t.hash === sha256(raw))?.name) || null });
      calls.splice(50);
      heard();
    });
    void handle(req, res).catch(() => reply(res, 500, { error: { code: 'internal', message: 'Something went wrong' } }));
  });
  await new Promise<void>(resolve => {
    s.once('error', (e: NodeJS.ErrnoException) => { error = e.code === 'EADDRINUSE' ? 'port_in_use' : 'listen_failed'; resolve(); });
    s.listen(settings.port, '127.0.0.1', () => { server = s; resolve(); });
  });
}

function reply(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}){
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, code: string, message: string, headers?: Record<string, string>) => reply(res, status, { error: { code, message } }, headers);

// Company is unthrottled; the plan is looked up at most once a minute.
async function unthrottled(workspaceId: string){
  const known = plans.get(workspaceId);
  if (known && Date.now() - known.at < PLAN_MS) return known.company;
  const r = await api<{ subscription: { plan: string } }>('GET', `/workspaces/${workspaceId}`);
  const company = r.ok && r.data.subscription.plan === 'company';
  plans.set(workspaceId, { company, at: Date.now() });
  return company;
}

// Launch failures as HTTP answers.
const LAUNCH: Record<string, number> = { locked: 409, in_trash: 409, not_found: 404, kernel_missing: 409, proxy_down: 502, starting: 409 };

async function handle(req: IncomingMessage, res: ServerResponse){
  const raw = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  const token = raw ? settings.tokens.find(t => t.hash === sha256(raw)) : undefined;
  const who = await me();
  if (!token || !who || token.userId !== who.id) return fail(res, 401, 'unauthorized', 'Send a token made in Folio (API & scripts) as Authorization: Bearer <token>');
  if (!(await unthrottled(token.workspaceId))){
    const now = Date.now();
    while (hits.length && now - hits[0] >= WINDOW_MS) hits.shift();
    if (hits.length >= LIMIT){
      const retry = Math.max(1, Math.ceil((hits[0] + WINDOW_MS - now) / 1000));
      return reply(res, 429, { error: { code: 'rate_limited', message: `This plan allows ${LIMIT} requests a minute`, retryAfter: retry } }, { 'retry-after': String(retry) });
    }
    hits.push(now);
  }
  if (!token.lastUsedAt || Date.now() - Date.parse(token.lastUsedAt) > 60_000){ token.lastUsedAt = new Date().toISOString(); void save(); }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1);
  const route = `${req.method} /${parts.slice(0, 3).join('/')}${parts.length > 3 ? '/:ref' : ''}${parts[4] ? `/${parts[4]}` : ''}`;
  const ws = token.workspaceId, ref = parts[3];

  const profiles = async () => {
    const r = await api<{ profiles: Listed[] }>('GET', `/workspaces/${ws}/profiles`);
    return r.ok ? r.data.profiles : [];
  };
  const view = (p: Listed) => ({ id: p.id, number: p.number, name: p.name, kernel: p.kernel, running: isRunning(p.id), ...(debugOf(p.id) ?? {}) });
  // A profile by its number (42, 0042 or #0042) or id, among those the token's person sees.
  const find = async () => {
    const list = await profiles();
    const n = /^#?\d+$/.test(decodeURIComponent(ref ?? '')) ? Number(decodeURIComponent(ref).replace('#', '')) : null;
    return list.find(p => (n !== null ? p.number === n : p.id === ref)) ?? null;
  };

  switch (route){
    case 'GET /api/v1/profiles': return reply(res, 200, { profiles: (await profiles()).map(view) });
    case 'GET /api/v1/profiles/:ref': {
      const p = await find();
      return p ? reply(res, 200, view(p)) : fail(res, 404, 'not_found', 'No such profile');
    }
    case 'POST /api/v1/profiles/:ref/start': {
      const p = await find();
      if (!p) return fail(res, 404, 'not_found', 'No such profile');
      if (isRunning(p.id)){
        return debugOf(p.id) ? reply(res, 200, view(p))
          : fail(res, 409, 'running_without_api', 'This profile is open without a debugging address. Close it, then start it through the API.');
      }
      const failed = await open(p.id, { api: true });
      if (failed) return fail(res, LAUNCH[failed] ?? 500, failed, `The profile didn't open: ${failed}`);
      return reply(res, 200, view(p));
    }
    case 'POST /api/v1/profiles/:ref/stop': {
      const p = await find();
      if (!p) return fail(res, 404, 'not_found', 'No such profile');
      const was = isRunning(p.id);
      await stop(p.id);
      return reply(res, 200, { id: p.id, stopped: was });
    }
    case 'GET /api/v1/tasks': {
      const r = await api<{ tasks: { id: string; name: string; profiles: number; lastRun: unknown }[] }>('GET', `/workspaces/${ws}/tasks`);
      return reply(res, 200, { tasks: r.ok ? r.data.tasks.map(t => ({ id: t.id, name: t.name, profiles: t.profiles, lastRun: t.lastRun })) : [] });
    }
    case 'POST /api/v1/tasks/:ref/run': {
      const r = await runTask(ref, 'manual');
      return r.ok ? reply(res, 200, r.data) : fail(res, r.error.status || 500, r.error.code, r.error.message);
    }
    case 'GET /api/v1/runs/:ref': {
      const r = await api<{ run: unknown; items: { profileNumber: number; profileName: string; status: string; attempts: number; error: unknown; data: unknown }[] }>('GET', `/runs/${ref}`);
      if (!r.ok) return fail(res, r.error.status || 500, r.error.code, r.error.message);
      return reply(res, 200, { run: r.data.run, items: r.data.items.map(i => ({ number: i.profileNumber, name: i.profileName, status: i.status, attempts: i.attempts, error: i.error, data: i.data })) });
    }
    default: return fail(res, 404, 'no_route', 'See the API reference on the Folio website');
  }
}
