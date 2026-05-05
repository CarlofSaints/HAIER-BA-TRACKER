import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { readJson, writeJson } from '@/lib/blob';

export const dynamic = 'force-dynamic';

export interface PollSlot {
  id: string;
  time: string;         // "08:00" (SAST)
  type: 'short' | 'long';  // short = today only, long = last 7 days
  enabled: boolean;
}

export interface PollSchedule {
  slots: PollSlot[];
  timezone: string;     // "Africa/Johannesburg"
}

const SCHEDULE_KEY = 'config/perigee-schedule.json';

const DEFAULT_SCHEDULE: PollSchedule = {
  slots: [],
  timezone: 'Africa/Johannesburg',
};

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const schedule = await readJson<PollSchedule>(SCHEDULE_KEY, DEFAULT_SCHEDULE);
  return NextResponse.json(schedule, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const schedule: PollSchedule = {
      slots: Array.isArray(body.slots) ? body.slots : [],
      timezone: body.timezone || 'Africa/Johannesburg',
    };

    // Validate slots
    for (const slot of schedule.slots) {
      if (!slot.id || !slot.time || !['short', 'long'].includes(slot.type)) {
        return NextResponse.json(
          { error: 'Invalid slot: each must have id, time (HH:MM), and type (short/long)' },
          { status: 400, headers: noCacheHeaders() }
        );
      }
    }

    await writeJson(SCHEDULE_KEY, schedule);
    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: noCacheHeaders() });
  }
}
