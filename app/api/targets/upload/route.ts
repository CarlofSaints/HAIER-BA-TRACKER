import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadTargetData, saveTargetData, TargetEntry, TargetUploadMeta } from '@/lib/targetData';
import { writeJson } from '@/lib/blob';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

const MONTH_NAMES: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09',
  oct: '10', nov: '11', dec: '12',
};

/**
 * Parse a header cell like "April Target" or "May Target" and extract month name.
 * Returns MM-YYYY using the current year (targets don't include year).
 */
function parseTargetMonth(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim().toLowerCase();
  if (!str.includes('target')) return null;

  // Extract month name from e.g. "april target", "May Target"
  for (const [name, mm] of Object.entries(MONTH_NAMES)) {
    if (str.includes(name)) {
      const year = new Date().getFullYear();
      return `${mm}-${year}`;
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

    const data = await loadTargetData();
    const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const allMonths = new Set<string>();
    const allStores = new Set<string>();
    const processedSheets: string[] = [];

    // Raw data for rebuild-on-delete
    const rawTargets: Record<string, TargetEntry[]> = {};

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

      if (rows.length < 10) continue;

      // Scan row 7 (index 6) for cells matching *Target* (case-insensitive)
      const headerRow = rows[6] as unknown[];
      if (!headerRow) continue;

      // Find month columns: header cell contains "Target", value col = that col, volume col = col+1
      const monthCols: { monthKey: string; valueCol: number; volumeCol: number }[] = [];
      for (let col = 0; col < headerRow.length; col++) {
        const monthKey = parseTargetMonth(headerRow[col]);
        if (monthKey) {
          monthCols.push({ monthKey, valueCol: col, volumeCol: col + 1 });
          allMonths.add(monthKey);
        }
      }

      if (monthCols.length === 0) continue;
      processedSheets.push(sheetName);

      // Data rows from row 10 (index 9) onward
      for (let r = 9; r < rows.length; r++) {
        const row = rows[r] as unknown[];
        if (!row) continue;

        const storeName = row[0] ? String(row[0]).trim() : '';
        const siteCode = row[1] ? String(row[1]).trim() : '';
        if (!storeName || !siteCode) continue;

        allStores.add(siteCode);

        for (const { monthKey, valueCol, volumeCol } of monthCols) {
          const valueTarget = Number(row[valueCol]) || 0;
          const volumeTarget = Number(row[volumeCol]) || 0;
          if (valueTarget === 0 && volumeTarget === 0) continue;

          const entry: TargetEntry = { siteCode, storeName, valueTarget, volumeTarget };

          // Merge into main data
          if (!data.targets[monthKey]) data.targets[monthKey] = [];
          // Replace existing entry for same siteCode in this month
          const existIdx = data.targets[monthKey].findIndex(e => e.siteCode === siteCode);
          if (existIdx >= 0) {
            data.targets[monthKey][existIdx] = entry;
          } else {
            data.targets[monthKey].push(entry);
          }

          // Save to raw for rebuild
          if (!rawTargets[monthKey]) rawTargets[monthKey] = [];
          rawTargets[monthKey].push(entry);
        }
      }
    }

    if (processedSheets.length === 0) {
      return NextResponse.json({
        error: 'No sheets found with Target headers in row 7. Expected headers like "April Target", "May Target" etc.',
      }, { status: 400 });
    }

    // Save raw file for rebuild-on-delete
    await writeJson(`targets/raw/${uploadId}.json`, rawTargets);

    // Add upload metadata
    const meta: TargetUploadMeta = {
      id: uploadId,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.email,
      sheetNames: processedSheets,
      months: [...allMonths],
      storeCount: allStores.size,
    };
    data.uploads.push(meta);

    await saveTargetData(data);

    logFromUser(user, 'upload_targets', `targets/${uploadId}`, `Uploaded targets — ${allStores.size} stores, months: ${[...allMonths].join(', ')}`);
    return NextResponse.json({
      ok: true,
      uploadId,
      months: [...allMonths],
      storeCount: allStores.size,
      sheets: processedSheets,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Target upload error:', err);
    logFromUser(user, 'upload_targets', 'targets/failed', `Target upload failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({
      error: 'Failed to process target file',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
