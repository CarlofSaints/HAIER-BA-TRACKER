import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { loadUsers, saveUsers, User } from '@/lib/userData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json();
    if (secret !== 'haier-seed-2026') {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
    }

    const existing = await loadUsers();
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Already seeded', count: existing.length }, { status: 400 });
    }

    const hash = await bcrypt.hash('haier2026', 10);
    const seedUser: User = {
      id: crypto.randomUUID(),
      email: 'carl@outerjoin.co.za',
      name: 'Carl',
      surname: 'Dos Santos',
      passwordHash: hash,
      role: 'super_admin',
      forcePasswordChange: false,
      createdAt: new Date().toISOString(),
    };

    await saveUsers([seedUser]);
    return NextResponse.json({ ok: true, user: seedUser.email });
  } catch (err) {
    console.error('Seed error:', err);
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 });
  }
}
