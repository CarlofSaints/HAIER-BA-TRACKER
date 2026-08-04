import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { loadTargetData, TargetEntry } from '@/lib/targetData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
  Export ALL live targets as an .xlsx laid out EXACTLY the way
  app/api/targets/upload/route.ts parses it, so it round-trips:
  export -> edit in Excel -> re-upload.

  The upload parser is strictly positional, so this layout is load-bearing:
    - row 7  (index 6) = header row; a cell containing "<Month> Target" marks
                         the VALUE column, and the NEXT column is the volume col
    - rows 8-9 (idx 7-8) = ignored by the parser (we use row 8 for sub-labels)
    - row 10+ (index 9+) = data; col A = Store Name, col B = Site Code
    - a row whose value AND volume are both 0 is SKIPPED on re-upload, so
      blank month cells correctly stay "no target"

  Re-uploading this file MERGES by siteCode within each month (replacing the
  existing row), so exporting and re-uploading unchanged is a no-op.
*/

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// 'MM-YYYY' -> sortable number
function monthSortKey(key: string): number {
  const [mm, yyyy] = key.split('-');
  return Number(yyyy) * 100 + Number(mm);
}

// 'MM-YYYY' -> 'July Target'
function monthHeader(key: string): string {
  const mm = Number(key.split('-')[0]);
  return `${MONTH_LABELS[mm - 1] ?? key} Target`;
}

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await loadTargetData();
  const months = Object.keys(data.targets).sort((a, b) => monthSortKey(a) - monthSortKey(b));

  // Union of every store across every month, keyed by siteCode (upper-cased to
  // match getStoreTarget's comparison). Later months win for the display name.
  const stores = new Map<string, { siteCode: string; storeName: string }>();
  const byMonth = new Map<string, Map<string, TargetEntry>>();

  for (const m of months) {
    const idx = new Map<string, TargetEntry>();
    for (const e of data.targets[m] ?? []) {
      const code = e.siteCode.trim().toUpperCase();
      if (!code) continue;
      idx.set(code, e);
      stores.set(code, { siteCode: e.siteCode.trim(), storeName: e.storeName.trim() });
    }
    byMonth.set(m, idx);
  }

  const storeRows = [...stores.values()].sort((a, b) =>
    a.storeName.localeCompare(b.storeName) || a.siteCode.localeCompare(b.siteCode));

  // --- Build the sheet positionally ---
  const aoa: unknown[][] = [];
  for (let i = 0; i < 6; i++) aoa.push([]);          // rows 1-6: spacer (parser ignores)

  const header: unknown[] = ['Store Name', 'Site Code'];
  const subHeader: unknown[] = ['', ''];
  for (const m of months) {
    header.push(monthHeader(m), '');                  // value col, then volume col
    subHeader.push('Value (R)', 'Quantity (units)');
  }
  aoa.push(header);                                   // row 7  (index 6) <- parsed
  aoa.push(subHeader);                                // row 8  (index 7)   ignored
  aoa.push([]);                                       // row 9  (index 8)   ignored

  for (const s of storeRows) {                        // row 10+ (index 9+) <- parsed
    const row: unknown[] = [s.storeName, s.siteCode];
    for (const m of months) {
      const e = byMonth.get(m)?.get(s.siteCode.trim().toUpperCase());
      row.push(e ? e.valueTarget : '', e ? e.volumeTarget : '');
    }
    aoa.push(row);
  }

  // The parser bails on sheets with fewer than 10 rows; pad so an empty/near-empty
  // target set still produces a re-uploadable template.
  while (aoa.length < 10) aoa.push([]);

  const XLSX = require('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 34 }, { wch: 12 }, ...months.flatMap(() => [{ wch: 15 }, { wch: 15 }])];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Targets');
  // NOTE: do NOT annotate this as `: Buffer` — under Next 16 strict TS a Node
  // Buffer isn't assignable to BodyInit and the production build fails (see §13).
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="HaierTargets_${today}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
