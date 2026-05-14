import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { logFromUser } from '@/lib/activityLog';
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

const PERIGEE_PREFIX = 'https://live.perigeeportal.co.za';

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

/**
 * Download image from Perigee and upload to Vercel Blob.
 * Returns the public blob CDN URL, or null on failure.
 */
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
      signal: AbortSignal.timeout(15000), // 15s per image
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

/**
 * Process images in batches with concurrency limit.
 */
async function downloadImagesInBatches(
  tasks: { perigeeUrl: string; blobKey: string }[],
  concurrency: number,
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>(); // perigeeUrl → blobUrl
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async t => {
        const blobUrl = await cacheImageToBlob(t.perigeeUrl, t.blobKey);
        if (blobUrl) urlMap.set(t.perigeeUrl, blobUrl);
      })
    );
    // Log failures for debugging
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        console.warn(`Image download failed: ${batch[idx].perigeeUrl}`, r.reason);
      }
    });
  }
  return urlMap;
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
    for (const h of headers) {
      const normalised = h.toLowerCase().trim();
      if (COLUMN_MAP[normalised]) {
        mapping[h] = COLUMN_MAP[normalised];
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

      const firstName = parsed.firstName || '';
      const lastName = parsed.lastName || '';
      const repName = parsed.repName || [firstName, lastName].filter(Boolean).join(' ');
      const date = parsed.date ? normaliseDateDDMMYYYY(parsed.date) : '';
      const didComplete = (parsed.didComplete || '').toLowerCase() === 'yes';
      const email = (parsed.email || '').trim();
      const visitUUID = (parsed.visitUUID || '').trim();

      if ((!email && !repName) || !date) continue;

      records.push({
        email, repName, date, visitUUID, didComplete,
        store: parsed.store || '',
        storeCode: parsed.storeCode || '',
        channel: parsed.channel || '',
      });

      const formRow: TrainingFormRow = {};
      for (const h of headers) {
        const val = row[h];
        formRow[h] = val === undefined || val === null ? null : val === '' ? null : val;
      }
      formRow['_normalizedDate'] = date;
      formRows.push(formRow);
    }

    if (records.length === 0) {
      return NextResponse.json({
        error: 'No valid training rows found',
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

    // ── Download Perigee images → Vercel Blob CDN ──
    let imagesCached = 0;
    if (imageColumns.length > 0) {
      // Collect unique Perigee URLs and assign blob keys
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
              blobKey: `training/images/${uploadId}/${imgIndex++}.jpg`,
            });
          }
        }
      }

      // Download in batches of 5
      const urlMap = await downloadImagesInBatches(tasks, 5);
      imagesCached = urlMap.size;

      // Replace Perigee URLs with blob CDN URLs in form data
      if (urlMap.size > 0) {
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

    // Save structured records (for summary view)
    await saveTrainingData(uploadId, records);

    // Save raw form data (URLs now point to Vercel Blob CDN)
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

    logFromUser(user, 'upload_training', `training/${uploadId}`, `Uploaded ${records.length} training records from ${fileName}`);
    return NextResponse.json({
      ok: true,
      uploadId,
      rowCount: records.length,
      imagesCached,
      imageColumns: imageColumns.length,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Training upload error:', err);
    logFromUser(user, 'upload_training', 'training/failed', `Training upload failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({
      error: 'Upload failed: ' + (err instanceof Error ? err.message : 'Unknown'),
    }, { status: 500 });
  }
}
