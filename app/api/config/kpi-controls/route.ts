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
    await saveKPIControls({ minTrainingsPerMonth });
    return NextResponse.json({ ok: true, minTrainingsPerMonth }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('KPI controls PUT error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
