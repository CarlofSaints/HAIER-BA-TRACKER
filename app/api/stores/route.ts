import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadStores, saveStores, StoreMaster } from '@/lib/storeData';
import { loadChannels } from '@/lib/channelData';
import { deriveBaByStore, lookupDerivedBa } from '@/lib/storeBa';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Deriving the BA scans every visit, so it's gated behind ?derivedBa=1 —
  // only the Stores admin page needs it.
  const wantDerivedBa = req.nextUrl.searchParams.get('derivedBa') === '1';
  const [stores, channels] = await Promise.all([loadStores(), loadChannels()]);
  const derived = wantDerivedBa ? await deriveBaByStore(stores) : null;

  const channelMap = Object.fromEntries(channels.map(c => [c.id, c]));
  const enriched = stores.map(s => {
    const ch = channelMap[s.channelId];
    const parent = ch?.parentId ? channelMap[ch.parentId] : undefined;
    let derivedBaEmail = '';
    let derivedBaName = '';
    if (derived) {
      const d = lookupDerivedBa(s, derived);
      if (d) { derivedBaEmail = d.email; derivedBaName = d.repName; }
    }
    return {
      ...s,
      channelName: ch?.name || '',
      mainChannelId: parent?.id || ch?.id || '',
      mainChannelName: parent?.name || ch?.name || '',
      derivedBaEmail,
      derivedBaName,
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

export async function DELETE(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const storeName = sp.get('storeName');
  const siteCode = sp.get('siteCode') ?? '';
  const channelId = sp.get('channelId') ?? '';
  if (!storeName) {
    return NextResponse.json({ error: 'storeName param required' }, { status: 400 });
  }

  const stores = await loadStores();
  // Match on the full identity triple, case-sensitively: the same store can exist
  // twice under different channels with names differing only by case (e.g. one
  // created by a DISPO/Diamond load, the other by a Site Control File under a
  // sub-channel). A looser match would delete the wrong row.
  const idx = stores.findIndex(s =>
    s.storeName === storeName &&
    (s.siteCode || '') === siteCode &&
    (s.channelId || '') === channelId
  );
  if (idx === -1) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const [removed] = stores.splice(idx, 1);
  await saveStores(stores);

  logFromUser(
    user, 'delete_store', removed.storeName,
    `Deleted store ${removed.storeName}${removed.siteCode ? ` (${removed.siteCode})` : ''}`,
    { siteCode: removed.siteCode, channelId: removed.channelId, area: removed.area },
  );

  return NextResponse.json({ ok: true, removed, count: stores.length }, { headers: noCacheHeaders() });
}
