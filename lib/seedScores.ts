import { loadVisitIndex, loadVisitData, Visit } from './visitData';
import { loadScores, saveScores, BAScore } from './scoreData';
import { loadScoringConfig } from './scoringConfig';

/**
 * Seed leaderboard scores from visit data.
 * Called by both the manual "Seed from Visits" button and the Perigee auto-import.
 *
 * Check-in on Time formula:
 *   score = max(0, round(onTime% × 10) - round(earlyCheckout% × 10))
 *
 * - onTime% = visits where checkInTime <= lateCheckinTime threshold / total visits
 * - earlyCheckout% = visits where checkOutTime < earlyCheckoutTime threshold / total visits
 * - All visits counted regardless of status
 */
export async function seedScoresFromVisits(
  triggeredBy: string
): Promise<{ months: number; bas: number }> {
  // Load scoring thresholds
  const scoringConfig = await loadScoringConfig();
  const { lateCheckinTime, earlyCheckoutTime } = scoringConfig;

  // Load all visits
  const index = await loadVisitIndex();
  const allVisits: Visit[] = [];
  for (const meta of index) {
    const visits = await loadVisitData(meta.id);
    allVisits.push(...visits);
  }

  if (allVisits.length === 0) {
    return { months: 0, bas: 0 };
  }

  // Group visits by month (YYYY-MM)
  const byMonth = new Map<string, Visit[]>();
  for (const v of allVisits) {
    if (!v.checkInDate) continue;
    const month = v.checkInDate.substring(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(v);
  }

  let totalMonths = 0;
  let totalBAs = 0;

  for (const [month, visits] of byMonth) {
    // Load any existing scores for this month (preserve manual entries)
    const existingScores = await loadScores(month);
    const existingMap = new Map<string, BAScore>();
    for (const s of existingScores) {
      existingMap.set(s.email.toLowerCase(), s);
    }

    // Group visits by BA for this month
    const baMap = new Map<string, { repName: string; total: number; onTime: number; earlyOut: number }>();
    for (const v of visits) {
      const email = (v.email || '').toLowerCase();
      if (!email) continue;
      if (!baMap.has(email)) {
        baMap.set(email, { repName: v.repName || v.email, total: 0, onTime: 0, earlyOut: 0 });
      }
      const entry = baMap.get(email)!;
      if (v.repName) entry.repName = v.repName;
      entry.total++;

      // On time: checkInTime <= lateCheckinTime threshold
      if (v.checkInTime && v.checkInTime <= lateCheckinTime) {
        entry.onTime++;
      }

      // Early check-out: checkOutTime is present AND < earlyCheckoutTime threshold
      if (v.checkOutTime && v.checkOutTime < earlyCheckoutTime) {
        entry.earlyOut++;
      }
    }

    // Build scores array — merge with existing or create new
    const now = new Date().toISOString();
    const scores: BAScore[] = [];

    for (const [email, data] of baMap) {
      // Formula: max(0, round(onTime% × 10) - round(earlyCheckout% × 10))
      const onTimePts = data.total > 0 ? Math.round((data.onTime / data.total) * 10) : 0;
      const earlyOutPts = data.total > 0 ? Math.round((data.earlyOut / data.total) * 10) : 0;
      const checkInScore = Math.max(0, onTimePts - earlyOutPts);

      if (existingMap.has(email)) {
        // Existing score: update checkInOnTime + repName (preserve manual KPIs)
        const existing = existingMap.get(email)!;
        scores.push({
          ...existing,
          repName: data.repName,
          checkInOnTime: checkInScore,
          updatedAt: now,
          updatedBy: triggeredBy,
        });
        existingMap.delete(email);
      } else {
        // New BA: create with only check-in score populated
        scores.push({
          email,
          repName: data.repName,
          month,
          monthlySales: 0,
          dailySales: 0,
          checkInOnTime: checkInScore,
          feedback: 0,
          displayInspection: 0,
          weeklySummaries: 0,
          training: 0,
          bonusSuggestions: 0,
          updatedAt: now,
          updatedBy: triggeredBy,
        });
      }
      totalBAs++;
    }

    // Keep any existing BAs that weren't in visits this month
    for (const [, existing] of existingMap) {
      scores.push(existing);
    }

    await saveScores(month, scores);
    totalMonths++;
  }

  return { months: totalMonths, bas: totalBAs };
}
