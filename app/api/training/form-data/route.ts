import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadTrainingIndex, loadTrainingFormData } from '@/lib/trainingData';
import type { TrainingFormRow } from '@/lib/trainingData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/training/form-data?month=YYYY-MM
 * Returns merged raw form data from all training uploads for the given month.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
  }

  try {
    const index = await loadTrainingIndex();

    const allHeaders: string[] = [];
    const headerSet = new Set<string>();
    const allImageColumns = new Set<string>();
    const allRows: TrainingFormRow[] = [];

    for (const meta of index) {
      const formData = await loadTrainingFormData(meta.id);
      if (!formData) continue;

      // Merge headers (maintain order, union)
      for (const h of formData.headers) {
        if (!headerSet.has(h)) {
          headerSet.add(h);
          allHeaders.push(h);
        }
      }

      // Merge image columns
      for (const ic of formData.imageColumns) {
        allImageColumns.add(ic);
      }

      // Filter rows by month
      for (const row of formData.rows) {
        const date = row['_normalizedDate'];
        if (typeof date === 'string' && date.startsWith(month)) {
          allRows.push(row);
        }
      }
    }

    // Remove internal fields from headers sent to client
    const clientHeaders = allHeaders.filter(h => !h.startsWith('_'));

    return NextResponse.json({
      month,
      headers: clientHeaders,
      imageColumns: [...allImageColumns],
      rows: allRows,
      rowCount: allRows.length,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Training form-data GET error:', err);
    return NextResponse.json({ error: 'Failed to load form data' }, { status: 500 });
  }
}
