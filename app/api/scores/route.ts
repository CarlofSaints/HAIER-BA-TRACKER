import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, requireRole, noCacheHeaders } from '@/lib/auth';
import { loadScores, saveScores, BAScore, KPI_DEFS } from '@/lib/scoreData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = new URL(req.url).searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
  }

  try {
    const scores = await loadScores(month);
    return NextResponse.json(scores, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Scores GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { month, scores } = body as { month: string; scores: BAScore[] };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format' }, { status: 400 });
    }
    if (!Array.isArray(scores)) {
      return NextResponse.json({ error: 'scores must be an array' }, { status: 400 });
    }

    // Clamp values to max for each KPI
    const now = new Date().toISOString();
    const clamped: BAScore[] = scores.map(s => {
      const out: BAScore = { ...s, month, updatedAt: now, updatedBy: user.email };
      for (const kpi of KPI_DEFS) {
        const val = Number(out[kpi.key]) || 0;
        (out as unknown as Record<string, unknown>)[kpi.key] = Math.max(0, Math.min(val, kpi.max));
      }
      // Clamp trainingAuto and displayAuto (0–5, not in KPI_DEFS)
      out.trainingAuto = Math.max(0, Math.min(Number(out.trainingAuto) || 0, 5));
      out.displayAuto = Math.max(0, Math.min(Number(out.displayAuto) || 0, 5));
      return out;
    });

    // Compute diffs for activity log
    const existing = await loadScores(month);
    const changes: { email: string; field: string; before: number; after: number }[] = [];
    for (const s of clamped) {
      const prev = existing.find(e => e.email === s.email);
      if (!prev) continue;
      for (const kpi of KPI_DEFS) {
        const before = Number(prev[kpi.key]) || 0;
        const after = Number(s[kpi.key]) || 0;
        if (before !== after) changes.push({ email: s.email, field: kpi.label, before, after });
      }
    }

    await saveScores(month, clamped);
    if (changes.length > 0) {
      logFromUser(user, 'scores_save', `scores/${month}`, `Saved scores for ${month} — ${changes.length} field(s) changed`, { changes });
    }
    return NextResponse.json({ ok: true, count: clamped.length }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Scores PUT error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
