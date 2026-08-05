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

  // Read the doomed upload's raw file BEFORE deleting it — we need its store
  // names to know which stores are DISPO-sourced (see the rebuild note below).
  const deletedRaw = await readJson<RawFile | null>(`dispo/raw/${id}.json`, null);
  await deleteBlob(`dispo/raw/${id}.json`);

  // Full rebuild from the remaining raw files.
  //
  // CAREFUL: dispo/data.json is a SHARED dataset. DISPO uploads, the SAMS SQL
  // sync and the Diamond Corner PDF all merge into it, but ONLY DISPO uploads
  // leave a dispo/raw/{id}.json behind. Rebuilding purely from raw files
  // therefore used to silently WIPE every SAMS and Diamond Corner store —
  // the most destructive button in the app, one click, no warning.
  //
  // So: rebuild the DISPO-sourced slice from raw, and carry every non-DISPO
  // store through untouched. A store counts as DISPO-sourced if ANY dispo/raw
  // file mentions it — including the one being deleted, which is exactly how
  // this delete still removes that upload's stores.
  const dispoStoreNames = new Set<string>();
  for (const row of deletedRaw?.rows || []) dispoStoreNames.add(row.siteName);

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
      dispoStoreNames.add(siteName);

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

  // Carry through every store that no DISPO raw file owns (SAMS, Diamond
  // Corner, any future source). Prices are keyed by article, not store, so we
  // keep the originals and let the DISPO rebuild's values win on top.
  let preservedStores = 0;
  for (const [monthKey, byStore] of Object.entries(data.sales || {})) {
    for (const [siteName, byArticle] of Object.entries(byStore)) {
      if (dispoStoreNames.has(siteName)) continue;
      if (!rebuilt.sales[monthKey]) rebuilt.sales[monthKey] = {};
      rebuilt.sales[monthKey][siteName] = byArticle;
    }
  }
  for (const [siteName, byArticle] of Object.entries(data.stock || {})) {
    if (dispoStoreNames.has(siteName)) continue;
    rebuilt.stock[siteName] = byArticle;
    preservedStores++;
  }
  for (const [siteName, byArticle] of Object.entries(data.ytd || {})) {
    if (dispoStoreNames.has(siteName)) continue;
    rebuilt.ytd[siteName] = byArticle;
  }
  rebuilt.prices = { ...(data.prices || {}), ...rebuilt.prices };

  await saveDispoData(rebuilt);

  logFromUser(
    user,
    'delete_dispo',
    `dispo/${id}`,
    `Deleted DISPO upload ${id} (${preservedStores} non-DISPO stores preserved)`,
  );
  return NextResponse.json(
    { ok: true, deleted: true, preservedStores },
    { headers: noCacheHeaders() },
  );
}
