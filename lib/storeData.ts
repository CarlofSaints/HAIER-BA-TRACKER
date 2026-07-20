import { readJson, writeJson } from './blob';

export interface StoreMaster {
  siteCode: string;
  storeName: string;
  channelId: string;
  area?: string;
  // From the Site Control File upload (iRam MASTER_SITE format).
  province?: string;
  townCity?: string;
  status?: string; // ACTIVE / CLOSED / …
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
  // Where this store was first/also seen. A store can be ingested from a data
  // load (DISPO/Diamond/Hirsch upload) and/or from Perigee visits — both tags
  // accumulate so a single store DB holds stores even for channels we never get
  // data for. Legacy stores (created before this field) are treated as 'data'.
  addedFrom?: StoreSource[];
}

export type StoreSource = 'data' | 'perigee';

const BLOB_KEY = 'admin/stores.json';

export async function loadStores(): Promise<StoreMaster[]> {
  return readJson<StoreMaster[]>(BLOB_KEY, []);
}

export async function saveStores(stores: StoreMaster[]): Promise<void> {
  await writeJson(BLOB_KEY, stores);
}

/** Add a source tag to a store if not already present. Returns true if changed. */
export function addStoreSource(store: StoreMaster, source: StoreSource): boolean {
  if (!store.addedFrom) store.addedFrom = [];
  if (store.addedFrom.includes(source)) return false;
  store.addedFrom.push(source);
  return true;
}

/** Human label for a store's sources, e.g. "Data", "Perigee", "Data/Perigee". */
export function formatStoreSources(addedFrom?: StoreSource[]): string {
  const order: StoreSource[] = ['data', 'perigee'];
  const labels: Record<StoreSource, string> = { data: 'Data', perigee: 'Perigee' };
  if (!addedFrom || addedFrom.length === 0) return 'Data'; // legacy: predates the field
  const present = order.filter(s => addedFrom.includes(s));
  return present.length ? present.map(s => labels[s]).join('/') : 'Data';
}

/**
 * Upsert stores from a batch of {siteCode, storeName} records, tagging each with
 * `source`. To keep ONE store DB without duplicates across the two ingestion
 * paths (data loads vs Perigee visits), an incoming record is matched to an
 * existing store by siteCode (own OR perigeeSiteCode override) first, then by
 * storeName (case-insensitive). Matched stores just gain the source tag; only
 * genuinely new stores are appended (channel left blank for the admin to assign).
 * Mutates `stores` in place; returns true if anything changed.
 */
export function upsertStoresFromRecords(
  stores: StoreMaster[],
  records: { siteCode?: string; storeName?: string }[],
  source: StoreSource,
): boolean {
  const byCode = new Map<string, StoreMaster>();
  const byName = new Map<string, StoreMaster>();
  for (const s of stores) {
    if (s.siteCode) byCode.set(s.siteCode.toLowerCase().trim(), s);
    if (s.perigeeSiteCode) byCode.set(s.perigeeSiteCode.toLowerCase().trim(), s);
    if (s.storeName) byName.set(s.storeName.toLowerCase().trim(), s);
  }
  let changed = false;
  for (const rec of records) {
    const code = (rec.siteCode || '').toLowerCase().trim();
    const name = (rec.storeName || '').toLowerCase().trim();
    if (!code && !name) continue;
    let store: StoreMaster | undefined;
    if (code) store = byCode.get(code);
    if (!store && name) store = byName.get(name);
    if (store) {
      if (addStoreSource(store, source)) changed = true;
      continue;
    }
    const newStore: StoreMaster = {
      siteCode: (rec.siteCode || '').trim(),
      storeName: (rec.storeName || rec.siteCode || '').trim(),
      channelId: '',
      addedFrom: [source],
    };
    stores.push(newStore);
    if (code) byCode.set(code, newStore);
    if (name) byName.set(name, newStore);
    changed = true;
  }
  return changed;
}
