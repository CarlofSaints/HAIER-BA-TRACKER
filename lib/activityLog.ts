import { readJson, writeJson } from './blob';
import type { User } from './userData';

export type ActivityAction =
  | 'upload_visits' | 'upload_dispo' | 'upload_training' | 'upload_targets' | 'upload_display'
  | 'delete_visits' | 'delete_dispo' | 'delete_training' | 'delete_targets' | 'delete_display'
  | 'cron_import'
  | 'user_create' | 'user_edit' | 'user_delete' | 'user_purge'
  | 'scores_save';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: ActivityAction;
  actor: string;
  actorName: string;
  resource: string;
  summary: string;
  details?: Record<string, unknown>;
}

const MAX_ENTRIES_PER_MONTH = 500;

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function logActivity(
  action: ActivityAction,
  actor: string,
  actorName: string,
  resource: string,
  summary: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const month = monthKey();
  const key = `logs/activity/${month}.json`;
  const entries = await readJson<ActivityLogEntry[]>(key, []);

  entries.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    actor,
    actorName,
    resource,
    summary,
    details,
  });

  if (entries.length > MAX_ENTRIES_PER_MONTH) entries.length = MAX_ENTRIES_PER_MONTH;

  await writeJson(key, entries);
}

/** Fire-and-forget convenience wrapper using a User object */
export function logFromUser(
  user: User,
  action: ActivityAction,
  resource: string,
  summary: string,
  details?: Record<string, unknown>,
): void {
  logActivity(
    action,
    user.email,
    `${user.name} ${user.surname}`,
    resource,
    summary,
    details,
  ).catch(() => {});
}

export async function getActivityLog(month: string): Promise<ActivityLogEntry[]> {
  return readJson<ActivityLogEntry[]>(`logs/activity/${month}.json`, []);
}

export async function getActivityLogRange(months: string[]): Promise<ActivityLogEntry[]> {
  const all = await Promise.all(months.map(m => getActivityLog(m)));
  return all.flat().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
