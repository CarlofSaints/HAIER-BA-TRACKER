import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadScores, saveScores } from '@/lib/scoreData';
import { loadVisitIndex, loadVisitData, saveVisitData } from '@/lib/visitData';
import {
  loadTrainingIndex,
  loadTrainingData,
  saveTrainingData,
  loadTrainingFormData,
  saveTrainingFormData,
} from '@/lib/trainingData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/bas/purge
 * Body: { email: string }
 * Completely removes ALL data for a BA by email:
 * - Scores (all months)
 * - Visit records (all uploads)
 * - Training records (all uploads)
 * - Training form data (all uploads)
 *
 * Does NOT touch the users table — BAs are not necessarily system users.
 */
export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized — super_admin only' }, { status: 401 });

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const target = email.toLowerCase().trim();
    if (target === user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot purge yourself' }, { status: 400 });
    }

    const summary = { email: target, scoresRemoved: 0, visitsRemoved: 0, trainingRemoved: 0 };

    // 1. Remove scores from all months (scan last 24 months)
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const scores = await loadScores(monthKey);
      const before = scores.length;
      const after = scores.filter(s => s.email.toLowerCase() !== target);
      if (after.length < before) {
        await saveScores(monthKey, after);
        summary.scoresRemoved += (before - after.length);
      }
    }

    // 2. Remove visits from all upload files
    const visitIndex = await loadVisitIndex();
    for (const meta of visitIndex) {
      const visits = await loadVisitData(meta.id);
      const before = visits.length;
      const after = visits.filter(v => (v.email || '').toLowerCase() !== target);
      if (after.length < before) {
        await saveVisitData(meta.id, after);
        summary.visitsRemoved += (before - after.length);
      }
    }

    // 3. Remove training records from all upload files
    const trainingIndex = await loadTrainingIndex();
    for (const meta of trainingIndex) {
      const records = await loadTrainingData(meta.id);
      const before = records.length;
      const after = records.filter(r => (r.email || '').toLowerCase() !== target);
      if (after.length < before) {
        await saveTrainingData(meta.id, after);
        summary.trainingRemoved += (before - after.length);
      }

      // Also clean form data
      const formData = await loadTrainingFormData(meta.id);
      if (formData) {
        // Find email column in form data
        const emailCol = formData.headers.find(h => {
          const l = h.toLowerCase().trim();
          return l === 'email' || l === 'representative id' || l === 'rep email';
        });
        if (emailCol) {
          const beforeForm = formData.rows.length;
          formData.rows = formData.rows.filter(r => {
            const e = r[emailCol];
            return typeof e !== 'string' || e.toLowerCase().trim() !== target;
          });
          if (formData.rows.length < beforeForm) {
            await saveTrainingFormData(meta.id, formData);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, purged: summary }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('BA purge error:', err);
    return NextResponse.json({
      error: 'Purge failed: ' + (err instanceof Error ? err.message : String(err)),
    }, { status: 500 });
  }
}
