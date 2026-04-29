import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadRoles, saveRoles } from '@/lib/roleData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roles = await loadRoles();
  return NextResponse.json(roles, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const roles = await req.json();
    if (!Array.isArray(roles)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    await saveRoles(roles);
    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Save roles error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
