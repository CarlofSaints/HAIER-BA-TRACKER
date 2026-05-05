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

/**
 * Calculate sales value for given units using price logic:
 * If promSP > 0, use promSP; otherwise use inclSP.
 */
export function calcSalesValue(
  units: number,
  prices: { inclSP: number; promSP: number } | undefined
): number {
  if (!prices) return 0;
  const price = prices.promSP > 0 ? prices.promSP : prices.inclSP;
  return units * price;
}
