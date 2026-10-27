import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { loadUsers, saveUsers } from '@/lib/userData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const users = await loadUsers();
    // Stored as SHA-256 (forgot-password); compare the hash of what was sent.
    const hashed = createHash('sha256').update(String(token)).digest('hex');
    const idx = users.findIndex(u => !!u.resetToken && u.resetToken === hashed);
    if (idx === -1) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    const user = users[idx];
    if (!user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
      // Clear expired token
      users[idx].resetToken = undefined;
      users[idx].resetTokenExpiry = undefined;
      await saveUsers(users);
      return NextResponse.json({ error: 'Reset link has expired. Please request a new one.' }, { status: 400 });
    }

    users[idx].passwordHash = await bcrypt.hash(password, 10);
    users[idx].forcePasswordChange = false;
    users[idx].resetToken = undefined;
    users[idx].resetTokenExpiry = undefined;
    await saveUsers(users);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
