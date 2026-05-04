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
}

const CONFIG_KEY = 'config/perigee-api.json';

// Map Perigee API response fields to our Visit interface
function mapPerigeeVisit(row: Record<string, unknown>): Visit {
  const str = (key: string) => String(row[key] ?? '').trim();
  const num = (key: string) => parseInt(String(row[key] ?? '0')) || 0;

  return {
    email: str('email') || str('representativeId') || str('repEmail') || '',
    repName: str('repName') || str('representativeName') || '',
    channel: str('channel') || '',
    storeName: str('storeName') || str('place') || '',
    storeCode: str('storeCode') || str('placeId') || '',
    checkInDate: str('checkInDate') || str('date') || '',
    checkInTime: str('checkInTime') || str('startTime') || '',
    checkOutDate: str('checkOutDate') || str('date') || '',
    checkOutTime: str('checkOutTime') || str('endTime') || '',
    checkInDistance: str('checkInDistance') || '',
    checkOutDistance: str('checkOutDistance') || '',
    visitDuration: str('visitDuration') || str('timeAtPlace') || '',
    formsCompleted: num('formsCompleted'),
    picsUploaded: num('picsUploaded'),
    status: str('status') || '',
    networkOnCheckIn: str('networkOnCheckIn') || '',
  };
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await readJson<PerigeeConfig>(CONFIG_KEY, { apiKey: '', endpoint: '', enabled: false, lastPolledAt: null });

  if (!config.endpoint || !config.apiKey) {
    return NextResponse.json(
      { error: 'Perigee API not configured. Set endpoint and token in Settings.' },
      { status: 400, headers: noCacheHeaders() }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const startDate = (body as Record<string, string>).startDate;
    const mode = (body as Record<string, string>).mode || 'test'; // 'test' or 'import'

    if (!startDate) {
      return NextResponse.json(
        { error: 'startDate is required (YYYY-MM-DD)' },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    // Build request body — just startDate for now (simplest call)
    const perigeeBody: Record<string, unknown> = { startDate };
    if ((body as Record<string, string>).endDate) {
      perigeeBody.endDate = (body as Record<string, string>).endDate;
    }

    // Call Perigee API
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
    // Perigee may return { visits: [...] } or just an array
    const rawVisits: Record<string, unknown>[] = Array.isArray(perigeeData)
      ? perigeeData
      : Array.isArray(perigeeData.visits)
        ? perigeeData.visits
        : Array.isArray(perigeeData.data)
          ? perigeeData.data
          : [];

    if (mode === 'test') {
      // Return a preview — raw response keys + sample + count
      const sample = rawVisits.slice(0, 3);
      const responseKeys = rawVisits.length > 0 ? Object.keys(rawVisits[0]) : Object.keys(perigeeData);
      return NextResponse.json({
        ok: true,
        mode: 'test',
        totalRows: rawVisits.length,
        responseKeys,
        sample,
        rawTopLevelKeys: Object.keys(perigeeData),
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
      fileName: `perigee-api-${startDate}.json`,
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
