import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { logFromUser } from '@/lib/activityLog';
import { addDailySales } from '@/lib/dailySalesData';
import { parseDailySales } from '@/lib/dailySalesParse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

/**
 * POST /api/daily-sales/upload
 * Ingests a Perigee "Daily Sales" form export (Excel/CSV).
 */
export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const fileName = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return NextResponse.json({ error: 'The file has no readable sheet' }, { status: 400 });

    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1, raw: true, defval: null, blankrows: false,
    });

    const parsed = parseDailySales(rows);

    if (parsed.headerRowIndex < 0) {
      return NextResponse.json({
        error: 'Could not find the header row. Expected a "Product sold" column alongside Email and Date.',
        firstRow: (rows[0] || []).map(c => String(c ?? '')).slice(0, 30),
      }, { status: 400 });
    }

    if (parsed.records.length === 0) {
      return NextResponse.json({
        error: 'No valid submissions found in the file',
        detectedHeaders: parsed.headers,
        productSets: parsed.productSets,
        dataRows: parsed.dataRows,
        issues: parsed.issues.slice(0, 10),
      }, { status: 400 });
    }

    const dates = parsed.records.map(r => r.date).filter(Boolean).sort();

    const uploadId = crypto.randomUUID();
    const { added, refreshed, months } = await addDailySales({
      id: uploadId,
      fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: `${user.name} ${user.surname}`,
      rowCount: parsed.records.length,
      lineCount: parsed.lineCount,
      productSets: parsed.productSets,
      dateFrom: dates[0] || '',
      dateTo: dates[dates.length - 1] || '',
    }, parsed.records);

    logFromUser(
      user,
      'upload_daily_sales',
      `daily-sales/${uploadId}`,
      `Uploaded ${fileName}: ${added} new submissions, ${refreshed} already held (${parsed.lineCount} product lines)`,
    );

    return NextResponse.json({
      ok: true,
      uploadId,
      rowCount: parsed.records.length,
      lineCount: parsed.lineCount,
      productSets: parsed.productSets,
      /** Submissions this file introduced. */
      added,
      /** Submissions already held, re-read from this file (never duplicated). */
      refreshed,
      months,
      dateFrom: dates[0] || '',
      dateTo: dates[dates.length - 1] || '',
      skippedRows: parsed.dataRows - parsed.records.length,
      issues: parsed.issues.slice(0, 10),
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Daily sales upload error:', err);
    logFromUser(user, 'upload_daily_sales', 'daily-sales/failed',
      `Daily sales upload failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({
      error: 'Upload failed: ' + (err instanceof Error ? err.message : 'Unknown'),
    }, { status: 500 });
  }
}
