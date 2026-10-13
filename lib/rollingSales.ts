import { listSamsDailyMonths, loadSamsDailyMonths } from './samsDaily';
import { loadDispoData, calcSalesValue } from './dispoData';
import { loadStores } from './storeData';
import { loadChannels } from './channelData';
import { deriveBaByStore, resolveStoreBa } from './storeBa';
import type { Rolling7Row } from './rolling7View';

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

export interface Rolling7Report {
  /** The window, oldest first. Empty when no daily data exists yet. */
  days: string[];
  rows: Rolling7Row[];
  channels: { id: string; name: string; parentId: string }[];
}

/*
  The rolling-7-day report at store × SKU grain, each row carrying its store's
  BA (resolveStoreBa, the same rule as the leaderboard export). Used by the
  Sales: Last 7 Days page and the daily email.

  Rows are every SKU that SOLD in the window plus every SKU still IN STOCK at a
  SAMS store, the latter with zero units. Without the stock-only rows a store's
  SOH read as just the stock of whatever sold that week, so a store holding 27
  units whose only seller had sold out showed SOH 0.
*/
export async function buildRolling7Report(): Promise<Rolling7Report> {
  const [rolling, dispo, stores, channels] = await Promise.all([
    loadRollingDaily(),
    loadDispoData(),
    loadStores(),
    loadChannels(),
  ]);
  const derived = await deriveBaByStore(stores);

  const channelById = new Map(channels.map(c => [c.id, c]));
  const storeByName = new Map(stores.map(s => [s.storeName, s]));

  // Same rule as /sales: the 'dc' channel and its subs are depots, not shops.
  const dcIds = new Set(['dc', ...channels.filter(c => c.parentId === 'dc').map(c => c.id)]);

  // Stores with SAMS daily facts, plus every store in a SAMS channel (so one
  // that sold nothing this week still shows its stock). DISPO/Excel/PDF stores
  // stay off this page: their stock isn't from SAMS.
  const samsChannelIds = new Set(channels.filter(c => c.dataSource === 'sams').map(c => c.id));
  const storeNames = new Set(Object.keys(rolling.byStore));
  if (rolling.days.length > 0) {
    for (const s of stores) if (samsChannelIds.has(s.channelId)) storeNames.add(s.storeName);
  }

  const rows: Rolling7Row[] = [];
  for (const storeName of storeNames) {
    const sm = storeByName.get(storeName);
    const channelId = sm?.channelId || '';
    if (dcIds.has(channelId)) continue;
    const ch = channelById.get(channelId);
    const ba = sm ? resolveStoreBa(sm, derived) : null;
    const sold = rolling.byStore[storeName] || {};
    const stock = dispo.stock[storeName] || {};

    for (const article of new Set([...Object.keys(sold), ...Object.keys(stock)])) {
      const daily = sold[article] || new Array(rolling.days.length).fill(0);
      const soh = stock[article]?.soh || 0;
      if (soh === 0 && daily.every(u => u === 0)) continue;
      const units = daily.reduce((s, u) => s + u, 0);
      rows.push({
        store: storeName,
        siteCode: sm?.siteCode || '',
        channelId,
        channel: ch?.name || '',
        mainChannelId: ch?.parentId || channelId,
        ba: ba?.repName || '',
        baSource: ba?.source || 'none',
        article,
        daily,
        units,
        value: calcSalesValue(units, dispo.prices[article]),
        soh,
      });
    }
  }

  return {
    days: rolling.days,
    rows,
    channels: channels
      .filter(c => !dcIds.has(c.id))
      .map(c => ({ id: c.id, name: c.name, parentId: c.parentId || '' })),
  };
}
