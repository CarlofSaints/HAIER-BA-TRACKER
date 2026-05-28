import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadWeekMapping, saveWeekMapping, WeekMappingYear } from '@/lib/weekMapping';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await loadWeekMapping();
  return NextResponse.json(config, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { year, week1Start } = await req.json() as { year: number; week1Start: string };

  if (!year || !week1Start) {
    return NextResponse.json({ error: 'year and week1Start are required' }, { status: 400 });
  }

  // Validate the date
  const d = new Date(week1Start + 'T00:00:00');
  if (isNaN(d.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const config = await loadWeekMapping();
  const idx = config.years.findIndex(y => y.year === year);

  const entry: WeekMappingYear = { year, week1Start };
  if (idx >= 0) {
    config.years[idx] = entry;
  } else {
    config.years.push(entry);
    config.years.sort((a, b) => a.year - b.year);
  }

  await saveWeekMapping(config);
  return NextResponse.json({ ok: true, config }, { headers: noCacheHeaders() });
}
