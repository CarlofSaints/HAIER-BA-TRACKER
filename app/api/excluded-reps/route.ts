import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadExcludedReps, saveExcludedReps, ExcludedRep } from '@/lib/excludedReps';
import { loadScores, saveScores } from '@/lib/scoreData';
import { loadVisitIndex, loadVisitData, saveVisitData } from '@/lib/visitData';
import { loadTrainingIndex, loadTrainingData, saveTrainingData } from '@/lib/trainingData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await loadExcludedReps(), { headers: noCacheHeaders() });
}

/** Exclude a rep and strip their existing visits/scores/training. */
export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized — super_admin only' }, { status: 401 });

  const { email, repName } = await req.json() as { email?: string; repName?: string };
  const key = (email || '').toLowerCase().trim();
  if (!key) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  const list = await loadExcludedReps();
  if (!list.some(r => r.email === key)) {
    const entry: ExcludedRep = { email: key, repName: repName?.trim() || '', addedAt: new Date().toISOString(), addedBy: user.email };
    list.push(entry);
    await saveExcludedReps(list);
  }

  const summary = { visitsRemoved: 0, scoresRemoved: 0, trainingRemoved: 0 };

  const visitIndex = await loadVisitIndex();
  for (const meta of visitIndex) {
    const visits = await loadVisitData(meta.id);
    const after = visits.filter(v => (v.email || '').toLowerCase() !== key);
    if (after.length < visits.length) { await saveVisitData(meta.id, after); summary.visitsRemoved += visits.length - after.length; }
  }

  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const scores = await loadScores(monthKey);
    const after = scores.filter(s => s.email.toLowerCase() !== key);
    if (after.length < scores.length) { await saveScores(monthKey, after); summary.scoresRemoved += scores.length - after.length; }
  }

  const trainingIndex = await loadTrainingIndex();
  for (const meta of trainingIndex) {
    const records = await loadTrainingData(meta.id);
    const after = records.filter(r => (r.email || '').toLowerCase() !== key);
    if (after.length < records.length) { await saveTrainingData(meta.id, after); summary.trainingRemoved += records.length - after.length; }
  }

  logFromUser(user, 'rep_exclude', `rep/${key}`, `Excluded rep ${repName || key} — ${summary.visitsRemoved} visits, ${summary.scoresRemoved} scores, ${summary.trainingRemoved} training removed`, { excluded: { email: key, ...summary } });
  return NextResponse.json({ ok: true, email: key, removed: summary }, { headers: noCacheHeaders() });
}

/** Un-exclude a rep (their data will return on the next Perigee import). */
export async function DELETE(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized — super_admin only' }, { status: 401 });

  const { email } = await req.json() as { email?: string };
  const key = (email || '').toLowerCase().trim();
  if (!key) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  const list = await loadExcludedReps();
  await saveExcludedReps(list.filter(r => r.email !== key));
  return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
}
