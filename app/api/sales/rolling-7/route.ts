import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { buildRolling7Report } from '@/lib/rollingSales';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/*
  GET /api/sales/rolling-7 — the most recent 7 days of daily SAMS sales at
  store × SKU grain, each row carrying its store's BA. The page rolls these up
  to store and SKU views itself (lib/rolling7View.ts).
*/
export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await buildRolling7Report(), { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Rolling 7 GET error:', err);
    return NextResponse.json({ error: 'Failed to load rolling 7-day sales' }, { status: 500 });
  }
}
