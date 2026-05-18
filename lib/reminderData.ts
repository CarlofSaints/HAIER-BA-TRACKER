import { readJson, writeJson } from './blob';

/* ── Types ── */

export interface RecurrenceRule {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  time: string;            // HH:MM (SAST, 24h)
  daysOfWeek?: number[];   // 0=Sun..6=Sat (weekly)
  dayOfMonth?: number;     // 1-31 (monthly)
  intervalDays?: number;   // custom interval
}

export interface EmailReminder {
  id: string;
  name: string;
  subject: string;
  body: string;            // HTML from rich text editor
  to: string[];            // user IDs
  cc: string[];
  bcc: string[];
  recurrence: RecurrenceRule;
  startDate: string;       // YYYY-MM-DD
  endDate?: string;
  enabled: boolean;
  createdBy: string;       // email
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string;
  nextDueAt?: string;      // pre-computed UTC ISO string
}

/* ── Blob helpers ── */

const BLOB_KEY = 'config/reminders.json';

export async function loadReminders(): Promise<EmailReminder[]> {
  return readJson<EmailReminder[]>(BLOB_KEY, []);
}

export async function saveReminders(reminders: EmailReminder[]): Promise<void> {
  await writeJson(BLOB_KEY, reminders);
}

/* ── SAST time helpers ── */

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000; // UTC+2, no DST

/** Convert a UTC Date to SAST Date object (shifted so getHours/getDay etc. return SAST values) */
function toSAST(utc: Date): Date {
  return new Date(utc.getTime() + SAST_OFFSET_MS);
}

/** Build a UTC Date from a SAST date string (YYYY-MM-DD) and time string (HH:MM) */
function sastToUTC(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCHours(h, m, 0, 0);
  return new Date(d.getTime() - SAST_OFFSET_MS);
}

/** Format YYYY-MM-DD from a SAST Date */
function formatDate(sast: Date): string {
  const y = sast.getFullYear();
  const m = String(sast.getMonth() + 1).padStart(2, '0');
  const d = String(sast.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add days to a date string */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Get the last day of a month */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/* ── Compute next due date ── */

/**
 * Compute the next UTC ISO datetime when this reminder should fire.
 * `after` is a UTC Date -- we find the first occurrence strictly after it.
 * Returns undefined if the reminder has no more occurrences (past endDate).
 */
export function computeNextDue(
  rule: RecurrenceRule,
  after: Date,
  startDate: string,
  endDate?: string,
): string | undefined {
  const afterSAST = toSAST(after);
  const startSAST = toSAST(sastToUTC(startDate, rule.time));

  // Determine the first candidate date (SAST)
  let candidateDate: string;
  if (afterSAST < startSAST) {
    candidateDate = startDate;
  } else {
    // Start from afterSAST's date
    candidateDate = formatDate(afterSAST);
    // If the time today has already passed, start from tomorrow
    const todayFire = sastToUTC(candidateDate, rule.time);
    if (after >= todayFire) {
      candidateDate = addDays(candidateDate, 1);
    }
  }

  // Search up to 400 days ahead to find the next match
  for (let i = 0; i < 400; i++) {
    if (endDate && candidateDate > endDate) return undefined;
    if (candidateDate < startDate) {
      candidateDate = addDays(candidateDate, 1);
      continue;
    }

    const utcFire = sastToUTC(candidateDate, rule.time);
    const candSAST = toSAST(utcFire);
    const dow = candSAST.getDay(); // 0=Sun
    const dom = candSAST.getDate();

    let matches = false;
    switch (rule.type) {
      case 'daily':
        matches = true;
        break;
      case 'weekly':
        matches = !!(rule.daysOfWeek && rule.daysOfWeek.includes(dow));
        break;
      case 'monthly':
        if (rule.dayOfMonth) {
          const year = candSAST.getFullYear();
          const month = candSAST.getMonth();
          const maxDay = lastDayOfMonth(year, month);
          const targetDay = Math.min(rule.dayOfMonth, maxDay);
          matches = dom === targetDay;
        }
        break;
      case 'custom':
        if (rule.intervalDays && rule.intervalDays > 0) {
          const startMs = new Date(startDate + 'T12:00:00Z').getTime();
          const candMs = new Date(candidateDate + 'T12:00:00Z').getTime();
          const daysDiff = Math.round((candMs - startMs) / (24 * 60 * 60 * 1000));
          matches = daysDiff >= 0 && daysDiff % rule.intervalDays === 0;
        }
        break;
    }

    if (matches && utcFire > after) {
      return utcFire.toISOString();
    }

    candidateDate = addDays(candidateDate, 1);
  }

  return undefined;
}

/* ── Human-readable description ── */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeRecurrence(rule: RecurrenceRule): string {
  const time = rule.time || '09:00';
  switch (rule.type) {
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly': {
      const days = (rule.daysOfWeek || []).map(d => DAY_NAMES[d]).join(', ');
      return `Weekly on ${days || 'no days'} at ${time}`;
    }
    case 'monthly':
      return `Monthly on day ${rule.dayOfMonth || 1} at ${time}`;
    case 'custom':
      return `Every ${rule.intervalDays || 1} day(s) at ${time}`;
    default:
      return `At ${time}`;
  }
}
