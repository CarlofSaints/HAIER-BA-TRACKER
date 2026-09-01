import { loadAllVisits, type Visit } from './visitData';
import { loadTrainingIndex, loadTrainingData } from './trainingData';

/**
 * The BA roster — the single definition of "who is a BA", aggregated from visit
 * and training data. This is what the BA Management page (/bas) lists, and what
 * any page needing a full BA list must use, so the two can never disagree.
 *
 * Departed BAs leave the roster when their data is purged or excluded
 * (/api/bas/purge, /api/excluded-reps), which strips their visits and training.
 */
export interface BaRosterEntry {
  email: string;
  repName: string;
  visitCount: number;
  trainingCount: number;
  stores: string[];
  storeCount: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * @param preloadedVisits pass the visits you already hold so a caller that needs
 *   both the roster and the raw visits does not read them twice.
 */
export async function loadBaRoster(preloadedVisits?: Visit[]): Promise<BaRosterEntry[]> {
  const baMap = new Map<string, {
    email: string;
    repName: string;
    visitCount: number;
    trainingCount: number;
    stores: Set<string>;
    firstSeen: string;
    lastSeen: string;
  }>();

  function upsert(email: string, repName: string, date: string, store?: string) {
    const key = email.toLowerCase();
    if (!baMap.has(key)) {
      baMap.set(key, {
        email: key,
        repName: repName || email,
        visitCount: 0,
        trainingCount: 0,
        stores: new Set(),
        firstSeen: date || '',
        lastSeen: date || '',
      });
    }
    const entry = baMap.get(key)!;
    if (repName) entry.repName = repName;
    if (date && (!entry.firstSeen || date < entry.firstSeen)) entry.firstSeen = date;
    if (date && date > entry.lastSeen) entry.lastSeen = date;
    if (store) entry.stores.add(store);
  }

  const visits = preloadedVisits ?? await loadAllVisits();
  for (const v of visits) {
    if (!v.email) continue;
    upsert(v.email, v.repName, v.checkInDate, v.storeName || undefined);
    baMap.get(v.email.toLowerCase())!.visitCount++;
  }

  const trainingIndex = await loadTrainingIndex();
  for (const meta of trainingIndex) {
    for (const r of await loadTrainingData(meta.id)) {
      if (!r.email) continue;
      upsert(r.email, r.repName, r.date, r.store || undefined);
      baMap.get(r.email.toLowerCase())!.trainingCount++;
    }
  }

  const bas: BaRosterEntry[] = [...baMap.values()].map(b => ({
    email: b.email,
    repName: b.repName,
    visitCount: b.visitCount,
    trainingCount: b.trainingCount,
    stores: [...b.stores].slice(0, 5),
    storeCount: b.stores.size,
    firstSeen: b.firstSeen,
    lastSeen: b.lastSeen,
  }));

  bas.sort((a, b) => a.repName.localeCompare(b.repName));
  return bas;
}
