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
  // How much check-in evidence backs this BA at this store. The derivation rule
  // is "most recent visit wins", so ONE walk-in claims a store just as firmly as
  // a permanent posting — a Makro BA who stepped into a GAME store once outranks
  // nobody but looks identical to the BA stationed there. Exports carry the count
  // so a weak claim is visible rather than hidden behind a confident-looking name.
  visitCount: number;
  lastVisit: string;
}

export interface DerivedBa {
  email: string;
  repName: string;
  visitCount: number;
  lastVisit: string;
}

export type DerivedBaMap = Record<string, DerivedBa>;

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

  // The keys a visit can be filed under: its store name, its store code, and the
  // master store name that code bridges to.
  const visitKeys = (v: Visit): string[] => {
    const keys: string[] = [];
    const nameKey = (v.storeName || '').toLowerCase().trim();
    if (nameKey) keys.push(nameKey);
    const codeKey = (v.storeCode || '').toLowerCase().trim();
    if (codeKey) {
      keys.push(codeKey);
      if (codeToName[codeKey]) keys.push(codeToName[codeKey]);
    }
    return keys;
  };

  // Pass 1 — most recent visit wins each key.
  const derived: DerivedBaMap = {};
  for (const v of allVisits) {
    if (!v.email && !v.repName) continue;
    const val: DerivedBa = {
      email: (v.email || '').toLowerCase(),
      repName: v.repName || v.email || '',
      visitCount: 0,
      lastVisit: '',
    };
    for (const k of visitKeys(v)) {
      if (!derived[k]) derived[k] = { ...val };
    }
  }

  // Pass 2 — count how many visits the winning rep actually made to each key, so
  // callers can tell a home store from a single walk-in.
  for (const v of allVisits) {
    if (!v.email && !v.repName) continue;
    for (const k of visitKeys(v)) {
      const d = derived[k];
      if (!d || !sameRep(d, v)) continue;
      d.visitCount++;
      const when = v.checkInDate || '';
      if (when > d.lastVisit) d.lastVisit = when;
    }
  }
  return derived;
}

/* Match on email when both sides have one, else fall back to the rep's name. */
function sameRep(d: { email: string; repName: string }, v: Visit): boolean {
  const vEmail = (v.email || '').toLowerCase();
  if (d.email && vEmail) return d.email === vEmail;
  return d.repName === (v.repName || v.email || '');
}

/* Look a store up in a derived map by name, siteCode, then Perigee code. */
export function lookupDerivedBa(
  store: StoreMaster,
  derived: DerivedBaMap,
): DerivedBa | null {
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
  const d = lookupDerivedBa(store, derived);

  if (store.assignedBaEmail || store.assignedBaName) {
    const email = (store.assignedBaEmail || '').toLowerCase();
    const repName = store.assignedBaName || store.assignedBaEmail || '';
    // Carry the visit evidence only when the assigned BA is the one who actually
    // visits this store. When someone else does, 0 is the honest number — it says
    // the override is doing real work rather than rubber-stamping the visit data.
    const matches = d && (d.email && email ? d.email === email : d.repName === repName);
    return {
      email: store.assignedBaEmail || '',
      repName,
      source: 'assigned',
      visitCount: matches ? d!.visitCount : 0,
      lastVisit: matches ? d!.lastVisit : '',
    };
  }

  if (d) {
    return { email: d.email, repName: d.repName, source: 'visits', visitCount: d.visitCount, lastVisit: d.lastVisit };
  }
  return { email: '', repName: '', source: 'none', visitCount: 0, lastVisit: '' };
}
