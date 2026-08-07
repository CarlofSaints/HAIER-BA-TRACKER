import { StoreMaster } from './storeData';
import { loadAllVisits, Visit } from './visitData';

/*
  Who is the BA at a store?

  Two answers, in priority order — the same rule the BA Work report and sales
  attribution use:
    1. store.assignedBaEmail/Name — an explicit admin override. Wins everywhere.
    2. the rep of the most recent Perigee visit that matches the store.

  Kept in one place so the Stores page, the leaderboard export and anything else
  can't drift apart on it.
*/

export type BaSource = 'assigned' | 'visits' | 'none';

export interface StoreBa {
  email: string;
  repName: string;
  source: BaSource;
}

export type DerivedBaMap = Record<string, { email: string; repName: string }>;

/*
  Per-store BA derived from Perigee visits: the rep of the most recent visit that
  matches the store (by store name, siteCode, or Perigee Site Code override).
  Scans every visit, so callers should only ask for it when they need it.
*/
export async function deriveBaByStore(stores: StoreMaster[]): Promise<DerivedBaMap> {
  // Bridge siteCode / Perigee code → store name so a visit matches whichever
  // code Perigee uses.
  const codeToName: Record<string, string> = {};
  for (const s of stores) {
    if (!s.siteCode) continue;
    const name = (s.storeName || '').toLowerCase().trim();
    codeToName[s.siteCode.toLowerCase().trim()] = name;
    const pCode = s.perigeeSiteCode?.toLowerCase().trim();
    if (pCode) codeToName[pCode] = name;
  }

  const allVisits: Visit[] = await loadAllVisits();
  // Most recent first so the first write per key wins.
  allVisits.sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''));

  const derived: DerivedBaMap = {};
  for (const v of allVisits) {
    if (!v.email && !v.repName) continue;
    const val = { email: (v.email || '').toLowerCase(), repName: v.repName || v.email || '' };
    const nameKey = (v.storeName || '').toLowerCase().trim();
    if (nameKey && !derived[nameKey]) derived[nameKey] = val;
    const codeKey = (v.storeCode || '').toLowerCase().trim();
    if (codeKey && !derived[codeKey]) derived[codeKey] = val;
    if (codeKey && codeToName[codeKey] && !derived[codeToName[codeKey]]) {
      derived[codeToName[codeKey]] = val;
    }
  }
  return derived;
}

/* Look a store up in a derived map by name, siteCode, then Perigee code. */
export function lookupDerivedBa(
  store: StoreMaster,
  derived: DerivedBaMap,
): { email: string; repName: string } | null {
  const nameKey = (store.storeName || '').toLowerCase().trim();
  const codeKey = (store.siteCode || '').toLowerCase().trim();
  const pKey = (store.perigeeSiteCode || '').toLowerCase().trim();
  return (nameKey && derived[nameKey]) || (codeKey && derived[codeKey]) || (pKey && derived[pKey]) || null;
}

/*
  The single answer for "who is on this store", override first. `source` is part
  of the answer, not decoration: a blank BA column is ambiguous (nobody assigned
  vs never visited), so exports render the source alongside it.
*/
export function resolveStoreBa(store: StoreMaster, derived: DerivedBaMap): StoreBa {
  if (store.assignedBaEmail || store.assignedBaName) {
    return {
      email: store.assignedBaEmail || '',
      repName: store.assignedBaName || store.assignedBaEmail || '',
      source: 'assigned',
    };
  }
  const d = lookupDerivedBa(store, derived);
  if (d) return { email: d.email, repName: d.repName, source: 'visits' };
  return { email: '', repName: '', source: 'none' };
}
