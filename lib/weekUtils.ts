export interface WeekDef {
  week: number;       // 1-based week number within the month
  label: string;      // e.g. "Week 1 18/05"
  mondayDate: string; // ISO date of the Monday (YYYY-MM-DD)
}

/**
 * Returns the 4–5 week definitions for a given month.
 * Each week starts on Monday. Days before the first Monday
 * belong to Week 1 (labelled with the Monday of that ISO week).
 */
export function getWeeksForMonth(month: string): WeekDef[] {
  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0); // last day of month

  // Find all Mondays in the month
  const mondays: Date[] = [];
  const d = new Date(firstDay);
  while (d <= lastDay) {
    if (d.getDay() === 1) mondays.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  const weeks: WeekDef[] = [];

  if (mondays.length === 0) {
    // Very unlikely — a month with no Monday (impossible, but handle gracefully)
    const monday = getMondayOfISOWeek(firstDay);
    weeks.push({
      week: 1,
      label: `Week 1 ${formatDDMM(monday)}`,
      mondayDate: isoDate(monday),
    });
    return weeks;
  }

  // If the month starts before the first Monday, Week 1 covers those leading days
  // and is labelled with the Monday of the ISO week containing the 1st
  if (firstDay.getDay() !== 1) {
    // first day is not a Monday — Week 1 uses the Monday of that ISO week
    const monday = getMondayOfISOWeek(firstDay);
    weeks.push({
      week: 1,
      label: `Week 1 ${formatDDMM(monday)}`,
      mondayDate: isoDate(monday),
    });
    // remaining Mondays start at Week 2
    for (let i = 0; i < mondays.length; i++) {
      const weekNum = i + 2;
      weeks.push({
        week: weekNum,
        label: `Week ${weekNum} ${formatDDMM(mondays[i])}`,
        mondayDate: isoDate(mondays[i]),
      });
    }
  } else {
    // Month starts on a Monday — every Monday is a new week starting at 1
    for (let i = 0; i < mondays.length; i++) {
      const weekNum = i + 1;
      weeks.push({
        week: weekNum,
        label: `Week ${weekNum} ${formatDDMM(mondays[i])}`,
        mondayDate: isoDate(mondays[i]),
      });
    }
  }

  return weeks;
}

/**
 * Returns which week number today falls in for the given month.
 * Defaults to 1 if today is outside the month.
 */
export function getCurrentWeek(month: string): number {
  const weeks = getWeeksForMonth(month);
  if (weeks.length === 0) return 1;

  const [year, mon] = month.split('-').map(Number);
  const today = new Date();
  // If today is not in this month, return 1
  if (today.getFullYear() !== year || today.getMonth() + 1 !== mon) return 1;

  const dayOfMonth = today.getDate();
  const firstDay = new Date(year, mon - 1, 1);

  // Find which week this day belongs to by checking week boundaries
  // Each week starts at its monday (or the 1st for week 1)
  for (let i = weeks.length - 1; i >= 0; i--) {
    const weekMonday = new Date(weeks[i].mondayDate);
    // The week's start in terms of the month: max(monday, firstDay)
    const weekStart = weekMonday < firstDay ? firstDay : weekMonday;
    if (dayOfMonth >= weekStart.getDate()) {
      return weeks[i].week;
    }
  }

  return 1;
}

/** Get the Monday of the ISO week containing the given date */
function getMondayOfISOWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1, Sunday = 0 → diff = -6
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDDMM(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
