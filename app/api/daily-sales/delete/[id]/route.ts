import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { deleteDailySalesUpload } from '@/lib/dailySalesData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { removed, retained } = await deleteDailySalesUpload(id);
    logFromUser(user, 'delete_daily_sales', `daily-sales/${id}`,
      `Deleted daily sales upload ${id}: ${removed} submissions removed, ${retained} kept (also supplied by another upload)`);
    return NextResponse.json({ ok: true, removed, retained }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Daily sales delete error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
