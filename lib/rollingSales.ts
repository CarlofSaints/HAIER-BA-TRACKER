import { listSamsDailyMonths, loadSamsDailyMonths } from './samsDaily';

/*
  Rolling-7-day sales, read from the daily SAMS shards (lib/samsDaily.ts).

  The window ends on the LATEST DAY THAT HAS DATA, not on today. SAMS itself
  lags about two days, so "today minus 6" would always show two empty columns
  and a week that is really five days long.

  Only channels whose data source is SAMS have daily facts. DISPO, Excel and PDF
  channels arrive as month totals and cannot be split into days, so they are not
  on this page at all (the page says so).
*/

export const ROLLING_DAYS = 7;

/** "YYYY-MM-DD" shifted by n days (negative = earlier). UTC so no DST drift. */
export function shiftIsoDate(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The n days ending on `last`, oldest first. */
export function rollingWindow(last: string, n = ROLLING_DAYS): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftIsoDate(last, -i));
  return out;
}

export interface RollingDaily {
  /** The window, oldest first. Empty when no daily data exists yet. */
  days: string[];
  /** byStore[storeName][articleDesc] = units per day, aligned with `days` */
  byStore: Record<string, Record<string, number[]>>;
}

export async function loadRollingDaily(n = ROLLING_DAYS): Promise<RollingDaily> {
  const months = await listSamsDailyMonths();
  if (months.length === 0) return { days: [], byStore: {} };

  // A 7-day window touches at most two calendar months.
  const shards = await loadSamsDailyMonths(months.slice(-2));

  let latest = '';
  for (const shard of shards) {
    for (const [date, byStore] of Object.entries(shard.days || {})) {
      if (Object.keys(byStore).length > 0 && date > latest) latest = date;
    }
  }
  if (!latest) return { days: [], byStore: {} };

  const days = rollingWindow(latest, n);
  const index = new Map(days.map((d, i) => [d, i]));

  const byStore: Record<string, Record<string, number[]>> = {};
  for (const shard of shards) {
    for (const [date, stores] of Object.entries(shard.days || {})) {
      const i = index.get(date);
      if (i === undefined) continue;
      for (const [store, articles] of Object.entries(stores)) {
        const s = (byStore[store] ||= {});
        for (const [article, units] of Object.entries(articles)) {
          const arr = (s[article] ||= new Array(n).fill(0));
          arr[i] += units;
        }
      }
    }
  }
  return { days, byStore };
}
