import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadKPIControls } from '@/lib/kpiControls';
import { countTrainingsForMonth } from '@/lib/trainingData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const month = url.searchParams.get('month');
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    const { minTrainingsPerMonth } = await loadKPIControls();
    const counts = await countTrainingsForMonth(month);

    const results = Array.from(counts.entries()).map(([email, data]) => {
      const autoPoints = Math.min(5, Math.round((data.count / minTrainingsPerMonth) * 5));
      return {
        email,
        repName: data.repName,
        completedCount: data.count,
        minRequired: minTrainingsPerMonth,
        autoPoints,
        compliant: data.count >= minTrainingsPerMonth,
      };
    });

    results.sort((a, b) => b.completedCount - a.completedCount);

    return NextResponse.json({ month, minRequired: minTrainingsPerMonth, bas: results }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Training summary GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
