/**
 * Reconciling an OCR'd Diamond Corner PDF against the totals row it prints.
 *
 * The review screen lets an admin fix any line OCR mis-read — but correcting
 * lines you can see can never reveal a line OCR skipped entirely. The report's
 * own totals row is the oracle for that: if the lines on screen don't add up to
 * the printed totals, something is missing or wrong.
 *
 * Pure functions, no I/O, so they can be exercised from a script without the
 * page or the HTTP route (same reasoning as lib/dailySalesParse.ts).
 */

export interface DiamondSummableRow {
  qty: number;
  soh: number;
  value: number;
}

export type DiamondTotalKey = 'qty' | 'soh' | 'value';

export const DIAMOND_TOTAL_KEYS: DiamondTotalKey[] = ['qty', 'soh', 'value'];

/** Value is Rand to 2dp, so allow a rounding cent; units must be exact. */
const TOLERANCE: Record<DiamondTotalKey, number> = { qty: 0.001, soh: 0.001, value: 0.05 };

export interface DiamondColumnRecon {
  key: DiamondTotalKey;
  /** The total printed on the PDF, or null if that column wasn't filled in. */
  printed: number | null;
  /** lines - printed. Positive means the lines over-count the PDF. */
  diff: number;
  /** null when there is nothing to check against. */
  ok: boolean | null;
}

export interface DiamondRecon {
  cols: DiamondColumnRecon[];
  /** At least one column has a printed total to check against. */
  checked: boolean;
  /** Every checked column matches. False while any checked column is out. */
  balanced: boolean;
}

/** Sum the qty / soh / value columns of the lines currently on screen. */
export function sumDiamondRows(rows: DiamondSummableRow[]): Record<DiamondTotalKey, number> {
  const out: Record<DiamondTotalKey, number> = { qty: 0, soh: 0, value: 0 };
  for (const r of rows) {
    for (const k of DIAMOND_TOTAL_KEYS) out[k] += Number(r[k]) || 0;
  }
  return out;
}

/**
 * Compare the summed lines against the printed totals.
 *
 * `printed` values arrive as raw strings straight off the input boxes: a blank
 * or unparseable column simply isn't checked, rather than being treated as 0 —
 * a zero there would read as "the PDF says nothing sold" and fire a false alarm.
 */
export function reconcileDiamond(
  sums: Record<DiamondTotalKey, number>,
  printed: Record<DiamondTotalKey, string>,
): DiamondRecon {
  const cols = DIAMOND_TOTAL_KEYS.map<DiamondColumnRecon>(key => {
    const raw = (printed[key] ?? '').trim();
    const n = Number(raw);
    const value = raw !== '' && Number.isFinite(n) ? n : null;
    const diff = value === null ? 0 : sums[key] - value;
    return { key, printed: value, diff, ok: value === null ? null : Math.abs(diff) <= TOLERANCE[key] };
  });
  const checked = cols.filter(c => c.ok !== null);
  return { cols, checked: checked.length > 0, balanced: checked.length > 0 && checked.every(c => c.ok) };
}
