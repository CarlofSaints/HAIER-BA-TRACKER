import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadBaRoster } from '@/lib/baRoster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/bas
 * The BA roster (visit + training data), with visit/training counts.
 * The aggregation itself lives in lib/baRoster so other pages that need the
 * full BA list resolve it identically.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await loadBaRoster(), { headers: noCacheHeaders() });
  } catch (err) {
    console.error('BA list error:', err);
    return NextResponse.json({ error: 'Failed to load BA list' }, { status: 500 });
  }
}
