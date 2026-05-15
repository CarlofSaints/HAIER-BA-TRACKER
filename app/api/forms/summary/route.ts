import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadTrainingIndex, loadTrainingData } from '@/lib/trainingData';
import { loadDisplayIndex, loadDisplayData } from '@/lib/displayData';
import { loadRedFlagIndex, loadRedFlagData } from '@/lib/redFlagData';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns form submission counts per rep, broken down by form type.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';

    // Accumulate per-rep counts
    const reps = new Map<string, { name: string; training: number; display: number; redFlags: number }>();

    function getOrCreate(email: string, repName: string) {
      const key = email.toLowerCase() || repName.toLowerCase();
      if (!key) return null;
      if (!reps.has(key)) {
        reps.set(key, { name: repName || email, training: 0, display: 0, redFlags: 0 });
      }
      const entry = reps.get(key)!;
      if (repName && entry.name !== repName) entry.name = repName;
      return entry;
    }

    function inRange(date: string): boolean {
      if (!date) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    }

    // Load training records
    const trainingIndex = await loadTrainingIndex();
    for (const meta of trainingIndex) {
      const records = await loadTrainingData(meta.id);
      for (const r of records) {
        if (!inRange(r.date)) continue;
        const entry = getOrCreate(r.email, r.repName);
        if (entry) entry.training++;
      }
    }

    // Load display records
    const displayIndex = await loadDisplayIndex();
    for (const meta of displayIndex) {
      const records = await loadDisplayData(meta.id);
      for (const r of records) {
        if (!inRange(r.date)) continue;
        const entry = getOrCreate(r.email, r.repName);
        if (entry) entry.display++;
      }
    }

    // Load red flag records
    const redFlagIndex = await loadRedFlagIndex();
    for (const meta of redFlagIndex) {
      const records = await loadRedFlagData(meta.id);
      for (const r of records) {
        if (!inRange(r.date)) continue;
        const entry = getOrCreate(r.email, r.repName);
        if (entry) entry.redFlags++;
      }
    }

    const result = Array.from(reps.values()).map(r => ({
      ...r,
      total: r.training + r.display + r.redFlags,
    }));

    result.sort((a, b) => b.total - a.total);

    return NextResponse.json({ reps: result }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Forms summary error:', err);
    return NextResponse.json({ error: 'Failed to load form summary' }, { status: 500 });
  }
}
