import { readJson, writeJson } from './blob';

export interface DispoUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
  months: string[];
  products: number;
  stores: number;
}

export interface DispoSalesData {
  // sales[month][storeName][articleDesc] = units
  sales: Record<string, Record<string, Record<string, number>>>;
  // stock[storeName][articleDesc] = { soh, soo }  (latest snapshot)
  stock: Record<string, Record<string, { soh: number; soo: number }>>;
  // prices[articleDesc] = { inclSP, promSP }  (latest)
  prices: Record<string, { inclSP: number; promSP: number }>;
  // ytd[storeName][articleDesc] = YTD sales units (Col X "Curr Y/S")
  ytd: Record<string, Record<string, number>>;
  // upload log
  uploads: DispoUploadMeta[];
}

const BLOB_KEY = 'dispo/data.json';

const EMPTY_DATA: DispoSalesData = {
  sales: {},
  stock: {},
  prices: {},
  ytd: {},
  uploads: [],
};

export async function loadDispoData(): Promise<DispoSalesData> {
  return readJson<DispoSalesData>(BLOB_KEY, EMPTY_DATA);
}

export async function saveDispoData(data: DispoSalesData): Promise<void> {
  await writeJson(BLOB_KEY, data);
}

// ── SAMS comparison dataset ──────────────────────────────────────────────────
// The SAMS sync writes here (a SEPARATE blob) while we validate it side-by-side
// against the live DISPO data. Same shape as DISPO, so the Sales & Stock page
// renders it unchanged. On cutover this is retired and SAMS writes BLOB_KEY.
const SAMS_BLOB_KEY = 'sams/data.json';

export async function loadSamsData(): Promise<DispoSalesData> {
  return readJson<DispoSalesData>(SAMS_BLOB_KEY, EMPTY_DATA);
}

export async function saveSamsData(data: DispoSalesData): Promise<void> {
  await writeJson(SAMS_BLOB_KEY, data);
}

/**
 * Calculate sales value for given units using price logic:
 * If promSP > 0, use promSP; otherwise use inclSP.
 * Price is divided by 1.15 to strip 15% SA VAT (returns nett of VAT).
 */
export function calcSalesValue(
  units: number,
  prices: { inclSP: number; promSP: number } | undefined
): number {
  if (!prices) return 0;
  const price = (prices.promSP > 0 ? prices.promSP : prices.inclSP) / 1.15;
  return units * price;
}
