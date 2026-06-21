/**
 * Core auto-calculation functions — extracted from API routes so they can
 * be called internally after data uploads (no HTTP round-trip needed).
 *
 * Each function returns an array of per-BA results.
 * `runAutoCalcForMonth()` runs all calcs, merges into existing scores, and saves.
 */

import { loadVisitIndex, loadVisitData } from './visitData';
import { loadScoringConfig } from './scoringConfig';
import { loadTargetData, getStoreTarget } from './targetData';
import { loadDispoData, calcSalesValue } from './dispoData';
import { loadStores } from './storeData';
import { loadKPIControls } from './kpiControls';
import { countDisplayChecksForMonth } from './displayData';
import { countTrainingsForMonth } from './trainingData';
import { loadScores, saveScores, BAScore } from './scoreData';

// ── Check-in on Time (max 10 pts) ──

interface CheckInResult {
  email: string;
  repName: string;
  score: number;
}

export async function calcCheckInScores(month: string): Promise<CheckInResult[]> {
  const { lateCheckinTime, earlyCheckoutTime } = await loadScoringConfig();
  const index = await loadVisitIndex();
  const allVisits = [];
  for (const meta of index) {
    const visits = await loadVisitData(meta.id);
    allVisits.push(...visits);
  }

  const monthVisits = allVisits.filter(v => v.checkInDate?.substring(0, 7) === month);
  const baMap = new Map<string, { repName: string; total: number; onTime: number; earlyOut: number }>();

  for (const v of monthVisits) {
    const key = (v.email || '').toLowerCase();
    if (!key) continue;
    if (!baMap.has(key)) baMap.set(key, { repName: v.repName || v.email, total: 0, onTime: 0, earlyOut: 0 });
    const entry = baMap.get(key)!;
    if (v.repName) entry.repName = v.repName;
    entry.total++;
    if (v.checkInTime && v.checkInTime <= lateCheckinTime) entry.onTime++;
    if (v.checkOutTime && v.checkOutTime < earlyCheckoutTime) entry.earlyOut++;
  }

  return Array.from(baMap.entries()).map(([email, d]) => {
    const onTimePts = d.total > 0 ? Math.round((d.onTime / d.total) * 10) : 0;
    const earlyOutPts = d.total > 0 ? Math.round((d.earlyOut / d.total) * 10) : 0;
    return { email, repName: d.repName, score: Math.max(0, onTimePts - earlyOutPts) };
  });
}

// ── Sales vs Target (max 40 pts) ──

interface SalesResult {
  email: string;
  repName: string;
  points: number;
  variance: number;
}

function toDispoMonth(yyyyMm: string): string {
  const [yyyy, mm] = yyyyMm.split('-');
  return `${mm}-${yyyy}`;
}

export async function calcSalesScores(month: string): Promise<SalesResult[]> {
  const dispoMonth = toDispoMonth(month);
  const [targetData, dispoData, stores, visitIndex, kpiControls] = await Promise.all([
    loadTargetData(), loadDispoData(), loadStores(), loadVisitIndex(), loadKPIControls(),
  ]);

  const salesThreshold = kpiControls.salesThresholdPct ?? 80;
  const siteCodeToName: Record<string, string> = {};
  for (const s of stores) {
    if (s.siteCode) siteCodeToName[s.siteCode.trim().toUpperCase()] = s.storeName;
  }

  // Explicit store→BA assignments (siteCode upper → assigned BA). When a store is
  // assigned, its sales credit the assigned BA and are NOT credited to whoever
  // happened to visit it (e.g. a departed BA still on record in Perigee).
  const assignedByCode = new Map<string, { email: string; repName: string; storeName: string }>();
  for (const s of stores) {
    if (s.assignedBaEmail && s.siteCode) {
      assignedByCode.set(s.siteCode.trim().toUpperCase(), {
        email: s.assignedBaEmail.toLowerCase(),
        repName: s.assignedBaName || s.assignedBaEmail,
        storeName: s.storeName,
      });
    }
  }

  const baStores = new Map<string, { repName: string; stores: Map<string, string> }>();
  for (const upload of visitIndex) {
    const visits = await loadVisitData(upload.id);
    for (const v of visits) {
      if (!v.checkInDate || !v.email || !v.checkInDate.startsWith(month)) continue;
      const email = v.email.toLowerCase();
      if (!baStores.has(email)) baStores.set(email, { repName: v.repName || v.email, stores: new Map() });
      const entry = baStores.get(email)!;
      if (v.storeCode) {
        const code = v.storeCode.trim().toUpperCase();
        const storeName = siteCodeToName[code];
        // Skip stores that are explicitly assigned to another BA — they're
        // attributed below to the assigned BA, not the visiting one.
        if (storeName && !assignedByCode.has(code)) entry.stores.set(code, storeName);
      }
      if (v.repName) entry.repName = v.repName;
    }
  }

  // Attribute each assigned store's sales to its assigned BA.
  for (const [code, a] of assignedByCode) {
    if (!baStores.has(a.email)) baStores.set(a.email, { repName: a.repName, stores: new Map() });
    const entry = baStores.get(a.email)!;
    entry.repName = a.repName;
    entry.stores.set(code, a.storeName);
  }

  const rawMonthSales = dispoData.sales[dispoMonth] || {};
  const monthSalesNorm: Record<string, Record<string, number>> = {};
  for (const [key, products] of Object.entries(rawMonthSales)) {
    monthSalesNorm[key.trim().toUpperCase()] = products;
  }

  const results: SalesResult[] = [];
  for (const [email, { repName, stores: baStoreMap }] of baStores) {
    let totalValueTarget = 0;
    let totalActualValue = 0;

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

    if (totalValueTarget === 0) {
      results.push({ email, repName, variance: 0, points: 0 });
      continue;
    }

    const variance = (totalActualValue / totalValueTarget) * 100;
    const points = variance < salesThreshold ? 0 : Math.min(40, Math.round((variance / 100) * 40));
    results.push({
      email, repName,
      variance: Math.round(variance * 10) / 10,
      points,
    });
  }

  return results;
}

// ── Display Inspection auto (max 5 pts) ──

interface DisplayResult {
  email: string;
  repName: string;
  autoPoints: number;
}

export async function calcDisplayScores(month: string): Promise<DisplayResult[]> {
  const { minDisplayChecksPerMonth } = await loadKPIControls();
  const counts = await countDisplayChecksForMonth(month);
  return Array.from(counts.entries()).map(([email, data]) => ({
    email,
    repName: data.repName,
    autoPoints: Math.min(5, Math.round((data.visitCount / minDisplayChecksPerMonth) * 5)),
  }));
}

// ── Training auto (max 5 pts) ──

interface TrainingResult {
  email: string;
  repName: string;
  autoPoints: number;
}

export async function calcTrainingScores(month: string): Promise<TrainingResult[]> {
  const { minTrainingsPerMonth } = await loadKPIControls();
  const counts = await countTrainingsForMonth(month);
  return Array.from(counts.entries()).map(([email, data]) => ({
    email,
    repName: data.repName,
    autoPoints: Math.min(5, Math.round((data.count / minTrainingsPerMonth) * 5)),
  }));
}

// ── Run all auto-calcs for a month and save ──

export async function runAutoCalcForMonth(
  month: string,
  types: ('checkin' | 'sales' | 'display' | 'training')[] = ['checkin', 'sales', 'display', 'training'],
): Promise<{ month: string; updated: number }> {
  // Load existing scores
  const existing = await loadScores(month);
  const scoreMap = new Map<string, BAScore>();
  for (const s of existing) {
    scoreMap.set(s.email.toLowerCase(), s);
  }

  // Helper to get or create a score entry
  function getOrCreate(email: string, repName: string): BAScore {
    const key = email.toLowerCase();
    if (!scoreMap.has(key)) {
      scoreMap.set(key, {
        email: key, repName, month,
        monthlySales: 0, dailySales: 0, checkInOnTime: 0,
        feedback: 0, feedbackAuto: 0, displayInspection: 0,
        weeklySummaries: 0, training: 0, trainingAuto: 0,
        displayAuto: 0, bonusSuggestions: 0,
        updatedAt: '', updatedBy: '',
      });
    }
    return scoreMap.get(key)!;
  }

  const now = new Date().toISOString();

  if (types.includes('checkin')) {
    try {
      const results = await calcCheckInScores(month);
      for (const r of results) {
        const s = getOrCreate(r.email, r.repName);
        s.checkInOnTime = r.score;
        s.updatedAt = now;
        s.updatedBy = 'auto-calc';
      }
    } catch (err) {
      console.error(`Auto-calc checkin failed for ${month}:`, err);
    }
  }

  if (types.includes('sales')) {
    try {
      const results = await calcSalesScores(month);
      for (const r of results) {
        const s = getOrCreate(r.email, r.repName);
        s.monthlySales = r.points;
        s.salesVariance = r.variance;
        s.updatedAt = now;
        s.updatedBy = 'auto-calc';
      }
    } catch (err) {
      console.error(`Auto-calc sales failed for ${month}:`, err);
    }
  }

  if (types.includes('display')) {
    try {
      const results = await calcDisplayScores(month);
      for (const r of results) {
        const s = getOrCreate(r.email, r.repName);
        const manualPart = Math.max(0, (s.displayInspection || 0) - (s.displayAuto || 0));
        s.displayAuto = r.autoPoints;
        s.displayInspection = Math.min(20, r.autoPoints + manualPart);
        s.updatedAt = now;
        s.updatedBy = 'auto-calc';
      }
    } catch (err) {
      console.error(`Auto-calc display failed for ${month}:`, err);
    }
  }

  if (types.includes('training')) {
    try {
      const results = await calcTrainingScores(month);
      for (const r of results) {
        const s = getOrCreate(r.email, r.repName);
        const manualPart = Math.max(0, (s.training || 0) - (s.trainingAuto || 0));
        s.trainingAuto = r.autoPoints;
        s.training = Math.min(20, r.autoPoints + manualPart);
        s.updatedAt = now;
        s.updatedBy = 'auto-calc';
      }
    } catch (err) {
      console.error(`Auto-calc training failed for ${month}:`, err);
    }
  }

  const allScores = Array.from(scoreMap.values());
  await saveScores(month, allScores);

  return { month, updated: allScores.length };
}
