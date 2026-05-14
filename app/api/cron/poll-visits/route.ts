import { NextRequest, NextResponse } from 'next/server';
import { readJson, writeJson } from '@/lib/blob';
import { Visit, loadVisitIndex, saveVisitIndex, saveVisitData, loadVisitData, visitDedupeKey } from '@/lib/visitData';
import { seedScoresFromVisits } from '@/lib/seedScores';
import { requireRole } from '@/lib/auth';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PerigeeConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  lastPolledAt: string | null;
  requestBody: string;
}

interface PollSlot {
  id: string;
  time: string;
  type: 'short' | 'long';
  enabled: boolean;
}

interface PollSchedule {
  slots: PollSlot[];
  timezone: string;
}

interface CronLogEntry {
  timestamp: string;
  matched: boolean;
  slotTime?: string;
  slotType?: string;
  result?: string;
  imported?: number;
  skipped?: number;
  error?: string;
}

const CONFIG_KEY = 'config/perigee-api.json';
const SCHEDULE_KEY = 'config/perigee-schedule.json';
const CRON_LOG_KEY = 'logs/cron-poll.json';

function mapPerigeeVisit(row: Record<string, unknown>): Visit {
  const str = (key: string) => String(row[key] ?? '').trim();
  const num = (key: string) => parseInt(String(row[key] ?? '0')) || 0;

  const rawStore = str('store') || str('Store Full Name') || str('storeName') || str('place') || '';
  let storeName = rawStore;
  let storeCode = str('storeCode') || str('placeId') || '';
  if (!storeCode && rawStore.includes(' - ')) {
    const lastDash = rawStore.lastIndexOf(' - ');
    storeName = rawStore.substring(0, lastDash).trim();
    storeCode = rawStore.substring(lastDash + 3).trim();
  }

  let checkInDate = str('checkInDate') || '';
  const startDateFull = str('startDateFull');
  if (!checkInDate) {
    if (startDateFull && startDateFull.includes(' ')) {
      checkInDate = startDateFull.split(' ')[0];
    } else {
      checkInDate = str('date') || '';
    }
  }

  let checkOutDate = str('checkOutDate') || '';
  const endDateFull = str('endDateFull');
  if (!checkOutDate) {
    if (endDateFull && endDateFull.includes(' ')) {
      checkOutDate = endDateFull.split(' ')[0];
    }
  }

  const checkInTime = str('checkInTime') || str('startTime') || '';
  const checkOutTime = str('checkOutTime') || str('endTime') || '';
  const email = str('email') || str('username') || str('Username') || str('representativeId') || '';
  const repName = str('repName') || str('displayName') || str('representativeName') || '';
  const channel = str('channel') || str('Channel') || '';
  const status = str('status') || str('callStatus') || '';
  const visitId = str('visitGuid') || str('guid') || str('visitId') || '';

  // Calculate duration
  let visitDuration = str('visitDuration') || str('timeAtPlace') || '';
  if (!visitDuration && checkInTime && checkOutTime) {
    const inParts = checkInTime.split(':').map(Number);
    const outParts = checkOutTime.split(':').map(Number);
    if (inParts.length >= 2 && outParts.length >= 2) {
      let diffMin: number;
      if (startDateFull && endDateFull && startDateFull.includes(' ') && endDateFull.includes(' ')) {
        const startMs = new Date(startDateFull.replace(' ', 'T')).getTime();
        const endMs = new Date(endDateFull.replace(' ', 'T')).getTime();
        diffMin = (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs)
          ? Math.round((endMs - startMs) / 60000) : -1;
      } else {
        diffMin = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
      }
      if (diffMin > 0) {
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        visitDuration = h > 0 ? `${h}h ${m}m` : `${m}m`;
      }
    }
  }

  return {
    email, repName, channel, storeName, storeCode,
    checkInDate, checkInTime, checkOutDate, checkOutTime,
    checkInDistance: str('checkInDistance') || '',
    checkOutDistance: str('checkOutDistance') || '',
    visitDuration,
    formsCompleted: num('formsCompleted'),
    picsUploaded: num('picsUploaded'),
    status,
    networkOnCheckIn: str('networkOnCheckIn') || '',
    visitId: visitId || undefined,
  };
}

export async function GET(req: NextRequest) {
  // Validate cron secret OR super_admin session
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCronAuth = !cronSecret || authHeader === `Bearer ${cronSecret}`;
  const isAdminAuth = !!(await requireRole(req, ['super_admin']));
  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logEntry: CronLogEntry = { timestamp: new Date().toISOString(), matched: false };
  const forceRun = req.nextUrl.searchParams.get('force') === 'true';

  try {
    // Load schedule
    const schedule = await readJson<PollSchedule>(SCHEDULE_KEY, { slots: [], timezone: 'Africa/Johannesburg' });

    if (schedule.slots.length === 0 && !forceRun) {
      logEntry.result = 'No slots configured';
      await appendCronLog(logEntry);
      return NextResponse.json({ ok: true, action: 'none', reason: 'No slots configured' });
    }

    // Get current SAST time
    const now = new Date();
    const sastTime = new Date(now.toLocaleString('en-US', { timeZone: schedule.timezone || 'Africa/Johannesburg' }));
    const currentHour = sastTime.getHours();
    const currentMin = sastTime.getMinutes();
    const currentMins = currentHour * 60 + currentMin;

    // Find matching slot (within 15-minute window) — skip if forced
    let matchedSlot: PollSlot | undefined;
    if (forceRun) {
      // Use first enabled slot's type, default to 'short'
      const firstEnabled = schedule.slots.find(s => s.enabled);
      matchedSlot = {
        id: 'manual',
        time: `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`,
        type: firstEnabled?.type || 'short',
        enabled: true,
      };
    } else {
      matchedSlot = schedule.slots.find(slot => {
        if (!slot.enabled) return false;
        const [slotH, slotM] = slot.time.split(':').map(Number);
        const slotMins = slotH * 60 + slotM;
        const diff = Math.abs(currentMins - slotMins);
        return diff <= 14;
      });
    }

    if (!matchedSlot) {
      logEntry.result = `No matching slot at ${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')} SAST`;
      await appendCronLog(logEntry);
      return NextResponse.json({ ok: true, action: 'none', reason: logEntry.result });
    }

    logEntry.matched = true;
    logEntry.slotTime = matchedSlot.time;
    logEntry.slotType = matchedSlot.type;

    // Load Perigee config
    const config = await readJson<PerigeeConfig>(CONFIG_KEY, { apiKey: '', endpoint: '', enabled: false, lastPolledAt: null, requestBody: '' });
    if (!config.endpoint || !config.apiKey) {
      logEntry.error = 'Perigee API not configured';
      await appendCronLog(logEntry);
      return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 400 });
    }

    // Build request body
    const today = now.toISOString().slice(0, 10);
    let startDate: string;
    if (matchedSlot.type === 'long') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate = sevenDaysAgo.toISOString().slice(0, 10);
    } else {
      startDate = today;
    }

    // Parse the saved request body template, override dates
    let perigeeBody: Record<string, unknown> = {};
    if (config.requestBody) {
      try { perigeeBody = JSON.parse(config.requestBody); } catch { /* use empty */ }
    }
    perigeeBody.startDate = startDate;
    perigeeBody.endDate = today;

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
      logEntry.error = `Perigee ${perigeeRes.status}: ${errText.slice(0, 200)}`;
      await appendCronLog(logEntry);
      return NextResponse.json({ ok: false, error: logEntry.error }, { status: 502 });
    }

    const perigeeData = await perigeeRes.json();

    // Update lastPolledAt
    await writeJson(CONFIG_KEY, { ...config, lastPolledAt: new Date().toISOString() });

    // Extract visits array
    let rawVisits: Record<string, unknown>[] = [];
    if (Array.isArray(perigeeData)) {
      rawVisits = perigeeData;
    } else if (perigeeData.visits && Array.isArray(perigeeData.visits.data)) {
      rawVisits = perigeeData.visits.data;
    } else if (Array.isArray(perigeeData.visits)) {
      rawVisits = perigeeData.visits;
    } else if (Array.isArray(perigeeData.data)) {
      rawVisits = perigeeData.data;
    }

    if (rawVisits.length === 0) {
      logEntry.result = 'No visits returned';
      logEntry.imported = 0;
      await appendCronLog(logEntry);
      return NextResponse.json({ ok: true, action: 'polled', imported: 0 });
    }

    // Map and deduplicate
    const mappedVisits: Visit[] = rawVisits.map(mapPerigeeVisit).filter(v => v.storeName || v.repName);

    // Deduplicate within this batch (Perigee returns same GUID 2+ times)
    const batchSeen = new Set<string>();
    const visits: Visit[] = [];
    for (const v of mappedVisits) {
      const key = visitDedupeKey(v);
      if (batchSeen.has(key)) continue;
      batchSeen.add(key);
      visits.push(v);
    }

    // Build dedup set from all existing visits (by visitId AND composite key)
    const index = await loadVisitIndex();
    const existingKeys = new Set<string>();
    for (const meta of index) {
      const existingVisits = await loadVisitData(meta.id);
      for (const ev of existingVisits) {
        existingKeys.add(visitDedupeKey(ev));
      }
    }

    const newVisits = visits.filter(v => !existingKeys.has(visitDedupeKey(v)));
    const skipped = mappedVisits.length - newVisits.length;

    if (newVisits.length === 0) {
      logEntry.result = 'All duplicates';
      logEntry.imported = 0;
      logEntry.skipped = skipped;
      await appendCronLog(logEntry);
      return NextResponse.json({ ok: true, action: 'polled', imported: 0, skipped });
    }

    // Save
    const uploadId = crypto.randomUUID();
    await saveVisitData(uploadId, newVisits);
    index.unshift({
      id: uploadId,
      fileName: `cron-${matchedSlot.type}-${startDate}.json`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: `Cron (${matchedSlot.time} ${matchedSlot.type})`,
      rowCount: newVisits.length,
    });
    await saveVisitIndex(index);

    // Auto-seed scores
    await seedScoresFromVisits('Cron (auto-seed)');

    logEntry.result = 'Success';
    logEntry.imported = newVisits.length;
    logEntry.skipped = skipped;
    await appendCronLog(logEntry);

    logActivity('cron_import', `Cron (${matchedSlot.time} ${matchedSlot.type})`, 'System', `visits/${uploadId}`, `Cron imported ${newVisits.length} visits (${skipped} skipped)`, { imported: newVisits.length, skipped }).catch(() => {});
    return NextResponse.json({
      ok: true,
      action: 'imported',
      imported: newVisits.length,
      skipped,
      uploadId,
    });
  } catch (err) {
    logEntry.error = err instanceof Error ? err.message : 'Unknown error';
    await appendCronLog(logEntry).catch(() => {});
    console.error('Cron poll error:', err);
    return NextResponse.json({ ok: false, error: logEntry.error }, { status: 500 });
  }
}

async function appendCronLog(entry: CronLogEntry) {
  try {
    const logs = await readJson<CronLogEntry[]>(CRON_LOG_KEY, []);
    logs.unshift(entry);
    // Keep last 100 entries
    await writeJson(CRON_LOG_KEY, logs.slice(0, 100));
  } catch {
    // Non-blocking — logging should never crash the cron
  }
}
