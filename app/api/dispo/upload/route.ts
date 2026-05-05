import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDispoData, saveDispoData, DispoUploadMeta } from '@/lib/dispoData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

// Column indices (0-based)
const COL_ARTICLE_DESC = 9;   // J
const COL_SITE_NAME = 27;     // AB
const COL_YTD = 23;           // X — "Curr Y/S" (YTD sales)
const COL_SOH = 30;           // AE
const COL_SOO = 31;           // AF
const COL_INCL_SP = 41;       // AP
const COL_PROM_SP = 42;       // AQ
// Sales columns Q through W = indices 16..22
const SALES_COL_START = 16;   // Q
const SALES_COL_END = 22;     // W

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
 * Scan the first N rows to find the header row — the one that has
 * parseable month values in columns Q-W.
 */
function findHeaderRow(rows: unknown[][], maxScan = 10): { headerIdx: number; monthMap: Record<number, string> } | null {
  const limit = Math.min(maxScan, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const monthMap: Record<number, string> = {};
    for (let col = SALES_COL_START; col <= SALES_COL_END; col++) {
      const val = row[col];
      if (val !== undefined && val !== null && val !== '') {
        const month = parseMonthFromHeader(val);
        if (month) monthMap[col] = month;
      }
    }
    // Need at least 2 month columns to be confident this is the header row
    if (Object.keys(monthMap).length >= 2) {
      return { headerIdx: r, monthMap };
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
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

    if (rows.length < 3) {
      return NextResponse.json({ error: 'File has insufficient rows' }, { status: 400 });
    }

    // Find the header row dynamically (headers may not be in row 1)
    const found = findHeaderRow(rows);
    if (!found) {
      // Gather debug info from first 10 rows, columns Q-W
      const debug: Record<string, unknown> = {};
      for (let r = 0; r < Math.min(10, rows.length); r++) {
        const row = rows[r] as unknown[];
        if (!row) continue;
        const cells: Record<string, string> = {};
        for (let col = SALES_COL_START; col <= SALES_COL_END; col++) {
          const letter = String.fromCharCode(65 + col);
          cells[letter] = `${typeof row[col]}: ${row[col]}`;
        }
        debug[`row${r + 1}`] = cells;
      }
      return NextResponse.json({
        error: 'Could not find header row with month columns (Q-W). Expected MM-YYYY format (e.g. "05-2026").',
        debug,
      }, { status: 400 });
    }

    const { headerIdx, monthMap } = found;
    // Data starts after the header row, skipping any blank rows
    // Find the first data row: has a value in the Article Desc column (J)
    let dataStartIdx = headerIdx + 1;
    while (dataStartIdx < rows.length) {
      const row = rows[dataStartIdx] as unknown[];
      if (row && row[COL_ARTICLE_DESC]) break;
      dataStartIdx++;
    }

    // Determine which is the current (rightmost) month
    const sortedCols = Object.keys(monthMap).map(Number).sort((a, b) => a - b);
    const currentMonthCol = sortedCols[sortedCols.length - 1];
    const currentMonthKey = monthMap[currentMonthCol];

    // Load existing data (ensure ytd exists for backwards compat)
    const data = await loadDispoData();
    if (!data.ytd) data.ytd = {};

    const allStores = new Set<string>();
    const allProducts = new Set<string>();
    let rowCount = 0;

    // Process data rows
    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row) continue;
      const articleDesc = row[COL_ARTICLE_DESC] ? String(row[COL_ARTICLE_DESC]).trim() : '';
      const siteName = row[COL_SITE_NAME] ? String(row[COL_SITE_NAME]).trim() : '';

      if (!articleDesc || !siteName) continue;

      allStores.add(siteName);
      allProducts.add(articleDesc);
      rowCount++;

      // Parse sales for each month column
      for (const colStr of Object.keys(monthMap)) {
        const col = Number(colStr);
        const monthKey = monthMap[col];
        const units = Number(row[col]) || 0;

        if (units === 0 && col !== currentMonthCol) continue;

        if (!data.sales[monthKey]) data.sales[monthKey] = {};
        if (!data.sales[monthKey][siteName]) data.sales[monthKey][siteName] = {};

        if (col === currentMonthCol) {
          data.sales[monthKey][siteName][articleDesc] = units;
        } else {
          if (data.sales[monthKey][siteName][articleDesc] === undefined) {
            data.sales[monthKey][siteName][articleDesc] = units;
          }
        }
      }

      // YTD sales (Col X)
      const ytdUnits = Number(row[COL_YTD]) || 0;
      if (!data.ytd[siteName]) data.ytd[siteName] = {};
      data.ytd[siteName][articleDesc] = ytdUnits;

      // Stock (latest snapshot)
      const soh = Number(row[COL_SOH]) || 0;
      const soo = Number(row[COL_SOO]) || 0;
      if (!data.stock[siteName]) data.stock[siteName] = {};
      data.stock[siteName][articleDesc] = { soh, soo };

      // Prices (latest)
      const inclSP = Number(row[COL_INCL_SP]) || 0;
      const promSP = Number(row[COL_PROM_SP]) || 0;
      if (inclSP > 0 || promSP > 0) {
        data.prices[articleDesc] = { inclSP, promSP };
      }
    }

    // Log the upload
    const uploadMeta: DispoUploadMeta = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.email,
      rowCount,
      months: [...new Set(Object.values(monthMap))],
      products: allProducts.size,
      stores: allStores.size,
    };
    data.uploads.push(uploadMeta);

    await saveDispoData(data);

    return NextResponse.json({
      ok: true,
      rowCount,
      months: [...new Set(Object.values(monthMap))],
      products: allProducts.size,
      stores: allStores.size,
      currentMonth: currentMonthKey,
      headerRow: headerIdx + 1,
      dataStartRow: dataStartIdx + 1,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('DISPO upload error:', err);
    return NextResponse.json({
      error: 'Failed to process file',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
