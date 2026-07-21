import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runSamsSync } from '@/lib/samsSync';
import { isSqlProxyConfigured } from '@/lib/sqlProxy';
import { logActivity } from '@/lib/activityLog';
import { loadSamsSchedule, shouldRunNow } from '@/lib/samsSchedule';

// SAMS is the lowest-grain fact pull and can be large — give it the same headroom
// as the manual sync route.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Scheduled SAMS sync. Vercel calls this HOURLY (vercel.json). This route reads
 * the user-set schedule (config/sams-schedule.json, edited on the Sync Schedule
 * page) and only runs the sync when the current time matches an enabled hour +
 * weekday — so the timing is changed from the UI with no redeploy. Auth: Vercel
 * sends `Authorization: Bearer $CRON_SECRET`; a super_admin session is also
 * accepted (append ?force=true to run immediately, ignoring the schedule).
 * Syncs ALL channels whose data source is marked SAMS.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCronAuth = !cronSecret || authHeader === `Bearer ${cronSecret}`;
  const isAdminAuth = !!(await requireRole(req, ['super_admin']));
  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Gate on the user's schedule unless explicitly forced (manual "run now").
  const force = req.nextUrl.searchParams.get('force') === 'true';
  const schedule = await loadSamsSchedule();
  if (!force && !shouldRunNow(schedule, new Date())) {
    return NextResponse.json({ ok: true, action: 'skipped', reason: 'Outside the scheduled window.' });
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
