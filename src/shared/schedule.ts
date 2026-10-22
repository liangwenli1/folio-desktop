// When a scheduled task is due. Daily times are in this computer's local time (the computer the task runs on).
import type { components } from './api-schema';

export type Schedule = components['schemas']['Schedule'];
const DAY = 86_400_000;
const weekday = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

// The scheduled times after `from` and up to `to` (epoch ms), oldest first, looking back at most eight days.
export function slotsBetween(s: Schedule, from: number, to: number): number[] {
  if (s.kind === 'once'){
    const at = Date.parse(s.at);
    return at > from && at <= to ? [at] : [];
  }
  const [h, m] = s.time.split(':').map(Number);
  const out: number[] = [];
  const day = new Date(Math.max(from, to - 8 * DAY));
  day.setHours(0, 0, 0, 0);
  for (; day.getTime() <= to; day.setDate(day.getDate() + 1)){
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
    if (s.days.includes(weekday(day)) && at > from && at <= to) out.push(at);
  }
  return out;
}

// The next scheduled time after `after`, or null when there is none (a one-off time that has passed).
export function nextSlot(s: Schedule, after: number): number | null {
  if (s.kind === 'once') return Date.parse(s.at) > after ? Date.parse(s.at) : null;
  return slotsBetween(s, after, after + 8 * DAY)[0] ?? null;
}
