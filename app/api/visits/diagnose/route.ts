import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, loadVisitData, Visit, visitDedupeKey } from '@/lib/visitData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Diagnostic view of the RAW (un-deduped) visit rows for one rep, so we can see
 * why the dashboard (which dedupes by visitId, else by email|store|date|time)
 * collapses many check-ins into fewer "visits". Returns every matching raw row
 * with its computed dedupe key + whether it survives dedup, plus histograms by
 * date and by dedupe key. Admin only.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const rep = (url.searchParams.get('rep') || '').trim().toLowerCase();
    const store = (url.searchParams.get('store') || '').trim().toLowerCase();
    const from = url.searchParams.get('from'); // YYYY-MM-DD
    const to = url.searchParams.get('to');     // YYYY-MM-DD

    if (!rep) return NextResponse.json({ error: 'rep (email or name) is required' }, { status: 400 });

    const index = await loadVisitIndex();
    const raw: (Visit & { _uploadId: string })[] = [];
    for (const meta of index) {
      const visits = await loadVisitData(meta.id);
      for (const v of visits) raw.push({ ...v, _uploadId: meta.id });
    }

    // Match rep by exact email OR name substring (rep names vary).
    const matchRep = (v: Visit) =>
      (v.email || '').toLowerCase() === rep ||
      (v.repName || '').toLowerCase().includes(rep);
    const matchStore = (v: Visit) =>
      !store ||
      (v.storeName || '').toLowerCase().includes(store) ||
      (v.storeCode || '').toLowerCase().includes(store);
    const inRange = (v: Visit) =>
      (!from || (v.checkInDate || '') >= from) &&
      (!to || (v.checkInDate || '') <= to);

    let matched = raw.filter(v => matchRep(v) && matchStore(v));
    matched = matched.filter(inRange);

    // Determine which rows survive dedup (first occurrence of each dedupe key
    // wins — same rule as /api/visits, applied here to the matched set; keys
    // include email/store so cross-rep collisions don't apply).
    const seen = new Set<string>();
    const byKey: Record<string, number> = {};
    const byDate: Record<string, number> = {};
    const rows = matched
      .slice()
      .sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || '') || (a.checkInTime || '').localeCompare(b.checkInTime || ''))
      .map(v => {
        const key = visitDedupeKey(v);
        const kept = !seen.has(key);
        if (kept) seen.add(key);
        byKey[key] = (byKey[key] || 0) + 1;
        const d = v.checkInDate || '(blank)';
        byDate[d] = (byDate[d] || 0) + 1;
        return {
          checkInDate: v.checkInDate || '',
          checkInTime: v.checkInTime || '',
          checkOutDate: v.checkOutDate || '',
          checkOutTime: v.checkOutTime || '',
          storeName: v.storeName || '',
          storeCode: v.storeCode || '',
          visitId: v.visitId || '',
          email: v.email || '',
          repName: v.repName || '',
          uploadId: v._uploadId,
          dedupeKey: key,
          kept,
        };
      });

    const keptCount = rows.filter(r => r.kept).length;

    return NextResponse.json({
      rep,
      store: store || null,
      from: from || null,
      to: to || null,
      summary: {
        rawMatched: rows.length,
        survivesDedup: keptCount,
        droppedAsDuplicate: rows.length - keptCount,
        distinctDates: Object.keys(byDate).length,
        distinctDedupeKeys: Object.keys(byKey).length,
        anyVisitId: rows.some(r => r.visitId),
        anyBlankCheckInTime: rows.some(r => !r.checkInTime),
        anyBlankCheckInDate: rows.some(r => !r.checkInDate),
      },
      byDate: Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
      byDedupeKey: Object.entries(byKey).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
      rows,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Visit diagnose error:', err);
    return NextResponse.json({ error: 'Failed', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
