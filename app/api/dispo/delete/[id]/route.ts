import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDispoData, saveDispoData, DispoSalesData } from '@/lib/dispoData';
import { readJson, deleteBlob } from '@/lib/blob';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RawRow {
  articleDesc: string;
  siteName: string;
  siteCode: string;
  sales: Record<string, number>;
  ytd: number;
  soh: number;
  soo: number;
  inclSP: number;
  promSP: number;
}

interface RawFile {
  rows: RawRow[];
  monthMap: Record<number, string>;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const data = await loadDispoData();
  const uploadIdx = data.uploads.findIndex(u => u.id === id);
  if (uploadIdx === -1) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }

  // Remove the upload entry
  data.uploads.splice(uploadIdx, 1);

  // Delete raw file for this upload
  await deleteBlob(`dispo/raw/${id}.json`);

  // Full rebuild from remaining raw files
  const rebuilt: DispoSalesData = {
    sales: {},
    stock: {},
    prices: {},
    ytd: {},
    uploads: data.uploads,
  };

  for (const upload of data.uploads) {
    const rawFile = await readJson<RawFile | null>(`dispo/raw/${upload.id}.json`, null);
    if (!rawFile || !rawFile.rows) continue;

    for (const row of rawFile.rows) {
      const { articleDesc, siteName, sales, ytd, soh, soo, inclSP, promSP } = row;

      // Sales
      for (const [monthKey, units] of Object.entries(sales)) {
        if (units === 0) continue;
        if (!rebuilt.sales[monthKey]) rebuilt.sales[monthKey] = {};
        if (!rebuilt.sales[monthKey][siteName]) rebuilt.sales[monthKey][siteName] = {};
        rebuilt.sales[monthKey][siteName][articleDesc] = units;
      }

      // YTD (latest wins)
      if (!rebuilt.ytd[siteName]) rebuilt.ytd[siteName] = {};
      rebuilt.ytd[siteName][articleDesc] = ytd;

      // Stock (latest wins)
      if (!rebuilt.stock[siteName]) rebuilt.stock[siteName] = {};
      rebuilt.stock[siteName][articleDesc] = { soh, soo };

      // Prices (latest wins)
      if (inclSP > 0 || promSP > 0) {
        rebuilt.prices[articleDesc] = { inclSP, promSP };
      }
    }
  }

  await saveDispoData(rebuilt);

  logFromUser(user, 'delete_dispo', `dispo/${id}`, `Deleted DISPO upload ${id}`);
  return NextResponse.json({ ok: true, deleted: true }, { headers: noCacheHeaders() });
}
