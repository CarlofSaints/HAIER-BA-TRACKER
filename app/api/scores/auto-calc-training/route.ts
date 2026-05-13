import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadKPIControls } from '@/lib/kpiControls';
import { countTrainingsForMonth } from '@/lib/trainingData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface TrainingAutoResult {
  email: string;
  repName: string;
  completedCount: number;
  minRequired: number;
  autoPoints: number;
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { month } = await req.json() as { month: string };
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    const { minTrainingsPerMonth } = await loadKPIControls();
    const counts = await countTrainingsForMonth(month);

    const results: TrainingAutoResult[] = Array.from(counts.entries()).map(([email, data]) => {
      const autoPoints = Math.min(5, Math.round((data.count / minTrainingsPerMonth) * 5));
      return {
        email,
        repName: data.repName,
        completedCount: data.count,
        minRequired: minTrainingsPerMonth,
        autoPoints,
      };
    });

    return NextResponse.json(results, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Training auto-calc error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
