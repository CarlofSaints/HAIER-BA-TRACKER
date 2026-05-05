import { readJson, writeJson } from './blob';

export interface StoreMaster {
  siteCode: string;
  storeName: string;
  channelId: string;
}

const BLOB_KEY = 'admin/stores.json';

export async function loadStores(): Promise<StoreMaster[]> {
  return readJson<StoreMaster[]>(BLOB_KEY, []);
}

export async function saveStores(stores: StoreMaster[]): Promise<void> {
  await writeJson(BLOB_KEY, stores);
}
