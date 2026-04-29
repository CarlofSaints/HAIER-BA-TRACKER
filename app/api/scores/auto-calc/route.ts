import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, loadVisitData } from '@/lib/visitData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface AutoCalcResult {
  email: string;
  repName: string;
  score: number;
  totalVisits: number;
  onTimeVisits: number;
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { month } = await req.json() as { month: string };
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    // Load all visits
    const index = await loadVisitIndex();
    const allVisits = [];
    for (const meta of index) {
      const visits = await loadVisitData(meta.id);
      allVisits.push(...visits);
    }

    // Filter visits for the target month
    // checkInDate is "YYYY-MM-DD" — match first 7 chars to month
    const monthVisits = allVisits.filter(v => v.checkInDate && v.checkInDate.substring(0, 7) === month);

    // Group by BA email
    const baMap = new Map<string, { repName: string; total: number; onTime: number }>();

    for (const v of monthVisits) {
      const key = (v.email || '').toLowerCase();
      if (!key) continue;

      if (!baMap.has(key)) {
        baMap.set(key, { repName: v.repName || v.email, total: 0, onTime: 0 });
      }
      const entry = baMap.get(key)!;
      if (v.repName) entry.repName = v.repName;
      entry.total++;

      // "On time" = checkInTime <= "09:00" AND status = "CHECKED_OUT"
      const isCheckedOut = (v.status || '').toUpperCase() === 'CHECKED_OUT';
      const isOnTime = v.checkInTime && v.checkInTime <= '09:00';
      if (isCheckedOut && isOnTime) {
        entry.onTime++;
      }
    }

    const results: AutoCalcResult[] = Array.from(baMap.entries()).map(([email, data]) => ({
      email,
      repName: data.repName,
      totalVisits: data.total,
      onTimeVisits: data.onTime,
      score: data.total > 0 ? Math.round((data.onTime / data.total) * 10) : 0,
    }));

    return NextResponse.json(results, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Auto-calc error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
