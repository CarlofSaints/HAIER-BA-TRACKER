import { readJson, writeJson } from './blob';

export interface TargetEntry {
  siteCode: string;
  storeName: string;
  valueTarget: number;   // "Volume" in file = actually value (revenue)
  volumeTarget: number;  // "Quantity" in file = actually volume (units)
}

export interface TargetUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  sheetNames: string[];
  months: string[];       // MM-YYYY keys
  storeCount: number;
}

export interface TargetData {
  // targets[MM-YYYY] = TargetEntry[]
  targets: Record<string, TargetEntry[]>;
  uploads: TargetUploadMeta[];
}

const BLOB_KEY = 'targets/data.json';
const EMPTY: TargetData = { targets: {}, uploads: [] };

export async function loadTargetData(): Promise<TargetData> {
  return readJson<TargetData>(BLOB_KEY, EMPTY);
}

export async function saveTargetData(data: TargetData): Promise<void> {
  await writeJson(BLOB_KEY, data);
}

/**
 * Get the target for a specific store + month by siteCode.
 * Month format: MM-YYYY (matching DISPO).
 */
export function getStoreTarget(
  targets: Record<string, TargetEntry[]>,
  month: string,
  siteCode: string,
): TargetEntry | undefined {
  const entries = targets[month];
  if (!entries) return undefined;
  const code = siteCode.trim();
  return entries.find(e => e.siteCode === code);
}

/**
 * Get the target for a specific store + month by storeName.
 * Uses normalized (trimmed, uppercase) comparison since target file
 * siteCode may differ from DISPO/store master siteCode.
 */
export function getStoreTargetByName(
  targets: Record<string, TargetEntry[]>,
  month: string,
  storeName: string,
): TargetEntry | undefined {
  const entries = targets[month];
  if (!entries) return undefined;
  const norm = storeName.trim().toUpperCase();
  return entries.find(e => e.storeName.trim().toUpperCase() === norm);
}
