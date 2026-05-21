import { NextRequest, NextResponse } from 'next/server';
import { loadUsers } from '@/lib/userData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json();
    if (secret !== 'haier-seed-2026') {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
    }

    const users = await loadUsers();
    return NextResponse.json({
      count: users.length,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        hasPassword: !!u.passwordHash,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Debug failed',
      message: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
