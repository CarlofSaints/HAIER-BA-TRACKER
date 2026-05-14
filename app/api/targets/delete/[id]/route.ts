import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadTargetData, saveTargetData, TargetData, TargetEntry } from '@/lib/targetData';
import { readJson, deleteBlob } from '@/lib/blob';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const data = await loadTargetData();

  const uploadIdx = data.uploads.findIndex(u => u.id === id);
  if (uploadIdx === -1) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }

  // Remove the upload entry
  data.uploads.splice(uploadIdx, 1);

  // Delete raw file for this upload
  await deleteBlob(`targets/raw/${id}.json`);

  // Full rebuild from remaining raw files
  const rebuilt: TargetData = { targets: {}, uploads: data.uploads };

  for (const upload of data.uploads) {
    const rawTargets = await readJson<Record<string, TargetEntry[]> | null>(`targets/raw/${upload.id}.json`, null);
    if (!rawTargets) continue;

    for (const [monthKey, entries] of Object.entries(rawTargets)) {
      if (!rebuilt.targets[monthKey]) rebuilt.targets[monthKey] = [];
      for (const entry of entries) {
        const existIdx = rebuilt.targets[monthKey].findIndex(e => e.siteCode === entry.siteCode);
        if (existIdx >= 0) {
          rebuilt.targets[monthKey][existIdx] = entry;
        } else {
          rebuilt.targets[monthKey].push(entry);
        }
      }
    }
  }

  await saveTargetData(rebuilt);

  logFromUser(user, 'delete_targets', `targets/${id}`, `Deleted target upload ${id}`);
  return NextResponse.json({ ok: true, deleted: true }, { headers: noCacheHeaders() });
}
