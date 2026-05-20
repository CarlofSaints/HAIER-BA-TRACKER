import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadKPIControls } from '@/lib/kpiControls';
import { countRedFlagsForMonth } from '@/lib/redFlagData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface FeedbackAutoResult {
  email: string;
  repName: string;
  redFlagCount: number;
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

    const { minRedFlagsPerMonth } = await loadKPIControls();
    const counts = await countRedFlagsForMonth(month);

    const results: FeedbackAutoResult[] = Array.from(counts.entries()).map(([email, data]) => {
      const autoPoints = Math.min(3, Math.round((data.count / minRedFlagsPerMonth) * 3));
      return {
        email,
        repName: data.repName,
        redFlagCount: data.count,
        minRequired: minRedFlagsPerMonth,
        autoPoints,
      };
    });

    return NextResponse.json(results, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Feedback auto-calc error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
