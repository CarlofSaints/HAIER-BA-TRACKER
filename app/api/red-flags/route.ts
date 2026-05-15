import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadRedFlagIndex } from '@/lib/redFlagData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const index = await loadRedFlagIndex();
    return NextResponse.json(index, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Red flags list error:', err);
    return NextResponse.json({ error: 'Failed to load red flag uploads' }, { status: 500 });
  }
}
