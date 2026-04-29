import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, loadVisitData, Visit } from '@/lib/visitData';
import { loadScores, saveScores, BAScore } from '@/lib/scoreData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Load all visits
    const index = await loadVisitIndex();
    const allVisits: Visit[] = [];
    for (const meta of index) {
      const visits = await loadVisitData(meta.id);
      allVisits.push(...visits);
    }

    if (allVisits.length === 0) {
      return NextResponse.json({ error: 'No visit data found' }, { status: 400 });
    }

    // Group visits by month (YYYY-MM)
    const byMonth = new Map<string, Visit[]>();
    for (const v of allVisits) {
      if (!v.checkInDate) continue;
      const month = v.checkInDate.substring(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month)!.push(v);
    }

    let totalMonths = 0;
    let totalBAs = 0;

    for (const [month, visits] of byMonth) {
      // Load any existing scores for this month (preserve manual entries)
      const existingScores = await loadScores(month);
      const existingMap = new Map<string, BAScore>();
      for (const s of existingScores) {
        existingMap.set(s.email.toLowerCase(), s);
      }

      // Group visits by BA for this month
      const baMap = new Map<string, { repName: string; total: number; onTime: number }>();
      for (const v of visits) {
        const email = (v.email || '').toLowerCase();
        if (!email) continue;
        if (!baMap.has(email)) {
          baMap.set(email, { repName: v.repName || v.email, total: 0, onTime: 0 });
        }
        const entry = baMap.get(email)!;
        if (v.repName) entry.repName = v.repName;
        entry.total++;

        const isCheckedOut = (v.status || '').toUpperCase() === 'CHECKED_OUT';
        const isOnTime = v.checkInTime && v.checkInTime <= '09:00';
        if (isCheckedOut && isOnTime) {
          entry.onTime++;
        }
      }

      // Build scores array — merge with existing or create new
      const now = new Date().toISOString();
      const scores: BAScore[] = [];

      for (const [email, data] of baMap) {
        const checkInScore = data.total > 0 ? Math.round((data.onTime / data.total) * 10) : 0;

        if (existingMap.has(email)) {
          // Existing score: update checkInOnTime + repName (preserve manual KPIs)
          const existing = existingMap.get(email)!;
          scores.push({
            ...existing,
            repName: data.repName,
            checkInOnTime: checkInScore,
            updatedAt: now,
            updatedBy: user.email,
          });
          existingMap.delete(email);
        } else {
          // New BA: create with only check-in score populated
          scores.push({
            email,
            repName: data.repName,
            month,
            monthlySales: 0,
            dailySales: 0,
            checkInOnTime: checkInScore,
            feedback: 0,
            displayInspection: 0,
            weeklySummaries: 0,
            training: 0,
            bonusSuggestions: 0,
            updatedAt: now,
            updatedBy: user.email,
          });
        }
        totalBAs++;
      }

      // Keep any existing BAs that weren't in visits this month
      for (const [, existing] of existingMap) {
        scores.push(existing);
      }

      await saveScores(month, scores);
      totalMonths++;
    }

    return NextResponse.json(
      { ok: true, months: totalMonths, bas: totalBAs },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    console.error('Seed from visits error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
