import { readJson, writeJson } from './blob';

export interface BAScore {
  email: string;
  repName: string;
  month: string;              // "YYYY-MM"
  monthlySales: number;       // 0 or 30
  dailySales: number;         // 0–20
  checkInOnTime: number;      // 0–10
  feedback: number;           // 0–5
  displayInspection: number;  // 0–15
  weeklySummaries: number;    // 0–10
  training: number;           // 0–10
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
  { key: 'monthlySales', label: 'Monthly Sales vs Target', max: 30, isBonus: false },
  { key: 'dailySales', label: 'Daily Sales vs Target', max: 20, isBonus: false },
  { key: 'checkInOnTime', label: 'Check-in on Time', max: 10, isBonus: false },
  { key: 'feedback', label: 'Feedback', max: 5, isBonus: false },
  { key: 'displayInspection', label: 'Display Inspection', max: 15, isBonus: false },
  { key: 'weeklySummaries', label: 'Weekly Summaries', max: 10, isBonus: false },
  { key: 'training', label: 'Training', max: 10, isBonus: false },
  { key: 'bonusSuggestions', label: 'Bonus Suggestions', max: 10, isBonus: true },
];

export const CORE_KPI_DEFS = KPI_DEFS.filter(k => !k.isBonus);

export function calcTotal(s: BAScore): number {
  const sum = s.monthlySales + s.dailySales + s.checkInOnTime +
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
    training: 0, bonusSuggestions: 0,
    updatedAt: '', updatedBy: '',
  };
}

export async function loadScores(month: string): Promise<BAScore[]> {
  return readJson<BAScore[]>(`scores/${month}.json`, []);
}

export async function saveScores(month: string, scores: BAScore[]): Promise<void> {
  await writeJson(`scores/${month}.json`, scores);
}
