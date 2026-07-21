import { readJson, writeJson } from './blob';

/**
 * User-configurable schedule for the automatic SAMS sync. A Vercel cron hits
 * /api/cron/sync-sams every hour; that route reads this config and only runs the
 * sync when the current time (in `timezone`) matches an enabled hour + weekday.
 * So the schedule is changed from the UI with no redeploy.
 */
export interface SamsSchedule {
  enabled: boolean;
  hours: number[]; // 0-23 — hours of the day to run (in `timezone`)
  days: number[];  // 0-6, 0=Sunday — weekdays to run
  timezone: string;
}

const KEY = 'config/sams-schedule.json';

// Default preserves the prior behaviour (daily at 05:00 SAST).
export const DEFAULT_SAMS_SCHEDULE: SamsSchedule = {
  enabled: true,
  hours: [5],
  days: [0, 1, 2, 3, 4, 5, 6],
  timezone: 'Africa/Johannesburg',
};

const uniqSorted = (arr: unknown, lo: number, hi: number): number[] =>
  Array.isArray(arr)
    ? [...new Set(arr.filter((n): n is number => Number.isInteger(n) && n >= lo && n <= hi))].sort((a, b) => a - b)
    : [];

export async function loadSamsSchedule(): Promise<SamsSchedule> {
  const s = await readJson<SamsSchedule>(KEY, DEFAULT_SAMS_SCHEDULE);
  const hours = uniqSorted(s.hours, 0, 23);
  const days = uniqSorted(s.days, 0, 6);
  return {
    enabled: !!s.enabled,
    hours: hours.length ? hours : DEFAULT_SAMS_SCHEDULE.hours,
    days: days.length ? days : DEFAULT_SAMS_SCHEDULE.days,
    timezone: s.timezone || DEFAULT_SAMS_SCHEDULE.timezone,
  };
}

export async function saveSamsSchedule(s: SamsSchedule): Promise<void> {
  await writeJson(KEY, {
    enabled: !!s.enabled,
    hours: uniqSorted(s.hours, 0, 23),
    days: uniqSorted(s.days, 0, 6),
    timezone: s.timezone || DEFAULT_SAMS_SCHEDULE.timezone,
  });
}

/** Local (schedule-timezone) hour + weekday for a given instant. */
export function localHourDay(s: SamsSchedule, now: Date): { hour: number; day: number } {
  const local = new Date(now.toLocaleString('en-US', { timeZone: s.timezone || DEFAULT_SAMS_SCHEDULE.timezone }));
  return { hour: local.getHours(), day: local.getDay() };
}

/** Whether an automatic sync should fire at `now` under this schedule. */
export function shouldRunNow(s: SamsSchedule, now: Date): boolean {
  if (!s.enabled || s.hours.length === 0 || s.days.length === 0) return false;
  const { hour, day } = localHourDay(s, now);
  return s.days.includes(day) && s.hours.includes(hour);
}
