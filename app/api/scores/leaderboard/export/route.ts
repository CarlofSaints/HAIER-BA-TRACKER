import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser } from '@/lib/auth';
import { loadStores } from '@/lib/storeData';
import { loadChannels } from '@/lib/channelData';
import { deriveBaByStore, resolveStoreBa, BaSource } from '@/lib/storeBa';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/*
  Excel export for the Leaderboard page. Two sheets:

    "Store BA Allocation" — every store in the master with the BA on it. This is
      the sheet Carl asked for: site code, site name, who's allocated. It is NOT
      month-scoped — an explicit assignment has no month, and the visit-derived
      fallback is the most recent visit all-time (same rule as the Stores page).
    "Leaderboard" — the ranked table exactly as displayed, for the chosen month.

  The leaderboard rows are POSTed from the page rather than recomputed here, so
  the file matches what the user is looking at (same month, same sort order) and
  the ranking logic stays in one place.
*/

interface ExportRow {
  rank: number;
  repName: string;
  email: string;
  storeName: string;
  total: number;
  grandTotal: number;
  monthlySales: number;
  checkInOnTime: number;
  displayInspection: number;
  training: number;
  weeklySummaries: number;
  bonusSuggestions: number;
  salesVol?: number | null;
  salesVal?: number | null;
}

const SOURCE_LABEL: Record<BaSource, string> = {
  assigned: 'Assigned (override)',
  visits: 'From Perigee visits',
  none: 'No BA',
};

function formatMonth(m: string) {
  const [y, mo] = (m || '').split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = parseInt(mo, 10) - 1;
  if (!y || isNaN(idx) || !names[idx]) return m || '';
  return `${names[idx]} ${y}`;
}

export async function POST(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as { month?: string; rows?: ExportRow[]; includeSales?: boolean };
    const month = body.month || '';
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const includeSales = body.includeSales !== false;

    const [stores, channels] = await Promise.all([loadStores(), loadChannels()]);
    const derived = await deriveBaByStore(stores);
    const byId = Object.fromEntries(channels.map(c => [c.id, c]));

    const storeRows = stores
      .map(s => {
        const ch = byId[s.channelId];
        const parent = ch?.parentId ? byId[ch.parentId] : undefined;
        const ba = resolveStoreBa(s, derived);
        return {
          'SITE CODE': s.siteCode || '',
          'SITE NAME': s.storeName || '',
          BA: ba.repName,
          // The BA name alone can't distinguish a permanent posting from a single
          // walk-in — "most recent visit wins" treats both the same. These two
          // columns are what make the BA column interpretable.
          VISITS: ba.visitCount,
          'LAST VISIT': ba.lastVisit || '',
          'BA EMAIL': ba.email,
          'BA SOURCE': SOURCE_LABEL[ba.source],
          CHANNEL: parent?.name || ch?.name || '',
          'SUB-CHANNEL': parent ? (ch?.name || '') : '',
          AREA: s.area || '',
          PROVINCE: s.province || '',
          STATUS: s.status || '',
        };
      })
      .sort((a, b) =>
        a.CHANNEL.localeCompare(b.CHANNEL) ||
        a['SITE NAME'].localeCompare(b['SITE NAME'])
      );

    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    const storeHeader = [
      'SITE CODE', 'SITE NAME', 'BA', 'VISITS', 'LAST VISIT', 'BA EMAIL', 'BA SOURCE',
      'CHANNEL', 'SUB-CHANNEL', 'AREA', 'PROVINCE', 'STATUS',
    ];
    const wsStores = XLSX.utils.json_to_sheet(storeRows, { header: storeHeader });
    wsStores['!cols'] = [
      { wch: 12 }, { wch: 42 }, { wch: 26 }, { wch: 9 }, { wch: 13 }, { wch: 30 }, { wch: 20 },
      { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
    ];
    wsStores['!autofilter'] = { ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: storeRows.length, c: storeHeader.length - 1 },
    }) };
    XLSX.utils.book_append_sheet(wb, wsStores, 'Store BA Allocation');

    const lbRows = rows.map(r => {
      const out: Record<string, string | number> = {
        RANK: r.rank,
        'BA NAME': r.repName || '',
        EMAIL: r.email || '',
        STORE: r.storeName || '',
        TOTAL: r.total ?? 0,
        'GRAND TOTAL': r.grandTotal ?? 0,
        'SALES /40': r.monthlySales ?? 0,
        'VISITS /10': r.checkInOnTime ?? 0,
        'DISPLAY /20': r.displayInspection ?? 0,
        'TRAINING /20': r.training ?? 0,
        'WEEKLY /10': r.weeklySummaries ?? 0,
        'BONUS /10': r.bonusSuggestions ?? 0,
      };
      if (includeSales) {
        out['SALES VOL'] = r.salesVol ?? 0;
        out['SALES VAL (EX VAT)'] = r.salesVal != null ? Math.round(r.salesVal) : 0;
      }
      return out;
    });

    const lbHeader = [
      'RANK', 'BA NAME', 'EMAIL', 'STORE', 'TOTAL', 'GRAND TOTAL',
      'SALES /40', 'VISITS /10', 'DISPLAY /20', 'TRAINING /20', 'WEEKLY /10', 'BONUS /10',
      ...(includeSales ? ['SALES VOL', 'SALES VAL (EX VAT)'] : []),
    ];
    const wsLb = XLSX.utils.json_to_sheet(lbRows, { header: lbHeader });
    wsLb['!cols'] = lbHeader.map(h =>
      h === 'BA NAME' ? { wch: 26 } : h === 'EMAIL' ? { wch: 30 } : h === 'STORE' ? { wch: 34 } : { wch: 14 }
    );
    XLSX.utils.book_append_sheet(wb, wsLb, `Leaderboard ${formatMonth(month)}`.slice(0, 31));

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const stamp = (month || new Date().toISOString().slice(0, 7)).replace('-', '');
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="HaierLeaderboard_${stamp}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Leaderboard export error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
