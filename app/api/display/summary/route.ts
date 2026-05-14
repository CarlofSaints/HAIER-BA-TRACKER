import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadKPIControls } from '@/lib/kpiControls';
import { countDisplayChecksForMonth } from '@/lib/displayData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const month = url.searchParams.get('month');
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    const { minDisplayChecksPerMonth } = await loadKPIControls();
    const counts = await countDisplayChecksForMonth(month);

    const results = Array.from(counts.entries()).map(([email, data]) => {
      const autoPoints = Math.min(5, Math.round((data.visitCount / minDisplayChecksPerMonth) * 5));
      return {
        email,
        repName: data.repName,
        visitCount: data.visitCount,
        productCount: data.productCount,
        minRequired: minDisplayChecksPerMonth,
        autoPoints,
        compliant: data.visitCount >= minDisplayChecksPerMonth,
      };
    });

    results.sort((a, b) => b.visitCount - a.visitCount);

    return NextResponse.json({ month, minRequired: minDisplayChecksPerMonth, bas: results }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Display summary GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
