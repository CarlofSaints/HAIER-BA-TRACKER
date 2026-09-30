import { readJson, writeJson } from './blob';
import { logActivity } from './activityLog';
import type { StoreMaster } from './storeData';
import type { User } from './userData';

/*
  Per-BA settings the roster can't derive from visit/training data.

  deployment:
    'dedicated' — works ONE store. The Stores page refuses to leave a dedicated
                  BA on two stores (picking a new store moves them).
    'roaming'   — covers several stores. Multiple assignments are expected.
    absent      — not decided yet. Treated like roaming (nothing is blocked),
                  but shown as "Not set" so it is visibly undecided rather than
                  silently defaulted.

  Either way the leaderboard sums sales over every store the BA is credited
  with, the same set the sales points are scored on (lib/baStores.ts).
*/

export type BaDeployment = 'dedicated' | 'roaming';

export interface BaProfile {
  deployment?: BaDeployment;
  updatedAt?: string;
  updatedBy?: string;
}

export type BaProfiles = Record<string, BaProfile>; // key = lower-case email

const BLOB_KEY = 'admin/ba-profiles.json';

export async function loadBaProfiles(): Promise<BaProfiles> {
  return readJson<BaProfiles>(BLOB_KEY, {});
}

export async function saveBaProfiles(profiles: BaProfiles): Promise<void> {
  await writeJson(BLOB_KEY, profiles);
}

export function isDedicated(profiles: BaProfiles, email: string | undefined): boolean {
  return !!email && profiles[email.toLowerCase().trim()]?.deployment === 'dedicated';
}

/* Identity of a store row across a save. siteCode+name+channel is the exact
   key; the looser fallbacks keep an assignment's date when an admin only edits
   the channel or the code in the same save. */
function findPrevious(prev: StoreMaster[], s: StoreMaster): StoreMaster | undefined {
  const code = (s.siteCode || '').trim();
  return prev.find(p => p.storeName === s.storeName && (p.siteCode || '').trim() === code && (p.channelId || '') === (s.channelId || ''))
    || prev.find(p => p.storeName === s.storeName && (p.siteCode || '').trim() === code)
    || prev.find(p => p.storeName === s.storeName && (p.channelId || '') === (s.channelId || ''));
}

export interface AssignmentChange {
  storeName: string;
  siteCode: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
}

/*
  Server-side stamping for a store-list save. For each store:
    - BA unchanged → carry the stored assignedAt/By/Via forward (the client's
      copy is ignored, so a page that doesn't know these fields can't wipe them)
    - BA changed   → stamp now + the saving user, or clear the stamp on unassign
  Mutates `next` in place and returns what changed, for the activity log.
*/
export function stampAssignments(prev: StoreMaster[], next: StoreMaster[], user: User): AssignmentChange[] {
  const now = new Date().toISOString();
  const changes: AssignmentChange[] = [];
  for (const s of next) {
    const before = findPrevious(prev, s);
    const fromEmail = (before?.assignedBaEmail || '').toLowerCase().trim();
    const toEmail = (s.assignedBaEmail || '').toLowerCase().trim();
    if (fromEmail === toEmail) {
      s.assignedAt = before?.assignedAt;
      s.assignedBy = before?.assignedBy;
      s.assignedVia = before?.assignedVia;
      continue;
    }
    if (toEmail) {
      s.assignedAt = now;
      s.assignedBy = user.email;
      s.assignedVia = 'manual';
    } else {
      delete s.assignedAt;
      delete s.assignedBy;
      delete s.assignedVia;
    }
    changes.push({
      storeName: s.storeName,
      siteCode: s.siteCode || '',
      fromEmail,
      fromName: before?.assignedBaName || fromEmail,
      toEmail,
      toName: s.assignedBaName || toEmail,
    });
  }
  return changes;
}

/* Awaited, one entry per change: a fire-and-forget write is dropped when the
   serverless function returns. */
export async function logAssignmentChanges(user: User, changes: AssignmentChange[]): Promise<void> {
  for (const c of changes) {
    const store = `${c.storeName}${c.siteCode ? ` (${c.siteCode})` : ''}`;
    const summary = c.toEmail
      ? `Assigned ${c.toName} to ${store}${c.fromEmail ? ` (was ${c.fromName})` : ''}`
      : `Removed ${c.fromName} from ${store} (back to auto from Perigee visits)`;
    await logActivity('assign_ba', user.email, `${user.name} ${user.surname}`, store, summary, {
      siteCode: c.siteCode, from: c.fromEmail, to: c.toEmail, via: 'manual',
    }).catch(() => {});
  }
}

/* Dedicated BAs left on more than one store by this save, counting only BAs
   whose assignment actually changed in it. Pre-existing doubles are left for
   the admin to clean up rather than blocking every unrelated save. */
export function dedicatedConflicts(
  next: StoreMaster[],
  changes: AssignmentChange[],
  profiles: BaProfiles,
): { email: string; stores: string[] }[] {
  const touched = new Set(changes.map(c => c.toEmail).filter(Boolean));
  const out: { email: string; stores: string[] }[] = [];
  for (const email of touched) {
    if (!isDedicated(profiles, email)) continue;
    const stores = next
      .filter(s => (s.assignedBaEmail || '').toLowerCase().trim() === email)
      .map(s => s.storeName);
    if (stores.length > 1) out.push({ email, stores });
  }
  return out;
}
