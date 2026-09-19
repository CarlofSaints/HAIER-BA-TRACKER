import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadRollingDaily } from '@/lib/rollingSales';
import { loadDispoData, calcSalesValue } from '@/lib/dispoData';
import { loadStores } from '@/lib/storeData';
import { loadChannels } from '@/lib/channelData';
import { deriveBaByStore, resolveStoreBa, BaSource } from '@/lib/storeBa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface Rolling7Row {
  store: string;
  siteCode: string;
  channelId: string;
  channel: string;
  mainChannelId: string;
  ba: string;
  baSource: BaSource;
  article: string;
  /** Units per day, aligned with the response's `days` */
  daily: number[];
  units: number;
  /** Rand, nett of VAT (calcSalesValue), same as scoring and the BA Work report */
  value: number;
  /** Current stock on hand. A snapshot, not per day. */
  soh: number;
}

/*
  GET /api/sales/rolling-7 — the most recent 7 days of daily SAMS sales at
  store × article grain, each row carrying its store's BA. The page rolls these
  up to store and product views itself.
*/
export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [rolling, dispo, stores, channels] = await Promise.all([
      loadRollingDaily(),
      loadDispoData(),
      loadStores(),
      loadChannels(),
    ]);
    const derived = await deriveBaByStore(stores);

    const channelById = new Map(channels.map(c => [c.id, c]));
    const storeByName = new Map(stores.map(s => [s.storeName, s]));

    // Same rule as /sales: the 'dc' channel and its subs are depots, not shops.
    const dcIds = new Set(['dc', ...channels.filter(c => c.parentId === 'dc').map(c => c.id)]);

    const rows: Rolling7Row[] = [];
    for (const [storeName, articles] of Object.entries(rolling.byStore)) {
      const sm = storeByName.get(storeName);
      const channelId = sm?.channelId || '';
      if (dcIds.has(channelId)) continue;
      const ch = channelById.get(channelId);
      const ba = sm ? resolveStoreBa(sm, derived) : null;

      for (const [article, daily] of Object.entries(articles)) {
        if (daily.every(u => u === 0)) continue;
        const units = daily.reduce((s, u) => s + u, 0);
        rows.push({
          store: storeName,
          siteCode: sm?.siteCode || '',
          channelId,
          channel: ch?.name || '',
          mainChannelId: ch?.parentId || channelId,
          ba: ba?.repName || '',
          baSource: ba?.source || 'none',
          article,
          daily,
          units,
          value: calcSalesValue(units, dispo.prices[article]),
          soh: dispo.stock[storeName]?.[article]?.soh || 0,
        });
      }
    }

    return NextResponse.json(
      {
        days: rolling.days,
        rows,
        channels: channels
          .filter(c => !dcIds.has(c.id))
          .map(c => ({ id: c.id, name: c.name, parentId: c.parentId || '' })),
      },
      { headers: noCacheHeaders() },
    );
  } catch (err) {
    console.error('Rolling 7 GET error:', err);
    return NextResponse.json({ error: 'Failed to load rolling 7-day sales' }, { status: 500 });
  }
}
