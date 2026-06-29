import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDispoData, saveDispoData } from '@/lib/dispoData';
import { loadStores } from '@/lib/storeData';
import {
  loadDiamondUploads, saveDiamondUploads, saveDiamondRaw, deleteDiamondRaw,
  DiamondRow, DiamondUploadMeta,
} from '@/lib/diamondData';
import { runAutoCalcForMonth } from '@/lib/autoCalc';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

interface CommitBody {
  siteCode: string;
  storeName: string;
  month: string;       // "MM-YYYY"
  dateFrom?: string;
  dateTo?: string;
  fileName: string;
  rows: DiamondRow[];
  /** Override the month-to-date staleness guard (load an older range anyway). */
  force?: boolean;
}

const MONTH_RE = /^\d{2}-\d{4}$/;

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as CommitBody;
    const storeName = (body.storeName || '').trim();
    const siteCode = (body.siteCode || '').trim();
    const month = (body.month || '').trim();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!storeName) return NextResponse.json({ error: 'Select a target store before loading.' }, { status: 400 });
    if (!MONTH_RE.test(month)) return NextResponse.json({ error: 'A valid month (MM-YYYY) is required.' }, { status: 400 });
    if (rows.length === 0) return NextResponse.json({ error: 'No rows to load.' }, { status: 400 });

    // Confirm the target store exists in the store master (so scoring/reports can resolve it).
    const stores = await loadStores();
    const target = stores.find(s => s.storeName === storeName);
    if (!target) {
      return NextResponse.json({ error: `Store "${storeName}" is not in the store master. Add it (with a channel) on the Stores page first.` }, { status: 400 });
    }

    // Month-to-date staleness guard: these PDFs are month-to-date and loading
    // OVERWRITES the store's slice for the month. Block a file whose end-date is
    // OLDER than one already loaded for this store+month, so a partial range
    // can't silently replace a fuller one. Caller can override with force:true.
    const uploads = await loadDiamondUploads();
    const existingForSlot = uploads.filter(u => u.storeName === storeName && u.month === month);
    const newEnd = (body.dateTo || '').trim();
    if (!body.force && newEnd) {
      const staler = existingForSlot.find(u => (u.dateTo || '') > newEnd);
      if (staler) {
        return NextResponse.json({
          stale: true,
          existingDateTo: staler.dateTo,
          newDateTo: newEnd,
          error: `A more recent Diamond Corner file is already loaded for ${storeName} (${month}) — it covers up to ${staler.dateTo}, but this file only goes to ${newEnd}. Loading it would replace the fuller data with a partial range.`,
        }, { status: 409 });
      }
    }

    const data = await loadDispoData();
    if (!data.ytd) data.ytd = {};
    if (!data.sales[month]) data.sales[month] = {};

    // Replace this store's slice for this month so a re-upload is a clean
    // OVERWRITE, not a sum — these PDFs are month-to-date. Wipe both the
    // month's sales slice and the store's stock snapshot before re-writing,
    // so products that dropped out of the newer file don't linger. Other
    // stores and other months are untouched. (Diamond Corner stores only ever
    // hold Diamond data, so clearing the whole store stock is safe.)
    data.sales[month][storeName] = {};
    data.stock[storeName] = {};

    const unmappedCodes: string[] = [];
    let totalValue = 0;
    let loadedRows = 0;

    for (const r of rows) {
      const articleDesc = (r.articleDesc || r.description || '').trim();
      if (!articleDesc) continue;
      const qty = Number(r.qty) || 0;
      const soh = Number(r.soh) || 0;
      const value = Number(r.value) || 0;
      if (!r.mapped && r.code) unmappedCodes.push(r.code);
      totalValue += value;
      loadedRows++;

      // Sales units (skip zero, mirroring DISPO behaviour)
      if (qty !== 0) {
        data.sales[month][storeName][articleDesc] = qty;
      }

      // Stock snapshot (Diamond Corner report has no stock-on-order)
      data.stock[storeName][articleDesc] = { soh, soo: 0 };

      // Price: derive per-unit from value / qty (VAT-inclusive retail, like inclSP),
      // so calcSalesValue() reproduces the report's value nett of VAT.
      if (qty > 0 && value > 0) {
        data.prices[articleDesc] = { inclSP: value / qty, promSP: 0 };
      }
    }

    // Remove any prior Diamond upload for this same store+month (and its raw),
    // then record the new one. (`uploads`/`existingForSlot` loaded above.)
    for (const old of existingForSlot) await deleteDiamondRaw(old.id);
    const kept = uploads.filter(u => !(u.storeName === storeName && u.month === month));

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const meta: DiamondUploadMeta = {
      id,
      fileName: body.fileName || 'diamond-corner.pdf',
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.email,
      storeName,
      siteCode: siteCode || target.siteCode,
      month,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      rowCount: loadedRows,
      totalValue,
      unmappedCodes: [...new Set(unmappedCodes)],
    };
    kept.push(meta);

    await saveDispoData(data);
    await saveDiamondRaw(id, { meta, rows });
    await saveDiamondUploads(kept);

    // Auto-recalculate sales scores for the affected month (MM-YYYY -> YYYY-MM).
    const [mm, yyyy] = month.split('-');
    let autoCalc: { month: string; updated: number } | null = null;
    try {
      autoCalc = await runAutoCalcForMonth(`${yyyy}-${mm}`, ['sales']);
    } catch (err) {
      console.error('Diamond commit auto-calc failed:', err);
    }

    logFromUser(user, 'upload_diamond', `diamond/${id}`,
      `Loaded ${loadedRows} Diamond Corner rows for ${storeName} (${month}). Sales scores auto-recalculated.`);

    return NextResponse.json({
      ok: true,
      id,
      storeName,
      month,
      rowCount: loadedRows,
      totalValue,
      unmappedCodes: meta.unmappedCodes,
      autoCalc,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Diamond commit error:', err);
    return NextResponse.json({
      error: 'Failed to load data',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
