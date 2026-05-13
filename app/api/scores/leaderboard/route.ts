import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadScores, calcTotal, calcGrandTotal } from '@/lib/scoreData';
import { loadVisitIndex, loadVisitData } from '@/lib/visitData';
import { loadDispoData } from '@/lib/dispoData';
import { loadStores } from '@/lib/storeData';

export const dynamic = 'force-dynamic';

interface MonthScore {
  total: number;
  grandTotal: number;
  salesVol?: number;
  salesVal?: number;
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

export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const monthCount = Math.min(Number(url.searchParams.get('months')) || 6, 24);
    const months = getLastNMonths(monthCount);

    // Load visit index, DISPO data, and store master in parallel
    const [visitIndex, dispoData, storeMaster] = await Promise.all([
      loadVisitIndex(),
      loadDispoData(),
      loadStores(),
    ]);

    // Build siteCode → DISPO storeName map from store master
    const codeToDispoName = new Map<string, string>();
    for (const s of storeMaster) {
      if (s.siteCode && s.storeName) {
        codeToDispoName.set(s.siteCode.toLowerCase().trim(), s.storeName);
      }
    }

    // Build normalized DISPO store name lookup (lowercase → original)
    const normToDispoName = new Map<string, string>();
    for (const monthData of Object.values(dispoData.sales)) {
      for (const store of Object.keys(monthData)) {
        normToDispoName.set(store.toLowerCase().trim(), store);
      }
    }

    // Build email → storeName and email → storeCode maps from visit data
    const storeMap = new Map<string, string>();
    const storeCodeMap = new Map<string, string>();
    for (const meta of visitIndex) {
      const visits = await loadVisitData(meta.id);
      for (const v of visits) {
        if (v.email) {
          const emailKey = v.email.toLowerCase();
          if (v.storeName) storeMap.set(emailKey, v.storeName);
          if (v.storeCode) storeCodeMap.set(emailKey, v.storeCode);
        }
      }
    }

    // Resolve BA email → DISPO store name (for sales lookup)
    const baDispoStore = new Map<string, string>();
    for (const [email] of storeMap) {
      const visitCode = storeCodeMap.get(email);
      const visitName = storeMap.get(email) || '';

      // Strategy 1: storeCode → store master siteCode → DISPO storeName
      if (visitCode) {
        const dispoName = codeToDispoName.get(visitCode.toLowerCase().trim());
        if (dispoName) { baDispoStore.set(email, dispoName); continue; }
      }

      // Strategy 2: visit storeName matches DISPO store name (case-insensitive)
      const normVisitName = visitName.toLowerCase().trim();
      if (normVisitName) {
        const dispoName = normToDispoName.get(normVisitName);
        if (dispoName) { baDispoStore.set(email, dispoName); continue; }
      }

      // Strategy 3: use visit storeName as-is (fallback)
      if (visitName) {
        baDispoStore.set(email, visitName);
      }
    }

    const baMap = new Map<string, LeaderboardEntry>();

    for (const month of months) {
      const scores = await loadScores(month);
      // Convert YYYY-MM to MM-YYYY for DISPO lookup
      const [y, m] = month.split('-');
      const dispoMonthKey = `${m}-${y}`;

      for (const s of scores) {
        const key = s.email.toLowerCase();
        if (!baMap.has(key)) {
          baMap.set(key, { email: s.email, repName: s.repName, storeName: storeMap.get(key) || '', scores: {} });
        }
        const entry = baMap.get(key)!;
        // Keep latest repName
        if (s.repName) entry.repName = s.repName;

        const monthScore: MonthScore = {
          total: calcTotal(s),
          grandTotal: calcGrandTotal(s),
        };

        // Add DISPO sales data if available
        const dispoStoreName = baDispoStore.get(key);
        if (dispoStoreName) {
          const storeSales = dispoData.sales[dispoMonthKey]?.[dispoStoreName];
          if (storeSales) {
            let vol = 0, val = 0;
            for (const [article, units] of Object.entries(storeSales)) {
              vol += units;
              const p = dispoData.prices[article];
              if (p) {
                const price = p.promSP > 0 ? p.promSP : p.inclSP;
                val += units * price;
              }
            }
            monthScore.salesVol = vol;
            monthScore.salesVal = val;
          }
        }

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
