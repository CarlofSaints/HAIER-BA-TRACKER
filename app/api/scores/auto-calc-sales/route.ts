import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadTargetData, getStoreTarget } from '@/lib/targetData';
import { loadDispoData, calcSalesValue } from '@/lib/dispoData';
import { loadStores } from '@/lib/storeData';
import { loadVisitIndex, loadVisitData } from '@/lib/visitData';
import { loadKPIControls } from '@/lib/kpiControls';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Convert YYYY-MM to MM-YYYY (DISPO/target month key format).
 */
function toDispoMonth(yyyyMm: string): string {
  const [yyyy, mm] = yyyyMm.split('-');
  return `${mm}-${yyyy}`;
}

/**
 * Get days in a given month.
 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Parse DD.MM.YYYY export date string and return the day-of-month.
 * Returns null if not parseable.
 */
function parseExportDay(exportDate: string, targetMonth: string): number | null {
  // exportDate = "DD.MM.YYYY", targetMonth = "MM-YYYY"
  const m = exportDate.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  const exportMonthKey = `${mm}-${yyyy}`;
  // Only prorate if the export is in the same month as the target
  if (exportMonthKey === targetMonth) return day;
  // Export is in a later month — full target applies (no prorating)
  return null;
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const month: string = body.month; // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (expected YYYY-MM)' }, { status: 400 });
    }

    const dispoMonth = toDispoMonth(month); // MM-YYYY
    const [yyyy, mm] = month.split('-').map(Number);
    const totalDays = daysInMonth(yyyy, mm);

    // Load all data in parallel
    const [targetData, dispoData, stores, visitIndex, kpiControls] = await Promise.all([
      loadTargetData(),
      loadDispoData(),
      loadStores(),
      loadVisitIndex(),
      loadKPIControls(),
    ]);

    const salesThreshold = kpiControls.salesThresholdPct ?? 80;

    // Build store master lookup: siteCode → storeName
    const siteCodeToName: Record<string, string> = {};
    for (const s of stores) {
      if (s.siteCode) siteCodeToName[s.siteCode.trim()] = s.storeName;
    }

    // Find latest DISPO export date for this month (for prorating)
    let latestExportDay: number | null = null;
    for (const upload of dispoData.uploads) {
      const exportDate = (upload as any).exportDate as string | undefined;
      if (exportDate) {
        const day = parseExportDay(exportDate, dispoMonth);
        if (day !== null && (latestExportDay === null || day > latestExportDay)) {
          latestExportDay = day;
        }
      }
    }

    // Prorate factor: if we have a mid-month export, prorate; otherwise full month
    const prorateFactor = latestExportDay !== null ? latestExportDay / totalDays : 1;

    // Load all visits and group by BA email → set of storeCodes visited in this month
    const baStores = new Map<string, { repName: string; storeCodes: Set<string> }>();
    for (const upload of visitIndex) {
      const visits = await loadVisitData(upload.id);
      for (const v of visits) {
        if (!v.checkInDate || !v.email) continue;
        // checkInDate is YYYY-MM-DD; month is YYYY-MM
        if (!v.checkInDate.startsWith(month)) continue;
        const email = v.email.toLowerCase();
        if (!baStores.has(email)) {
          baStores.set(email, { repName: v.repName || v.email, storeCodes: new Set() });
        }
        const entry = baStores.get(email)!;
        if (v.storeCode) entry.storeCodes.add(v.storeCode.trim());
        // Keep the latest repName
        if (v.repName) entry.repName = v.repName;
      }
    }

    // Get DISPO sales for a store (by storeName) in this month
    const monthSales = dispoData.sales[dispoMonth] || {};

    // Calculate per-BA results
    const results: {
      email: string;
      repName: string;
      storeNames: string[];
      valueTarget: number;
      proratedTarget: number;
      actualValue: number;
      variance: number;
      points: number;
    }[] = [];

    for (const [email, { repName, storeCodes }] of baStores) {
      let totalValueTarget = 0;
      let totalActualValue = 0;
      const storeNames: string[] = [];

      for (const storeCode of storeCodes) {
        // Get target for this store
        const target = getStoreTarget(targetData.targets, dispoMonth, storeCode);
        if (!target) continue;

        totalValueTarget += target.valueTarget;

        // Get actual sales: storeName from store master, then lookup in DISPO
        const storeName = siteCodeToName[storeCode] || target.storeName;
        if (!storeNames.includes(storeName)) storeNames.push(storeName);

        const storeProducts = monthSales[storeName];
        if (storeProducts) {
          for (const [article, units] of Object.entries(storeProducts)) {
            totalActualValue += calcSalesValue(units, dispoData.prices[article]);
          }
        }
      }

      // Skip BAs with no targets
      if (totalValueTarget === 0) {
        results.push({
          email, repName, storeNames,
          valueTarget: 0, proratedTarget: 0, actualValue: totalActualValue,
          variance: 0, points: 0,
        });
        continue;
      }

      const proratedTarget = totalValueTarget * prorateFactor;
      const variance = proratedTarget > 0 ? (totalActualValue / proratedTarget) * 100 : 0;

      let points: number;
      if (variance < salesThreshold) {
        points = 0;
      } else {
        points = Math.min(40, Math.round((variance / 100) * 40));
      }

      results.push({
        email, repName, storeNames,
        valueTarget: totalValueTarget,
        proratedTarget: Math.round(proratedTarget * 100) / 100,
        actualValue: Math.round(totalActualValue * 100) / 100,
        variance: Math.round(variance * 10) / 10,
        points,
      });
    }

    return NextResponse.json(results, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Auto-calc sales error:', err);
    return NextResponse.json({
      error: 'Failed to auto-calculate sales scores',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
