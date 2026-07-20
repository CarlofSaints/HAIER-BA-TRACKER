import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadSamsSyncLog } from '@/lib/samsSync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET — rolling SAMS sync history (last 50 runs) with per-query timings/rows,
// so the Data Sync page can show a "History" table like ARIA's.
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const log = await loadSamsSyncLog();
  return NextResponse.json({ log }, { headers: noCacheHeaders() });
}
