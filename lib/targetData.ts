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
 * Get the target for a specific store + month by siteCode (case-insensitive).
 * Month format: MM-YYYY (matching DISPO).
 * Falls back to MM-only matching if exact month not found (target headers have no year).
 */
export function getStoreTarget(
  targets: Record<string, TargetEntry[]>,
  month: string,
  siteCode: string,
): TargetEntry | undefined {
  const code = siteCode.trim().toUpperCase();

  // Try exact month first
  let entries = targets[month];
  if (!entries) {
    // Fallback: match by MM only (target file has no year in headers)
    const mm = month.split('-')[0];
    for (const [key, val] of Object.entries(targets)) {
      if (key.startsWith(mm + '-') && val.length > 0) {
        entries = val;
        break;
      }
    }
  }
  if (!entries) return undefined;
  return entries.find(e => e.siteCode.trim().toUpperCase() === code);
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
