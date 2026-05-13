import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadTrainingIndex } from '@/lib/trainingData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const index = await loadTrainingIndex();
    return NextResponse.json(index, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Training index GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
