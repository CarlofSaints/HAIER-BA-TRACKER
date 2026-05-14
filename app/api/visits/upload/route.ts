import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, saveVisitIndex, saveVisitData, Visit } from '@/lib/visitData';
import { logFromUser } from '@/lib/activityLog';
import * as zlib from 'zlib';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

// Perigee column mapping — maps expected header names to Visit fields
// Columns that map directly to Visit fields
// Supports both custom report format AND standard Perigee export format
const COLUMN_MAP: Record<string, keyof Visit> = {
  // Email
  'email': 'email',
  'representative id': 'email',
  'rep email': 'email',
  // Rep name
  'rep name': 'repName',
  'representative name': 'repName',
  // Channel
  'channel': 'channel',
  'cpf.channel': 'channel',
  // Store
  'store name': 'storeName',
  'place': 'storeName',
  'store code': 'storeCode',
  'place id': 'storeCode',
  'cpf.retailersitecode': 'storeCode',
  // Check-in date/time (custom report format)
  'check in date': 'checkInDate',
  'check-in date': 'checkInDate',
  'check in time': 'checkInTime',
  'check-in time': 'checkInTime',
  // Check-out date/time (custom report format)
  'check out date': 'checkOutDate',
  'check-out date': 'checkOutDate',
  'check out time': 'checkOutTime',
  'check-out time': 'checkOutTime',
  // Perigee standard format: Date, Start time, End time
  'date': 'checkInDate',
  'start time': 'checkInTime',
  'end time': 'checkOutTime',
  // Duration
  'visit duration': 'visitDuration',
  'time at place': 'visitDuration',
  // Distance
  'check in distance': 'checkInDistance',
  'check-in distance': 'checkInDistance',
  'check out distance': 'checkOutDistance',
  'check-out distance': 'checkOutDistance',
  // Forms / pics
  'forms completed': 'formsCompleted',
  'pics uploaded': 'picsUploaded',
  // Status
  'status': 'status',
  // Network
  'network on check in': 'networkOnCheckIn',
  'network on check-in': 'networkOnCheckIn',
};

// Extra columns used to build repName when mapped repName is empty
const NAME_COLUMNS = ['name', 'first name', 'firstname'];
const SURNAME_COLUMNS = ['surname', 'last name', 'lastname'];

function normaliseDateDDMMYYYY(val: string): string {
  // Convert DD/MM/YYYY → YYYY-MM-DD
  const m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return val;
}

interface ParseResult {
  visits: Visit[];
  detectedHeaders: string[];
  mappedFields: string[];
}

function parseExcelRows(buffer: Buffer, fileName: string): ParseResult {
  // Dynamic import doesn't work in synchronous context, so use require-style
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (rows.length === 0) return { visits: [], detectedHeaders: [], mappedFields: [] };

  // Build header mapping
  const headers = Object.keys(rows[0]);
  const mapping: Record<string, keyof Visit> = {};
  let nameHeader = '';
  let surnameHeader = '';
  for (const h of headers) {
    const normalised = h.toLowerCase().trim();
    if (COLUMN_MAP[normalised]) {
      mapping[h] = COLUMN_MAP[normalised];
    }
    if (NAME_COLUMNS.includes(normalised)) nameHeader = h;
    if (SURNAME_COLUMNS.includes(normalised)) surnameHeader = h;
  }

  const visits: Visit[] = [];
  for (const row of rows) {
    const visit: Partial<Visit> = {};
    for (const [header, field] of Object.entries(mapping)) {
      const raw = String(row[header] ?? '').trim();
      if (field === 'formsCompleted' || field === 'picsUploaded') {
        (visit as Record<string, unknown>)[field] = parseInt(raw) || 0;
      } else if (field === 'checkInDate' || field === 'checkOutDate') {
        (visit as Record<string, unknown>)[field] = normaliseDateDDMMYYYY(raw);
      } else {
        (visit as Record<string, unknown>)[field] = raw;
      }
    }

    // Build full name from Name + Surname columns — always prefer over repName
    if (nameHeader || surnameHeader) {
      const first = String(row[nameHeader] ?? '').trim();
      const last = String(row[surnameHeader] ?? '').trim();
      const fullName = [first, last].filter(Boolean).join(' ');
      if (fullName) visit.repName = fullName;
    }

    // Only include rows that have at minimum a store name or rep name
    if (visit.storeName || visit.repName) {
      visits.push({
        email: visit.email || '',
        repName: visit.repName || '',
        channel: visit.channel || '',
        storeName: visit.storeName || '',
        storeCode: visit.storeCode || '',
        checkInDate: visit.checkInDate || '',
        checkInTime: visit.checkInTime || '',
        checkOutDate: visit.checkOutDate || '',
        checkOutTime: visit.checkOutTime || '',
        checkInDistance: visit.checkInDistance || '',
        checkOutDistance: visit.checkOutDistance || '',
        visitDuration: visit.visitDuration || '',
        formsCompleted: visit.formsCompleted ?? 0,
        picsUploaded: visit.picsUploaded ?? 0,
        status: visit.status || '',
        networkOnCheckIn: visit.networkOnCheckIn || '',
      });
    }
  }
  return {
    visits,
    detectedHeaders: headers,
    mappedFields: Object.values(mapping),
  };
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    let buffer: Buffer;
    let fileName = 'upload.xlsx';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/gzip')) {
      // Client-side parsed + gzipped JSON
      const compressed = Buffer.from(await req.arrayBuffer());
      const decompressed = zlib.gunzipSync(compressed);
      const jsonData = JSON.parse(decompressed.toString('utf-8'));
      fileName = jsonData.fileName || fileName;

      // jsonData.rows is already parsed Visit[]
      const visits: Visit[] = (jsonData.rows || []).map((r: Record<string, unknown>) => ({
        email: String(r.email || ''),
        repName: String(r.repName || ''),
        channel: String(r.channel || ''),
        storeName: String(r.storeName || ''),
        storeCode: String(r.storeCode || ''),
        checkInDate: String(r.checkInDate || ''),
        checkInTime: String(r.checkInTime || ''),
        checkOutDate: String(r.checkOutDate || ''),
        checkOutTime: String(r.checkOutTime || ''),
        checkInDistance: String(r.checkInDistance || ''),
        checkOutDistance: String(r.checkOutDistance || ''),
        visitDuration: String(r.visitDuration || ''),
        formsCompleted: Number(r.formsCompleted) || 0,
        picsUploaded: Number(r.picsUploaded) || 0,
        status: String(r.status || ''),
        networkOnCheckIn: String(r.networkOnCheckIn || ''),
      }));

      const uploadId = crypto.randomUUID();
      await saveVisitData(uploadId, visits);

      const index = await loadVisitIndex();
      index.unshift({
        id: uploadId,
        fileName,
        uploadedAt: new Date().toISOString(),
        uploadedBy: `${user.name} ${user.surname}`,
        rowCount: visits.length,
      });
      await saveVisitIndex(index);

      logFromUser(user, 'upload_visits', `visits/${uploadId}`, `Uploaded ${visits.length} visit rows from ${fileName}`);
      return NextResponse.json({ ok: true, uploadId, rowCount: visits.length }, { headers: noCacheHeaders() });
    }

    // FormData path — server-side Excel parsing
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    fileName = file.name;
    buffer = Buffer.from(await file.arrayBuffer());

    const parsed = parseExcelRows(buffer, fileName);
    if (parsed.visits.length === 0) {
      return NextResponse.json({
        error: 'No valid visit rows found',
        detectedHeaders: parsed.detectedHeaders,
        mappedFields: parsed.mappedFields,
      }, { status: 400 });
    }

    const uploadId = crypto.randomUUID();
    await saveVisitData(uploadId, parsed.visits);

    const index = await loadVisitIndex();
    index.unshift({
      id: uploadId,
      fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: `${user.name} ${user.surname}`,
      rowCount: parsed.visits.length,
    });
    await saveVisitIndex(index);

    logFromUser(user, 'upload_visits', `visits/${uploadId}`, `Uploaded ${parsed.visits.length} visit rows from ${fileName}`);
    // Include sample repName for debugging
    const sampleName = parsed.visits.find(v => v.repName)?.repName || '(none detected)';
    return NextResponse.json({
      ok: true, uploadId, rowCount: parsed.visits.length,
      detectedHeaders: parsed.detectedHeaders,
      sampleRepName: sampleName,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Visit upload error:', err);
    logFromUser(user, 'upload_visits', 'visits/failed', `Visit upload failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: 'Upload failed: ' + (err instanceof Error ? err.message : 'Unknown') }, { status: 500 });
  }
}
