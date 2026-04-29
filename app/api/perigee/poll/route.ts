import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Stub — Perigee API polling not yet implemented
  return NextResponse.json(
    { status: 'not_implemented', message: 'Perigee API polling is not yet implemented. Use manual Excel upload.' },
    { headers: noCacheHeaders() }
  );
}
