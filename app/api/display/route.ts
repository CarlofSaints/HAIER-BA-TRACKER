import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDisplayIndex } from '@/lib/displayData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const index = await loadDisplayIndex();
    return NextResponse.json(index, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Display list error:', err);
    return NextResponse.json({ error: 'Failed to load display uploads' }, { status: 500 });
  }
}
