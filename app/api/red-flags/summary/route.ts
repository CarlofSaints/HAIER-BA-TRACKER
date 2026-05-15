import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { countRedFlagsForMonth, RED_FLAG_TYPES } from '@/lib/redFlagData';

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

    const counts = await countRedFlagsForMonth(month);

    // Build per-type totals
    const typeTotals: Record<string, number> = {};
    for (const t of RED_FLAG_TYPES) {
      typeTotals[t] = 0;
    }

    const bas = Array.from(counts.entries()).map(([email, data]) => {
      // Accumulate type totals
      for (const [type, count] of Object.entries(data.byType)) {
        typeTotals[type] = (typeTotals[type] || 0) + count;
      }

      return {
        email,
        repName: data.repName,
        totalFlags: data.count,
        byType: data.byType,
      };
    });

    bas.sort((a, b) => b.totalFlags - a.totalFlags);

    return NextResponse.json({ month, bas, typeTotals }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Red flags summary GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
