import { readJson, writeJson, deleteBlob } from './blob';

export interface Visit {
  email: string;
  repName: string;
  channel: string;
  storeName: string;
  storeCode: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  checkInDistance: string;
  checkOutDistance: string;
  visitDuration: string;
  formsCompleted: number;
  picsUploaded: number;
  status: string;
  networkOnCheckIn: string;
  visitId?: string;
  /** The upload (batch) this record came from — lets a batch be deleted/purged
   *  out of the shared month shards. Set when a record is stored in a shard. */
  sourceId?: string;
}

export interface VisitUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
  /** Month shards (YYYY-MM) this upload's records live in. Present = stored in the
   *  month-shard model; absent = a legacy per-upload blob (pre-migration). */
  months?: string[];
}

/*
  Visit storage — month-sharded.

  Records live in one file PER MONTH: `visits/month/YYYY-MM.json`. An import
  upserts into the current month's shard (dedup by visitDedupeKey) rather than
  writing a brand-new blob every time — so the file count stays ~12/year instead
  of growing forever, and each import only rewrites one small file.

  `visits/index.json` keeps upload METADATA (for the history UI + per-batch
  delete); each record carries `sourceId` = its upload id.

  Backward compatible: uploads made before this model have no `meta.months` and
  their data is still in legacy `visits/{uploadId}.json` blobs. `loadAllVisits`
  reads BOTH (shards ∪ legacy, deduped), and `migrateLegacyToShards()` folds the
  legacy blobs into shards. So reads are correct before, during, and after the
  migration.
*/

const INDEX_KEY = 'visits/index.json';
const MONTHS_KEY = 'visits/months.json'; // string[] of month keys that have a shard
const MONTH_PREFIX = 'visits/month/';    // visits/month/YYYY-MM.json
const LEGACY_PREFIX = 'visits/';         // visits/{uploadId}.json (legacy per-upload)
const READ_BATCH = 25;                    // bounded concurrency for blob reads

/** Consistent dedup key: visitId when present, otherwise composite of email|store|date|time */
export function visitDedupeKey(v: Visit): string {
  if (v.visitId) return `id:${v.visitId}`;
  return `comp:${(v.email || v.repName || '').toLowerCase()}|${(v.storeCode || v.storeName || '').toLowerCase()}|${v.checkInDate || ''}|${v.checkInTime || ''}`;
}

/** Month shard key for a visit (YYYY-MM from checkInDate; 'unknown' if unparseable). */
function monthKeyOf(v: Visit): string {
  const d = (v.checkInDate || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(d) ? d : 'unknown';
}

// ── Index (upload metadata) ──────────────────────────────────────────────────

export async function loadVisitIndex(): Promise<VisitUploadMeta[]> {
  return readJson<VisitUploadMeta[]>(INDEX_KEY, []);
}

export async function saveVisitIndex(index: VisitUploadMeta[]): Promise<void> {
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
async function loadMonthShard(month: string): Promise<Visit[]> {
  return readJson<Visit[]>(`${MONTH_PREFIX}${month}.json`, []);
}

async function saveMonthShard(month: string, visits: Visit[]): Promise<void> {
  await writeJson(`${MONTH_PREFIX}${month}.json`, visits);
}

async function loadShards(months: string[]): Promise<Visit[]> {
  const all: Visit[] = [];
  for (let i = 0; i < months.length; i += READ_BATCH) {
    const chunks = await Promise.all(months.slice(i, i + READ_BATCH).map(m => loadMonthShard(m)));
    for (const c of chunks) all.push(...c);
  }
  return all;
}

async function loadLegacyBlobs(ids: string[]): Promise<Visit[]> {
  const all: Visit[] = [];
  for (let i = 0; i < ids.length; i += READ_BATCH) {
    const chunks = await Promise.all(
      ids.slice(i, i + READ_BATCH).map(id => readJson<Visit[]>(`${LEGACY_PREFIX}${id}.json`, [], { useCache: true })),
    );
    for (const c of chunks) all.push(...c);
  }
  return all;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * All visits: month shards ∪ not-yet-migrated legacy per-upload blobs, deduped.
 * Bounded-concurrency reads; shard record wins on a key collision (it's the
 * maintained copy). This is the single read path for every consumer.
 */
export async function loadAllVisits(): Promise<Visit[]> {
  const [months, index] = await Promise.all([loadMonthList(), loadVisitIndex()]);
  const legacyIds = index.filter(m => !m.months || m.months.length === 0).map(m => m.id);
  const [shardVisits, legacyVisits] = await Promise.all([
    loadShards(months),
    loadLegacyBlobs(legacyIds),
  ]);
  const seen = new Set<string>();
  const all: Visit[] = [];
  for (const v of shardVisits) { const k = visitDedupeKey(v); if (!seen.has(k)) { seen.add(k); all.push(v); } }
  for (const v of legacyVisits) { const k = visitDedupeKey(v); if (!seen.has(k)) { seen.add(k); all.push(v); } }
  return all;
}

/**
 * The visits belonging to ONE upload. Back-compat for callers that still iterate
 * the index. Prefers the legacy blob (pre-migration); otherwise reconstructs the
 * batch from its month shards by sourceId.
 */
export async function loadVisitData(uploadId: string): Promise<Visit[]> {
  const legacy = await readJson<Visit[]>(`${LEGACY_PREFIX}${uploadId}.json`, [], { useCache: true });
  if (legacy.length) return legacy;
  const meta = (await loadVisitIndex()).find(m => m.id === uploadId);
  if (!meta?.months?.length) return [];
  const shards = await Promise.all(meta.months.map(m => loadMonthShard(m)));
  return shards.flat().filter(v => v.sourceId === uploadId);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Upsert a batch of visits into the month shards (dedup by key) and record the
 * upload's metadata. Returns how many were actually added vs skipped as dups.
 * `meta` should NOT include `months` — this fills it in from the months touched.
 */
export async function addVisits(
  meta: Omit<VisitUploadMeta, 'months'>,
  visits: Visit[],
): Promise<{ added: number; skipped: number }> {
  const byMonth = new Map<string, Visit[]>();
  for (const v of visits) {
    const month = monthKeyOf(v);
    const arr = byMonth.get(month);
    const tagged = { ...v, sourceId: meta.id };
    if (arr) arr.push(tagged); else byMonth.set(month, [tagged]);
  }

  const monthList = new Set(await loadMonthList());
  const touched: string[] = [];
  let added = 0;

  for (const [month, incoming] of byMonth) {
    const shard = await loadMonthShard(month);
    const seen = new Set(shard.map(visitDedupeKey));
    let changed = false;
    for (const v of incoming) {
      const k = visitDedupeKey(v);
      if (seen.has(k)) continue;
      seen.add(k);
      shard.push(v);
      added++;
      changed = true;
    }
    touched.push(month);
    if (changed) { await saveMonthShard(month, shard); monthList.add(month); }
  }

  await saveMonthList(monthList);

  const index = await loadVisitIndex();
  index.unshift({ ...meta, months: touched });
  await saveVisitIndex(index);

  return { added, skipped: visits.length - added };
}

/** Delete one upload (batch): remove its records from the shards, drop its meta. */
export async function deleteVisitUpload(uploadId: string): Promise<void> {
  const index = await loadVisitIndex();
  const meta = index.find(m => m.id === uploadId);
  if (meta?.months?.length) {
    for (const month of meta.months) {
      const shard = await loadMonthShard(month);
      const filtered = shard.filter(v => v.sourceId !== uploadId);
      if (filtered.length !== shard.length) await saveMonthShard(month, filtered);
    }
  }
  // Also remove any legacy blob (pre-migration uploads, or belt-and-braces).
  await deleteBlob(`${LEGACY_PREFIX}${uploadId}.json`);
  await saveVisitIndex(index.filter(m => m.id !== uploadId));
}

/**
 * Remove every visit matching `predicate` from ALL shards and legacy blobs.
 * Returns the count removed. Used by BA / user purges.
 */
export async function removeVisitsWhere(predicate: (v: Visit) => boolean): Promise<number> {
  let removed = 0;
  // Shards
  const months = await loadMonthList();
  for (const month of months) {
    const shard = await loadMonthShard(month);
    const kept = shard.filter(v => !predicate(v));
    if (kept.length !== shard.length) { removed += shard.length - kept.length; await saveMonthShard(month, kept); }
  }
  // Legacy blobs (not-yet-migrated uploads)
  const index = await loadVisitIndex();
  for (const meta of index) {
    if (meta.months && meta.months.length) continue;
    const legacy = await readJson<Visit[]>(`${LEGACY_PREFIX}${meta.id}.json`, [], { useCache: false });
    if (!legacy.length) continue;
    const kept = legacy.filter(v => !predicate(v));
    if (kept.length !== legacy.length) { removed += legacy.length - kept.length; await writeJson(`${LEGACY_PREFIX}${meta.id}.json`, kept); }
  }
  return removed;
}

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * Fold every legacy per-upload blob into month shards (idempotent). Order is
 * safe against a crash: shards + month list are written first, THEN the index is
 * marked migrated, THEN legacy blobs are deleted — so a partial run just leaves
 * data readable via both paths (loadAllVisits dedups), and re-running finishes it.
 */
export async function migrateLegacyToShards(): Promise<{ migrated: number; months: string[] }> {
  const index = await loadVisitIndex();
  const legacyMetas = index.filter(m => !m.months || m.months.length === 0);
  if (legacyMetas.length === 0) {
    return { migrated: 0, months: (await loadMonthList()).sort() };
  }

  // Group all legacy visits by month (one pass), tracking which months each upload hit.
  const byMonth = new Map<string, Visit[]>();
  const metaMonths = new Map<string, Set<string>>();
  for (let i = 0; i < legacyMetas.length; i += READ_BATCH) {
    const batch = legacyMetas.slice(i, i + READ_BATCH);
    const loaded = await Promise.all(
      batch.map(m => readJson<Visit[]>(`${LEGACY_PREFIX}${m.id}.json`, [], { useCache: true })),
    );
    batch.forEach((meta, j) => {
      const set = new Set<string>();
      for (const v of loaded[j]) {
        const month = monthKeyOf(v);
        const tagged = { ...v, sourceId: v.sourceId || meta.id };
        const arr = byMonth.get(month);
        if (arr) arr.push(tagged); else byMonth.set(month, [tagged]);
        set.add(month);
      }
      metaMonths.set(meta.id, set);
    });
  }

  // Merge each month into its shard exactly once (dedup).
  const monthList = new Set(await loadMonthList());
  for (const [month, incoming] of byMonth) {
    const shard = await loadMonthShard(month);
    const seen = new Set(shard.map(visitDedupeKey));
    for (const v of incoming) {
      const k = visitDedupeKey(v);
      if (!seen.has(k)) { seen.add(k); shard.push(v); }
    }
    await saveMonthShard(month, shard);
    monthList.add(month);
  }
  await saveMonthList(monthList);

  // Mark the metas migrated, then delete their legacy blobs.
  for (const meta of legacyMetas) meta.months = [...(metaMonths.get(meta.id) || [])];
  await saveVisitIndex(index);
  for (let i = 0; i < legacyMetas.length; i += READ_BATCH) {
    await Promise.all(legacyMetas.slice(i, i + READ_BATCH).map(m => deleteBlob(`${LEGACY_PREFIX}${m.id}.json`)));
  }

  return { migrated: legacyMetas.length, months: [...monthList].sort() };
}
