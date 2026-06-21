import { readJson, writeJson } from './blob';

export interface StoreMaster {
  siteCode: string;
  storeName: string;
  channelId: string;
  area?: string;
  // Explicit BA assignment. When set, this overrides the Perigee-visit-derived
  // BA for this store everywhere (BA Work report + sales attribution). Used when
  // a store changes hands (e.g. a BA leaves and is replaced). Empty/undefined
  // = auto-derive the BA from visit data as before.
  assignedBaEmail?: string;
  assignedBaName?: string;
}

const BLOB_KEY = 'admin/stores.json';

export async function loadStores(): Promise<StoreMaster[]> {
  return readJson<StoreMaster[]>(BLOB_KEY, []);
}

export async function saveStores(stores: StoreMaster[]): Promise<void> {
  await writeJson(BLOB_KEY, stores);
}
