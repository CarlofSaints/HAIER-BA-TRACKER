import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadScores, calcTotal, calcGrandTotal } from '@/lib/scoreData';
import { loadVisitIndex, loadVisitData } from '@/lib/visitData';

export const dynamic = 'force-dynamic';

interface MonthScore {
  total: number;
  grandTotal: number;
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

    // Build email → storeName map from visit data (BA is dedicated to one store)
    const storeMap = new Map<string, string>();
    const visitIndex = await loadVisitIndex();
    for (const meta of visitIndex) {
      const visits = await loadVisitData(meta.id);
      for (const v of visits) {
        if (v.email && v.storeName) {
          storeMap.set(v.email.toLowerCase(), v.storeName);
        }
      }
    }

    const baMap = new Map<string, LeaderboardEntry>();

    for (const month of months) {
      const scores = await loadScores(month);
      for (const s of scores) {
        const key = s.email.toLowerCase();
        if (!baMap.has(key)) {
          baMap.set(key, { email: s.email, repName: s.repName, storeName: storeMap.get(key) || '', scores: {} });
        }
        const entry = baMap.get(key)!;
        // Keep latest repName
        if (s.repName) entry.repName = s.repName;
        entry.scores[month] = {
          total: calcTotal(s),
          grandTotal: calcGrandTotal(s),
        };
      }
    }

    const result = Array.from(baMap.values());
    return NextResponse.json(result, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Leaderboard GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
