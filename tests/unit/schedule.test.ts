import { describe, expect, it } from 'vitest';
import { nextSlot, slotsBetween, weekOf, weekSlots, type Schedule } from '../../src/shared/schedule';

// Local times, as the computer running the task sees them.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const weekdays: Schedule = { kind: 'daily', time: '09:30', days: [1, 2, 3, 4, 5], tz: 'local' };

describe('slotsBetween', () => {
  it('lists daily times on the chosen weekdays, after `from` and up to `to`', () => {
    // 2026-11-06 is a Friday.
    expect(slotsBetween(weekdays, at(2026, 11, 5, 9, 30), at(2026, 11, 10, 9, 30))).toEqual([
      at(2026, 11, 6, 9, 30), at(2026, 11, 9, 9, 30), at(2026, 11, 10, 9, 30)
    ]);
    expect(slotsBetween(weekdays, at(2026, 11, 7), at(2026, 11, 8, 23, 59))).toEqual([]);
  });

  it('looks back at most eight days', () => {
    const daily: Schedule = { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5, 6, 7], tz: 'local' };
    expect(slotsBetween(daily, 0, at(2026, 11, 20, 12))).toHaveLength(9);
  });

  it('has the one time of a one-off schedule when it falls in the window', () => {
    const once: Schedule = { kind: 'once', at: new Date(at(2026, 11, 6, 14)).toISOString(), tz: 'local' };
    expect(slotsBetween(once, at(2026, 11, 6), at(2026, 11, 7))).toEqual([at(2026, 11, 6, 14)]);
    expect(slotsBetween(once, at(2026, 11, 6, 14), at(2026, 11, 7))).toEqual([]);
  });
});

describe('nextSlot', () => {
  it('finds the next time, skipping weekends, and none once a one-off time has passed', () => {
    expect(nextSlot(weekdays, at(2026, 11, 6, 10))).toBe(at(2026, 11, 9, 9, 30));
    expect(nextSlot(weekdays, at(2026, 11, 9, 9))).toBe(at(2026, 11, 9, 9, 30));
    const once: Schedule = { kind: 'once', at: new Date(at(2026, 11, 6, 14)).toISOString(), tz: 'local' };
    expect(nextSlot(once, at(2026, 11, 6, 15))).toBeNull();
  });
});

describe('the week in the calendar', () => {
  // 2026-11-09 is a Monday.
  const monday = at(2026, 11, 9);
  it('starts on Monday at midnight, Sundays included in the week before', () => {
    expect(weekOf(at(2026, 11, 12, 15))).toBe(monday);
    expect(weekOf(monday)).toBe(monday);
    expect(weekOf(at(2026, 11, 15, 23, 59))).toBe(monday);
    expect(weekOf(at(2026, 11, 16))).toBe(at(2026, 11, 16));
  });

  it('places daily times on their days, one-off times in their week, and nothing for tasks run by hand', () => {
    const monWed: Schedule = { kind: 'daily', time: '09:00', days: [1, 3], tz: 'local' };
    const once: Schedule = { kind: 'once', at: new Date(at(2026, 11, 13, 18, 30)).toISOString(), tz: 'local' };
    const later: Schedule = { kind: 'once', at: new Date(at(2026, 11, 20, 18, 30)).toISOString(), tz: 'local' };
    expect(weekSlots([monWed, null, once, later], monday)).toEqual([
      { i: 0, at: at(2026, 11, 9, 9) }, { i: 0, at: at(2026, 11, 11, 9) }, { i: 2, at: at(2026, 11, 13, 18, 30) }
    ]);
  });

  it('counts a time at Monday midnight in its own week, not the week before', () => {
    const midnight: Schedule = { kind: 'daily', time: '00:00', days: [1, 2, 3, 4, 5, 6, 7], tz: 'local' };
    const slots = weekSlots([midnight], monday).map(s => s.at);
    expect(slots).toHaveLength(7);
    expect(slots[0]).toBe(monday);
    expect(slots.at(-1)).toBe(at(2026, 11, 15));
    const edge: Schedule = { kind: 'once', at: new Date(at(2026, 11, 16)).toISOString(), tz: 'local' };
    expect(weekSlots([edge], monday)).toEqual([]);
    expect(weekSlots([edge], at(2026, 11, 16))).toEqual([{ i: 0, at: at(2026, 11, 16) }]);
  });
});
