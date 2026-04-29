import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { loadUsers } from '@/lib/userData';
import { noCacheHeaders } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const users = await loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
      cellNumber: user.cellNumber || '',
      role: user.role,
      forcePasswordChange: user.forcePasswordChange,
    };

    return NextResponse.json(session, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Auth error:', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
