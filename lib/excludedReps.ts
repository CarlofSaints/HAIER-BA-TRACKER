import { readJson, writeJson } from './blob';

/**
 * Reps (Perigee BAs) that should be kept OUT of the app entirely — e.g. test
 * accounts. They are filtered from every Perigee import (so they never come
 * back on a poll) and their existing visits/scores are stripped when added.
 * Matched by email (the stable key Perigee sends).
 */
export interface ExcludedRep {
  email: string;     // lowercased primary match key
  repName?: string;  // optional label for display
  addedAt: string;
  addedBy?: string;
}

const BLOB_KEY = 'config/excluded-reps.json';

export async function loadExcludedReps(): Promise<ExcludedRep[]> {
  const list = await readJson<ExcludedRep[]>(BLOB_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function saveExcludedReps(list: ExcludedRep[]): Promise<void> {
  await writeJson(BLOB_KEY, list);
}

/** Set of lowercased emails for fast matching. */
export function excludedEmailSet(list: ExcludedRep[]): Set<string> {
  return new Set(list.map(r => (r.email || '').toLowerCase().trim()).filter(Boolean));
}

/** Drop rows belonging to an excluded rep (by email). No-op when the set is empty. */
export function filterExcluded<T extends { email?: string }>(rows: T[], emails: Set<string>): T[] {
  if (emails.size === 0) return rows;
  return rows.filter(r => !emails.has((r.email || '').toLowerCase().trim()));
}
