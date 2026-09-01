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
  /** Which upload last wrote this record. */
  sourceId?: string;
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
  return shards.flat().filter(r => r.sourceId === uploadId);
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
): Promise<{ added: number; replaced: number; months: string[] }> {
  const byMonth = new Map<string, DailySalesRecord[]>();
  for (const r of records) {
    const month = dailySalesMonthKey(r);
    const tagged = { ...r, sourceId: meta.id };
    const arr = byMonth.get(month);
    if (arr) arr.push(tagged); else byMonth.set(month, [tagged]);
  }

  const monthList = new Set(await loadMonthList());
  const touched: string[] = [];
  let added = 0;
  let replaced = 0;

  for (const [month, incoming] of byMonth) {
    const shard = await loadMonthShard(month);
    const byKey = new Map<string, DailySalesRecord>();
    for (const r of shard) byKey.set(dailySalesDedupeKey(r), r);

    for (const r of incoming) {
      const k = dailySalesDedupeKey(r);
      if (byKey.has(k)) replaced++; else added++;
      byKey.set(k, r);
    }

    await saveMonthShard(month, [...byKey.values()]);
    monthList.add(month);
    touched.push(month);
  }

  await saveMonthList(monthList);

  const index = await loadDailySalesIndex();
  index.unshift({ ...meta, months: touched });
  await saveDailySalesIndex(index);

  return { added, replaced, months: touched };
}

/** Delete one upload: remove its records from the shards, drop its meta. */
export async function deleteDailySalesUpload(uploadId: string): Promise<number> {
  const index = await loadDailySalesIndex();
  const meta = index.find(m => m.id === uploadId);
  let removed = 0;
  if (meta?.months?.length) {
    for (const month of meta.months) {
      const shard = await loadMonthShard(month);
      const filtered = shard.filter(r => r.sourceId !== uploadId);
      if (filtered.length !== shard.length) {
        removed += shard.length - filtered.length;
        await saveMonthShard(month, filtered);
      }
    }
  }
  await saveDailySalesIndex(index.filter(m => m.id !== uploadId));
  return removed;
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
