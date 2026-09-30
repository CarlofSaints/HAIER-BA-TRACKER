import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadScores, calcTotal, calcGrandTotal, BAScore } from '@/lib/scoreData';
import { loadAllVisits } from '@/lib/visitData';
import { loadDispoData, calcSalesValue } from '@/lib/dispoData';
import { buildBaStoresForMonth } from '@/lib/baStores';
import { loadStores } from '@/lib/storeData';

export const dynamic = 'force-dynamic';

interface MonthScore {
  total: number;
  grandTotal: number;
  monthlySales: number;
  checkInOnTime: number;
  displayInspection: number;
  weeklySummaries: number;
  training: number;
  bonusSuggestions: number;
  salesVol?: number;
  salesVal?: number;
  // The stores Sales Vol / Val were summed over (same as the points).
  salesStores?: string[];
}

interface LeaderboardEntry {
  email: string;
  repName: string;
  storeName: string;
  scores: Record<string, MonthScore>;
}

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

function buildMonthScore(s: BAScore): MonthScore {
  return {
    total: calcTotal(s),
    grandTotal: calcGrandTotal(s),
    monthlySales: s.monthlySales,
    checkInOnTime: s.checkInOnTime,
    displayInspection: s.displayInspection,
    weeklySummaries: s.weeklySummaries,
    training: s.training,
    bonusSuggestions: s.bonusSuggestions,
  };
}

export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const monthCount = Math.min(Number(url.searchParams.get('months')) || 6, 24);
    const months = getLastNMonths(monthCount);

    // Load all visits, DISPO data, and store master in parallel
    const [allVisits, dispoData, storeMaster] = await Promise.all([
      loadAllVisits(),
      loadDispoData(),
      loadStores(),
    ]);

    // email → a store name from their visits: the Store column fallback when a
    // BA has no credited store in the chosen month.
    const storeMap = new Map<string, string>();
    for (const v of allVisits) {
      if (v.email && v.storeName) storeMap.set(v.email.toLowerCase(), v.storeName);
    }

    const baMap = new Map<string, LeaderboardEntry>();

    for (const month of months) {
      const scores = await loadScores(month);
      const [y, m] = month.split('-');
      const dispoMonthKey = `${m}-${y}`;

      // Same stores the Monthly Sales points were scored on (lib/baStores.ts),
      // summed. A BA covering several stores (Roaming, or a Dedicated BA not yet
      // cleaned up) gets all of them, not whichever store happened to be last.
      const baStores = buildBaStoresForMonth(month, storeMaster, allVisits);
      const monthSalesNorm: Record<string, Record<string, number>> = {};
      for (const [store, products] of Object.entries(dispoData.sales[dispoMonthKey] || {})) {
        monthSalesNorm[store.trim().toUpperCase()] = products;
      }

      for (const s of scores) {
        const key = s.email.toLowerCase();
        if (!baMap.has(key)) {
          baMap.set(key, { email: s.email, repName: s.repName, storeName: storeMap.get(key) || '', scores: {} });
        }
        const entry = baMap.get(key)!;
        if (s.repName) entry.repName = s.repName;

        const monthScore = buildMonthScore(s);

        const credited = [...(baStores.get(key)?.stores.values() || [])];
        let vol = 0, val = 0, hasSales = false;
        for (const storeName of credited) {
          const storeSales = monthSalesNorm[storeName.trim().toUpperCase()];
          if (!storeSales) continue;
          hasSales = true;
          for (const [article, units] of Object.entries(storeSales)) {
            vol += units;
            val += calcSalesValue(units, dispoData.prices[article]);
          }
        }
        if (hasSales) {
          monthScore.salesVol = vol;
          monthScore.salesVal = val;
        }
        if (credited.length) monthScore.salesStores = credited;

        entry.scores[month] = monthScore;
      }
    }

    const result = Array.from(baMap.values());
    return NextResponse.json(result, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Leaderboard GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
