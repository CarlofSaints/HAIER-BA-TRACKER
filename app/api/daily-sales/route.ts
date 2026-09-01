import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDailySalesIndex } from '@/lib/dailySalesData';

export const dynamic = 'force-dynamic';

/** GET /api/daily-sales — upload history for the Data Upload page. */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await loadDailySalesIndex(), { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Daily sales index GET error:', err);
    return NextResponse.json({ error: 'Failed to load upload history' }, { status: 500 });
  }
}
