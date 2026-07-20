import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadSamsData } from '@/lib/dispoData';

export const dynamic = 'force-dynamic';

// Serves the SAMS comparison dataset (sams/data.json) in the exact same shape
// as /api/dispo, so the Sales & Stock page can render it via ?source=sams
// without any other changes. Read-only.
export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await loadSamsData();
    return NextResponse.json(data, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('SAMS data GET error:', err);
    return NextResponse.json({ error: 'Failed to load SAMS data' }, { status: 500 });
  }
}
