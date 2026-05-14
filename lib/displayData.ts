import { readJson, writeJson, deleteBlob } from './blob';

export interface DisplayRecord {
  email: string;
  repName: string;
  date: string;          // YYYY-MM-DD
  visitUUID: string;     // dedup key
  store: string;
  storeCode: string;
  channel: string;
  province: string;
  unitCount: number;     // how many display units inspected in this row
}

/** Raw form data row — all columns from the uploaded Excel */
export type DisplayFormRow = Record<string, string | number | null>;

/** Raw form data for one upload */
export interface DisplayFormData {
  headers: string[];         // All column headers
  imageColumns: string[];    // Headers containing Perigee image URLs
  rows: DisplayFormRow[];    // Each row = { header: value, ..., _normalizedDate: "YYYY-MM-DD" }
}

export interface DisplayUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
}

const INDEX_KEY = 'display/index.json';

export async function loadDisplayIndex(): Promise<DisplayUploadMeta[]> {
  return readJson<DisplayUploadMeta[]>(INDEX_KEY, []);
}

export async function saveDisplayIndex(index: DisplayUploadMeta[]): Promise<void> {
  await writeJson(INDEX_KEY, index);
}

export async function loadDisplayData(uploadId: string): Promise<DisplayRecord[]> {
  return readJson<DisplayRecord[]>(`display/${uploadId}.json`, []);
}

export async function saveDisplayData(uploadId: string, records: DisplayRecord[]): Promise<void> {
  await writeJson(`display/${uploadId}.json`, records);
}

export async function deleteDisplayUpload(uploadId: string): Promise<void> {
  await deleteBlob(`display/${uploadId}.json`);
  await deleteBlob(`display/form/${uploadId}.json`);
  const index = await loadDisplayIndex();
  const updated = index.filter(u => u.id !== uploadId);
  await saveDisplayIndex(updated);
}

/* ── Raw form data ── */

export async function loadDisplayFormData(uploadId: string): Promise<DisplayFormData | null> {
  return readJson<DisplayFormData | null>(`display/form/${uploadId}.json`, null);
}

export async function saveDisplayFormData(uploadId: string, data: DisplayFormData): Promise<void> {
  await writeJson(`display/form/${uploadId}.json`, data);
}

/* ── Counting for auto-score ── */

export async function countDisplayChecksForMonth(
  month: string
): Promise<Map<string, { repName: string; count: number }>> {
  const index = await loadDisplayIndex();
  const allRecords: DisplayRecord[] = [];
  for (const meta of index) {
    const records = await loadDisplayData(meta.id);
    allRecords.push(...records);
  }

  // Filter to month
  const monthRecords = allRecords.filter(r => r.date.substring(0, 7) === month);

  // Dedup by visitUUID
  const seen = new Set<string>();
  const result = new Map<string, { repName: string; count: number }>();

  for (const r of monthRecords) {
    if (r.visitUUID && seen.has(r.visitUUID)) continue;
    if (r.visitUUID) seen.add(r.visitUUID);

    const email = (r.email || '').toLowerCase();
    if (!email) continue;

    if (!result.has(email)) {
      result.set(email, { repName: r.repName, count: 0 });
    }
    const entry = result.get(email)!;
    if (r.repName) entry.repName = r.repName;
    entry.count++;
  }

  return result;
}
