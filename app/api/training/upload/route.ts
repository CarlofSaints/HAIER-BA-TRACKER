import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import {
  loadTrainingIndex,
  saveTrainingIndex,
  saveTrainingData,
  saveTrainingFormData,
  TrainingRecord,
  TrainingFormRow,
  TrainingFormData,
} from '@/lib/trainingData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

// Column mapping for training form exports
const COLUMN_MAP: Record<string, string> = {
  'email': 'email',
  'representative id': 'email',
  'rep email': 'email',
  'first name': 'firstName',
  'firstname': 'firstName',
  'name': 'firstName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'surname': 'lastName',
  'date': 'date',
  'check in date': 'date',
  'check-in date': 'date',
  'visit uuid': 'visitUUID',
  'visit id': 'visitUUID',
  'visitid': 'visitUUID',
  'did you complete training?': 'didComplete',
  'did you complete training': 'didComplete',
  'training completed': 'didComplete',
  'training complete': 'didComplete',
  'store name': 'store',
  'place': 'store',
  'store code': 'storeCode',
  'place id': 'storeCode',
  'channel': 'channel',
  'rep name': 'repName',
  'representative name': 'repName',
};

function normaliseDateDDMMYYYY(val: string): string {
  const m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return val;
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

    const fileName = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 });
    }

    // Build header mapping
    const headers = Object.keys(rows[0]);
    const mapping: Record<string, string> = {};
    // Find the date header for normalising dates in form data
    let dateHeader: string | null = null;
    for (const h of headers) {
      const normalised = h.toLowerCase().trim();
      if (COLUMN_MAP[normalised]) {
        mapping[h] = COLUMN_MAP[normalised];
        if (COLUMN_MAP[normalised] === 'date') dateHeader = h;
      }
    }

    // Parse rows (structured TrainingRecord for summary)
    const records: TrainingRecord[] = [];
    // Raw form data (ALL columns preserved)
    const formRows: TrainingFormRow[] = [];

    for (const row of rows) {
      const parsed: Record<string, string> = {};
      for (const [header, field] of Object.entries(mapping)) {
        parsed[field] = String(row[header] ?? '').trim();
      }

      // Build repName from first + last name
      const firstName = parsed.firstName || '';
      const lastName = parsed.lastName || '';
      const repName = parsed.repName || [firstName, lastName].filter(Boolean).join(' ');

      // Normalise date
      const date = parsed.date ? normaliseDateDDMMYYYY(parsed.date) : '';

      // Did complete check
      const didComplete = (parsed.didComplete || '').toLowerCase() === 'yes';

      const email = (parsed.email || '').trim();
      const visitUUID = (parsed.visitUUID || '').trim();

      // Must have at minimum email or repName, and a date
      if ((!email && !repName) || !date) continue;

      records.push({
        email,
        repName,
        date,
        visitUUID,
        didComplete,
        store: parsed.store || '',
        storeCode: parsed.storeCode || '',
        channel: parsed.channel || '',
      });

      // Build form data row with ALL original columns
      const formRow: TrainingFormRow = {};
      for (const h of headers) {
        const val = row[h];
        formRow[h] = val === undefined || val === null ? null : val === '' ? null : val;
      }
      // Inject normalised date for month filtering
      formRow['_normalizedDate'] = date;
      formRows.push(formRow);
    }

    if (records.length === 0) {
      return NextResponse.json({
        error: 'No valid training rows found',
        detectedHeaders: headers,
      }, { status: 400 });
    }

    // Auto-detect image columns: any column where >30% of non-empty values look like Perigee image URLs
    const PERIGEE_PREFIX = 'https://live.perigeeportal.co.za';
    const imageColumns: string[] = [];
    for (const h of headers) {
      let total = 0;
      let imageCount = 0;
      for (const r of formRows) {
        const v = r[h];
        if (v && typeof v === 'string' && v.trim()) {
          total++;
          if (v.trim().startsWith(PERIGEE_PREFIX)) imageCount++;
        }
      }
      if (total > 0 && (imageCount / total) >= 0.3) {
        imageColumns.push(h);
      }
    }

    const uploadId = crypto.randomUUID();

    // Save structured records (for summary view)
    await saveTrainingData(uploadId, records);

    // Save raw form data (for form data view with all columns)
    const rawFormData: TrainingFormData = { headers, imageColumns, rows: formRows };
    await saveTrainingFormData(uploadId, rawFormData);

    const index = await loadTrainingIndex();
    index.unshift({
      id: uploadId,
      fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: `${user.name} ${user.surname}`,
      rowCount: records.length,
    });
    await saveTrainingIndex(index);

    return NextResponse.json({
      ok: true,
      uploadId,
      rowCount: records.length,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Training upload error:', err);
    return NextResponse.json({
      error: 'Upload failed: ' + (err instanceof Error ? err.message : 'Unknown'),
    }, { status: 500 });
  }
}
