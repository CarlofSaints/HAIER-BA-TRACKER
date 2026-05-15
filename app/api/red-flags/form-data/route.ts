import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadRedFlagIndex, loadRedFlagFormData } from '@/lib/redFlagData';
import type { RedFlagFormRow } from '@/lib/redFlagData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/red-flags/form-data?month=YYYY-MM
 * Returns merged raw form data from all red flag uploads for the given month.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
  }

  try {
    const index = await loadRedFlagIndex();

    const allHeaders: string[] = [];
    const headerSet = new Set<string>();
    const allImageColumns = new Set<string>();
    const allRows: RedFlagFormRow[] = [];

    for (const meta of index) {
      const formData = await loadRedFlagFormData(meta.id);
      if (!formData) continue;

      for (const h of formData.headers) {
        if (!headerSet.has(h)) {
          headerSet.add(h);
          allHeaders.push(h);
        }
      }

      for (const ic of formData.imageColumns) {
        allImageColumns.add(ic);
      }

      for (const row of formData.rows) {
        const date = row['_normalizedDate'];
        if (typeof date === 'string' && date.startsWith(month)) {
          allRows.push(row);
        }
      }
    }

    const clientHeaders = allHeaders.filter(h => !h.startsWith('_'));

    return NextResponse.json({
      month,
      headers: clientHeaders,
      imageColumns: [...allImageColumns],
      rows: allRows,
      rowCount: allRows.length,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Red flags form-data GET error:', err);
    return NextResponse.json({ error: 'Failed to load form data' }, { status: 500 });
  }
}
