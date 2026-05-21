import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { loadUsers, saveUsers } from '@/lib/userData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { secret, email, newPassword } = await req.json();
    if (secret !== 'haier-seed-2026') {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
    }
    if (!email || !newPassword) {
      return NextResponse.json({ error: 'email and newPassword required' }, { status: 400 });
    }

    const users = await loadUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
    users[idx].forcePasswordChange = false;
    users[idx].resetToken = undefined;
    users[idx].resetTokenExpiry = undefined;
    await saveUsers(users);

    return NextResponse.json({ ok: true, email: users[idx].email });
  } catch (err) {
    console.error('Admin reset error:', err);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
