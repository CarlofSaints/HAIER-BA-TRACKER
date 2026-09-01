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

interface SuspectLine {
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
}

/**
 * Flag a captured line that cannot be a real sale.
 *
 * The dominant failure is the BA typing the PRICE into the quantity box, which
 * leaves qty exactly equal to unitPrice and squares the value: three such lines
 * in May/June 2026 produced R179m of a R189m total. Left in, they bury every
 * real number on the page.
 */
function suspectReason(qty: number, unitPrice: number): string | null {
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

    // Read only the shards both windows need.
    const neededMonths = new Set<string>([
      ...monthsBetween(complianceDates[0], complianceDates[complianceDates.length - 1]),
      ...monthsBetween(from <= to ? from : to, from <= to ? to : from),
    ]);
    const records = await loadDailySalesForMonths([...neededMonths]);

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

    // Capture errors are listed always, but kept OUT of the figures unless the
    // user asks for them, so the headline number is never 19x the truth.
    const includeSuspect = url.searchParams.get('includeSuspect') === '1';
    const suspectLines: SuspectLine[] = [];
    let suspectQty = 0;
    let suspectValue = 0;

    for (const r of inRange) {
      const baKey = r.email || r.repName.toLowerCase();
      const ba = baMap.get(baKey);
      if (ba) { ba.submissions++; } else {
        baMap.set(baKey, { email: r.email, repName: r.repName || r.email, qty: 0, value: 0, submissions: 1 });
      }

      for (const line of r.lines) {
        const reason = suspectReason(line.qty, line.unitPrice);
        if (reason) {
          suspectLines.push({
            submissionId: r.submissionId, date: r.date, email: r.email, repName: r.repName,
            store: r.store, product: line.product, qty: line.qty, unitPrice: line.unitPrice,
            value: line.value, reason,
          });
          suspectQty += line.qty;
          suspectValue += line.value;
          if (!includeSuspect) continue;
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
          /** Whether the figures above include the flagged lines. */
          includeSuspect,
          count: suspectLines.length,
          qty: suspectQty,
          value: suspectValue,
          lines: suspectLines.sort((a, b) => b.value - a.value).slice(0, 50),
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
