import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadStores, saveStores, addStoreSource, StoreMaster } from '@/lib/storeData';
import { loadChannels, saveChannels, ensureChannelPath } from '@/lib/channelData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/*
  Site Control File upload (iRam MASTER_SITE format). Columns (case-insensitive):
    SITE NUM · STORE NAME · CHANNEL · SUB_CHANNEL · COUNTRY · PROVINCE ·
    TOWN/CITY · ADDRESS · POSTAL CODE · LATITUDE · LONGITUDE · STATUS · …
  Upserts stores by SITE NUM (= siteCode, the stripped SAMS code), auto-creating
  the CHANNEL/SUB_CHANNEL as needed and assigning the store to the sub-channel.
  Existing manual fields (assignedBa*, perigeeSiteCode) are preserved.
*/

function norm(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase().trim()] = v === null || v === undefined ? '' : String(v).trim();
  }
  return out;
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const XLSX = require('xlsx');
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', bookVBA: true });
    // Prefer a MASTER_SITE sheet if present, else the first sheet.
    const sheetName =
      workbook.SheetNames.find((n: string) => n.toUpperCase().includes('MASTER_SITE')) ||
      workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

    if (!rows.length) {
      return NextResponse.json({ error: 'Sheet has no rows' }, { status: 400 });
    }

    const stores = await loadStores();
    const channels = await loadChannels();

    // Index stores by siteCode for upsert.
    const byCode = new Map<string, StoreMaster>();
    for (const s of stores) if (s.siteCode) byCode.set(s.siteCode.toLowerCase().trim(), s);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const channelsCreated = new Set<string>();

    for (const raw of rows) {
      const r = norm(raw);
      const siteCode = r['site num'] || r['sitenum'] || r['site code'] || r['site'] || '';
      const storeName = r['store name'] || r['storename'] || '';
      if (!siteCode && !storeName) { skipped++; continue; }
      if (!siteCode) { skipped++; continue; } // need a code to key on / match SAMS

      const mainName = r['channel'] || '';
      const subName = r['sub_channel'] || r['sub-channel'] || r['subchannel'] || '';
      const { channelId, created: newCh } = ensureChannelPath(channels, mainName, subName);
      newCh.forEach(n => channelsCreated.add(n));

      const key = siteCode.toLowerCase();
      let store = byCode.get(key);
      if (!store) {
        store = { siteCode, storeName: storeName || siteCode, channelId, addedFrom: ['data'] };
        stores.push(store);
        byCode.set(key, store);
        created++;
      } else {
        updated++;
      }

      // Control file is authoritative for these; preserve assignedBa*/perigeeSiteCode.
      if (storeName) store.storeName = storeName;
      if (channelId) store.channelId = channelId;
      if (r['province']) store.province = r['province'];
      if (r['town/city'] || r['town'] || r['city']) store.townCity = r['town/city'] || r['town'] || r['city'];
      if (r['status']) store.status = r['status'].toUpperCase();
      addStoreSource(store, 'data');
    }

    if (channelsCreated.size > 0) await saveChannels(channels);
    await saveStores(stores);

    logFromUser(
      user, 'sync_sams', 'stores/site-control-file',
      `Site Control File upload — ${created} created, ${updated} updated, ${channelsCreated.size} channel(s) created (${file.name}).`,
    );

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      sheet: sheetName,
      rows: rows.length,
      created,
      updated,
      skipped,
      channelsCreated: [...channelsCreated],
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Site Control File upload error:', err);
    return NextResponse.json(
      { error: 'Failed to process file', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
