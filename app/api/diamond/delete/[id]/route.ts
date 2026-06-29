import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDispoData, saveDispoData } from '@/lib/dispoData';
import { loadDiamondUploads, saveDiamondUploads, deleteDiamondRaw } from '@/lib/diamondData';
import { runAutoCalcForMonth } from '@/lib/autoCalc';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const uploads = await loadDiamondUploads();
  const upload = uploads.find(u => u.id === id);
  if (!upload) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });

  // Remove this upload's contribution from the shared DISPO model. One
  // store+month maps to exactly one Diamond upload (commit replaces in full),
  // so dropping the store's slice for that month + its stock is exact.
  const data = await loadDispoData();
  if (data.sales[upload.month]) delete data.sales[upload.month][upload.storeName];
  if (data.stock) delete data.stock[upload.storeName];
  await saveDispoData(data);

  await deleteDiamondRaw(id);
  await saveDiamondUploads(uploads.filter(u => u.id !== id));

  // Recalculate sales scores for the affected month.
  const [mm, yyyy] = upload.month.split('-');
  try {
    await runAutoCalcForMonth(`${yyyy}-${mm}`, ['sales']);
  } catch (err) {
    console.error('Diamond delete auto-calc failed:', err);
  }

  logFromUser(user, 'delete_diamond', `diamond/${id}`,
    `Deleted Diamond Corner upload for ${upload.storeName} (${upload.month})`);
  return NextResponse.json({ ok: true, deleted: true }, { headers: noCacheHeaders() });
}
