import { readJson, writeJson } from './blob';

/**
 * DAILY SAMS FACTS.
 *
 * SAMS returns one row per SITE_ID × ARTICLE_ID × DATE, but runSamsSync()
 * aggregates that straight into monthly buckets (DispoSalesData.sales
 * ["MM-YYYY"]) and the day is lost. That was fine when the source was DISPO —
 * a cumulative month-to-date Excel snapshot, where the only way to get a weekly
 * number was to diff two uploads and credit the difference to the week of the
 * later upload. It is the wrong shape now that the source is daily.
 *
 * This module keeps the day. Weekly figures are then a straight sum of the days
 * in a week — exact, reproducible, and independent of when a sync happened.
 *
 * Stored month-sharded (same pattern as the visit shards) so a year of data is
 * never one giant blob:
 *
 *   sams/daily/{YYYY-MM}.json   → days[YYYY-MM-DD][storeName][articleDesc] = units
 *   sams/daily/index.json       → ["2026-01", "2026-02", …] the shards that exist
 *
 * Only UNITS are stored. Value is derived through prices exactly as the monthly
 * path does (calcSalesValue), so the two can never disagree. SOH is deliberately
 * NOT kept per-day: it is a snapshot, not a flow, and a dense store × article ×
 * day matrix of it would dwarf the sales rows it sits next to.
 */

export interface SamsDailyMonth {
  /** "YYYY-MM" */
  month: string;
  /** days[YYYY-MM-DD][storeName][articleDesc] = units sold that day */
  days: Record<string, Record<string, Record<string, number>>>;
  updatedAt: string;
}

const INDEX_KEY = 'sams/daily/index.json';
const shardKey = (yyyyMm: string) => `sams/daily/${yyyyMm}.json`;

const emptyMonth = (month: string): SamsDailyMonth => ({
  month,
  days: {},
  updatedAt: new Date().toISOString(),
});

/** "MM-YYYY" (the DispoSalesData key format) → "YYYY-MM" (shard format). */
export function toShardMonth(monthKey: string): string {
  const [mm, yyyy] = monthKey.split('-');
  return `${yyyy}-${mm}`;
}

/** "YYYY-MM-DD" → "YYYY-MM" */
export function shardMonthOfDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export async function listSamsDailyMonths(): Promise<string[]> {
  return readJson<string[]>(INDEX_KEY, []);
}

export async function loadSamsDailyMonth(yyyyMm: string): Promise<SamsDailyMonth> {
  return readJson<SamsDailyMonth>(shardKey(yyyyMm), emptyMonth(yyyyMm));
}

export async function saveSamsDailyMonth(data: SamsDailyMonth): Promise<void> {
  data.updatedAt = new Date().toISOString();
  await writeJson(shardKey(data.month), data);

  const months = await listSamsDailyMonths();
  if (!months.includes(data.month)) {
    months.push(data.month);
    months.sort();
    await writeJson(INDEX_KEY, months);
  }
}

/** Load several shards concurrently, in bounded batches. */
export async function loadSamsDailyMonths(months: string[]): Promise<SamsDailyMonth[]> {
  const out: SamsDailyMonth[] = [];
  const BATCH = 12;
  for (let i = 0; i < months.length; i += BATCH) {
    const slice = months.slice(i, i + BATCH);
    out.push(...(await Promise.all(slice.map(m => loadSamsDailyMonth(m)))));
  }
  return out;
}

/**
 * Every day in a calendar year, flattened.
 * Returns days[YYYY-MM-DD][storeName][articleDesc] = units.
 *
 * A retail week can start in the PREVIOUS calendar year (Haier's 2026 Week 1
 * starts Mon 29 Dec 2025), so December of the prior year is included — leaving
 * it out would silently zero Week 1.
 */
export async function loadSamsDailyForYear(
  year: number,
): Promise<Record<string, Record<string, Record<string, number>>>> {
  const available = await listSamsDailyMonths();
  const wanted = available.filter(
    m => m.startsWith(`${year}-`) || m === `${year - 1}-12`,
  );
  const shards = await loadSamsDailyMonths(wanted);

  const days: Record<string, Record<string, Record<string, number>>> = {};
  for (const shard of shards) {
    for (const [date, byStore] of Object.entries(shard.days || {})) {
      const target = (days[date] ||= {});
      for (const [store, byArticle] of Object.entries(byStore)) {
        const t = (target[store] ||= {});
        for (const [article, units] of Object.entries(byArticle)) {
          t[article] = (t[article] || 0) + units;
        }
      }
    }
  }
  return days;
}

/**
 * Replace the given stores' rows in a month shard with fresh ones.
 *
 * Mirrors how runSamsSync merges into the live dataset: SAMS is the authority
 * for the stores it reports, so their existing rows are dropped first, but
 * every OTHER store in the shard is left alone. Without this a per-channel sync
 * ("Sync GAME only") would wipe the other channels' days.
 */
export async function upsertSamsDailyStores(
  yyyyMm: string,
  storeNames: Set<string>,
  fresh: Record<string, Record<string, Record<string, number>>>,
): Promise<void> {
  const shard = await loadSamsDailyMonth(yyyyMm);

  for (const byStore of Object.values(shard.days)) {
    for (const name of storeNames) delete byStore[name];
  }

  for (const [date, byStore] of Object.entries(fresh)) {
    const target = (shard.days[date] ||= {});
    for (const [store, byArticle] of Object.entries(byStore)) {
      target[store] = byArticle;
    }
  }

  // Drop days that ended up with no stores at all.
  for (const [date, byStore] of Object.entries(shard.days)) {
    if (Object.keys(byStore).length === 0) delete shard.days[date];
  }

  await saveSamsDailyMonth(shard);
}
