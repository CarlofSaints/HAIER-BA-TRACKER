import { readJson, writeJson } from './blob';

export interface StoreMaster {
  siteCode: string;
  storeName: string;
  channelId: string;
  area?: string;
  // Optional override for how Perigee identifies this store. Perigee visits are
  // matched to a store by visit.storeCode === siteCode; when Perigee uses a
  // different code than the store's own siteCode (e.g. Diamond Corner, whose PDF
  // has no code so its siteCode is made up), set perigeeSiteCode to the Perigee
  // store code and visits will match on it too. Blank = match on siteCode only.
  perigeeSiteCode?: string;
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
