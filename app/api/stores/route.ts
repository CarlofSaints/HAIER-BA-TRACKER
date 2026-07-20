import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadStores, saveStores, StoreMaster } from '@/lib/storeData';
import { loadChannels } from '@/lib/channelData';
import { loadVisitIndex, loadVisitData, Visit } from '@/lib/visitData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/*
  Per-store BA derived from Perigee visits: the rep of the most recent visit that
  matches the store (by store name, siteCode, or Perigee Site Code override).
  Same matching rule as buildBaMap in the BA Work report. Gated behind
  ?derivedBa=1 since it scans all visits — only the Stores admin page needs it.
*/
async function deriveBaByStore(
  stores: StoreMaster[],
): Promise<Record<string, { email: string; repName: string }>> {
  // Bridge siteCode / Perigee code → store name so a visit matches whichever
  // code Perigee uses.
  const codeToName: Record<string, string> = {};
  for (const s of stores) {
    if (!s.siteCode) continue;
    const name = (s.storeName || '').toLowerCase().trim();
    codeToName[s.siteCode.toLowerCase().trim()] = name;
    const pCode = s.perigeeSiteCode?.toLowerCase().trim();
    if (pCode) codeToName[pCode] = name;
  }

  const index = await loadVisitIndex();
  const allVisits: Visit[] = [];
  for (const meta of index) allVisits.push(...await loadVisitData(meta.id));
  // Most recent first so the first write per key wins.
  allVisits.sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''));

  const derived: Record<string, { email: string; repName: string }> = {};
  for (const v of allVisits) {
    if (!v.email && !v.repName) continue;
    const val = { email: (v.email || '').toLowerCase(), repName: v.repName || v.email || '' };
    const nameKey = (v.storeName || '').toLowerCase().trim();
    if (nameKey && !derived[nameKey]) derived[nameKey] = val;
    const codeKey = (v.storeCode || '').toLowerCase().trim();
    if (codeKey && !derived[codeKey]) derived[codeKey] = val;
    if (codeKey && codeToName[codeKey] && !derived[codeToName[codeKey]]) {
      derived[codeToName[codeKey]] = val;
    }
  }
  return derived;
}

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      const nameKey = (s.storeName || '').toLowerCase().trim();
      const codeKey = (s.siteCode || '').toLowerCase().trim();
      const pKey = (s.perigeeSiteCode || '').toLowerCase().trim();
      const d = (nameKey && derived[nameKey]) || (codeKey && derived[codeKey]) || (pKey && derived[pKey]) || null;
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
