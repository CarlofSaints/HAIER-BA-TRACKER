import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { readJson, writeJson } from '@/lib/blob';
import { Visit, loadVisitIndex, saveVisitIndex, saveVisitData } from '@/lib/visitData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PerigeeConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  lastPolledAt: string | null;
  requestBody: string;
}

const CONFIG_KEY = 'config/perigee-api.json';

// Map Perigee API response fields to our Visit interface
// Perigee visit record fields (from actual API):
//   store / Store Full Name — "STORE NAME - CODE"
//   channel / Channel
//   username / Username — email
//   displayName — rep full name
//   startDateFull — "2026-05-04 16:39:02"
//   endDateFull — ""
//   startTime — "16:39"
//   endTime — ""
//   callStatus — "VISITED"
function mapPerigeeVisit(row: Record<string, unknown>): Visit {
  const str = (key: string) => String(row[key] ?? '').trim();
  const num = (key: string) => parseInt(String(row[key] ?? '0')) || 0;

  // Extract store name and code from "STORE NAME - CODE" format
  const rawStore = str('store') || str('Store Full Name') || str('storeName') || str('place') || '';
  let storeName = rawStore;
  let storeCode = str('storeCode') || str('placeId') || '';

  // If store field has " - CODE" suffix, split it
  if (!storeCode && rawStore.includes(' - ')) {
    const lastDash = rawStore.lastIndexOf(' - ');
    storeName = rawStore.substring(0, lastDash).trim();
    storeCode = rawStore.substring(lastDash + 3).trim();
  }

  // Extract check-in date from startDateFull "2026-05-04 16:39:02" or checkInDate or date
  let checkInDate = str('checkInDate') || '';
  if (!checkInDate) {
    const startDateFull = str('startDateFull');
    if (startDateFull && startDateFull.includes(' ')) {
      checkInDate = startDateFull.split(' ')[0]; // "2026-05-04"
    } else {
      checkInDate = str('date') || '';
    }
  }

  // Extract check-out date similarly
  let checkOutDate = str('checkOutDate') || '';
  if (!checkOutDate) {
    const endDateFull = str('endDateFull');
    if (endDateFull && endDateFull.includes(' ')) {
      checkOutDate = endDateFull.split(' ')[0];
    }
  }

  // Check-in/out times
  const checkInTime = str('checkInTime') || str('startTime') || '';
  const checkOutTime = str('checkOutTime') || str('endTime') || '';

  // Email — username field is the email in Perigee
  const email = str('email') || str('username') || str('Username') || str('representativeId') || '';

  // Rep name — displayName in Perigee
  const repName = str('repName') || str('displayName') || str('representativeName') || '';

  // Channel
  const channel = str('channel') || str('Channel') || '';

  // Status
  const status = str('status') || str('callStatus') || '';

  return {
    email,
    repName,
    channel,
    storeName,
    storeCode,
    checkInDate,
    checkInTime,
    checkOutDate,
    checkOutTime,
    checkInDistance: str('checkInDistance') || '',
    checkOutDistance: str('checkOutDistance') || '',
    visitDuration: str('visitDuration') || str('timeAtPlace') || '',
    formsCompleted: num('formsCompleted'),
    picsUploaded: num('picsUploaded'),
    status,
    networkOnCheckIn: str('networkOnCheckIn') || '',
  };
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await readJson<PerigeeConfig>(CONFIG_KEY, { apiKey: '', endpoint: '', enabled: false, lastPolledAt: null, requestBody: '' });

  if (!config.endpoint || !config.apiKey) {
    return NextResponse.json(
      { error: 'Perigee API not configured. Set endpoint and token in Settings.' },
      { status: 400, headers: noCacheHeaders() }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = (body as Record<string, string>).mode || 'test';

    // The client sends the full Perigee request body — strip 'mode' before forwarding
    const perigeeBody = { ...(body as Record<string, unknown>) };
    delete perigeeBody.mode;

    if (!perigeeBody.startDate) {
      return NextResponse.json(
        { error: 'startDate is required in the request body' },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    // Call Perigee API — forward the JSON body directly
    const perigeeRes = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(perigeeBody),
    });

    if (!perigeeRes.ok) {
      const errText = await perigeeRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Perigee API returned ${perigeeRes.status}`, detail: errText.slice(0, 500) },
        { status: 502, headers: noCacheHeaders() }
      );
    }

    const perigeeData = await perigeeRes.json();

    // Update lastPolledAt
    await writeJson(CONFIG_KEY, { ...config, lastPolledAt: new Date().toISOString() });

    // Determine the visits array from the response
    // Perigee returns: { valid, visits: { total, data: [...] }, timestamp, metadata }
    // Or possibly: { visits: [...] } or just an array
    let rawVisits: Record<string, unknown>[] = [];
    if (Array.isArray(perigeeData)) {
      rawVisits = perigeeData;
    } else if (perigeeData.visits && Array.isArray(perigeeData.visits.data)) {
      // Perigee standard: { visits: { total, data: [...], ... } }
      rawVisits = perigeeData.visits.data;
    } else if (Array.isArray(perigeeData.visits)) {
      rawVisits = perigeeData.visits;
    } else if (Array.isArray(perigeeData.data)) {
      rawVisits = perigeeData.data;
    }

    if (mode === 'test') {
      // Return a preview — raw response keys + sample + count + debug info
      const sample = rawVisits.slice(0, 3);
      const responseKeys = rawVisits.length > 0 ? Object.keys(rawVisits[0]) : [];
      // Map the sample to show what would be imported
      const mappedSample = sample.map(mapPerigeeVisit);
      // Include non-visits metadata for debugging
      const meta: Record<string, unknown> = {};
      for (const k of Object.keys(perigeeData)) {
        if (k === 'visits' && typeof perigeeData[k] === 'object' && !Array.isArray(perigeeData[k])) {
          // Include visits metadata (total, redFlags, etc.) but not the full data array
          const { data, ...visitsMeta } = perigeeData[k] as Record<string, unknown>;
          meta['visits'] = visitsMeta;
        } else if (k !== 'visits') {
          meta[k] = perigeeData[k];
        }
      }
      return NextResponse.json({
        ok: true,
        mode: 'test',
        totalRows: rawVisits.length,
        responseKeys,
        sample,
        mappedSample,
        rawTopLevelKeys: Object.keys(perigeeData),
        meta,
        sentBody: perigeeBody,
      }, { headers: noCacheHeaders() });
    }

    // mode === 'import' — map and save
    if (rawVisits.length === 0) {
      return NextResponse.json(
        { ok: true, mode: 'import', message: 'No visits returned for this date range', totalRows: 0 },
        { headers: noCacheHeaders() }
      );
    }

    const visits: Visit[] = rawVisits
      .map(mapPerigeeVisit)
      .filter(v => v.storeName || v.repName);

    const uploadId = crypto.randomUUID();
    await saveVisitData(uploadId, visits);

    const index = await loadVisitIndex();
    index.unshift({
      id: uploadId,
      fileName: `perigee-api-${perigeeBody.startDate}.json`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: `${user.name} ${user.surname} (API)`,
      rowCount: visits.length,
    });
    await saveVisitIndex(index);

    return NextResponse.json({
      ok: true,
      mode: 'import',
      uploadId,
      totalRows: rawVisits.length,
      importedRows: visits.length,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Perigee poll error:', err);
    return NextResponse.json(
      { error: 'Failed to call Perigee API: ' + (err instanceof Error ? err.message : 'Unknown') },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
