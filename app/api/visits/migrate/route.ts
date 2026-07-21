import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { migrateLegacyToShards, loadVisitIndex } from '@/lib/visitData';
import { logFromUser } from '@/lib/activityLog';

// Folding hundreds of legacy blobs can take a while — give it headroom.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One-time (idempotent) migration: fold every legacy per-upload visit blob into
 * month shards, then delete the legacy blobs. Safe to run anytime and to re-run —
 * reads already union shards ∪ legacy, so nothing is lost before/during/after.
 *
 * GET  — report how many uploads are still legacy (nothing written).
 * POST — run the migration.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const index = await loadVisitIndex();
  const legacy = index.filter(m => !m.months || m.months.length === 0).length;
  return NextResponse.json(
    { totalUploads: index.length, legacyRemaining: legacy, migrated: index.length - legacy },
    { headers: noCacheHeaders() },
  );
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await migrateLegacyToShards();
    logFromUser(user, 'upload_visits', 'visits/migrate',
      `Migrated ${result.migrated} legacy visit upload(s) into month shards (${result.months.length} months).`);
    return NextResponse.json({ ok: true, ...result }, { headers: noCacheHeaders() });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('Visit migration error:', err);
    return NextResponse.json({ ok: false, error: 'Migration failed', detail }, { status: 500 });
  }
}
