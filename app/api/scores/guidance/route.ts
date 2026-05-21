import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadVisitIndex, loadVisitData } from '@/lib/visitData';
import { loadScoringConfig } from '@/lib/scoringConfig';
import { loadTargetData, getStoreTarget } from '@/lib/targetData';
import { loadDispoData, calcSalesValue } from '@/lib/dispoData';
import { loadStores } from '@/lib/storeData';
import { loadKPIControls } from '@/lib/kpiControls';
import { countDisplayChecksForMonth } from '@/lib/displayData';
import { countTrainingsForMonth } from '@/lib/trainingData';
import { loadScores } from '@/lib/scoreData';

export const dynamic = 'force-dynamic';

function toDispoMonth(yyyyMm: string): string {
  const [yyyy, mm] = yyyyMm.split('-');
  return `${mm}-${yyyy}`;
}

export async function GET(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  const email = url.searchParams.get('email')?.toLowerCase();

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    // Load all data in parallel
    const [
      scoringConfig,
      visitIndex,
      targetData,
      dispoData,
      stores,
      kpiControls,
      displayCounts,
      trainingCounts,
      allScores,
    ] = await Promise.all([
      loadScoringConfig(),
      loadVisitIndex(),
      loadTargetData(),
      loadDispoData(),
      loadStores(),
      loadKPIControls(),
      countDisplayChecksForMonth(month),
      countTrainingsForMonth(month),
      loadScores(month),
    ]);

    const baScore = allScores.find(s => s.email.toLowerCase() === email);

    // ── Check-in stats ──
    const allVisits = [];
    for (const meta of visitIndex) {
      const visits = await loadVisitData(meta.id);
      allVisits.push(...visits);
    }
    const monthVisits = allVisits.filter(
      v => v.checkInDate?.substring(0, 7) === month && (v.email || '').toLowerCase() === email
    );

    let totalVisits = 0;
    let onTimeVisits = 0;
    let earlyCheckouts = 0;
    let lateVisits = 0;

    for (const v of monthVisits) {
      totalVisits++;
      const isOnTime = v.checkInTime && v.checkInTime <= scoringConfig.lateCheckinTime;
      const isLate = v.checkInTime && v.checkInTime > scoringConfig.lateCheckinTime;
      const isEarlyOut = v.checkOutTime && v.checkOutTime < scoringConfig.earlyCheckoutTime;
      if (isOnTime) onTimeVisits++;
      if (isLate) lateVisits++;
      if (isEarlyOut) earlyCheckouts++;
    }

    const checkInPoints = baScore?.checkInOnTime ?? 0;

    // ── Sales stats ──
    const dispoMonth = toDispoMonth(month);
    const salesThreshold = kpiControls.salesThresholdPct ?? 80;

    const siteCodeToName: Record<string, string> = {};
    for (const s of stores) {
      if (s.siteCode) siteCodeToName[s.siteCode.trim().toUpperCase()] = s.storeName;
    }

    // Find stores this BA visited
    const baStoreMap = new Map<string, string>();
    for (const v of monthVisits) {
      if (v.storeCode) {
        const code = v.storeCode.trim().toUpperCase();
        const storeName = siteCodeToName[code];
        if (storeName) baStoreMap.set(code, storeName);
      }
    }

    let totalValueTarget = 0;
    let totalActualValue = 0;

    const rawMonthSales = dispoData.sales[dispoMonth] || {};
    const monthSalesNorm: Record<string, Record<string, number>> = {};
    for (const [key, products] of Object.entries(rawMonthSales)) {
      monthSalesNorm[key.trim().toUpperCase()] = products;
    }

    for (const [siteCode, storeName] of baStoreMap) {
      const target = getStoreTarget(targetData.targets, dispoMonth, siteCode);
      if (!target) continue;
      totalValueTarget += target.valueTarget;
      const storeProducts = monthSalesNorm[storeName.trim().toUpperCase()];
      if (storeProducts) {
        for (const [article, units] of Object.entries(storeProducts)) {
          totalActualValue += calcSalesValue(units, dispoData.prices[article]);
        }
      }
    }

    const salesVariance = totalValueTarget > 0
      ? Math.round((totalActualValue / totalValueTarget) * 1000) / 10
      : 0;
    const salesPoints = baScore?.monthlySales ?? 0;
    const amountLeft = Math.max(0, totalValueTarget - totalActualValue);
    const toThreshold = totalValueTarget > 0
      ? Math.max(0, Math.round(totalValueTarget * (salesThreshold / 100) - totalActualValue))
      : 0;

    // ── Display stats ──
    const displayData = displayCounts.get(email);
    const completedDisplayChecks = displayData?.visitCount ?? 0;
    const minDisplayChecks = kpiControls.minDisplayChecksPerMonth;
    const displayAutoPoints = baScore?.displayAuto ?? 0;
    const displayManualPoints = Math.max(0, (baScore?.displayInspection ?? 0) - displayAutoPoints);

    // ── Training stats ──
    const trainingData = trainingCounts.get(email);
    const completedTrainings = trainingData?.count ?? 0;
    const minTrainings = kpiControls.minTrainingsPerMonth;
    const trainingAutoPoints = baScore?.trainingAuto ?? 0;
    const trainingManualPoints = Math.max(0, (baScore?.training ?? 0) - trainingAutoPoints);

    // ── Weekly Summaries ──
    const weeklySummariesCurrent = baScore?.weeklySummaries ?? 0;

    // ── Bonus ──
    const bonusCurrent = baScore?.bonusSuggestions ?? 0;

    const guidance = {
      sales: {
        valueTarget: Math.round(totalValueTarget),
        actualValue: Math.round(totalActualValue),
        variance: salesVariance,
        threshold: salesThreshold,
        points: salesPoints,
        maxPoints: 40,
        amountLeft: Math.round(amountLeft),
        toThreshold: toThreshold,
      },
      checkin: {
        totalVisits,
        onTimeVisits,
        earlyCheckouts,
        lateVisits,
        points: checkInPoints,
        maxPoints: 10,
        lateCheckinTime: scoringConfig.lateCheckinTime,
        earlyCheckoutTime: scoringConfig.earlyCheckoutTime,
      },
      display: {
        completedChecks: completedDisplayChecks,
        minRequired: minDisplayChecks,
        autoPoints: displayAutoPoints,
        manualPoints: displayManualPoints,
        maxAutoPoints: 5,
        maxManualPoints: 15,
        maxPoints: 20,
        totalPoints: baScore?.displayInspection ?? 0,
      },
      training: {
        completedTrainings,
        minRequired: minTrainings,
        autoPoints: trainingAutoPoints,
        manualPoints: trainingManualPoints,
        maxAutoPoints: 5,
        maxManualPoints: 15,
        maxPoints: 20,
        totalPoints: baScore?.training ?? 0,
      },
      weeklySummaries: {
        current: weeklySummariesCurrent,
        maxPoints: 10,
      },
      bonus: {
        current: bonusCurrent,
        maxPoints: 10,
      },
    };

    return NextResponse.json(guidance, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Guidance GET error:', err);
    return NextResponse.json({ error: 'Failed to load guidance data' }, { status: 500 });
  }
}
