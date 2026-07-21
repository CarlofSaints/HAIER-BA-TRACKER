import { readJson, writeJson } from './blob';
import {
  getSamsData,
  getClientProducts,
  getClientProductLinks,
  SamsFactRow,
  HAIER_CLIENT,
} from './sqlProxy';
import {
  loadDispoData,
  saveDispoData,
  DispoSalesData,
  DispoUploadMeta,
} from './dispoData';
import { loadStores, StoreMaster } from './storeData';
import { loadChannels } from './channelData';
import { runAutoCalcForMonth } from './autoCalc';

/*
  SAMS sync (per-sub-channel data-source model).

  SAMS supplies the lowest-grain facts (SITE_ID × ARTICLE_ID × DATE). We resolve
  names/channels from the CONTROL FILES (store master + channels), NOT the SQL
  dimension — so Carl controls naming. Only channels marked dataSource='sams'
  are written to the LIVE shared dataset (dispo/data.json); DISPO/Excel channels
  are left untouched.

  Store match: strip the channel prefix off SITE_ID ("GAME-G016" → "G016") and
  match the store master siteCode (then full SITE_ID, then perigeeSiteCode).
  Unmatched SAMS sites are SKIPPED and reported — never invented.

  Product resolution (unchanged, via SQL dimensions):
    ARTICLE_ID → client_product_links["Channel Article"] → "Product ID"
               → client_products["Client Product ID"] → "Product Description"
*/

export type SyncSource = 'manual' | 'cron';
export type SyncTarget = 'sams' | 'dispo';

export interface QueryTiming {
  ms: number;
  rows: number;
  ok: boolean;
  error?: string;
}

export interface SamsSyncCounts {
  stores: number; // SAMS-marked-channel stores merged into live
  products: number;
  salesRows: number;
  sohRows: number;
  months: number;
  unresolvedStores?: number; // SITE_IDs with no store-master match (skipped)
  matchedNonSamsChannel?: number; // matched, but their channel isn't marked SAMS (skipped from live)
  unresolvedArticles?: number; // ARTICLE_IDs with no product-link match (kept as raw)
}

export interface SamsSyncMeta {
  lastSync?: string;
  lastSyncSource?: SyncSource;
  lastSyncTarget?: SyncTarget;
  lastAutoSync?: string;
  latestDataDate?: string; // ISO date of the most recent SAMS fact row (data recency)
  lastSyncDurationMs?: number;
  lastSyncQueryTimings?: Record<string, QueryTiming>;
  counts?: SamsSyncCounts;
  unresolvedSiteSample?: string[]; // a few unmatched SITE_IDs, to help reconcile
  matchedNonSamsSample?: { siteId: string; storeName: string; channel: string }[];
  skippedEmptySamsChannels?: string[]; // marked SAMS but SAMS returned nothing → NOT wiped
  lastError?: string;
}

export interface SamsSyncLogEntry {
  at: string;
  source: SyncSource;
  target?: SyncTarget;
  durationMs: number;
  ok: boolean;
  counts?: SamsSyncCounts;
  queries: Record<string, QueryTiming>;
  error?: string;
}

const META_KEY = 'dispo/sync-meta.json';
const LOG_KEY = 'dispo/sync-log.json';

// SAMS VALUE is EX-VAT (confirmed by Mark 20 Jul 2026). We store inclSP =
// (VALUE/UNITS)*1.15 so calcSalesValue's ÷1.15 returns the true nett Rand.
const SAMS_VALUE_IS_VAT_INCLUSIVE = false;

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

/** SITE_ID "GAME-G016" → channel token "GAME". */
export function channelFromSiteId(siteId: string): string {
  const dash = siteId.indexOf('-');
  return dash > 0 ? siteId.slice(0, dash) : '';
}

/** SITE_ID "GAME-G016" → store code "G016" (strip the channel prefix). */
export function storeCodeFromSiteId(siteId: string): string {
  const dash = siteId.indexOf('-');
  return dash >= 0 ? siteId.slice(dash + 1) : siteId;
}

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

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

/**
 * Pull SAMS, resolve via control files, and MERGE the SAMS-marked channels into
 * the live shared dataset (dispo/data.json). DISPO/Excel channels are untouched.
 */
export async function runSamsSync(
  source: SyncSource,
  client: string = HAIER_CLIENT,
  opts: { channelIds?: string[] } = {},
): Promise<SamsSyncMeta> {
  const syncStart = Date.now();
  const timings: Record<string, QueryTiming> = {};
  const target: SyncTarget = 'dispo'; // merges into the live shared dataset

  // 1. Pull facts + product dimensions (store names/channels come from control files).
  const facts = await timed<SamsFactRow>('haier_sams', timings, () => getSamsData(client));
  const linkDim = await timed<Record<string, unknown>>('client_product_links', timings, () =>
    getClientProductLinks(client),
  );
  const productDim = await timed<Record<string, unknown>>('client_products', timings, () =>
    getClientProducts(client),
  );

  if (!timings.haier_sams.ok) {
    await finalizeMeta(source, syncStart, timings, undefined, timings.haier_sams.error, target);
    throw new Error(`SAMS pull failed: ${timings.haier_sams.error}`);
  }

  // 2. Control files.
  const stores = await loadStores();
  const channels = await loadChannels();
  // SAMS-marked channels, optionally narrowed to a specific set (per-channel
  // sync — e.g. "Sync GAME only"). NOTE: the SAMS SP returns ALL channels for
  // the client regardless, so this scopes the merge + score recalc, not the SQL
  // pull itself (that needs a channel param on the SP).
  let samsChannelIds = new Set(channels.filter(c => c.dataSource === 'sams').map(c => c.id));
  if (opts.channelIds && opts.channelIds.length) {
    const requested = new Set(opts.channelIds);
    samsChannelIds = new Set([...samsChannelIds].filter(id => requested.has(id)));
  }
  const channelNameById = new Map(channels.map(c => [c.id, c.name]));

  // Store lookup. SAMS facts must ONLY resolve to stores in SAMS-marked channels:
  // a SAMS SITE_ID belongs to a SAMS channel, so it must never land on a store in
  // a NON-SAMS channel (e.g. Diamond Corner / Walmart) that happens to share the
  // same site code — Perigee allows the same code across channels. Matching across
  // all channels is exactly how a SAMS sync could clobber Diamond Corner data.
  //   samsStoreByCode   → the real resolution (SAMS-marked channels only)
  //   nonSamsStoreByCode → ONLY for the "matched but not marked SAMS" coverage hint
  const samsStoreByCode = new Map<string, StoreMaster>();
  const nonSamsStoreByCode = new Map<string, StoreMaster>();
  for (const s of stores) {
    const codes: string[] = [];
    if (s.siteCode) codes.push(s.siteCode.toLowerCase().trim());
    if (s.perigeeSiteCode) codes.push(s.perigeeSiteCode.toLowerCase().trim());
    for (const c of codes) {
      if (!c) continue;
      if (samsChannelIds.has(s.channelId)) samsStoreByCode.set(c, s);
      else if (!nonSamsStoreByCode.has(c)) nonSamsStoreByCode.set(c, s);
    }
  }
  const lookup = (m: Map<string, StoreMaster>, siteId: string): StoreMaster | undefined =>
    m.get(storeCodeFromSiteId(siteId).toLowerCase()) || m.get(siteId.toLowerCase().trim());

  // Product resolution (dimensions).
  const productIdByChannelArticle = new Map<string, string>();
  for (const l of linkDim) {
    const ca = str(l['Channel Article']);
    const pid = str(l['Product ID']);
    if (ca && pid) productIdByChannelArticle.set(ca, pid);
  }
  const descByProductId = new Map<string, string>();
  for (const p of productDim) {
    const pid = str(p['Client Product ID']);
    if (pid) descByProductId.set(pid, str(p['Product Description']) || pid);
  }
  const unresolvedArticleIds = new Set<string>();
  const resolveArticle = (articleId: string): string => {
    const pid = productIdByChannelArticle.get(articleId);
    const desc = pid ? descByProductId.get(pid) : undefined;
    if (desc) return desc;
    unresolvedArticleIds.add(articleId);
    return articleId;
  };

  // 3. Aggregate facts → a full SAMS-resolved dataset (all MATCHED stores). The
  //    subset belonging to SAMS-marked channels is merged into live afterwards.
  const data: DispoSalesData = { sales: {}, stock: {}, prices: {}, ytd: {}, uploads: [] };
  const thisYear = new Date().getUTCFullYear();
  const latestKey = new Map<string, number>();
  const allArticles = new Set<string>();
  const monthsSeen = new Set<string>();
  const liveStoreNames = new Set<string>(); // matched AND channel marked SAMS
  const unmatchedSites = new Set<string>();
  const matchedNonSams = new Map<string, { storeName: string; channel: string }>();
  let salesRows = 0;
  let maxDataTime = -Infinity; // latest fact DATE seen → data-recency indicator

  for (const row of facts) {
    const siteId = str(row.SITE_ID);
    const articleId = str(row.ARTICLE_ID);
    if (!siteId || !articleId) continue;

    const store = lookup(samsStoreByCode, siteId);
    if (!store) {
      // Not a SAMS-channel store. If the code matches a store in a NON-SAMS
      // channel, report it as "matched but not marked SAMS" (a hint to mark it);
      // otherwise it's genuinely unmatched. Either way we NEVER touch it.
      const other = lookup(nonSamsStoreByCode, siteId);
      if (other) {
        if (!matchedNonSams.has(siteId)) {
          matchedNonSams.set(siteId, {
            storeName: other.storeName,
            channel: channelNameById.get(other.channelId) || other.channelId || '(unassigned)',
          });
        }
      } else {
        unmatchedSites.add(siteId);
      }
      continue;
    }
    const storeName = store.storeName;
    liveStoreNames.add(storeName);

    const article = resolveArticle(articleId);
    allArticles.add(article);
    const units = Number(row.UNITS) || 0;
    const value = Number(row.VALUE) || 0;
    const soh = Number(row.SOH) || 0;
    const month = monthKeyFromDate(row.DATE);
    const rowTime = new Date(String(row.DATE)).getTime();
    if (!isNaN(rowTime) && rowTime > maxDataTime) maxDataTime = rowTime;

    if (month && units !== 0) {
      monthsSeen.add(month);
      if (!data.sales[month]) data.sales[month] = {};
      if (!data.sales[month][storeName]) data.sales[month][storeName] = {};
      if (data.sales[month][storeName][article] === undefined) {
        data.sales[month][storeName][article] = 0;
        salesRows++;
      }
      data.sales[month][storeName][article] += units;
    }

    if (yearFromDate(row.DATE) === thisYear && units !== 0) {
      if (!data.ytd[storeName]) data.ytd[storeName] = {};
      data.ytd[storeName][article] = (data.ytd[storeName][article] || 0) + units;
    }

    const k = `${storeName}|${article}`;
    const prevTime = latestKey.get(k) ?? -Infinity;
    if (!isNaN(rowTime) && rowTime >= prevTime) {
      latestKey.set(k, rowTime);
      if (!data.stock[storeName]) data.stock[storeName] = {};
      data.stock[storeName][article] = { soh, soo: 0 };
      if (units > 0 && value > 0) {
        const unitValue = value / units;
        data.prices[article] = {
          inclSP: SAMS_VALUE_IS_VAT_INCLUSIVE ? unitValue : unitValue * 1.15,
          promSP: 0,
        };
      }
    }
  }

  const uploadId = Date.now().toString(36) + '-sams';
  const uploadMeta: DispoUploadMeta & { source?: string } = {
    id: uploadId,
    fileName: `SAMS sync (${source})`,
    uploadedAt: new Date().toISOString(),
    uploadedBy: source === 'cron' ? 'cron' : 'manual sync',
    rowCount: facts.length,
    months: [...monthsSeen],
    products: allArticles.size,
    stores: liveStoreNames.size,
    source: 'sams',
  };

  // 4. Merge SAMS-marked channels into the LIVE dataset.
  const live = await loadDispoData();
  if (!live.ytd) live.ytd = {};
  const affectedMonths = new Set<string>();

  // 4a. Remove existing data for every store in a SAMS-marked channel (clean
  //     re-sync — drops stores SAMS no longer reports).
  //
  //     SAFETY GUARD: only clear channels that actually received SAMS data this
  //     run. If a channel is marked SAMS but SAMS returned NO matched store for
  //     it, that's almost always a misconfiguration (e.g. Diamond Corner or
  //     Walmart — whose data comes from PDF/DISPO, not SAMS SQL — marked SAMS by
  //     mistake). Clearing it would silently wipe that channel's data with
  //     nothing to put back, so we SKIP it and report it instead. Stale data is
  //     safer than wiped data.
  const channelsWithData = new Set(
    stores.filter(s => liveStoreNames.has(s.storeName)).map(s => s.channelId),
  );
  const skippedEmptySamsChannels = [...samsChannelIds]
    .filter(id => !channelsWithData.has(id))
    .map(id => channelNameById.get(id) || id);
  const samsMasterStoreNames = new Set(
    stores
      .filter(s => samsChannelIds.has(s.channelId) && channelsWithData.has(s.channelId))
      .map(s => s.storeName),
  );
  for (const name of samsMasterStoreNames) {
    for (const [month, byStore] of Object.entries(live.sales)) {
      if (byStore[name]) { delete byStore[name]; affectedMonths.add(month); }
    }
    delete live.stock[name];
    delete live.ytd[name];
  }

  // 4b. Write the fresh SAMS data for the marked-channel stores.
  for (const [month, byStore] of Object.entries(data.sales)) {
    for (const name of liveStoreNames) {
      if (byStore[name]) {
        if (!live.sales[month]) live.sales[month] = {};
        live.sales[month][name] = byStore[name];
        affectedMonths.add(month);
      }
    }
  }
  for (const name of liveStoreNames) {
    if (data.stock[name]) live.stock[name] = data.stock[name];
    if (data.ytd[name]) live.ytd[name] = data.ytd[name];
  }
  for (const [art, p] of Object.entries(data.prices)) live.prices[art] = p;
  live.uploads.push({ ...uploadMeta });
  await saveDispoData(live);

  // 5. Re-run sales auto-calc for every affected month.
  for (const mm of affectedMonths) {
    const [mmPart, yyyyPart] = mm.split('-');
    try {
      await runAutoCalcForMonth(`${yyyyPart}-${mmPart}`, ['sales']);
    } catch (err) {
      console.error(`SAMS sync: auto-calc failed for ${mm}:`, err);
    }
  }

  const counts: SamsSyncCounts = {
    stores: liveStoreNames.size,
    products: allArticles.size,
    salesRows,
    sohRows: latestKey.size,
    months: monthsSeen.size,
    unresolvedStores: unmatchedSites.size,
    matchedNonSamsChannel: matchedNonSams.size,
    unresolvedArticles: unresolvedArticleIds.size,
  };

  const matchedNonSamsSample = [...matchedNonSams.entries()]
    .slice(0, 25)
    .map(([siteId, v]) => ({ siteId, ...v }));

  const latestDataDate = isFinite(maxDataTime) ? new Date(maxDataTime).toISOString() : undefined;

  return finalizeMeta(
    source, syncStart, timings, counts, undefined, target,
    [...unmatchedSites].slice(0, 25), matchedNonSamsSample, latestDataDate,
    skippedEmptySamsChannels,
  );
}

/** Write sync-meta.json + prepend to the rolling sync-log.json (last 50). */
async function finalizeMeta(
  source: SyncSource,
  syncStart: number,
  timings: Record<string, QueryTiming>,
  counts?: SamsSyncCounts,
  error?: string,
  target: SyncTarget = 'dispo',
  unresolvedSiteSample?: string[],
  matchedNonSamsSample?: { siteId: string; storeName: string; channel: string }[],
  latestDataDate?: string,
  skippedEmptySamsChannels?: string[],
): Promise<SamsSyncMeta> {
  const now = new Date();
  const durationMs = Date.now() - syncStart;

  const meta = await readJson<SamsSyncMeta>(META_KEY, {});
  meta.lastSync = now.toISOString();
  if (latestDataDate) meta.latestDataDate = latestDataDate; // preserve prior on error path
  meta.lastSyncSource = source;
  meta.lastSyncTarget = target;
  if (source === 'cron') meta.lastAutoSync = now.toISOString();
  meta.lastSyncDurationMs = durationMs;
  meta.lastSyncQueryTimings = timings;
  if (counts) meta.counts = counts;
  meta.unresolvedSiteSample = unresolvedSiteSample;
  meta.matchedNonSamsSample = matchedNonSamsSample;
  meta.skippedEmptySamsChannels = skippedEmptySamsChannels;
  meta.lastError = error;
  await writeJson(META_KEY, meta);

  const log = await readJson<SamsSyncLogEntry[]>(LOG_KEY, []);
  log.unshift({
    at: now.toISOString(),
    source,
    target,
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
