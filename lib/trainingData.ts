import { readJson, writeJson, deleteBlob } from './blob';

export interface TrainingRecord {
  email: string;
  repName: string;
  date: string;          // YYYY-MM-DD
  visitUUID: string;     // dedup key
  didComplete: boolean;  // "DID YOU COMPLETE TRAINING?" = Yes
  store: string;
  storeCode: string;
  channel: string;
}

/** Raw form data row — all columns from the uploaded Excel */
export type TrainingFormRow = Record<string, string | number | null>;

/** Raw form data for one upload */
export interface TrainingFormData {
  headers: string[];         // All column headers
  imageColumns: string[];    // Headers containing Perigee image URLs
  rows: TrainingFormRow[];   // Each row = { header: value, ..., _normalizedDate: "YYYY-MM-DD" }
}

export interface TrainingUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
}

const INDEX_KEY = 'training/index.json';

export async function loadTrainingIndex(): Promise<TrainingUploadMeta[]> {
  return readJson<TrainingUploadMeta[]>(INDEX_KEY, []);
}

export async function saveTrainingIndex(index: TrainingUploadMeta[]): Promise<void> {
  await writeJson(INDEX_KEY, index);
}

export async function loadTrainingData(uploadId: string): Promise<TrainingRecord[]> {
  return readJson<TrainingRecord[]>(`training/${uploadId}.json`, []);
}

export async function saveTrainingData(uploadId: string, records: TrainingRecord[]): Promise<void> {
  await writeJson(`training/${uploadId}.json`, records);
}

export async function deleteTrainingUpload(uploadId: string): Promise<void> {
  await deleteBlob(`training/${uploadId}.json`);
  await deleteBlob(`training/form/${uploadId}.json`);
  const index = await loadTrainingIndex();
  const updated = index.filter(u => u.id !== uploadId);
  await saveTrainingIndex(updated);
}

/* ── Raw form data ── */

export async function loadTrainingFormData(uploadId: string): Promise<TrainingFormData | null> {
  return readJson<TrainingFormData | null>(`training/form/${uploadId}.json`, null);
}

export async function saveTrainingFormData(uploadId: string, data: TrainingFormData): Promise<void> {
  await writeJson(`training/form/${uploadId}.json`, data);
}

/**
 * Count completed trainings per BA for a given month (YYYY-MM).
 * Loads all training uploads, filters to month, dedupes by visitUUID.
 * Returns Map<email, { repName, count }>.
 */
export async function countTrainingsForMonth(
  month: string
): Promise<Map<string, { repName: string; count: number }>> {
  const index = await loadTrainingIndex();
  const allRecords: TrainingRecord[] = [];
  for (const meta of index) {
    const records = await loadTrainingData(meta.id);
    allRecords.push(...records);
  }

  // Filter to month + completed only
  const monthRecords = allRecords.filter(
    r => r.date.substring(0, 7) === month && r.didComplete
  );

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
