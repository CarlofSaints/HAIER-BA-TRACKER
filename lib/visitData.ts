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
}

export interface VisitUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
}

const INDEX_KEY = 'visits/index.json';

/** Consistent dedup key: visitId when present, otherwise composite of email|store|date|time */
export function visitDedupeKey(v: Visit): string {
  if (v.visitId) return `id:${v.visitId}`;
  return `comp:${(v.email || v.repName || '').toLowerCase()}|${(v.storeCode || v.storeName || '').toLowerCase()}|${v.checkInDate || ''}|${v.checkInTime || ''}`;
}

export async function loadVisitIndex(): Promise<VisitUploadMeta[]> {
  return readJson<VisitUploadMeta[]>(INDEX_KEY, []);
}

export async function saveVisitIndex(index: VisitUploadMeta[]): Promise<void> {
  await writeJson(INDEX_KEY, index);
}

export async function loadVisitData(uploadId: string): Promise<Visit[]> {
  return readJson<Visit[]>(`visits/${uploadId}.json`, []);
}

export async function saveVisitData(uploadId: string, visits: Visit[]): Promise<void> {
  await writeJson(`visits/${uploadId}.json`, visits);
}

export async function deleteVisitUpload(uploadId: string): Promise<void> {
  // Delete data file
  await deleteBlob(`visits/${uploadId}.json`);
  // Remove from index
  const index = await loadVisitIndex();
  const updated = index.filter(u => u.id !== uploadId);
  await saveVisitIndex(updated);
}
