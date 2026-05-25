import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDispoData, saveDispoData, DispoUploadMeta } from '@/lib/dispoData';
import { loadStores, saveStores } from '@/lib/storeData';
import { writeJson } from '@/lib/blob';
import { logFromUser } from '@/lib/activityLog';
import { runAutoCalcForMonth } from '@/lib/autoCalc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

/** Known header patterns for dynamic column lookup (lowercase) */
const FIELD_PATTERNS: Record<string, (h: string) => boolean> = {
  articleDesc: (h) => h === 'article desc' || h === 'articledesc',
  siteCode:    (h) => h === 'site',
  siteName:    (h) => h === 'site name' || h === 'sitename',
  ytd:         (h) => h === 'curr y/s' || h === 'curr ys' || h === 'ytd',
  soh:         (h) => h.includes('soh'),
  soo:         (h) => h.includes('soo'),
  inclSP:      (h) => h === 'incl sp' || h === 'inclsp' || h === 'incl selling price',
  promSP:      (h) => h === 'prom sp' || h === 'promsp' || h === 'prom selling price',
};

type ColumnMap = Record<keyof typeof FIELD_PATTERNS, number>;

function parseMonthFromHeader(header: unknown): string | null {
  if (header === undefined || header === null) return null;

  if (header instanceof Date) {
    const mm = String(header.getMonth() + 1).padStart(2, '0');
    return `${mm}-${header.getFullYear()}`;
  }

  // Excel date serial (days since 1899-12-30)
  if (typeof header === 'number') {
    if (header > 30000 && header < 60000) {
      const d = new Date((header - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        return `${mm}-${d.getUTCFullYear()}`;
      }
    }
    return null;
  }

  const cleaned = String(header).trim();
  if (!cleaned) return null;

  // "MM-YYYY" (e.g. "05-2026", "12-2025")
  const mmyyyyMatch = cleaned.match(/^(\d{1,2})-(\d{4})$/);
  if (mmyyyyMatch) return `${mmyyyyMatch[1].padStart(2, '0')}-${mmyyyyMatch[2]}`;

  // "YYYY-MM"
  const yyyymmMatch = cleaned.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyymmMatch) return `${yyyymmMatch[2].padStart(2, '0')}-${yyyymmMatch[1]}`;

  // "Mon YYYY" / "Month YYYY"
  const months: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02',
    mar: '03', march: '03', apr: '04', april: '04',
    may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11',
    dec: '12', december: '12',
  };
  const wordMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (wordMatch) {
    const mm = months[wordMatch[1].toLowerCase()];
    if (mm) return `${mm}-${wordMatch[2]}`;
  }

  return null;
}

/**
 * Parse export date from cell A1 — format is typically DD.MM.YYYY or DD/MM/YYYY
 */
function parseExportDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  // Match DD.MM.YYYY or DD/MM/YYYY
  const m = str.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`;
  return null;
}

/**
 * Scan the first N rows to find the header row.
 * The header row is whichever row has both recognizable field names
 * AND at least 2 parseable month columns.
 * Returns the field column map AND the month column map in one pass.
 */
function findHeaderRow(rows: unknown[][], maxScan = 10): {
  headerIdx: number;
  cols: ColumnMap;
  monthMap: Record<number, string>;
} | null {
  const fieldKeys = Object.keys(FIELD_PATTERNS) as (keyof typeof FIELD_PATTERNS)[];
  const limit = Math.min(maxScan, rows.length);

  for (let r = 0; r < limit; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;

    // --- field columns ---
    const cols: Partial<ColumnMap> = {};
    // --- month columns ---
    const monthMap: Record<number, string> = {};

    for (let col = 0; col < row.length; col++) {
      const val = row[col];
      if (val === undefined || val === null || val === '') continue;

      // Check for month header first
      const month = parseMonthFromHeader(val);
      if (month) {
        monthMap[col] = month;
        continue;           // month columns won't also be field columns
      }

      // Check for known field name
      const h = String(val).trim().toLowerCase();
      if (!h) continue;
      for (const key of fieldKeys) {
        if (cols[key] === undefined && FIELD_PATTERNS[key](h)) {
          cols[key] = col;
          break;
        }
      }
    }

    // Need at least 2 month columns + all 8 required fields
    const missingFields = fieldKeys.filter(k => cols[k] === undefined);
    if (Object.keys(monthMap).length >= 2 && missingFields.length === 0) {
      return { headerIdx: r, cols: cols as ColumnMap, monthMap };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const XLSX = require('xlsx');
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', bookVBA: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const range = sheet['!ref'] || 'unknown';
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

    if (rows.length < 3) {
      return NextResponse.json({ error: 'File has insufficient rows' }, { status: 400 });
    }

    // Duplicate check: read cell A1 for export date
    const exportDateRaw = rows[0]?.[0];
    const exportDate = parseExportDate(exportDateRaw);

    // Load existing data
    const data = await loadDispoData();
    if (!data.ytd) data.ytd = {};

    // Check if this export date already exists in uploads
    if (exportDate) {
      const existing = data.uploads.find(u => (u as any).exportDate === exportDate);
      if (existing) {
        return NextResponse.json({
          error: `DISPO data for ${exportDate} has already been uploaded (file: ${existing.fileName}, uploaded ${new Date(existing.uploadedAt).toLocaleDateString('en-ZA')}).`,
        }, { status: 409 });
      }
    }

    // Find the header row dynamically (headers may not be in row 1)
    const found = findHeaderRow(rows);
    if (!found) {
      // Dump everything we can for diagnosis
      const debug: Record<string, unknown> = {};
      debug['_sheetRef'] = range;
      debug['_totalRows'] = rows.length;
      debug['_sheetNames'] = workbook.SheetNames;
      debug['_fileName'] = file.name;
      debug['_fileSize'] = file.size;

      // Show which fields were found in the best candidate row
      const fieldKeys = Object.keys(FIELD_PATTERNS) as (keyof typeof FIELD_PATTERNS)[];
      const candidateInfo: Record<string, unknown> = {};
      for (let r = 0; r < Math.min(10, rows.length); r++) {
        const row = rows[r] as unknown[];
        if (!row) continue;
        const foundFields: string[] = [];
        let monthCount = 0;
        for (let col = 0; col < row.length; col++) {
          const val = row[col];
          if (val === undefined || val === null || val === '') continue;
          if (parseMonthFromHeader(val)) { monthCount++; continue; }
          const h = String(val).trim().toLowerCase();
          for (const key of fieldKeys) {
            if (FIELD_PATTERNS[key](h)) { foundFields.push(`${key}=${col}`); break; }
          }
        }
        if (foundFields.length > 0 || monthCount > 0) {
          candidateInfo[`row${r + 1}`] = { months: monthCount, fields: foundFields };
        }
      }
      debug['_candidates'] = candidateInfo;

      // Dump first 5 rows — ALL columns (as array of values with col letter keys)
      for (let r = 0; r < Math.min(5, rows.length); r++) {
        const row = rows[r] as unknown[];
        if (!row) { debug[`row${r + 1}`] = 'null/undefined'; continue; }
        const cells: Record<string, string> = {};
        cells['_len'] = String(row.length);
        for (let col = 0; col < Math.min(row.length, 50); col++) {
          const letter = col < 26 ? String.fromCharCode(65 + col) : 'A' + String.fromCharCode(65 + col - 26);
          const val = row[col];
          cells[letter] = val === null ? 'null' : val === undefined ? 'undefined' : `${typeof val}: ${String(val).slice(0, 60)}`;
        }
        debug[`row${r + 1}`] = cells;
      }

      return NextResponse.json({
        error: 'Could not find header row. Need all 8 required fields (Article Desc, Site, Site Name, Curr Y/S, SOH, SOO, Incl SP, Prom SP) and at least 2 month columns.',
        debug,
      }, { status: 400 });
    }

    const { headerIdx, cols, monthMap } = found;
    // Data starts after the header row, skipping any blank rows
    let dataStartIdx = headerIdx + 1;
    while (dataStartIdx < rows.length) {
      const row = rows[dataStartIdx] as unknown[];
      if (row && row[cols.articleDesc]) break;
      dataStartIdx++;
    }

    // Determine which month column has the LATEST date (not rightmost position)
    const sortedCols = Object.keys(monthMap).map(Number).sort((a, b) => a - b);
    const currentMonthCol = sortedCols.reduce((best, col) => {
      const [mm, yyyy] = monthMap[col].split('-').map(Number);
      const [bmm, byyyy] = monthMap[best].split('-').map(Number);
      return (yyyy * 100 + mm) > (byyyy * 100 + bmm) ? col : best;
    }, sortedCols[0]);
    const currentMonthKey = monthMap[currentMonthCol];

    const allStores = new Set<string>();
    const allProducts = new Set<string>();
    let rowCount = 0;

    // Raw rows for rebuild-on-delete
    const rawRows: { articleDesc: string; siteName: string; siteCode: string; sales: Record<string, number>; ytd: number; soh: number; soo: number; inclSP: number; promSP: number }[] = [];

    // Clear sales for every month in this upload so stale data from
    // previous uploads doesn't inflate totals.  The raw files + rebuild-
    // on-delete ensure no data is permanently lost.
    for (const monthKey of new Set(Object.values(monthMap))) {
      data.sales[monthKey] = {};
    }

    // Load store master for new-store detection
    const storeMaster = await loadStores();
    const existingStoreNames = new Set(storeMaster.map(s => s.storeName));
    const newStoreEntries: { siteCode: string; storeName: string }[] = [];

    // Process data rows
    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row) continue;
      const articleDesc = row[cols.articleDesc] ? String(row[cols.articleDesc]).trim() : '';
      const siteName = row[cols.siteName] ? String(row[cols.siteName]).trim() : '';
      const siteCode = row[cols.siteCode] ? String(row[cols.siteCode]).trim() : '';

      if (!articleDesc || !siteName) continue;

      allStores.add(siteName);
      allProducts.add(articleDesc);
      rowCount++;

      // Track new stores
      if (!existingStoreNames.has(siteName)) {
        existingStoreNames.add(siteName);
        newStoreEntries.push({ siteCode, storeName: siteName });
      }

      const rowSales: Record<string, number> = {};

      // Parse sales for each month column
      for (const colStr of Object.keys(monthMap)) {
        const col = Number(colStr);
        const monthKey = monthMap[col];
        const units = Number(row[col]) || 0;

        rowSales[monthKey] = units;

        if (units === 0) continue;

        if (!data.sales[monthKey][siteName]) data.sales[monthKey][siteName] = {};
        data.sales[monthKey][siteName][articleDesc] = units;
      }

      // YTD sales
      const ytdUnits = Number(row[cols.ytd]) || 0;
      if (!data.ytd[siteName]) data.ytd[siteName] = {};
      data.ytd[siteName][articleDesc] = ytdUnits;

      // Stock (latest snapshot)
      const soh = Number(row[cols.soh]) || 0;
      const soo = Number(row[cols.soo]) || 0;
      if (!data.stock[siteName]) data.stock[siteName] = {};
      data.stock[siteName][articleDesc] = { soh, soo };

      // Prices (latest)
      const inclSP = Number(row[cols.inclSP]) || 0;
      const promSP = Number(row[cols.promSP]) || 0;
      if (inclSP > 0 || promSP > 0) {
        data.prices[articleDesc] = { inclSP, promSP };
      }

      // Save raw row for rebuild
      rawRows.push({ articleDesc, siteName, siteCode, sales: rowSales, ytd: ytdUnits, soh, soo, inclSP, promSP });
    }

    // Log the upload
    const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const uploadMeta: DispoUploadMeta & { exportDate?: string } = {
      id: uploadId,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.email,
      rowCount,
      months: [...new Set(Object.values(monthMap))],
      products: allProducts.size,
      stores: allStores.size,
    };
    if (exportDate) (uploadMeta as any).exportDate = exportDate;
    data.uploads.push(uploadMeta);

    // Save raw data for rebuild-on-delete
    await writeJson(`dispo/raw/${uploadId}.json`, { rows: rawRows, monthMap });

    // Update store master with new stores
    if (newStoreEntries.length > 0) {
      for (const entry of newStoreEntries) {
        storeMaster.push({ siteCode: entry.siteCode, storeName: entry.storeName, channelId: '' });
      }
      await saveStores(storeMaster);
    }

    await saveDispoData(data);

    // Auto-recalculate sales scores for affected months
    const affectedMonths = [...new Set(Object.values(monthMap))];
    const autoCalcResults: { month: string; updated: number }[] = [];
    for (const mm of affectedMonths) {
      // Convert MM-YYYY to YYYY-MM for the score system
      const [mmPart, yyyyPart] = mm.split('-');
      const yyyyMm = `${yyyyPart}-${mmPart}`;
      try {
        const result = await runAutoCalcForMonth(yyyyMm, ['sales']);
        autoCalcResults.push(result);
      } catch (err) {
        console.error(`Auto-calc sales failed for ${yyyyMm}:`, err);
      }
    }

    logFromUser(user, 'upload_dispo', `dispo/${uploadId}`, `Uploaded ${rowCount} DISPO rows — ${allStores.size} stores, ${allProducts.size} products. Sales scores auto-recalculated.`);
    return NextResponse.json({
      ok: true,
      rowCount,
      months: affectedMonths,
      products: allProducts.size,
      stores: allStores.size,
      currentMonth: currentMonthKey,
      headerRow: headerIdx + 1,
      dataStartRow: dataStartIdx + 1,
      newStoreNames: newStoreEntries.map(e => e.storeName),
      autoCalc: autoCalcResults,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('DISPO upload error:', err);
    logFromUser(user, 'upload_dispo', 'dispo/failed', `DISPO upload failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({
      error: 'Failed to process file',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
