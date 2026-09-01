import { readJson, writeJson, deleteBlob } from './blob';

/**
 * One product set from a Daily Sales form: the "Product sold" / "QTY sold:" /
 * "Unit price:" columns read together. A submission can carry several of these
 * (Perigee repeats the question group across columns), so a record holds a list.
 */
export interface DailySalesLine {
  product: string;
  qty: number;
  unitPrice: number;
  /** qty x unitPrice, as captured on the form (NOT stripped of VAT). */
  value: number;
}

/** One Daily Sales form submission. */
export interface DailySalesRecord {
  /** Perigee's "ID" column — unique per submission, our dedupe key. */
  submissionId: string;
  email: string;
  repName: string;
  date: string;      // YYYY-MM-DD
  time: string;
  visitUUID: string;
  channel: string;
  store: string;
  storeCode: string;
  province: string;
  lines: DailySalesLine[];
  /** Totals across `lines`, precomputed so consumers never re-derive them. */
  totalQty: number;
  totalValue: number;
  /**
   * Every upload that has supplied this submission. Overlapping loads are the
   * normal way this data arrives (load the 1st today, load the 1st and 2nd
   * tomorrow to catch late submissions), so the same submission routinely comes
   * from several files. The record survives until the LAST of them is deleted.
   */
  sourceIds?: string[];
  /**
   * @deprecated Single-owner field written before the multi-source change.
   * Read through `recordSources()`, never directly.
   */
  sourceId?: string;
}

/** Which uploads supplied this record, tolerating the legacy single-owner field. */
export function recordSources(r: DailySalesRecord): string[] {
  if (r.sourceIds?.length) return r.sourceIds;
  return r.sourceId ? [r.sourceId] : [];
}

export interface DailySalesUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  /** Submissions parsed out of the file. */
  rowCount: number;
  /** Product sets (lines) parsed out of the file. */
  lineCount: number;
  /** How many "Product sold / QTY / Unit price" triplets the header carried. */
  productSets: number;
  /** Month shards (YYYY-MM) this upload's records live in. */
  months: string[];
  /** Earliest / latest submission date in the file, for the history table. */
  dateFrom: string;
  dateTo: string;
}

/*
  Storage — month-sharded, mirroring lib/visitData.ts.

  Records live in one file PER MONTH: `daily-sales/month/YYYY-MM.json`, so a read
  for a date range touches only the months it needs rather than one blob per
  daily upload (this data arrives daily, so per-upload blobs would grow without
  bound and every read would pay for all of them).

  `daily-sales/index.json` keeps upload METADATA for the history UI and per-batch
  delete. `daily-sales/months.json` lists which month shards exist.

  Unlike visits, a re-upload REPLACES a submission it has seen before rather than
  skipping it: these forms get corrected and resubmitted in Perigee, and the value
  calculation depends on qty/price being the corrected ones.
*/

const INDEX_KEY = 'daily-sales/index.json';
const MONTHS_KEY = 'daily-sales/months.json';
const MONTH_PREFIX = 'daily-sales/month/';
const READ_BATCH = 25;

/** Consistent dedupe key: the form's own ID when present, else a composite. */
export function dailySalesDedupeKey(r: DailySalesRecord): string {
  if (r.submissionId) return `id:${r.submissionId}`;
  return `comp:${(r.email || r.repName || '').toLowerCase()}|${r.date}|${r.time}|${(r.storeCode || r.store).toLowerCase()}`;
}

/** Month shard key (YYYY-MM from the submission date; 'unknown' if unparseable). */
export function dailySalesMonthKey(r: DailySalesRecord): string {
  const d = (r.date || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(d) ? d : 'unknown';
}

// ── Index ────────────────────────────────────────────────────────────────────

export async function loadDailySalesIndex(): Promise<DailySalesUploadMeta[]> {
  return readJson<DailySalesUploadMeta[]>(INDEX_KEY, []);
}

export async function saveDailySalesIndex(index: DailySalesUploadMeta[]): Promise<void> {
  await writeJson(INDEX_KEY, index);
}

// ── Month shards ─────────────────────────────────────────────────────────────

async function loadMonthList(): Promise<string[]> {
  return readJson<string[]>(MONTHS_KEY, []);
}

async function saveMonthList(months: Iterable<string>): Promise<void> {
  await writeJson(MONTHS_KEY, [...new Set(months)].sort());
}

/** A month shard is mutable (upserted) → read fresh, never cached. */
async function loadMonthShard(month: string): Promise<DailySalesRecord[]> {
  return readJson<DailySalesRecord[]>(`${MONTH_PREFIX}${month}.json`, []);
}

async function saveMonthShard(month: string, records: DailySalesRecord[]): Promise<void> {
  await writeJson(`${MONTH_PREFIX}${month}.json`, records);
}

/** Which month shards exist, oldest first. */
export async function loadDailySalesMonths(): Promise<string[]> {
  return (await loadMonthList()).filter(m => m !== 'unknown').sort();
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Every Daily Sales record, deduped. Reads only the shards that exist.
 */
export async function loadAllDailySales(): Promise<DailySalesRecord[]> {
  const months = await loadMonthList();
  return loadDailySalesForMonths(months);
}

/**
 * Records for the given month keys (YYYY-MM). Months with no shard read as empty,
 * so callers can pass a whole calendar range without checking first.
 */
export async function loadDailySalesForMonths(months: string[]): Promise<DailySalesRecord[]> {
  const wanted = [...new Set(months)];
  const all: DailySalesRecord[] = [];
  for (let i = 0; i < wanted.length; i += READ_BATCH) {
    const chunks = await Promise.all(wanted.slice(i, i + READ_BATCH).map(m => loadMonthShard(m)));
    for (const c of chunks) all.push(...c);
  }
  const seen = new Set<string>();
  const out: DailySalesRecord[] = [];
  for (const r of all) {
    const k = dailySalesDedupeKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** The records belonging to ONE upload (for the history table's row count). */
export async function loadDailySalesUpload(uploadId: string): Promise<DailySalesRecord[]> {
  const meta = (await loadDailySalesIndex()).find(m => m.id === uploadId);
  if (!meta?.months?.length) return [];
  const shards = await Promise.all(meta.months.map(m => loadMonthShard(m)));
  return shards.flat().filter(r => recordSources(r).includes(uploadId));
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Upsert a batch into the month shards and record the upload's metadata.
 * A record whose dedupe key already exists is REPLACED (see the note above).
 * `meta` should NOT include `months` — this fills it in from the months touched.
 */
export async function addDailySales(
  meta: Omit<DailySalesUploadMeta, 'months'>,
  records: DailySalesRecord[],
): Promise<{ added: number; refreshed: number; months: string[] }> {
  const byMonth = new Map<string, DailySalesRecord[]>();
  for (const r of records) {
    const month = dailySalesMonthKey(r);
    const arr = byMonth.get(month);
    if (arr) arr.push(r); else byMonth.set(month, [r]);
  }

  const monthList = new Set(await loadMonthList());
  const touched: string[] = [];
  let added = 0;
  let refreshed = 0;

  for (const [month, incoming] of byMonth) {
    const shard = await loadMonthShard(month);
    const byKey = new Map<string, DailySalesRecord>();
    for (const r of shard) byKey.set(dailySalesDedupeKey(r), r);

    for (const r of incoming) {
      const k = dailySalesDedupeKey(r);
      const existing = byKey.get(k);
      if (existing) {
        // Already held. Take this file's values (a submission edited in Perigee
        // must land) but ADD this upload as another source rather than taking
        // ownership, so deleting this upload later cannot remove a submission an
        // earlier upload also supplied.
        refreshed++;
        byKey.set(k, { ...r, sourceIds: [...new Set([...recordSources(existing), meta.id])] });
      } else {
        added++;
        byKey.set(k, { ...r, sourceIds: [meta.id] });
      }
    }

    await saveMonthShard(month, [...byKey.values()]);
    monthList.add(month);
    touched.push(month);
  }

  await saveMonthList(monthList);

  const index = await loadDailySalesIndex();
  index.unshift({ ...meta, months: touched });
  await saveDailySalesIndex(index);

  return { added, refreshed, months: touched };
}

/**
 * Delete one upload and drop its meta.
 *
 * A submission is removed only when this upload was its LAST remaining source.
 * One that another upload also supplied is kept, minus this upload's claim on
 * it, so deleting a file that re-covered an earlier date range cannot take that
 * earlier range's data with it.
 */
export async function deleteDailySalesUpload(
  uploadId: string,
): Promise<{ removed: number; retained: number }> {
  const index = await loadDailySalesIndex();
  const meta = index.find(m => m.id === uploadId);
  let removed = 0;
  let retained = 0;

  // Fall back to every month if the meta somehow carries none, so a delete can
  // never leave orphaned records behind.
  const months = meta?.months?.length ? meta.months : await loadMonthList();

  for (const month of months) {
    const shard = await loadMonthShard(month);
    const next: DailySalesRecord[] = [];
    let changed = false;

    for (const r of shard) {
      const sources = recordSources(r);
      if (!sources.includes(uploadId)) { next.push(r); continue; }

      const rest = sources.filter(id => id !== uploadId);
      changed = true;
      if (rest.length === 0) {
        removed++;
      } else {
        retained++;
        next.push({ ...r, sourceIds: rest, sourceId: undefined });
      }
    }

    if (changed) await saveMonthShard(month, next);
  }

  await saveDailySalesIndex(index.filter(m => m.id !== uploadId));
  return { removed, retained };
}

/** Remove every record matching `predicate` from ALL shards (BA / user purges). */
export async function removeDailySalesWhere(
  predicate: (r: DailySalesRecord) => boolean,
): Promise<number> {
  let removed = 0;
  for (const month of await loadMonthList()) {
    const shard = await loadMonthShard(month);
    const filtered = shard.filter(r => !predicate(r));
    if (filtered.length !== shard.length) {
      removed += shard.length - filtered.length;
      await saveMonthShard(month, filtered);
    }
  }
  return removed;
}

/** Drop everything (used only by an explicit admin reset). */
export async function clearAllDailySales(): Promise<void> {
  for (const month of await loadMonthList()) {
    await deleteBlob(`${MONTH_PREFIX}${month}.json`);
  }
  await saveMonthList([]);
  await saveDailySalesIndex([]);
}
