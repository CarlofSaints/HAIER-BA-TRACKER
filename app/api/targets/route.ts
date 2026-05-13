import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadTargetData } from '@/lib/targetData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await loadTargetData();
    return NextResponse.json(data, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Targets GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
