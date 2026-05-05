import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadScoringConfig, saveScoringConfig } from '@/lib/scoringConfig';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await loadScoringConfig();
  return NextResponse.json(config, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const current = await loadScoringConfig();

    const updated = {
      lateCheckinTime: body.lateCheckinTime || current.lateCheckinTime,
      earlyCheckoutTime: body.earlyCheckoutTime || current.earlyCheckoutTime,
    };

    // Validate HH:MM format
    const timeRe = /^\d{2}:\d{2}$/;
    if (!timeRe.test(updated.lateCheckinTime) || !timeRe.test(updated.earlyCheckoutTime)) {
      return NextResponse.json({ error: 'Times must be in HH:MM format' }, { status: 400 });
    }

    await saveScoringConfig(updated);
    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Scoring config error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
