import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, loadVisitData, Visit, visitDedupeKey } from '@/lib/visitData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from'); // YYYY-MM-DD
    const to = url.searchParams.get('to');     // YYYY-MM-DD

    const index = await loadVisitIndex();
    const allVisits: Visit[] = [];

    // Load all upload data
    for (const meta of index) {
      const visits = await loadVisitData(meta.id);
      allVisits.push(...visits);
    }

    // Deduplicate: by visitId when present, otherwise by composite key
    const seenKeys = new Set<string>();
    const deduped: Visit[] = [];
    let dupCount = 0;
    for (const v of allVisits) {
      const key = visitDedupeKey(v);
      if (seenKeys.has(key)) { dupCount++; continue; }
      seenKeys.add(key);
      deduped.push(v);
    }

    // Apply date filter
    let filtered = deduped;
    if (from) {
      filtered = filtered.filter(v => v.checkInDate >= from);
    }
    if (to) {
      filtered = filtered.filter(v => v.checkInDate <= to);
    }

    return NextResponse.json(filtered, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Visits GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
