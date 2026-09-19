import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadSales7EmailConfig, saveSales7EmailConfig, parseEmailList, isEmail } from '@/lib/sales7Email';

export const dynamic = 'force-dynamic';

/* Settings for the daily Sales: Last 7 Days email (Sync Schedule page). */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ config: await loadSales7EmailConfig() }, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { enabled?: unknown; to?: unknown; cc?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: noCacheHeaders() });
  }

  const to = parseEmailList(body.to);
  const cc = parseEmailList(body.cc);
  const bad = [...to, ...cc].filter(e => !isEmail(e));
  if (bad.length) {
    return NextResponse.json({ error: `Not an email address: ${bad.join(', ')}` }, { status: 400, headers: noCacheHeaders() });
  }
  const enabled = !!body.enabled;
  if (enabled && to.length === 0) {
    return NextResponse.json({ error: 'Add at least one recipient, or switch the email off.' }, { status: 400, headers: noCacheHeaders() });
  }

  // Send state (lastSent*) is kept; only the settings change.
  const current = await loadSales7EmailConfig();
  const config = { ...current, enabled, to, cc };
  await saveSales7EmailConfig(config);
  return NextResponse.json({ ok: true, config }, { headers: noCacheHeaders() });
}
