import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import {
  loadDisplayIndex,
  saveDisplayIndex,
  saveDisplayData,
  saveDisplayFormData,
  DisplayRecord,
  DisplayFormRow,
  DisplayFormData,
} from '@/lib/displayData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

const PERIGEE_PREFIX = 'https://live.perigeeportal.co.za';

// Column mapping for display form exports
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
  'store': 'store',
  'store name': 'store',
  'place': 'store',
  'store code': 'storeCode',
  'place id': 'storeCode',
  'channel': 'channel',
  'rep name': 'repName',
  'representative name': 'repName',
  'province': 'province',
};

function normaliseDateDDMMYYYY(val: string): string {
  const m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return val;
}

async function cacheImageToBlob(
  perigeeUrl: string,
  blobKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(perigeeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://live.perigeeportal.co.za/',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const body = await res.arrayBuffer();
    if (body.byteLength === 0) return null;

    const blob = await put(blobKey, Buffer.from(body), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return blob.url;
  } catch {
    return null;
  }
}

async function downloadImagesInBatches(
  tasks: { perigeeUrl: string; blobKey: string }[],
  concurrency: number,
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(async t => {
        const blobUrl = await cacheImageToBlob(t.perigeeUrl, t.blobKey);
        if (blobUrl) urlMap.set(t.perigeeUrl, blobUrl);
      })
    );
  }
  return urlMap;
}

/**
 * Count how many display unit slots are filled in a row.
 * Unit 1 = "Select a Display unit", Unit 2+ = "Select a Display unit [N]"
 */
function countDisplayUnits(row: Record<string, string>, headers: string[]): number {
  let count = 0;
  for (const h of headers) {
    const lower = h.toLowerCase().trim();
    if (lower.startsWith('select a display unit')) {
      const val = (row[h] || '').trim();
      if (val) count++;
    }
  }
  return count;
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rawFormData = await req.formData();
    const file = rawFormData.get('file') as File | null;
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

    const headers = Object.keys(rows[0]);
    const mapping: Record<string, string> = {};
    for (const h of headers) {
      const normalised = h.toLowerCase().trim();
      if (COLUMN_MAP[normalised]) {
        mapping[h] = COLUMN_MAP[normalised];
      }
    }

    const records: DisplayRecord[] = [];
    const formRows: DisplayFormRow[] = [];

    for (const row of rows) {
      const parsed: Record<string, string> = {};
      for (const [header, field] of Object.entries(mapping)) {
        parsed[field] = String(row[header] ?? '').trim();
      }

      const firstName = parsed.firstName || '';
      const lastName = parsed.lastName || '';
      const repName = parsed.repName || [firstName, lastName].filter(Boolean).join(' ');
      const date = parsed.date ? normaliseDateDDMMYYYY(parsed.date) : '';
      const email = (parsed.email || '').trim();
      const visitUUID = (parsed.visitUUID || '').trim();

      if ((!email && !repName) || !date) continue;

      records.push({
        email, repName, date, visitUUID,
        store: parsed.store || '',
        storeCode: parsed.storeCode || '',
        channel: parsed.channel || '',
        province: parsed.province || '',
        unitCount: countDisplayUnits(row, headers),
      });

      const formRow: DisplayFormRow = {};
      for (const h of headers) {
        const val = row[h];
        formRow[h] = val === undefined || val === null ? null : val === '' ? null : val;
      }
      formRow['_normalizedDate'] = date;
      formRows.push(formRow);
    }

    if (records.length === 0) {
      return NextResponse.json({
        error: 'No valid display rows found',
        detectedHeaders: headers,
      }, { status: 400 });
    }

    // Auto-detect image columns
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

    // Download Perigee images → Vercel Blob CDN
    let imagesCached = 0;
    if (imageColumns.length > 0) {
      const seen = new Set<string>();
      const tasks: { perigeeUrl: string; blobKey: string }[] = [];
      let imgIndex = 0;

      for (const row of formRows) {
        for (const col of imageColumns) {
          const val = row[col];
          if (typeof val === 'string' && val.startsWith(PERIGEE_PREFIX) && !seen.has(val)) {
            seen.add(val);
            tasks.push({
              perigeeUrl: val,
              blobKey: `display/images/${uploadId}/${imgIndex++}.jpg`,
            });
          }
        }
      }

      if (tasks.length > 0) {
        const urlMap = await downloadImagesInBatches(tasks, 5);
        imagesCached = urlMap.size;

        // Replace Perigee URLs with blob CDN URLs in form data
        for (const row of formRows) {
          for (const col of imageColumns) {
            const val = row[col];
            if (typeof val === 'string' && urlMap.has(val)) {
              row[col] = urlMap.get(val)!;
            }
          }
        }
      }
    }

    // Save structured records
    await saveDisplayData(uploadId, records);

    // Save raw form data
    const formData: DisplayFormData = { headers, imageColumns, rows: formRows };
    await saveDisplayFormData(uploadId, formData);

    // Update index
    const index = await loadDisplayIndex();
    index.push({
      id: uploadId,
      fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.email,
      rowCount: records.length,
    });
    await saveDisplayIndex(index);

    return NextResponse.json({
      ok: true,
      uploadId,
      rowCount: records.length,
      imagesCached,
      columns: headers.length,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Display upload error:', err);
    return NextResponse.json({
      error: 'Failed to process file',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
