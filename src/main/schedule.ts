// Runs this computer's scheduled tasks on time, while the app is open and logged in. Times that passed while it
// was not (closed, asleep, logged out) are recorded as missed, at most a week's worth, and are not run late: the
// person can run the task from its record instead. The server keeps what has been handled, so a restart neither
// repeats a run nor forgets a missed time.
import { powerMonitor } from 'electron';
import { api } from './api';
import { runTask } from './runs';
import { slotsBetween, type Schedule } from '../shared/schedule';

interface Scheduled { id: string; workspaceId: string; name: string; schedule: Schedule; since: string }

const TICK_MS = 30_000, REFRESH_MS = 5 * 60_000;
// A time is run when it is noticed within this long; later than that it counts as missed.
const GRACE_MS = 2 * 60_000;
const WEEK = 7 * 86_400_000, MAX_MISSED = 7;
// Tests move this computer's clock forward instead of waiting.
const now = () => Date.now() + Number(process.env.FOLIO_TEST_CLOCK_OFFSET_MS ?? 0);

let tasks: Scheduled[] = [];
let timers: NodeJS.Timeout[] = [];
let busy = false, resumeWatched = false;
let notify: (has: boolean) => void = () => {};
export const onScheduled = (fn: (has: boolean) => void) => { notify = fn; };
export const hasScheduled = () => tasks.length > 0;

async function refresh(){
  const r = await api<{ tasks: Scheduled[] }>('GET', '/me/schedules');
  if (!r.ok) return;
  tasks = r.data.tasks;
  notify(tasks.length > 0);
}

// Checks every task against the clock: the latest time due is run if it is fresh, older ones are recorded as missed.
export async function tick(){
  if (busy) return;
  busy = true;
  try {
    await refresh();
    let acted = false;
    for (const t of tasks){
      const at = now();
      const slots = slotsBetween(t.schedule, Math.max(Date.parse(t.since), at - WEEK), at);
      if (!slots.length) continue;
      const due = slots[slots.length - 1];
      const fresh = at - due <= GRACE_MS;
      const missed = (fresh ? slots.slice(0, -1) : slots).slice(-MAX_MISSED);
      if (missed.length) await api('POST', `/tasks/${t.id}/missed`, { slots: missed.map(s => new Date(s).toISOString()) });
      if (fresh) await runTask(t.id, 'schedule', undefined, new Date(due).toISOString());
      acted = true;
    }
    if (acted) await refresh();
  } finally { busy = false; }
}

// From logging in (or starting logged in) until logging out.
export function startScheduler(){
  stopScheduler();
  if (!resumeWatched){ resumeWatched = true; powerMonitor.on('resume', () => { if (timers.length) void tick(); }); }
  void tick();
  timers = [setInterval(() => void tick(), TICK_MS), setInterval(() => void refresh(), REFRESH_MS)];
}
export function stopScheduler(){
  timers.forEach(clearInterval);
  timers = [];
  tasks = [];
  notify(false);
}
