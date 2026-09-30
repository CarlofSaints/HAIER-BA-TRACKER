import type { StoreMaster } from './storeData';
import type { Visit } from './visitData';

/*
  Which stores a BA is credited with for a month: the ONE rule behind both the
  Monthly Sales points (lib/autoCalc.ts) and the leaderboard's Sales Vol / Val.
  One difference, on purpose: the points skip a store with no target for the
  month (nothing to score against), while the leaderboard still shows its
  sales, so a missing target never hides sales that really happened.

    1. Every store the BA checked into that month (Perigee visit storeCode,
       matched on the store's siteCode or its Perigee Site Code override)...
    2. ...EXCEPT a store explicitly assigned to a BA, which is credited only to
       its assigned BA, whether or not they visited that month.

  A BA can hold several stores (a Roaming BA, or a Dedicated BA not yet cleaned
  up on the Stores page); callers sum over all of them.

  Returns email → { repName, stores: own siteCode (upper) → store master name }.
*/
export type BaStoresForMonth = Map<string, { repName: string; stores: Map<string, string> }>;

export function buildBaStoresForMonth(month: string, stores: StoreMaster[], allVisits: Visit[]): BaStoresForMonth {
  // Both a store's own siteCode and its Perigee override resolve to the store's
  // OWN siteCode (the target lookup key) + store name (the sales key).
  const perigeeToStore = new Map<string, { storeName: string; ownCode: string }>();
  for (const s of stores) {
    if (!s.siteCode) continue;
    const ownCode = s.siteCode.trim().toUpperCase();
    const resolved = { storeName: s.storeName, ownCode };
    perigeeToStore.set(ownCode, resolved);
    const pCode = s.perigeeSiteCode?.trim().toUpperCase();
    if (pCode) perigeeToStore.set(pCode, resolved);
  }

  const assignedByCode = new Map<string, { email: string; repName: string; storeName: string }>();
  for (const s of stores) {
    if (s.assignedBaEmail && s.siteCode) {
      assignedByCode.set(s.siteCode.trim().toUpperCase(), {
        email: s.assignedBaEmail.toLowerCase(),
        repName: s.assignedBaName || s.assignedBaEmail,
        storeName: s.storeName,
      });
    }
  }

  const baStores: BaStoresForMonth = new Map();
  for (const v of allVisits) {
    if (!v.checkInDate || !v.email || !v.checkInDate.startsWith(month)) continue;
    const email = v.email.toLowerCase();
    if (!baStores.has(email)) baStores.set(email, { repName: v.repName || v.email, stores: new Map() });
    const entry = baStores.get(email)!;
    if (v.storeCode) {
      const matched = perigeeToStore.get(v.storeCode.trim().toUpperCase());
      // An assigned store goes to its assigned BA below, not the visitor (e.g. a
      // departed BA still on record in Perigee).
      if (matched && !assignedByCode.has(matched.ownCode)) {
        entry.stores.set(matched.ownCode, matched.storeName);
      }
    }
    if (v.repName) entry.repName = v.repName;
  }

  for (const [code, a] of assignedByCode) {
    if (!baStores.has(a.email)) baStores.set(a.email, { repName: a.repName, stores: new Map() });
    const entry = baStores.get(a.email)!;
    entry.repName = a.repName;
    entry.stores.set(code, a.storeName);
  }

  return baStores;
}
