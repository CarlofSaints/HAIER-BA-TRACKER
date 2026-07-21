import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadSamsSchedule, saveSamsSchedule, SamsSchedule } from '@/lib/samsSchedule';
import { loadSamsSyncMeta } from '@/lib/samsSync';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [schedule, meta] = await Promise.all([loadSamsSchedule(), loadSamsSyncMeta()]);
  // lastAutoSync = last time the CRON actually ran a sync (not manual runs).
  return NextResponse.json(
    { schedule, lastAutoSync: meta.lastAutoSync ?? null, lastSync: meta.lastSync ?? null },
    { headers: noCacheHeaders() },
  );
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const schedule: SamsSchedule = {
      enabled: !!body.enabled,
      hours: Array.isArray(body.hours) ? body.hours : [],
      days: Array.isArray(body.days) ? body.days : [],
      timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : 'Africa/Johannesburg',
    };
    if (schedule.enabled && (schedule.hours.length === 0 || schedule.days.length === 0)) {
      return NextResponse.json(
        { error: 'Pick at least one time and one day, or disable the schedule.' },
        { status: 400, headers: noCacheHeaders() },
      );
    }
    await saveSamsSchedule(schedule);
    const saved = await loadSamsSchedule();
    return NextResponse.json({ ok: true, schedule: saved }, { headers: noCacheHeaders() });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: noCacheHeaders() });
  }
}
