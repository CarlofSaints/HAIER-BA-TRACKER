import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadAllVisits } from '@/lib/visitData';
import { loadBaRoster } from '@/lib/baRoster';
import {
  loadDailySalesForMonths,
  loadDailySalesMonths,
  loadDailySalesIndex,
} from '@/lib/dailySalesData';
import {
  todayInSA, mondayOf, weekDates, rollingDates, weekOptions, monthOptions,
  monthsBetween, shortLabel, dayName, lastDayOfMonth,
} from '@/lib/dailySalesWeeks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type CellStatus = 'submitted' | 'missed' | 'none';

/**
 * A quantity no BA plausibly sells in one store visit. These are large
 * appliances; the highest genuine quantity in the May-Aug 2026 data is 6.
 */
const SUSPECT_QTY = 50;

/** How far either side of a SKU's average unit price still counts as normal. */
const PRICE_BAND = 0.25;

/**
 * A SKU needs this many OTHER submissions before its average means anything.
 * Below it the line is reported as unjudged rather than guessed at.
 */
const MIN_BAND_SAMPLES = 3;

interface SuspectLine {
  kind: 'quantity' | 'price';
  submissionId: string;
  date: string;
  email: string;
  repName: string;
  store: string;
  product: string;
  qty: number;
  unitPrice: number;
  value: number;
  reason: string;
  /** Price lines only: the band this price fell outside. */
  bandLow?: number;
  bandHigh?: number;
  bandAverage?: number;
  sampleSize?: number;
}

/**
 * Flag a quantity that cannot be a real sale.
 *
 * The failure is the BA typing the PRICE into the quantity box, which leaves qty
 * exactly equal to unitPrice and squares the value: three such lines in May/June
 * 2026 produced R179m of a R189m total. Left in, they bury every real number.
 */
function quantityReason(qty: number, unitPrice: number): string | null {
  if (qty <= SUSPECT_QTY) return null;
  return qty === unitPrice
    ? 'Quantity is identical to the unit price, so the price was very likely typed into the quantity box'
    : `Quantity of ${qty.toLocaleString()} is not a plausible number of units for one visit`;
}

interface ComplianceCell {
  date: string;
  status: CellStatus;
  submissions: number;
  qty: number;
  value: number;
}

/**
 * GET /api/daily-sales/summary
 *   ?weekStart=YYYY-MM-DD   Monday of the week to show; omit for the rolling 7 days
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   sales grid range (defaults to the current month)
 *
 * Returns the submission-compliance grid and the sales aggregates for all three
 * views, so switching Product / BA / Detail needs no extra round trip.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const qWeekStart = url.searchParams.get('weekStart') || '';
    const qFrom = url.searchParams.get('from') || '';
    const qTo = url.searchParams.get('to') || '';

    const today = todayInSA();

    const [visits, salesMonths, uploadIndex] = await Promise.all([
      loadAllVisits(),
      loadDailySalesMonths(),
      loadDailySalesIndex(),
    ]);
    const roster = await loadBaRoster(visits);

    // ── The compliance window ──
    const complianceDates = qWeekStart
      ? weekDates(mondayOf(qWeekStart))
      : rollingDates(today, 7);

    // ── The sales window ──
    // Defaults to the most recent month that actually HAS submissions, not the
    // calendar month: data is loaded daily and the current month can be empty
    // first thing, which would open the page on "No sales in this period" while
    // there is plenty of data a click away.
    const latestDataMonth = salesMonths.length ? salesMonths[salesMonths.length - 1] : '';
    const defaultMonth = latestDataMonth || today.slice(0, 7);
    const defaultFrom = `${defaultMonth}-01`;
    const defaultTo = defaultMonth === today.slice(0, 7) ? today : lastDayOfMonth(defaultMonth);
    const from = qFrom || defaultFrom;
    const to = qTo || defaultTo;

    // Every submission, not just the two windows. The per-SKU price band is built
    // from ALL submissions so it does not shift when the user changes the date
    // filter (a one-week view would otherwise have too few samples per SKU to
    // judge anything). The shards are one small file per month, so this is cheap.
    const records = await loadDailySalesForMonths(
      salesMonths.length
        ? salesMonths
        : [...new Set([
          ...monthsBetween(complianceDates[0], complianceDates[complianceDates.length - 1]),
          ...monthsBetween(from <= to ? from : to, from <= to ? to : from),
        ])],
    );

    // ── Compliance grid ──
    const windowStart = complianceDates[0];
    const windowEnd = complianceDates[complianceDates.length - 1];

    // Who submitted, per BA per day.
    const submitted = new Map<string, ComplianceCell>(); // `${email}|${date}`
    for (const r of records) {
      if (r.date < windowStart || r.date > windowEnd) continue;
      const key = `${r.email}|${r.date}`;
      const cell = submitted.get(key);
      if (cell) {
        cell.submissions++;
        cell.qty += r.totalQty;
        cell.value += r.totalValue;
      } else {
        submitted.set(key, {
          date: r.date, status: 'submitted', submissions: 1,
          qty: r.totalQty, value: r.totalValue,
        });
      }
    }

    // Who was actually working, per BA per day. A BA with no store check-in on a
    // day is not counted as a miss — this team works Thu-Mon, and crossing every
    // BA on every calendar day would paint their days off red for everyone.
    const worked = new Set<string>(); // `${email}|${date}`
    for (const v of visits) {
      const email = (v.email || '').toLowerCase();
      if (!email || !v.checkInDate) continue;
      if (v.checkInDate < windowStart || v.checkInDate > windowEnd) continue;
      worked.add(`${email}|${v.checkInDate}`);
    }

    // Roster, plus anyone who submitted in the window but is not on it (so a
    // submission can never be invisible).
    const byEmail = new Map(roster.map(b => [b.email, b.repName]));
    for (const r of records) {
      if (r.email && !byEmail.has(r.email)) byEmail.set(r.email, r.repName || r.email);
    }

    const complianceRows = [...byEmail.entries()].map(([email, repName]) => {
      const cells: ComplianceCell[] = complianceDates.map(date => {
        const hit = submitted.get(`${email}|${date}`);
        if (hit) return hit;
        return {
          date,
          status: worked.has(`${email}|${date}`) ? 'missed' : 'none',
          submissions: 0, qty: 0, value: 0,
        };
      });
      return {
        email,
        repName,
        cells,
        submitted: cells.filter(c => c.status === 'submitted').length,
        missed: cells.filter(c => c.status === 'missed').length,
        expected: cells.filter(c => c.status !== 'none').length,
      };
    });

    // Working BAs first, then alphabetical, so the rows that need action are up top.
    complianceRows.sort((a, b) => {
      if ((b.expected > 0 ? 1 : 0) !== (a.expected > 0 ? 1 : 0)) return (b.expected > 0 ? 1 : 0) - (a.expected > 0 ? 1 : 0);
      return a.repName.localeCompare(b.repName);
    });

    const dayTotals = complianceDates.map(date => {
      let sub = 0;
      let exp = 0;
      for (const row of complianceRows) {
        const c = row.cells.find(x => x.date === date)!;
        if (c.status === 'submitted') { sub++; exp++; }
        else if (c.status === 'missed') exp++;
      }
      return { date, submitted: sub, expected: exp };
    });

    // ── Sales aggregates ──
    const lo = from <= to ? from : to;
    const hi = from <= to ? to : from;
    const inRange = records.filter(r => r.date >= lo && r.date <= hi);

    const productMap = new Map<string, { product: string; qty: number; value: number; submissions: number }>();
    const baMap = new Map<string, { email: string; repName: string; qty: number; value: number; submissions: number }>();
    const detailMap = new Map<string, { email: string; repName: string; product: string; qty: number; value: number }>();

    let totalQty = 0;
    let totalValue = 0;

    // Impossible quantities are kept OUT of the figures unless asked for, so the
    // headline number is never 19x the truth. Prices outside their SKU's band are
    // flagged but left IN by default: unlike a quantity of 9 999 they are often a
    // decimal slip on a genuine sale, and dropping the line would lose a real unit
    // as well as its value.
    const includeBadQty = url.searchParams.get('includeBadQty') === '1';
    const excludeBadPrice = url.searchParams.get('excludeBadPrice') === '1';

    const suspectLines: SuspectLine[] = [];
    let badQtyCount = 0, badQtyQty = 0, badQtyValue = 0;
    let badPriceCount = 0, badPriceQty = 0, badPriceValue = 0;
    let unjudgedLines = 0;

    /*
      Per-SKU price band, from every submission in the dataset.

      Lines already flagged on quantity are left out of the stats so known-bad
      rows cannot drag the band that is meant to catch them. The average for a
      given line is computed LEAVE-ONE-OUT (the line's own price removed), so a
      single wrong price can never widen the band far enough to justify itself.
    */
    const skuSum = new Map<string, number>();
    const skuCount = new Map<string, number>();
    for (const r of records) {
      for (const l of r.lines) {
        if (!(l.unitPrice > 0)) continue;
        if (quantityReason(l.qty, l.unitPrice)) continue;
        skuSum.set(l.product, (skuSum.get(l.product) ?? 0) + l.unitPrice);
        skuCount.set(l.product, (skuCount.get(l.product) ?? 0) + 1);
      }
    }

    /** The band for one line, or null when the SKU has too few other samples. */
    function priceBand(product: string, unitPrice: number, countedInStats: boolean) {
      const total = skuSum.get(product) ?? 0;
      const n = skuCount.get(product) ?? 0;
      const otherSum = countedInStats ? total - unitPrice : total;
      const otherN = countedInStats ? n - 1 : n;
      if (otherN < MIN_BAND_SAMPLES) return null;
      const average = otherSum / otherN;
      if (!(average > 0)) return null;
      return { average, low: average * (1 - PRICE_BAND), high: average * (1 + PRICE_BAND), sampleSize: otherN };
    }

    for (const r of inRange) {
      const baKey = r.email || r.repName.toLowerCase();
      const ba = baMap.get(baKey);
      if (ba) { ba.submissions++; } else {
        baMap.set(baKey, { email: r.email, repName: r.repName || r.email, qty: 0, value: 0, submissions: 1 });
      }

      for (const line of r.lines) {
        const base = {
          submissionId: r.submissionId, date: r.date, email: r.email, repName: r.repName,
          store: r.store, product: line.product, qty: line.qty, unitPrice: line.unitPrice,
          value: line.value,
        };

        const qtyIssue = quantityReason(line.qty, line.unitPrice);
        if (qtyIssue) {
          suspectLines.push({ kind: 'quantity', ...base, reason: qtyIssue });
          badQtyCount++;
          badQtyQty += line.qty;
          badQtyValue += line.value;
          if (!includeBadQty) continue;
        } else if (line.unitPrice > 0) {
          // Only a line that fed the stats gets the leave-one-out treatment.
          const band = priceBand(line.product, line.unitPrice, true);
          if (!band) {
            unjudgedLines++;
          } else if (line.unitPrice < band.low || line.unitPrice > band.high) {
            const direction = line.unitPrice < band.low ? 'below' : 'above';
            suspectLines.push({
              kind: 'price', ...base,
              reason: `${direction === 'below' ? 'Below' : 'Above'} the band: this product averages R${Math.round(band.average).toLocaleString()} across ${band.sampleSize} other submissions`,
              bandLow: band.low, bandHigh: band.high, bandAverage: band.average, sampleSize: band.sampleSize,
            });
            badPriceCount++;
            badPriceQty += line.qty;
            badPriceValue += line.value;
            if (excludeBadPrice) continue;
          }
        }

        totalQty += line.qty;
        totalValue += line.value;

        const p = productMap.get(line.product);
        if (p) { p.qty += line.qty; p.value += line.value; p.submissions++; }
        else productMap.set(line.product, { product: line.product, qty: line.qty, value: line.value, submissions: 1 });

        const b = baMap.get(baKey)!;
        b.qty += line.qty;
        b.value += line.value;

        const dKey = `${baKey}|${line.product}`;
        const d = detailMap.get(dKey);
        if (d) { d.qty += line.qty; d.value += line.value; }
        else detailMap.set(dKey, { email: r.email, repName: r.repName || r.email, product: line.product, qty: line.qty, value: line.value });
      }
    }

    const byProduct = [...productMap.values()].sort((a, b) => b.value - a.value);
    const byBa = [...baMap.values()].sort((a, b) => b.value - a.value);
    const detail = [...detailMap.values()].sort(
      (a, b) => a.repName.localeCompare(b.repName) || b.value - a.value,
    );

    // ── Selector options ──
    const allDates: string[] = [];
    for (const v of visits) if (v.checkInDate) allDates.push(v.checkInDate);
    const firstMonth = salesMonths[0];
    const earliest = [
      allDates.length ? allDates.reduce((m, d) => (d < m ? d : m)) : '',
      firstMonth ? `${firstMonth}-01` : '',
    ].filter(Boolean).sort()[0] || today;

    return NextResponse.json({
      today,
      compliance: {
        mode: qWeekStart ? 'week' : 'rolling',
        weekStart: qWeekStart ? mondayOf(qWeekStart) : '',
        days: complianceDates.map(d => ({ date: d, label: shortLabel(d), dow: dayName(d) })),
        rows: complianceRows,
        dayTotals,
      },
      sales: {
        from: lo,
        to: hi,
        submissions: inRange.length,
        totalQty,
        totalValue,
        byProduct,
        byBa,
        detail,
        dataQuality: {
          quantity: {
            count: badQtyCount, qty: badQtyQty, value: badQtyValue,
            /** Impossible quantities are out of the figures unless this is true. */
            included: includeBadQty,
          },
          price: {
            count: badPriceCount, qty: badPriceQty, value: badPriceValue,
            /** Out-of-band prices are in the figures unless this is true. */
            excluded: excludeBadPrice,
            bandPct: Math.round(PRICE_BAND * 100),
            minSamples: MIN_BAND_SAMPLES,
            /** Lines whose SKU had too few other submissions to judge. */
            unjudged: unjudgedLines,
          },
          lines: suspectLines
            .sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === 'quantity' ? -1 : 1))
            .slice(0, 100),
        },
      },
      options: {
        weeks: weekOptions(earliest, today),
        months: monthOptions(earliest, today),
        dataMonths: salesMonths,
      },
      // Whether anything is loaded at all. Taken from the upload index, NOT the
      // month-shard list: deleting every upload empties the shards but leaves
      // their month keys behind, which would keep an empty grid on screen
      // instead of the "nothing loaded yet" state.
      hasData: uploadIndex.length > 0,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Daily sales summary error:', err);
    return NextResponse.json({
      error: 'Failed to build daily sales summary: ' + (err instanceof Error ? err.message : 'Unknown'),
    }, { status: 500 });
  }
}
