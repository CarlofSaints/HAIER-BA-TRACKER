import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, loadVisitData, Visit } from '@/lib/visitData';

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

    // Deduplicate by visitId (guards against overlapping imports)
    const seenIds = new Set<string>();
    const deduped: Visit[] = [];
    let dupCount = 0;
    for (const v of allVisits) {
      if (v.visitId) {
        if (seenIds.has(v.visitId)) { dupCount++; continue; }
        seenIds.add(v.visitId);
      }
      deduped.push(v);
    }

    // Debug mode: return data stats
    if (url.searchParams.get('debug') === '1') {
      const noId = allVisits.filter(v => !v.visitId).length;
      // Find Cape Gate sample
      const capeGate = allVisits.filter(v =>
        (v.storeName || '').toLowerCase().includes('cape gate')
      );
      const capeGateIds = capeGate.map(v => v.visitId || '(no id)');
      return NextResponse.json({
        totalRaw: allVisits.length,
        uniqueVisitIds: seenIds.size,
        withoutVisitId: noId,
        duplicatesRemoved: dupCount,
        afterDedup: deduped.length,
        uploadBatches: index.length,
        batchSizes: index.map(m => ({ id: m.id.slice(0, 8), file: m.fileName, rows: m.rowCount })),
        capeGateRaw: capeGate.length,
        capeGateVisitIds: capeGateIds,
      }, { headers: noCacheHeaders() });
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
