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

function parseMonthFromHeader(header: string): string | null {
  if (!header || typeof header !== 'string') return null;
  const cleaned = String(header).trim();

  // Format: "MM-YYYY" (e.g. "05-2026", "12-2025")
  const mmyyyyMatch = cleaned.match(/^(\d{2})-(\d{4})$/);
  if (mmyyyyMatch) return `${mmyyyyMatch[1]}-${mmyyyyMatch[2]}`;

  // Format: "YYYY-MM" (e.g. "2026-05")
  const yyyymmMatch = cleaned.match(/^(\d{4})-(\d{2})$/);
  if (yyyymmMatch) return `${yyyymmMatch[2]}-${yyyymmMatch[1]}`;

  // Format: "Mon YYYY" or "Month YYYY" (e.g. "Mar 2026")
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
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      return NextResponse.json({ error: 'File has no data rows' }, { status: 400 });
    }

    // Parse month headers from the first row (columns Q..W)
    const headerRow = rows[0] as string[];
    const monthMap: Record<number, string> = {}; // colIndex → "MM-YYYY"
    for (let col = SALES_COL_START; col <= SALES_COL_END; col++) {
      const headerVal = headerRow[col];
      if (headerVal) {
        const month = parseMonthFromHeader(String(headerVal));
        if (month) {
          monthMap[col] = month;
        }
      }
    }

    if (Object.keys(monthMap).length === 0) {
      return NextResponse.json({
        error: 'Could not parse month headers from columns Q-W. Expected format: "MM-YYYY" (e.g. "05-2026").',
      }, { status: 400 });
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
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
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

        if (units === 0 && col !== currentMonthCol) continue; // Skip zero for older months

        // Initialize nested structure
        if (!data.sales[monthKey]) data.sales[monthKey] = {};
        if (!data.sales[monthKey][siteName]) data.sales[monthKey][siteName] = {};

        if (col === currentMonthCol) {
          // Current month: always overwrite
          data.sales[monthKey][siteName][articleDesc] = units;
        } else {
          // Older months: only write if not already present
          if (data.sales[monthKey][siteName][articleDesc] === undefined) {
            data.sales[monthKey][siteName][articleDesc] = units;
          }
        }
      }

      // Update YTD sales (Col X — "Curr Y/S", always overwrite with latest)
      const ytdUnits = Number(row[COL_YTD]) || 0;
      if (!data.ytd[siteName]) data.ytd[siteName] = {};
      data.ytd[siteName][articleDesc] = ytdUnits;

      // Update stock (latest snapshot)
      const soh = Number(row[COL_SOH]) || 0;
      const soo = Number(row[COL_SOO]) || 0;
      if (!data.stock[siteName]) data.stock[siteName] = {};
      data.stock[siteName][articleDesc] = { soh, soo };

      // Update prices (latest)
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
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('DISPO upload error:', err);
    return NextResponse.json({
      error: 'Failed to process file',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
