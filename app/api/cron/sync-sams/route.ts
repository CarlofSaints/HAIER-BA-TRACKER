import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runSamsSync } from '@/lib/samsSync';
import { isSqlProxyConfigured } from '@/lib/sqlProxy';
import { logActivity } from '@/lib/activityLog';

// SAMS is the lowest-grain fact pull and can be large — give it the same headroom
// as the manual sync route.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Scheduled SAMS sync. Declared in vercel.json → Vercel calls this on a cron
 * (no in-app scheduler needed). Auth: Vercel sends `Authorization: Bearer
 * $CRON_SECRET`; a super_admin session is also accepted for a manual browser run
 * (append ?force=true to run outside the schedule). Syncs ALL channels whose
 * data source is marked SAMS (same as "Sync all SAMS" on the Data Sync page).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCronAuth = !cronSecret || authHeader === `Bearer ${cronSecret}`;
  const isAdminAuth = !!(await requireRole(req, ['super_admin']));
  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSqlProxyConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'SQL proxy not configured — set SQL_PROXY_URL and SQL_PROXY_API_KEY.' },
      { status: 400 },
    );
  }

  try {
    const meta = await runSamsSync('cron');
    logActivity(
      'sync_sams',
      'Cron',
      'System',
      'dispo/sams',
      `Cron SAMS sync — ${meta.counts?.salesRows ?? 0} sales cells across ${meta.counts?.months ?? 0} months, ${meta.counts?.stores ?? 0} stores.`,
      { salesRows: meta.counts?.salesRows ?? 0, stores: meta.counts?.stores ?? 0 },
    ).catch(() => {});
    return NextResponse.json({ ok: true, meta });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('Cron SAMS sync error:', err);
    return NextResponse.json({ ok: false, error: 'SAMS sync failed', detail }, { status: 500 });
  }
}
