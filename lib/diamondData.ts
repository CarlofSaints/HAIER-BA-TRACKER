import { readJson, writeJson, deleteBlob } from './blob';

/**
 * Diamond Corner is a separate retailer/channel whose sales arrive as a flat
 * PDF ("Sales Analysis By Item in Dept"), one store per file. The PDF is OCR'd
 * (see app/api/diamond/extract), reviewed by an admin, then committed. On
 * commit the rows are MERGED into the shared DISPO sales model (dispo/data.json)
 * so they score and report exactly like Makro/Massmart data — see
 * app/api/diamond/commit. This file only tracks the Diamond Corner upload log
 * and the raw extracted rows (for display + clean delete/rebuild).
 */

/** A single product line extracted from a Diamond Corner sales PDF. */
export interface DiamondRow {
  /** Diamond Corner item code, e.g. "HRF-425VCWRMBL" */
  code: string;
  /** Description as printed on the PDF, e.g. "HAIER 326LT" */
  description: string;
  /** Units sold in the period */
  qty: number;
  /** Stock on hand (can be negative on the report) */
  soh: number;
  /** Sales value for the period (Rand, as printed — VAT-inclusive retail) */
  value: number;
  /**
   * The DISPO articleDesc this row was committed under. Resolved from the
   * product master via diamondCode when a mapping exists; otherwise falls back
   * to `description`. Set at commit time.
   */
  articleDesc?: string;
  /** Whether `code` matched a product master diamondCode at commit time. */
  mapped?: boolean;
}

export interface DiamondUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  /** Target store (store master) the rows were loaded against. */
  storeName: string;
  siteCode: string;
  /** DISPO month key, "MM-YYYY". */
  month: string;
  /** Date range printed on the PDF, for display. */
  dateFrom?: string;
  dateTo?: string;
  rowCount: number;
  totalValue: number;
  /** Diamond codes that did NOT map to a product (committed under description). */
  unmappedCodes?: string[];
}

const INDEX_KEY = 'diamond/uploads.json';

export async function loadDiamondUploads(): Promise<DiamondUploadMeta[]> {
  return readJson<DiamondUploadMeta[]>(INDEX_KEY, []);
}

export async function saveDiamondUploads(uploads: DiamondUploadMeta[]): Promise<void> {
  await writeJson(INDEX_KEY, uploads);
}

export async function saveDiamondRaw(id: string, payload: { meta: DiamondUploadMeta; rows: DiamondRow[] }): Promise<void> {
  await writeJson(`diamond/raw/${id}.json`, payload);
}

export async function loadDiamondRaw(id: string): Promise<{ meta: DiamondUploadMeta; rows: DiamondRow[] } | null> {
  return readJson<{ meta: DiamondUploadMeta; rows: DiamondRow[] } | null>(`diamond/raw/${id}.json`, null);
}

export async function deleteDiamondRaw(id: string): Promise<void> {
  await deleteBlob(`diamond/raw/${id}.json`);
}
