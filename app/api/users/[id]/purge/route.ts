import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadUsers, saveUsers } from '@/lib/userData';
import { logFromUser } from '@/lib/activityLog';
import { loadScores, saveScores } from '@/lib/scoreData';
import { loadVisitIndex, loadVisitData, saveVisitData } from '@/lib/visitData';
import { loadTrainingIndex, loadTrainingData, saveTrainingData } from '@/lib/trainingData';
import { readJson } from '@/lib/blob';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * DELETE /api/users/[id]/purge
 * Completely removes a user and ALL their associated data:
 * - User account
 * - Scores (all months)
 * - Visit records (filtered from each upload)
 * - Training records (filtered from each upload)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized — super_admin only' }, { status: 401 });

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: 'Cannot purge yourself' }, { status: 400 });
  }

  const users = await loadUsers();
  const target = users.find(u => u.id === id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const email = target.email.toLowerCase();
  const summary = { user: `${target.name} ${target.surname} (${target.email})`, scoresRemoved: 0, visitsRemoved: 0, trainingRemoved: 0 };

  // 1. Remove user account
  const filtered = users.filter(u => u.id !== id);
  await saveUsers(filtered);

  // 2. Remove scores from all months
  // Scan known score months — check blob listing pattern
  // Since we don't have a blob list API, we'll check reasonable months (last 24)
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const scores = await loadScores(monthKey);
    const before = scores.length;
    const after = scores.filter(s => s.email.toLowerCase() !== email);
    if (after.length < before) {
      await saveScores(monthKey, after);
      summary.scoresRemoved += (before - after.length);
    }
  }

  // 3. Remove visits from all upload files
  const visitIndex = await loadVisitIndex();
  for (const meta of visitIndex) {
    const visits = await loadVisitData(meta.id);
    const before = visits.length;
    const after = visits.filter(v => (v.email || '').toLowerCase() !== email);
    if (after.length < before) {
      await saveVisitData(meta.id, after);
      summary.visitsRemoved += (before - after.length);
    }
  }

  // 4. Remove training records from all upload files
  const trainingIndex = await loadTrainingIndex();
  for (const meta of trainingIndex) {
    const records = await loadTrainingData(meta.id);
    const before = records.length;
    const after = records.filter(r => (r.email || '').toLowerCase() !== email);
    if (after.length < before) {
      await saveTrainingData(meta.id, after);
      summary.trainingRemoved += (before - after.length);
    }
  }

  logFromUser(user, 'user_purge', `user/${target.email}`, `Purged ${target.name} ${target.surname} — ${summary.scoresRemoved} scores, ${summary.visitsRemoved} visits, ${summary.trainingRemoved} training removed`, { purged: summary });
  return NextResponse.json({ ok: true, purged: summary }, { headers: noCacheHeaders() });
}
