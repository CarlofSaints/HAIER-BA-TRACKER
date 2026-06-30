import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDispoData, saveDispoData } from '@/lib/dispoData';
import { loadStores, saveStores, addStoreSource } from '@/lib/storeData';
import { loadProducts, saveProducts, ProductMaster } from '@/lib/productData';
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
  /** Store-master fields, editable in the UI (not in the PDF). The store is
   *  upserted from these so Diamond Corner stores can be created at upload
   *  time, just like DISPO uploads auto-create stores. */
  channelId?: string;
  area?: string;
  assignedBaEmail?: string;
  assignedBaName?: string;
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

    // Upsert the target store into the store master from the editable fields the
    // admin filled in on the upload screen (site code, area, channel, BA) — the
    // PDF only supplies the store name, so the rest is provided in the UI. This
    // lets a Diamond Corner store be created at upload time, mirroring how DISPO
    // uploads auto-populate stores.
    const channelId = (body.channelId || '').trim();
    const area = (body.area || '').trim();
    const assignedBaEmail = (body.assignedBaEmail || '').trim();
    const assignedBaName = (body.assignedBaName || '').trim();

    const stores = await loadStores();
    let target = stores.find(s => s.storeName.toLowerCase() === storeName.toLowerCase());
    let storesChanged = false;
    if (!target) {
      target = { siteCode, storeName, channelId, area, assignedBaEmail, assignedBaName, addedFrom: ['data'] };
      stores.push(target);
      storesChanged = true;
    } else {
      if (addStoreSource(target, 'data')) storesChanged = true;
      // Apply edits to the existing store (the form is prefilled from it, so
      // unchanged fields round-trip unchanged). Don't blank the site code if the
      // field was left empty.
      if (siteCode && target.siteCode !== siteCode) { target.siteCode = siteCode; storesChanged = true; }
      if (channelId && target.channelId !== channelId) { target.channelId = channelId; storesChanged = true; }
      if (area !== (target.area || '')) { target.area = area; storesChanged = true; }
      if (assignedBaEmail !== (target.assignedBaEmail || '')) { target.assignedBaEmail = assignedBaEmail; storesChanged = true; }
      if (assignedBaName !== (target.assignedBaName || '')) { target.assignedBaName = assignedBaName; storesChanged = true; }
    }
    if (storesChanged) await saveStores(stores);

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

    // Load the Products master up front and re-resolve each row's product
    // mapping from its (possibly user-edited) Diamond code here on the server,
    // rather than trusting the client's `mapped`/`articleDesc` — so edits made
    // in the preview are authoritative.
    const products = await loadProducts();
    const byArticle = new Map<string, ProductMaster>();
    const byDiamond = new Map<string, ProductMaster>();
    for (const p of products) {
      byArticle.set(p.articleDesc.toLowerCase().trim(), p);
      if (p.diamondCode?.trim()) byDiamond.set(p.diamondCode.trim().toUpperCase(), p);
    }
    const resolveArticle = (r: DiamondRow): { code: string; articleDesc: string; mapped: boolean } => {
      const code = (r.code || '').trim();
      const mappedProduct = code ? byDiamond.get(code.toUpperCase()) : undefined;
      return { code, mapped: !!mappedProduct, articleDesc: (mappedProduct?.articleDesc || r.description || '').trim() };
    };

    const unmappedCodes: string[] = [];
    let totalValue = 0;
    let loadedRows = 0;

    for (const r of rows) {
      const { code, articleDesc, mapped } = resolveArticle(r);
      if (!articleDesc) continue;
      const qty = Number(r.qty) || 0;
      const soh = Number(r.soh) || 0;
      const value = Number(r.value) || 0;
      if (!mapped && code) unmappedCodes.push(code);
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

    // Reconcile the Products master so Diamond Corner products that aren't on the
    // Products page get added there, with their Diamond Corner code populated:
    //  - row already mapped by diamondCode -> product exists, leave it.
    //  - else a product with the same articleDesc exists -> backfill diamondCode
    //    if it's missing (so future uploads map by code).
    //  - else create a new product seeded with the Diamond code; the Makro
    //    Product Code etc. stay blank for the admin to fill if it later shows up
    //    in DISPO/Makro data.
    // (products / byArticle / byDiamond were built above and are reused here.)
    let productsChanged = false;
    const newProductNames: string[] = [];
    for (const r of rows) {
      const { code, articleDesc } = resolveArticle(r);
      if (!articleDesc) continue;
      // Already known by its Diamond code — nothing to add.
      if (code && byDiamond.has(code.toUpperCase())) continue;
      const existing = byArticle.get(articleDesc.toLowerCase().trim());
      if (existing) {
        if (code && !existing.diamondCode?.trim()) {
          existing.diamondCode = code;
          byDiamond.set(code.toUpperCase(), existing);
          productsChanged = true;
        }
        continue;
      }
      const np: ProductMaster = {
        articleDesc, productCode: '', category: '', industry: '', status: '',
        diamondCode: code,
      };
      products.push(np);
      byArticle.set(articleDesc.toLowerCase().trim(), np);
      if (code) byDiamond.set(code.toUpperCase(), np);
      newProductNames.push(articleDesc);
      productsChanged = true;
    }
    if (productsChanged) {
      products.sort((a, b) => a.articleDesc.localeCompare(b.articleDesc));
      await saveProducts(products);
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

    const newProductNote = newProductNames.length
      ? ` ${newProductNames.length} new product(s) added to Products (Diamond code populated).`
      : '';
    logFromUser(user, 'upload_diamond', `diamond/${id}`,
      `Loaded ${loadedRows} Diamond Corner rows for ${storeName} (${month}). Sales scores auto-recalculated.${newProductNote}`);

    return NextResponse.json({
      ok: true,
      id,
      storeName,
      month,
      rowCount: loadedRows,
      totalValue,
      unmappedCodes: meta.unmappedCodes,
      newProducts: newProductNames,
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
