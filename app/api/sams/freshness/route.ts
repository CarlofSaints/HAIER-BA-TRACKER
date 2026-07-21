import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadSamsSyncMeta } from '@/lib/samsSync';

export const dynamic = 'force-dynamic';

/*
  Lightweight SAMS data-freshness indicator for the Dashboard + Sales & Stock
  cards. Returns just the recency fields (not the admin-only sync internals), so
  any logged-in user — including clients — can see how up to date the data is.
    latestDataDate — ISO date of the most recent SAMS fact row (data recency)
    lastSync       — ISO timestamp of when SAMS was last pulled
*/
export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const meta = await loadSamsSyncMeta();
    return NextResponse.json(
      { latestDataDate: meta.latestDataDate || null, lastSync: meta.lastSync || null },
      { headers: noCacheHeaders() },
    );
  } catch (err) {
    console.error('SAMS freshness GET error:', err);
    return NextResponse.json({ error: 'Failed to load SAMS freshness' }, { status: 500 });
  }
}
