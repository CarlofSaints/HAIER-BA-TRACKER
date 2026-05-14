import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadKPIControls } from '@/lib/kpiControls';
import { countDisplayChecksForMonth } from '@/lib/displayData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { month } = await req.json();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format' }, { status: 400 });
    }

    const { minDisplayChecksPerMonth } = await loadKPIControls();
    const counts = await countDisplayChecksForMonth(month);

    const results = Array.from(counts.entries()).map(([email, data]) => ({
      email,
      repName: data.repName,
      completedCount: data.visitCount,
      minRequired: minDisplayChecksPerMonth,
      autoPoints: Math.min(5, Math.round((data.visitCount / minDisplayChecksPerMonth) * 5)),
    }));

    return NextResponse.json(results, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Display auto-calc error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
