import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { sendSales7Now, sendSales7Test } from '@/lib/sales7Email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/*
  POST { mode: 'test' }  → send the current report to the signed-in admin only.
  POST { mode: 'send' }  → send it to the saved recipients now, and record the
                           day as sent so the hourly check won't repeat it.
*/
export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const who = `${user.name} ${user.surname}`.trim() || user.email;
  const result = body.mode === 'send' ? await sendSales7Now(who) : await sendSales7Test(user.email);

  const status = result.action === 'failed' ? 502 : 200;
  return NextResponse.json({ result }, { status, headers: noCacheHeaders() });
}
