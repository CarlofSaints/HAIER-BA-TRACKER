import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { seedScoresFromVisits } from '@/lib/seedScores';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await seedScoresFromVisits(user.email);

    if (result.months === 0) {
      return NextResponse.json({ error: 'No visit data found' }, { status: 400 });
    }

    return NextResponse.json(
      { ok: true, months: result.months, bas: result.bas },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    console.error('Seed from visits error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
