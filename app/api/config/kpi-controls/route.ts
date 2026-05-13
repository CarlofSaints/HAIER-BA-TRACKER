import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadKPIControls, saveKPIControls } from '@/lib/kpiControls';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const config = await loadKPIControls();
    return NextResponse.json(config, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('KPI controls GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const minTrainingsPerMonth = Math.max(1, Math.min(31, Math.round(Number(body.minTrainingsPerMonth) || 4)));
    const minVisitsPerMonth = Math.max(1, Math.min(100, Math.round(Number(body.minVisitsPerMonth) || 20)));
    const salesThresholdPct = Math.max(50, Math.min(100, Math.round(Number(body.salesThresholdPct) || 80)));
    await saveKPIControls({ minTrainingsPerMonth, minVisitsPerMonth, salesThresholdPct });
    return NextResponse.json({ ok: true, minTrainingsPerMonth, minVisitsPerMonth, salesThresholdPct }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('KPI controls PUT error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
