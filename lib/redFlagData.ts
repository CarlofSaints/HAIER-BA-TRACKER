import { readJson, writeJson, deleteBlob } from './blob';

export interface RedFlagRecord {
  email: string;
  repName: string;
  date: string;          // YYYY-MM-DD
  visitUUID: string;     // dedup key
  store: string;
  storeCode: string;
  channel: string;
  province: string;
  problemType: string;   // OUT OF STOCK, MISSING PARTS, etc.
  modelNumber: string;
  shopfittingNote: string;
}

/** Raw form data row — all columns from the uploaded Excel */
export type RedFlagFormRow = Record<string, string | number | null>;

/** Raw form data for one upload */
export interface RedFlagFormData {
  headers: string[];         // All column headers
  imageColumns: string[];    // Headers containing Perigee image URLs
  rows: RedFlagFormRow[];    // Each row = { header: value, ..., _normalizedDate: "YYYY-MM-DD" }
}

export interface RedFlagUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
}

const INDEX_KEY = 'red-flags/index.json';

export async function loadRedFlagIndex(): Promise<RedFlagUploadMeta[]> {
  return readJson<RedFlagUploadMeta[]>(INDEX_KEY, []);
}

export async function saveRedFlagIndex(index: RedFlagUploadMeta[]): Promise<void> {
  await writeJson(INDEX_KEY, index);
}

export async function loadRedFlagData(uploadId: string): Promise<RedFlagRecord[]> {
  return readJson<RedFlagRecord[]>(`red-flags/${uploadId}.json`, []);
}

export async function saveRedFlagData(uploadId: string, records: RedFlagRecord[]): Promise<void> {
  await writeJson(`red-flags/${uploadId}.json`, records);
}

export async function deleteRedFlagUpload(uploadId: string): Promise<void> {
  await deleteBlob(`red-flags/${uploadId}.json`);
  await deleteBlob(`red-flags/form/${uploadId}.json`);
  const index = await loadRedFlagIndex();
  const updated = index.filter(u => u.id !== uploadId);
  await saveRedFlagIndex(updated);
}

/* ── Raw form data ── */

export async function loadRedFlagFormData(uploadId: string): Promise<RedFlagFormData | null> {
  return readJson<RedFlagFormData | null>(`red-flags/form/${uploadId}.json`, null);
}

export async function saveRedFlagFormData(uploadId: string, data: RedFlagFormData): Promise<void> {
  await writeJson(`red-flags/form/${uploadId}.json`, data);
}

/* ── Counting for summary ── */

export const RED_FLAG_TYPES = [
  'OUT OF STOCK',
  'MISSING PARTS',
  'DENTED PRODUCTS',
  'SHOPFITTING',
  'POS SHORTAGE',
  'ENERGY LABELS SHORTAGE',
] as const;

export type RedFlagType = typeof RED_FLAG_TYPES[number];

/**
 * Count red flags per BA for a given month (YYYY-MM).
 * Loads all uploads, filters to month, dedupes by visitUUID+problemType.
 * Returns Map<email, { repName, count, byType }>.
 */
export async function countRedFlagsForMonth(
  month: string
): Promise<Map<string, { repName: string; count: number; byType: Record<string, number> }>> {
  const index = await loadRedFlagIndex();
  const allRecords: RedFlagRecord[] = [];
  for (const meta of index) {
    const records = await loadRedFlagData(meta.id);
    allRecords.push(...records);
  }

  // Filter to month
  const monthRecords = allRecords.filter(r => r.date.substring(0, 7) === month);

  // Dedup by visitUUID + problemType
  const seen = new Set<string>();
  const result = new Map<string, { repName: string; count: number; byType: Record<string, number> }>();

  for (const r of monthRecords) {
    const dedupKey = r.visitUUID ? `${r.visitUUID}|${r.problemType}` : '';
    if (dedupKey && seen.has(dedupKey)) continue;
    if (dedupKey) seen.add(dedupKey);

    const email = (r.email || '').toLowerCase();
    if (!email) continue;

    if (!result.has(email)) {
      result.set(email, { repName: r.repName, count: 0, byType: {} });
    }
    const entry = result.get(email)!;
    if (r.repName) entry.repName = r.repName;
    entry.count++;

    const type = r.problemType || 'OTHER';
    entry.byType[type] = (entry.byType[type] || 0) + 1;
  }

  return result;
}
