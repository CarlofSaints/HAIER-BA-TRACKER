import { readJson, writeJson } from './blob';

export interface WeekMappingYear {
  year: number;
  /** ISO date string for the start of Week 1 (e.g. "2026-01-05") */
  week1Start: string;
}

export interface WeekMappingConfig {
  years: WeekMappingYear[];
}

const BLOB_KEY = 'config/week-mapping.json';

const DEFAULT: WeekMappingConfig = { years: [] };

export async function loadWeekMapping(): Promise<WeekMappingConfig> {
  return readJson<WeekMappingConfig>(BLOB_KEY, DEFAULT);
}

export async function saveWeekMapping(config: WeekMappingConfig): Promise<void> {
  await writeJson(BLOB_KEY, config);
}

/**
 * Given a year config, return all 52/53 weeks with their start and end dates.
 * Weeks are generated from the start date for a full year (52 weeks minimum,
 * 53rd added if it starts within 365 days of Week 1).
 */
export function getWeeksForYear(yearConfig: WeekMappingYear): { weekNum: number; start: Date; end: Date }[] {
  const weeks: { weekNum: number; start: Date; end: Date }[] = [];
  const w1 = new Date(yearConfig.week1Start + 'T00:00:00');

  // Generate weeks for a full year from the start date
  const oneYearLater = new Date(w1);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  let current = new Date(w1);
  let weekNum = 1;
  while (current < oneYearLater) {
    const end = new Date(current);
    end.setDate(end.getDate() + 6);
    weeks.push({ weekNum, start: new Date(current), end });
    current.setDate(current.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

/**
 * Get the week number for a given date based on the year's week mapping.
 * Returns undefined if the date is before Week 1 or beyond the year's weeks.
 */
export function getWeekNumber(date: Date, yearConfig: WeekMappingYear): number | undefined {
  const w1 = new Date(yearConfig.week1Start + 'T00:00:00');
  if (date < w1) return undefined;
  const diffMs = date.getTime() - w1.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffDays / 7) + 1;
  // Cap at the total weeks in this year (52 or 53)
  const totalWeeks = getWeeksForYear(yearConfig).length;
  if (weekNum > totalWeeks) return undefined;
  return weekNum;
}

/**
 * Get week start/end dates for a specific week number.
 */
export function getWeekDates(weekNum: number, yearConfig: WeekMappingYear): { start: Date; end: Date } {
  const w1 = new Date(yearConfig.week1Start + 'T00:00:00');
  const start = new Date(w1);
  start.setDate(start.getDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}
