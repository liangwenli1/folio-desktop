// Running flows on profiles. A trial run from the editor opens the profile the normal way when it is not open,
// runs in a new tab and leaves the browser and tab as they are, so the person can look at the result.
// A task run goes through its profiles a few at a time: each one opens the normal way (lock, sign-ins, proxy),
// runs the flow in a new tab (again after a pause when it fails, as many times as the task allows), closes
// (saving its sign-ins) unless it was already open, and its result goes to the server for the team to see.
import { app, powerSaveBlocker } from 'electron';
import { basename, isAbsolute, join, relative } from 'node:path';
import { api } from './api';
import { runFlow } from './flow';
import { isRunning, newPage, open, stop } from './launcher';
import type { ApiResult, FlowError, FlowEvent, FlowLog, FlowResult, SignedOut, Step } from '../shared/bridge';

export const screenshotsDir = () => join(app.getPath('userData'), 'screenshots');
// Screenshots are named relative to the screenshots folder in run records.
export const screenshotPath = (path: string) => {
  const full = isAbsolute(path) ? path : join(screenshotsDir(), path);
  const rel = relative(screenshotsDir(), full);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? full : null;
};

export async function tryFlow(profileId: string, steps: Step[], vars: Record<string, string>, signal: AbortSignal, emit: (e: Omit<FlowEvent, 'token'>) => void){
  const failed = (launchError: string) => emit({ done: { ok: false, launchError, data: {}, screenshots: [] } });
  const launchError = isRunning(profileId) ? null : await open(profileId);
  if (launchError) return failed(launchError);
  const tab = await newPage(profileId).catch(() => null);
  if (!tab) return failed('launch_failed');
  const stop = () => { void tab.page.close().catch(() => {}); };
  signal.addEventListener('abort', stop, { once: true });
  const result = await runFlow(tab.page, steps, {
    firefox: tab.kernel === 'firefox', signal, vars, log: log => emit({ log }), shots: { dir: join(screenshotsDir(), 'trial'), prefix: '' }
  });
  signal.removeEventListener('abort', stop);
  emit({ done: result });
}

interface Started {
  run: { id: string; taskId: string }; task: { name: string; concurrency: number; retries: number; timeoutMin: number };
  steps: Step[]; items: { profileId: string; name: string; number: number; vars: Record<string, string> }[];
}
type Item = Started['items'][number];

const RETRY_PAUSE_MS = 10_000, HEARTBEAT_MS = 60_000, MAX_LOG = 800;
// Launch failures that waiting will not fix: the profile is open elsewhere, or gone.
const SKIP = new Set(['locked', 'not_found', 'in_trash', 'forbidden']);
const pad = (n: number) => String(n).padStart(4, '0');

const active = new Map<string, { taskId: string; abort: AbortController; done: Promise<void> }>();
let notify: (runs: { runId: string; taskId: string }[]) => void = () => {};
export const onRuns = (fn: typeof notify) => { notify = fn; };
// Profiles a run found signed out, for the desktop notification.
let signedOut: (e: SignedOut) => void = () => {};
export const onSignedOut = (fn: typeof signedOut) => { signedOut = fn; };
export const activeRuns = () => [...active].map(([runId, a]) => ({ runId, taskId: a.taskId }));
// The computer stays awake while runs are under way.
let blocker: number | null = null;
const changed = () => {
  if (active.size && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!active.size && blocker !== null){ powerSaveBlocker.stop(blocker); blocker = null; }
  notify(activeRuns());
};

export async function runTask(taskId: string, trigger: 'manual' | 'rerun' | 'schedule', profileIds?: string[], scheduledFor?: string): Promise<ApiResult<{ runId: string }>> {
  const r = await api<Started>('POST', `/tasks/${taskId}/runs`, { trigger, ...(profileIds ? { profileIds } : {}), ...(scheduledFor ? { scheduledFor } : {}) });
  if (!r.ok) return r;
  const abort = new AbortController();
  const done = execute(r.data, abort.signal).finally(() => { active.delete(r.data.run.id); changed(); });
  active.set(r.data.run.id, { taskId, abort, done });
  changed();
  return { ok: true, data: { runId: r.data.run.id } };
}

export const stopRun = (runId: string) => { active.get(runId)?.abort.abort(); };
// Before logging out or quitting: stop every run and let it report how far it got.
export async function stopRuns(){
  const all = [...active.values()];
  all.forEach(a => a.abort.abort());
  await Promise.all(all.map(a => a.done));
}

// However it ends, the run is reported finished (profiles not reached show as not run).
async function execute({ run, task, steps, items }: Started, signal: AbortSignal){
  const beat = setInterval(() => { void api('POST', `/runs/${run.id}/heartbeat`); }, HEARTBEAT_MS);
  const queue = [...items], out: string[] = [];
  try {
    await Promise.all(Array.from({ length: Math.min(task.concurrency, queue.length) }, async () => {
      for (let item = queue.shift(); item && !signal.aborted; item = queue.shift()){
        if (await runItem(run.id, task, steps, item, signal) === 'signed_out') out.push(item.name);
      }
    }));
    if (out.length) signedOut({ taskId: run.taskId, runId: run.id, task: task.name, profiles: out });
  } catch (e){
    console.error('task run failed', e);
  } finally {
    clearInterval(beat);
    await api('POST', `/runs/${run.id}/finish`, { status: signal.aborted ? 'stopped' : 'done' });
  }
}

async function runItem(runId: string, task: Started['task'], steps: Step[], item: Item, signal: AbortSignal){
  const id = item.profileId;
  const report = (body: object) => api('POST', `/runs/${runId}/items/${id}`, body);
  await report({ status: 'running', attempts: 0 });
  const wasOpen = isRunning(id);
  const vars = { ...item.vars, 'profile.name': item.name, 'profile.number': pad(item.number) };
  const log: (FlowLog & { attempt: number })[] = [], screenshots: string[] = [];
  let attempts = 0, result: FlowResult | null = null, error: FlowError | { code: string; message: string } | null = null, skipped: string | null = null;

  while (attempts <= task.retries && !signal.aborted){
    if (attempts && !(await pause(RETRY_PAUSE_MS, signal))) break;
    attempts++;
    const launchError = isRunning(id) ? null : await open(id);
    if (launchError && SKIP.has(launchError)){ skipped = launchError; break; }
    const tab = launchError ? null : await newPage(id).catch(() => null);
    if (!tab){ error = { code: launchError ?? 'launch_failed', message: '' }; continue; }

    // Stopping the run or running out of time closes the tab, which ends the flow.
    const attempt = new AbortController();
    let tooLong = false;
    const end = () => attempt.abort();
    signal.addEventListener('abort', end, { once: true });
    const timer = setTimeout(() => { tooLong = true; end(); }, task.timeoutMin * 60_000);
    attempt.signal.addEventListener('abort', () => { void tab.page.close().catch(() => {}); }, { once: true });
    const n = attempts;
    result = await runFlow(tab.page, steps, {
      firefox: tab.kernel === 'firefox', signal: attempt.signal, vars, log: l => log.push({ attempt: n, ...l }),
      shots: { dir: join(screenshotsDir(), runId), prefix: `${pad(item.number)}-${n}-` }
    });
    clearTimeout(timer);
    signal.removeEventListener('abort', end);
    await tab.page.close().catch(() => {});
    screenshots.push(...result.screenshots.map(f => `${runId}/${basename(f)}`));
    error = result.ok ? null : tooLong ? { code: 'too_long', message: String(task.timeoutMin) } : result.error!;
    // Signed out is an answer, not a failure: trying again would find the same.
    if (result.ok || error?.code === 'signed_out') break;
  }
  // Closing saves the sign-ins and releases the lock; a profile that was open before stays open.
  if (!wasOpen && isRunning(id)) await stop(id);
  const status = skipped ? 'skipped' : result?.ok ? 'ok' : error?.code === 'signed_out' ? 'signed_out' : signal.aborted ? 'canceled' : 'failed';
  await report({
    status, attempts, error: skipped ? { code: skipped, message: '' } : status === 'failed' || status === 'signed_out' ? error : null,
    log: log.slice(-MAX_LOG), data: Object.fromEntries(Object.entries(result?.data ?? {}).map(([k, v]) => [k, v.slice(0, 10_000)])), screenshots
  });
  return status;
}

// Resolves false when the run is stopped during the pause.
function pause(ms: number, signal: AbortSignal){
  return new Promise<boolean>(resolve => {
    const t = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(true); }, ms);
    const stop = () => { clearTimeout(t); resolve(false); };
    signal.addEventListener('abort', stop, { once: true });
  });
}
