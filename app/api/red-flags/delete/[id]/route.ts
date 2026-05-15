import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { deleteRedFlagUpload } from '@/lib/redFlagData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    await deleteRedFlagUpload(id);
    logFromUser(user, 'delete_red_flags', `red-flags/${id}`, `Deleted red flag upload ${id}`);
    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Red flags delete error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
