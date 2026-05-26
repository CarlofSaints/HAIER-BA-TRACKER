import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import {
  WeeklyBAScore,
  loadWeeklyScores,
  saveWeeklyScores,
  aggregateWeeklyToMonthly,
  round2,
} from '@/lib/weeklyScoreData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  const week = Number(url.searchParams.get('week'));

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
  }
  if (!week || week < 1 || week > 5) {
    return NextResponse.json({ error: 'Invalid week (1-5)' }, { status: 400 });
  }

  try {
    const scores = await loadWeeklyScores(month, week);
    return NextResponse.json(scores, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Weekly scores GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { month, week, scores } = body as {
      month: string;
      week: number;
      scores: WeeklyBAScore[];
    };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format' }, { status: 400 });
    }
    if (!week || week < 1 || week > 5) {
      return NextResponse.json({ error: 'Invalid week (1-5)' }, { status: 400 });
    }
    if (!Array.isArray(scores)) {
      return NextResponse.json({ error: 'scores must be an array' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const clamped: WeeklyBAScore[] = scores.map(s => ({
      ...s,
      month,
      week,
      displayManual: round2(Math.max(0, Math.min(s.displayManual || 0, 15))),
      weeklySummaries: round2(Math.max(0, Math.min(s.weeklySummaries || 0, 10))),
      trainingManual: round2(Math.max(0, Math.min(s.trainingManual || 0, 15))),
      bonusSuggestions: round2(Math.max(0, Math.min(s.bonusSuggestions || 0, 10))),
      updatedAt: now,
      updatedBy: user.email,
    }));

    await saveWeeklyScores(month, week, clamped);

    // Re-aggregate all weekly data into the monthly file
    await aggregateWeeklyToMonthly(month);

    logFromUser(
      user,
      'scores_save',
      `weekly-scores/${month}/week-${week}`,
      `Saved week ${week} scores for ${month} — ${clamped.length} BAs`,
    );

    return NextResponse.json({ ok: true, count: clamped.length }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Weekly scores PUT error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
