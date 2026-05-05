import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadDispoData } from '@/lib/dispoData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await loadDispoData();
    return NextResponse.json(data, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('DISPO GET error:', err);
    return NextResponse.json({ error: 'Failed to load DISPO data' }, { status: 500 });
  }
}
