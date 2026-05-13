import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, loadVisitData } from '@/lib/visitData';
import { loadTrainingIndex, loadTrainingData } from '@/lib/trainingData';
import { loadScores } from '@/lib/scoreData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/bas
 * Aggregates a list of BAs from visit + training + score data.
 * Returns unique BAs by email with visit/training counts.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
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

    // Visits
    const visitIndex = await loadVisitIndex();
    for (const meta of visitIndex) {
      const visits = await loadVisitData(meta.id);
      for (const v of visits) {
        if (!v.email) continue;
        upsert(v.email, v.repName, v.checkInDate, v.storeName || undefined);
        const entry = baMap.get(v.email.toLowerCase())!;
        entry.visitCount++;
      }
    }

    // Training
    const trainingIndex = await loadTrainingIndex();
    for (const meta of trainingIndex) {
      const records = await loadTrainingData(meta.id);
      for (const r of records) {
        if (!r.email) continue;
        upsert(r.email, r.repName, r.date, r.store || undefined);
        const entry = baMap.get(r.email.toLowerCase())!;
        entry.trainingCount++;
      }
    }

    // Convert to array
    const bas = Array.from(baMap.values()).map(b => ({
      email: b.email,
      repName: b.repName,
      visitCount: b.visitCount,
      trainingCount: b.trainingCount,
      storeCount: b.stores.size,
      stores: [...b.stores].slice(0, 5), // first 5 for display
      firstSeen: b.firstSeen,
      lastSeen: b.lastSeen,
    }));

    bas.sort((a, b) => a.repName.localeCompare(b.repName));

    return NextResponse.json(bas, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('BA list error:', err);
    return NextResponse.json({ error: 'Failed to load BA list' }, { status: 500 });
  }
}
