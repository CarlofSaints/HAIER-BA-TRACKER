import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadDispoData, saveDispoData } from '@/lib/dispoData';
import { loadStores } from '@/lib/storeData';
import { logFromUser } from '@/lib/activityLog';
import { runAutoCalcForMonth } from '@/lib/autoCalc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/*
  Clear the shared sales/stock dataset (dispo/data.json) for all stores belonging
  to a given sub-channel. Used when a sub-channel switches data source — e.g.
  clear Makro's DISPO data before pulling Makro from SAMS, while Walmart's DISPO
  data stays intact. Removes those stores from sales/stock/ytd (prices are
  per-article and shared, so left alone), then re-runs sales auto-calc for the
  affected months.
*/
export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subChannelId } = await req.json().catch(() => ({}));
  if (!subChannelId || typeof subChannelId !== 'string') {
    return NextResponse.json({ error: 'subChannelId is required' }, { status: 400 });
  }

  // Stores assigned to this sub-channel (channelId === the sub-channel id).
  const stores = await loadStores();
  const targetNames = new Set(
    stores
      .filter(s => s.channelId === subChannelId)
      .map(s => s.storeName.trim())
      .filter(Boolean),
  );

  if (targetNames.size === 0) {
    return NextResponse.json(
      { ok: true, storesCleared: 0, months: [], note: 'No stores are assigned to this sub-channel.' },
      { headers: noCacheHeaders() },
    );
  }

  const data = await loadDispoData();
  const affectedMonths = new Set<string>();
  let cellsRemoved = 0;

  // sales[month][storeName]
  for (const [month, byStore] of Object.entries(data.sales)) {
    for (const name of targetNames) {
      if (byStore[name]) {
        cellsRemoved += Object.keys(byStore[name]).length;
        delete byStore[name];
        affectedMonths.add(month);
      }
    }
  }
  // stock[storeName] + ytd[storeName]
  for (const name of targetNames) {
    delete data.stock[name];
    if (data.ytd) delete data.ytd[name];
  }

  await saveDispoData(data);

  // Recompute sales scores for the months we touched (scores drop for the
  // now-removed stores' BAs).
  const months = [...affectedMonths];
  for (const mm of months) {
    const [mmPart, yyyyPart] = mm.split('-');
    try {
      await runAutoCalcForMonth(`${yyyyPart}-${mmPart}`, ['sales']);
    } catch (err) {
      console.error(`clear-subchannel: auto-calc failed for ${mm}:`, err);
    }
  }

  logFromUser(
    user, 'sync_sams', `sales/clear/${subChannelId}`,
    `Cleared sales/stock data for sub-channel ${subChannelId} — ${targetNames.size} stores, ${cellsRemoved} sales cells across ${months.length} months.`,
  );

  return NextResponse.json(
    { ok: true, storesCleared: targetNames.size, cellsRemoved, months },
    { headers: noCacheHeaders() },
  );
}
