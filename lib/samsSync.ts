import { readJson, writeJson } from './blob';
import {
  getSamsData,
  getClientStores,
  getClientProducts,
  SamsFactRow,
  HAIER_CLIENT,
} from './sqlProxy';
import {
  loadDispoData,
  saveDispoData,
  DispoSalesData,
  DispoUploadMeta,
} from './dispoData';
import { loadStores, saveStores, upsertStoresFromRecords } from './storeData';
import { loadProducts } from './productData';
import { runAutoCalcForMonth } from './autoCalc';

/*
  SAMS sync — pulls Haier's lowest-grain sales/stock facts from SQL (via the
  Railway proxy) and aggregates them into the SAME model DISPO used
  (lib/dispoData.ts), so every downstream consumer (auto-calc, BA Work report,
  guidance, leaderboard) keeps working unchanged. This replaces the DISPO Excel
  upload as the data source.

  Grain in:  one row per SITE_ID × ARTICLE_ID × DATE  (SamsFactRow)
  Shape out: sales[MM-YYYY][storeName][articleDesc] = units
             stock[storeName][articleDesc] = { soh, soo }
             prices[articleDesc] = { inclSP, promSP }
             ytd[storeName][articleDesc] = units (current calendar year)
*/

export type SyncSource = 'manual' | 'cron';

export interface QueryTiming {
  ms: number;
  rows: number;
  ok: boolean;
  error?: string;
}

export interface SamsSyncCounts {
  stores: number;
  products: number;
  salesRows: number; // store×article×month cells written
  sohRows: number; // store×article stock snapshots
  months: number;
}

export interface SamsSyncMeta {
  lastSync?: string;
  lastSyncSource?: SyncSource;
  lastAutoSync?: string;
  lastSyncDurationMs?: number;
  lastSyncQueryTimings?: Record<string, QueryTiming>;
  counts?: SamsSyncCounts;
  lastError?: string;
}

export interface SamsSyncLogEntry {
  at: string;
  source: SyncSource;
  durationMs: number;
  ok: boolean;
  counts?: SamsSyncCounts;
  queries: Record<string, QueryTiming>;
  error?: string;
}

const META_KEY = 'dispo/sync-meta.json';
const LOG_KEY = 'dispo/sync-log.json';

// ── VAT ──────────────────────────────────────────────────────────────────────
// SAMS returns a Rand VALUE column. Haier reports sales value NETT of 15% VAT;
// lib/dispoData.calcSalesValue() strips VAT by dividing the stored price by 1.15.
// We store a per-article price calibrated so calcSalesValue reproduces the
// intended nett Rand. Flip this once Mark confirms whether SAMS VALUE is
// VAT-inclusive (true → we mirror DISPO's incl-VAT price) or already ex-VAT.
// TODO(probe): confirm VAT basis of SAMS.VALUE.
const SAMS_VALUE_IS_VAT_INCLUSIVE = true;

/** "2026-05-24" | Date → "MM-YYYY" (matches DISPO month keys). null if unparseable. */
function monthKeyFromDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (isNaN(d.getTime())) return null;
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${mm}-${d.getUTCFullYear()}`;
}

function yearFromDate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  return isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/** SITE_ID like "GAME-G016" → channel token "GAME". */
export function channelFromSiteId(siteId: string): string {
  const dash = siteId.indexOf('-');
  return dash > 0 ? siteId.slice(0, dash) : '';
}

/**
 * Run a single named query, timing it and never throwing — a failed dimension
 * pull shouldn't abort the whole sync. Records rows/ok/error into `timings`.
 */
async function timed<T>(
  key: string,
  timings: Record<string, QueryTiming>,
  fn: () => Promise<{ data: T[] }>,
): Promise<T[]> {
  const start = Date.now();
  try {
    const r = await fn();
    timings[key] = { ms: Date.now() - start, rows: r.data.length, ok: true };
    return r.data;
  } catch (e) {
    timings[key] = {
      ms: Date.now() - start,
      rows: 0,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    return [];
  }
}

/**
 * Pull SAMS (+ dimensions) and rebuild the DISPO model from it.
 * `source` records what triggered the run (manual button / cron).
 */
export async function runSamsSync(
  source: SyncSource,
  client: string = HAIER_CLIENT,
): Promise<SamsSyncMeta> {
  const syncStart = Date.now();
  const timings: Record<string, QueryTiming> = {};

  // 1. Pull. SAMS facts are required; dimensions are best-effort (used for
  //    counts today, and code→name enrichment once their columns are probed).
  const facts = await timed<SamsFactRow>('haier_sams', timings, () => getSamsData(client));
  const storeDim = await timed<Record<string, unknown>>('client_stores', timings, () =>
    getClientStores(client),
  );
  const productDim = await timed<Record<string, unknown>>('client_products', timings, () =>
    getClientProducts(client),
  );

  if (!timings.haier_sams.ok) {
    // The core pull failed — record the failed run and surface it, but DON'T
    // wipe the existing DISPO/SAMS data (no writes past this point).
    await finalizeMeta(source, syncStart, timings, undefined, timings.haier_sams.error);
    throw new Error(`SAMS pull failed: ${timings.haier_sams.error}`);
  }

  // 2. Resolution maps from Haier's OWN masters (known shapes). SITE_ID resolves
  //    to a friendly storeName via store master siteCode; ARTICLE_ID to
  //    articleDesc via product master productCode. Unmatched codes fall through
  //    as their own key (and, for stores, get upserted as new).
  //    TODO(probe): if SAMS codes DON'T match the masters, switch resolution to
  //    the client_stores / client_products dimensions (storeDim/productDim).
  const stores = await loadStores();
  const products = await loadProducts();

  const storeNameByCode = new Map<string, string>();
  for (const s of stores) {
    if (s.siteCode) storeNameByCode.set(s.siteCode.toLowerCase().trim(), s.storeName);
  }
  const articleByCode = new Map<string, string>();
  for (const p of products) {
    if (p.productCode) articleByCode.set(p.productCode.toLowerCase().trim(), p.articleDesc);
  }

  const resolveStore = (siteId: string) =>
    storeNameByCode.get(siteId.toLowerCase().trim()) || siteId;
  const resolveArticle = (articleId: string) =>
    articleByCode.get(articleId.toLowerCase().trim()) || articleId;

  // 3. Aggregate facts → DISPO model.
  const data: DispoSalesData = {
    sales: {},
    stock: {},
    prices: {},
    ytd: {},
    uploads: [],
  };

  const thisYear = new Date().getUTCFullYear();
  // Track the latest-dated row per (store, article) so SOH + price reflect the
  // most recent snapshot, mirroring DISPO's "latest" semantics.
  const latestKey = new Map<string, number>(); // `${store}|${article}` → epoch ms
  const fileStores = new Map<string, { siteCode: string; storeName: string }>();
  const monthsSeen = new Set<string>();
  let salesRows = 0;

  for (const row of facts) {
    const siteId = String(row.SITE_ID ?? '').trim();
    const articleId = String(row.ARTICLE_ID ?? '').trim();
    if (!siteId || !articleId) continue;

    const store = resolveStore(siteId);
    const article = resolveArticle(articleId);
    const units = Number(row.UNITS) || 0;
    const value = Number(row.VALUE) || 0;
    const soh = Number(row.SOH) || 0;

    const month = monthKeyFromDate(row.DATE);
    const rowTime = new Date(String(row.DATE)).getTime();

    // Collect store for the master upsert (keyed by the SAMS site code).
    const nameKey = store.toLowerCase();
    if (!fileStores.has(nameKey)) fileStores.set(nameKey, { siteCode: siteId, storeName: store });

    // Sales — sum units into the month bucket.
    if (month && units !== 0) {
      monthsSeen.add(month);
      if (!data.sales[month]) data.sales[month] = {};
      if (!data.sales[month][store]) data.sales[month][store] = {};
      if (data.sales[month][store][article] === undefined) {
        data.sales[month][store][article] = 0;
        salesRows++;
      }
      data.sales[month][store][article] += units;
    }

    // YTD units (current calendar year).
    if (yearFromDate(row.DATE) === thisYear && units !== 0) {
      if (!data.ytd[store]) data.ytd[store] = {};
      data.ytd[store][article] = (data.ytd[store][article] || 0) + units;
    }

    // Latest snapshot → SOH + price.
    const k = `${store}|${article}`;
    const prevTime = latestKey.get(k) ?? -Infinity;
    if (!isNaN(rowTime) && rowTime >= prevTime) {
      latestKey.set(k, rowTime);
      if (!data.stock[store]) data.stock[store] = {};
      data.stock[store][article] = { soh, soo: 0 }; // SAMS has no SOO

      // Derive a per-article price from the latest day with sales, calibrated so
      // calcSalesValue (÷1.15) reproduces the intended nett Rand value.
      if (units > 0 && value > 0) {
        const unitValue = value / units;
        const inclSP = SAMS_VALUE_IS_VAT_INCLUSIVE ? unitValue : unitValue * 1.15;
        data.prices[article] = { inclSP, promSP: 0 };
      }
    }
  }

  // 4. Persist. Upsert stores (tagged "data", same as the DISPO upload path).
  const storeCountBefore = stores.length;
  if (upsertStoresFromRecords(stores, [...fileStores.values()], 'data')) {
    await saveStores(stores);
  }

  // Log this sync as a pseudo-upload so the uploads history + delete tooling
  // still show a provenance entry.
  const uploadId = Date.now().toString(36) + '-sams';
  const uploadMeta: DispoUploadMeta & { source?: string } = {
    id: uploadId,
    fileName: `SAMS sync (${source})`,
    uploadedAt: new Date().toISOString(),
    uploadedBy: source === 'cron' ? 'cron' : 'manual sync',
    rowCount: facts.length,
    months: [...monthsSeen],
    products: Object.keys(data.prices).length,
    stores: fileStores.size,
    source: 'sams',
  };
  data.uploads.push(uploadMeta);

  await saveDispoData(data);

  const counts: SamsSyncCounts = {
    stores: fileStores.size,
    products: Object.keys(data.prices).length,
    salesRows,
    sohRows: latestKey.size,
    months: monthsSeen.size,
  };

  // 5. Re-run sales auto-calc for every affected month (MM-YYYY → YYYY-MM).
  for (const mm of monthsSeen) {
    const [mmPart, yyyyPart] = mm.split('-');
    try {
      await runAutoCalcForMonth(`${yyyyPart}-${mmPart}`, ['sales']);
    } catch (err) {
      console.error(`SAMS sync: auto-calc failed for ${mm}:`, err);
    }
  }

  void storeDim;
  void productDim;
  return finalizeMeta(source, syncStart, timings, counts);
}

/** Write sync-meta.json + append to the rolling sync-log.json (last 50). */
async function finalizeMeta(
  source: SyncSource,
  syncStart: number,
  timings: Record<string, QueryTiming>,
  counts?: SamsSyncCounts,
  error?: string,
): Promise<SamsSyncMeta> {
  const now = new Date();
  const durationMs = Date.now() - syncStart;

  const meta = await readJson<SamsSyncMeta>(META_KEY, {});
  meta.lastSync = now.toISOString();
  meta.lastSyncSource = source;
  if (source === 'cron') meta.lastAutoSync = now.toISOString();
  meta.lastSyncDurationMs = durationMs;
  meta.lastSyncQueryTimings = timings;
  if (counts) meta.counts = counts;
  meta.lastError = error;
  await writeJson(META_KEY, meta);

  const log = await readJson<SamsSyncLogEntry[]>(LOG_KEY, []);
  log.unshift({
    at: now.toISOString(),
    source,
    durationMs,
    ok: !error,
    counts,
    queries: timings,
    error,
  });
  await writeJson(LOG_KEY, log.slice(0, 50));

  return meta;
}

export async function loadSamsSyncMeta(): Promise<SamsSyncMeta> {
  return readJson<SamsSyncMeta>(META_KEY, {});
}

export async function loadSamsSyncLog(): Promise<SamsSyncLogEntry[]> {
  return readJson<SamsSyncLogEntry[]>(LOG_KEY, []);
}
