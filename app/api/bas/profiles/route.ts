import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadStores } from '@/lib/storeData';
import { deriveBaByStore, lookupDerivedBa } from '@/lib/storeBa';
import { loadBaProfiles, loadBaProfilesStrict, saveBaProfiles, BaDeployment, BaProfiles } from '@/lib/baProfiles';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface BaAllocation {
  storeName: string;
  siteCode: string;
  via: 'manual' | 'perigee';
  // manual: when the assignment was saved ('' = made before tracking began).
  // perigee: the BA's first check-in at the store.
  since: string;
  by?: string;
  visitCount?: number;
}

/**
 * GET /api/bas/profiles
 * Each BA's Dedicated/Roaming setting, plus the stores they are allocated to
 * right now: an explicit assignment on the Stores page (manual) or, for a store
 * with no assignment, being its most recent Perigee visitor (perigee).
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // ?allocations=0 → settings only. The Stores page wants just Dedicated/
    // Roaming and already scans visits itself.
    if (req.nextUrl.searchParams.get('allocations') === '0') {
      return NextResponse.json({ profiles: await loadBaProfiles(), allocations: {} }, { headers: noCacheHeaders() });
    }
    const [profiles, stores] = await Promise.all([loadBaProfiles(), loadStores()]);
    const derived = await deriveBaByStore(stores);

    const allocations: Record<string, BaAllocation[]> = {};
    const add = (email: string, a: BaAllocation) => {
      const key = email.toLowerCase().trim();
      if (!key) return;
      (allocations[key] ||= []).push(a);
    };

    for (const s of stores) {
      if (s.assignedBaEmail) {
        add(s.assignedBaEmail, {
          storeName: s.storeName, siteCode: s.siteCode || '', via: 'manual',
          since: s.assignedAt || '', by: s.assignedBy || '',
        });
        continue;
      }
      const d = lookupDerivedBa(s, derived);
      if (d?.email) {
        add(d.email, {
          storeName: s.storeName, siteCode: s.siteCode || '', via: 'perigee',
          since: d.firstVisit, visitCount: d.visitCount,
        });
      }
    }

    return NextResponse.json({ profiles, allocations }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('BA profiles GET error:', err);
    return NextResponse.json({ error: 'Failed to load BA profiles' }, { status: 500 });
  }
}

/**
 * PUT /api/bas/profiles  { email, deployment: 'dedicated' | 'roaming' | null }
 * null clears it back to "Not set".
 */
export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { email?: string; deployment?: BaDeployment | null };
  const email = (body.email || '').toLowerCase().trim();
  const deployment = body.deployment ?? null;
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
  if (deployment !== null && deployment !== 'dedicated' && deployment !== 'roaming') {
    return NextResponse.json({ error: 'deployment must be dedicated, roaming or null' }, { status: 400 });
  }

  let profiles: BaProfiles;
  try {
    profiles = await loadBaProfilesStrict();
  } catch (err) {
    console.error('BA profiles PUT: read failed', err);
    return NextResponse.json({ error: 'Could not read BA settings. Nothing was saved; try again.' }, { status: 503 });
  }
  const previous = profiles[email]?.deployment;
  if (deployment) {
    profiles[email] = { ...profiles[email], deployment, updatedAt: new Date().toISOString(), updatedBy: user.email };
  } else if (profiles[email]) {
    delete profiles[email].deployment;
    profiles[email].updatedAt = new Date().toISOString();
    profiles[email].updatedBy = user.email;
  }
  await saveBaProfiles(profiles);

  const label = (d?: string | null) => d === 'dedicated' ? 'Dedicated' : d === 'roaming' ? 'Roaming' : 'Not set';
  await logActivity('set_ba_deployment', user.email, `${user.name} ${user.surname}`, email,
    `${email}: ${label(previous)} → ${label(deployment)}`, { from: previous || null, to: deployment },
  ).catch(() => {});

  return NextResponse.json({ ok: true, profile: profiles[email] || {} }, { headers: noCacheHeaders() });
}
