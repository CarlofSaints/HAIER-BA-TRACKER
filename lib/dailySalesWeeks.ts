/*
  Monday-start week helpers for the Daily Sales Submissions page.

  Deliberately independent of lib/weekMapping.ts: that config drives the retail
  week for the BA Work report and starts wherever an admin sets Week 1, which is
  not necessarily a Monday. This page's weeks always start on a Monday.

  All dates are plain "YYYY-MM-DD" strings handled as calendar dates, never as
  Date objects in a server timezone, so a UTC server can't shift a day.
*/

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today in Africa/Johannesburg as YYYY-MM-DD (the server runs UTC). */
export function todayInSA(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Treat a YYYY-MM-DD as a UTC instant so arithmetic never crosses a DST edge. */
function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

export function dayName(date: string): string {
  return DAY_NAMES[dayOfWeek(date)];
}

/** The Monday on or before `date`. */
export function mondayOf(date: string): string {
  const dow = dayOfWeek(date);
  const back = dow === 0 ? 6 : dow - 1; // Sunday belongs to the week that started 6 days earlier
  return addDays(date, -back);
}

/** "Mon 25 Aug" */
export function shortLabel(date: string): string {
  const d = toUtc(date);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** "25 Aug" */
export function dayMonthLabel(date: string): string {
  const d = toUtc(date);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** The 7 dates of the Monday-start week containing `date`, Mon → Sun. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** The 7 dates ending on `end` (inclusive), oldest first. */
export function rollingDates(end: string, days = 7): string[] {
  return Array.from({ length: days }, (_, i) => addDays(end, i - (days - 1)));
}

export interface WeekOption {
  start: string;
  end: string;
  label: string;
}

/**
 * Monday-start weeks covering `first`..`last`, newest first.
 */
export function weekOptions(first: string, last: string): WeekOption[] {
  if (!first || !last) return [];
  const out: WeekOption[] = [];
  let cursor = mondayOf(last);
  const floor = mondayOf(first);
  let guard = 0;
  while (cursor >= floor && guard++ < 400) {
    const end = addDays(cursor, 6);
    out.push({ start: cursor, end, label: `${dayMonthLabel(cursor)} to ${dayMonthLabel(end)}` });
    cursor = addDays(cursor, -7);
  }
  return out;
}

/** Month keys (YYYY-MM) from `first` to `last` inclusive, newest first. */
export function monthOptions(first: string, last: string): string[] {
  if (!first || !last) return [];
  const out: string[] = [];
  let [y, m] = [Number(first.slice(0, 4)), Number(first.slice(5, 7))];
  const endY = Number(last.slice(0, 4));
  const endM = Number(last.slice(5, 7));
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard++ < 240) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}

/** Last calendar day of a YYYY-MM month, as YYYY-MM-DD. */
export function lastDayOfMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** "Aug 2026" for a YYYY-MM key. */
export function monthLabel(month: string): string {
  const y = month.slice(0, 4);
  const m = Number(month.slice(5, 7));
  return `${MONTH_NAMES[m - 1] ?? month} ${y}`;
}

/** Month keys spanned by a date range, for deciding which shards to read. */
export function monthsBetween(from: string, to: string): string[] {
  if (!from || !to) return [];
  return monthOptions(from, to);
}
