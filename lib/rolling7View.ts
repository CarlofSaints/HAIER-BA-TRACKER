/*
  Rolling-7-day sales: the roll-ups behind the three views (store, SKU, SKU and
  store) and the Excel sheet layout. Pure, no blob access, so the page and the
  daily email both use it and can never show different numbers.
*/

export type BaSource = 'assigned' | 'visits' | 'none';
export type Rolling7Mode = 'store' | 'product' | 'detail';

export interface Rolling7Row {
  store: string;
  siteCode: string;
  channelId: string;
  channel: string;
  mainChannelId: string;
  ba: string;
  baSource: BaSource;
  article: string;
  /** Units per day, aligned with `days` (oldest first) */
  daily: number[];
  units: number;
  /** Rand, nett of VAT (calcSalesValue) */
  value: number;
  /** Current stock on hand. A snapshot, not per day. */
  soh: number;
}

export interface Rolling7ViewRow {
  key: string;
  channel: string;
  store: string;
  ba: string;
  baSource: BaSource;
  article: string;
  daily: number[];
  units: number;
  value: number;
  soh: number;
  contribVal: number;
}

export const ROLLING7_MODES: { mode: Rolling7Mode; label: string }[] = [
  { mode: 'store', label: 'By Store' },
  { mode: 'product', label: 'By SKU' },
  { mode: 'detail', label: 'By SKU and Store' },
];

export const BA_SOURCE_LABEL: Record<BaSource, string> = {
  assigned: 'Assigned',
  visits: 'From Perigee visits',
  none: 'No BA',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-14" → "Mon 14 Sep" */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** Day columns are shown newest first; the data arrays stay oldest first. */
export function newestFirst(nDays: number): number[] {
  return Array.from({ length: nDays }, (_, i) => nDays - 1 - i);
}

/** Roll store × SKU rows up to one of the three views. Unsorted. */
export function aggregateRolling7(rows: Rolling7Row[], mode: Rolling7Mode, nDays: number): Rolling7ViewRow[] {
  const groups = new Map<string, Rolling7ViewRow>();
  for (const r of rows) {
    const key = mode === 'store' ? r.store : mode === 'product' ? r.article : `${r.store}|||${r.article}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        channel: mode === 'product' ? '' : r.channel,
        store: mode === 'product' ? '' : r.store,
        ba: mode === 'product' ? '' : r.ba,
        baSource: r.baSource,
        article: mode === 'store' ? '' : r.article,
        daily: new Array(nDays).fill(0),
        units: 0,
        value: 0,
        soh: 0,
        contribVal: 0,
      };
      groups.set(key, g);
    }
    r.daily.forEach((u, i) => (g!.daily[i] += u));
    g.units += r.units;
    g.value += r.value;
    g.soh += r.soh;
  }
  const out = [...groups.values()];
  const totalValue = out.reduce((s, r) => s + r.value, 0);
  for (const r of out) r.contribVal = totalValue > 0 ? (r.value / totalValue) * 100 : 0;
  return out;
}

/** How a column is formatted in Excel. */
export type Rolling7ColKind = 'text' | 'int' | 'rand' | 'pct';

export interface Rolling7Sheet {
  name: string;
  columns: { header: string; kind: Rolling7ColKind }[];
  rows: (string | number)[][];
  total: (string | number)[];
}

/*
  One sheet for a view: newest day first, then a total row. Percentages are
  fractions (0.15 = 15%) so Excel's % format shows them correctly.
*/
export function rolling7Sheet(viewRows: Rolling7ViewRow[], mode: Rolling7Mode, days: string[]): Rolling7Sheet {
  const showStore = mode !== 'product';
  const showArticle = mode !== 'store';
  const order = newestFirst(days.length);
  const columns: Rolling7Sheet['columns'] = [
    ...(showStore
      ? (['Sales Channel', 'Store', 'BA', 'BA Source'] as const).map(header => ({ header, kind: 'text' as const }))
      : []),
    ...(showArticle ? [{ header: 'SKU', kind: 'text' as const }] : []),
    ...order.map(i => ({ header: dayLabel(days[i]), kind: 'int' as const })),
    { header: 'Total Units', kind: 'int' },
    { header: 'Value (ex VAT)', kind: 'rand' },
    { header: 'Contrib Val%', kind: 'pct' },
    { header: 'SOH', kind: 'int' },
  ];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rows = viewRows.map(r => [
    ...(showStore ? [r.channel, r.store, r.ba, BA_SOURCE_LABEL[r.baSource]] : []),
    ...(showArticle ? [r.article] : []),
    ...order.map(i => r.daily[i]),
    r.units, round2(r.value), r.contribVal / 100, r.soh,
  ]);
  const sum = (f: (r: Rolling7ViewRow) => number) => viewRows.reduce((s, r) => s + f(r), 0);
  const total = [
    'Total',
    ...new Array((showStore ? 4 : 0) + (showArticle ? 1 : 0) - 1).fill(''),
    ...order.map(i => sum(r => r.daily[i])),
    sum(r => r.units), round2(sum(r => r.value)), viewRows.length ? 1 : 0, sum(r => r.soh),
  ];
  return { name: ROLLING7_MODES.find(m => m.mode === mode)!.label, columns, rows, total };
}
