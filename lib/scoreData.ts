import { readJson, writeJson } from './blob';

export interface BAScore {
  email: string;
  repName: string;
  month: string;              // "YYYY-MM"
  monthlySales: number;       // 0 or 40
  dailySales: number;         // tracked but not scored as KPI
  checkInOnTime: number;      // 0–10
  feedback: number;           // 0–10
  displayInspection: number;  // 0–15
  weeklySummaries: number;    // 0–10
  training: number;           // 0–15 (combined: auto + manual)
  trainingAuto: number;       // 0–5 (auto-calculated from training form data)
  displayAuto: number;        // 0–5 (auto-calculated from display checks threshold)
  bonusSuggestions: number;   // 0–10 (bonus)
  updatedAt: string;
  updatedBy: string;
}

export interface KPIDef {
  key: keyof BAScore;
  label: string;
  max: number;
  isBonus: boolean;
}

export const KPI_DEFS: KPIDef[] = [
  { key: 'monthlySales', label: 'Monthly Sales vs Target', max: 40, isBonus: false },
  { key: 'checkInOnTime', label: 'Check-in on Time', max: 10, isBonus: false },
  { key: 'feedback', label: 'Feedback', max: 10, isBonus: false },
  { key: 'displayInspection', label: 'Display Inspection', max: 15, isBonus: false },
  { key: 'weeklySummaries', label: 'Weekly Summaries', max: 10, isBonus: false },
  { key: 'training', label: 'Training', max: 15, isBonus: false },
  { key: 'bonusSuggestions', label: 'Bonus Suggestions', max: 10, isBonus: true },
];

export const CORE_KPI_DEFS = KPI_DEFS.filter(k => !k.isBonus);

export function calcTotal(s: BAScore): number {
  const sum = s.monthlySales + s.checkInOnTime +
    s.feedback + s.displayInspection + s.weeklySummaries + s.training;
  return Math.min(sum, 100);
}

export function calcGrandTotal(s: BAScore): number {
  return Math.min(calcTotal(s) + s.bonusSuggestions, 110);
}

export function emptyScore(email: string, repName: string, month: string): BAScore {
  return {
    email, repName, month,
    monthlySales: 0, dailySales: 0, checkInOnTime: 0,
    feedback: 0, displayInspection: 0, weeklySummaries: 0,
    training: 0, trainingAuto: 0, displayAuto: 0, bonusSuggestions: 0,
    updatedAt: '', updatedBy: '',
  };
}

export async function loadScores(month: string): Promise<BAScore[]> {
  const raw = await readJson<BAScore[]>(`scores/${month}.json`, []);
  // Backfill trainingAuto and displayAuto for old data
  return raw.map(s => ({ ...s, trainingAuto: s.trainingAuto ?? 0, displayAuto: s.displayAuto ?? 0 }));
}

export async function saveScores(month: string, scores: BAScore[]): Promise<void> {
  await writeJson(`scores/${month}.json`, scores);
}
