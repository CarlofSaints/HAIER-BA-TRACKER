import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { deleteVisitUpload } from '@/lib/visitData';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    await deleteVisitUpload(id);
    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Delete upload error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
