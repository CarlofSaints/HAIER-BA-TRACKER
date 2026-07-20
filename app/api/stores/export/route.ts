import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { loadStores } from '@/lib/storeData';
import { loadChannels } from '@/lib/channelData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
  Export the store master as a Site Control File (same MASTER_SITE columns as the
  upload), so it round-trips: export → edit in Excel → re-import. CHANNEL is the
  main channel, SUB_CHANNEL the store's assigned (sub-)channel.
*/
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [stores, channels] = await Promise.all([loadStores(), loadChannels()]);
  const byId = Object.fromEntries(channels.map(c => [c.id, c]));

  const rows = stores.map(s => {
    const ch = byId[s.channelId];
    const parent = ch?.parentId ? byId[ch.parentId] : undefined;
    const mainName = parent?.name || ch?.name || '';
    const subName = parent ? (ch?.name || '') : '';
    return {
      'SITE NUM': s.siteCode || '',
      'STORE NAME': s.storeName || '',
      CHANNEL: mainName,
      SUB_CHANNEL: subName,
      PROVINCE: s.province || '',
      'TOWN/CITY': s.townCity || '',
      AREA: s.area || '',
      STATUS: s.status || '',
      'ASSIGNED BA': s.assignedBaName || '',
    };
  });

  const XLSX = require('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['SITE NUM', 'STORE NAME', 'CHANNEL', 'SUB_CHANNEL', 'PROVINCE', 'TOWN/CITY', 'AREA', 'STATUS', 'ASSIGNED BA'],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MASTER_SITE');
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="HaierSiteControlFile_${today}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
