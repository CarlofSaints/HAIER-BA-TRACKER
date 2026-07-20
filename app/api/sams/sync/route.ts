import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { logFromUser } from '@/lib/activityLog';
import { runSamsSync, loadSamsSyncMeta } from '@/lib/samsSync';
import { isSqlProxyConfigured } from '@/lib/sqlProxy';

// SAMS is the lowest-grain fact pull and can be large; give it headroom like
// ARIA's sync route (the underlying proxy pool allows up to 180s per query).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST — run a manual SAMS sync (admin+).
export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isSqlProxyConfigured()) {
    return NextResponse.json(
      { error: 'SQL proxy not configured — set SQL_PROXY_URL and SQL_PROXY_API_KEY in the Vercel project.' },
      { status: 400, headers: noCacheHeaders() },
    );
  }

  try {
    const meta = await runSamsSync('manual');
    logFromUser(
      user,
      'sync_sams',
      'dispo/sams',
      `SAMS sync — ${meta.counts?.salesRows ?? 0} sales cells across ${meta.counts?.months ?? 0} months, ${meta.counts?.stores ?? 0} stores, ${meta.counts?.products ?? 0} products.`,
    );
    return NextResponse.json({ ok: true, meta }, { headers: noCacheHeaders() });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('SAMS sync error:', err);
    logFromUser(user, 'sync_sams', 'dispo/sams', `SAMS sync failed: ${detail}`);
    return NextResponse.json(
      { error: 'SAMS sync failed', detail },
      { status: 500, headers: noCacheHeaders() },
    );
  }
}

// GET — current sync status (last sync time, counts, per-query timings).
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const meta = await loadSamsSyncMeta();
  return NextResponse.json(
    { meta, configured: isSqlProxyConfigured() },
    { headers: noCacheHeaders() },
  );
}
