import { readJson, writeJson } from './blob';
import { loadScores, saveScores, BAScore } from './scoreData';

export interface WeeklyBAScore {
  email: string;
  repName: string;
  month: string;          // "YYYY-MM"
  week: number;           // 1-5
  weekLabel: string;      // e.g. "Week 1 18/05"
  displayManual: number;  // 0-15
  weeklySummaries: number; // 0-10
  trainingManual: number; // 0-15
  bonusSuggestions: number; // 0-10
  updatedAt: string;
  updatedBy: string;
}

function blobKey(month: string, week: number): string {
  return `weekly-scores/${month}/week-${week}.json`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function loadWeeklyScores(month: string, week: number): Promise<WeeklyBAScore[]> {
  return readJson<WeeklyBAScore[]>(blobKey(month, week), []);
}

export async function saveWeeklyScores(month: string, week: number, scores: WeeklyBAScore[]): Promise<void> {
  await writeJson(blobKey(month, week), scores);
}

/**
 * Loads all weekly score files for weeks 1-5 in parallel.
 * Returns a Map keyed by week number.
 */
export async function loadAllWeeklyScoresForMonth(month: string): Promise<Map<number, WeeklyBAScore[]>> {
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map(async (w) => {
      const scores = await loadWeeklyScores(month, w);
      return [w, scores] as [number, WeeklyBAScore[]];
    })
  );
  return new Map(results);
}

/**
 * Aggregates all weekly manual scores into the monthly BAScore file.
 * Sums weekly manual values, caps at KPI max, merges with existing auto-calc values.
 * Auto-calc fields (monthlySales, checkInOnTime, trainingAuto, displayAuto) are preserved untouched.
 */
export async function aggregateWeeklyToMonthly(month: string): Promise<void> {
  const [weeklyMap, monthlyScores] = await Promise.all([
    loadAllWeeklyScoresForMonth(month),
    loadScores(month),
  ]);

  // Build per-BA sums from weekly data
  const sums = new Map<string, {
    displayManual: number;
    weeklySummaries: number;
    trainingManual: number;
    bonusSuggestions: number;
  }>();

  for (const [, weekScores] of weeklyMap) {
    for (const ws of weekScores) {
      const email = ws.email.toLowerCase();
      const existing = sums.get(email) ?? {
        displayManual: 0,
        weeklySummaries: 0,
        trainingManual: 0,
        bonusSuggestions: 0,
      };
      existing.displayManual = round2(existing.displayManual + (ws.displayManual || 0));
      existing.weeklySummaries = round2(existing.weeklySummaries + (ws.weeklySummaries || 0));
      existing.trainingManual = round2(existing.trainingManual + (ws.trainingManual || 0));
      existing.bonusSuggestions = round2(existing.bonusSuggestions + (ws.bonusSuggestions || 0));
      sums.set(email, existing);
    }
  }

  // If no weekly data at all, don't modify monthly scores
  if (sums.size === 0) return;

  // Merge into monthly scores
  const updated = monthlyScores.map(s => {
    const email = s.email.toLowerCase();
    const weekSums = sums.get(email);
    if (!weekSums) return s;

    const trainingAuto = s.trainingAuto || 0;
    const displayAuto = s.displayAuto || 0;

    return {
      ...s,
      weeklySummaries: round2(Math.min(10, weekSums.weeklySummaries)),
      bonusSuggestions: round2(Math.min(10, weekSums.bonusSuggestions)),
      displayInspection: round2(Math.min(20, displayAuto + Math.min(15, weekSums.displayManual))),
      training: round2(Math.min(20, trainingAuto + Math.min(15, weekSums.trainingManual))),
    };
  });

  await saveScores(month, updated);
}
