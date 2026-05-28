import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadStores, saveStores, StoreMaster } from '@/lib/storeData';
import { loadChannels } from '@/lib/channelData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [stores, channels] = await Promise.all([loadStores(), loadChannels()]);

  const channelMap = Object.fromEntries(channels.map(c => [c.id, c]));
  const enriched = stores.map(s => {
    const ch = channelMap[s.channelId];
    const parent = ch?.parentId ? channelMap[ch.parentId] : undefined;
    return {
      ...s,
      channelName: ch?.name || '',
      mainChannelId: parent?.id || ch?.id || '',
      mainChannelName: parent?.name || ch?.name || '',
    };
  });

  return NextResponse.json(enriched, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stores } = await req.json() as { stores: StoreMaster[] };
  if (!Array.isArray(stores)) {
    return NextResponse.json({ error: 'stores array required' }, { status: 400 });
  }

  await saveStores(stores);
  return NextResponse.json({ ok: true, count: stores.length }, { headers: noCacheHeaders() });
}
