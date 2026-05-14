import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { getActivityLogRange } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.min(100, Math.max(10, Number(params.get('limit')) || 50));
  const actionFilter = params.get('action') || '';
  const actorFilter = params.get('actor') || '';

  // Default to current + last 2 months
  let months: string[];
  const monthsParam = params.get('months');
  if (monthsParam) {
    months = monthsParam.split(',').filter(m => /^\d{4}-\d{2}$/.test(m));
  } else {
    const now = new Date();
    months = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }

  try {
    let entries = await getActivityLogRange(months);

    if (actionFilter) entries = entries.filter(e => e.action === actionFilter);
    if (actorFilter) entries = entries.filter(e => e.actor === actorFilter);

    const total = entries.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paged = entries.slice(start, start + limit);

    return NextResponse.json({ entries: paged, total, page, limit, totalPages }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Activity log GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
