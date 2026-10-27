import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { loadUsers } from '@/lib/userData';
import { noCacheHeaders } from '@/lib/auth';
import { logActivity } from '@/lib/activityLog';
import { createSession, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

// A real cost-10 hash of a random value, made once per instance: compared against when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const users = await loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    // Always run one bcrypt compare, so an unknown email takes as long as a wrong password.
    const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !valid) {
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

    logActivity('user_login', user.email, `${user.name} ${user.surname}`, 'auth', `${user.name} ${user.surname} logged in`).catch(() => {});

    const token = createSession(user);
    if (!token) {
      return NextResponse.json({ error: 'Sign-in is not configured on this deployment (HAIER_SESSION_SECRET).' }, { status: 503 });
    }
    return NextResponse.json(session, { headers: { ...noCacheHeaders(), 'Set-Cookie': sessionCookieHeader(token) } });
  } catch (err) {
    console.error('Auth error:', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

/** Sign out: clear the session cookie. */
export async function DELETE() {
  return NextResponse.json({ ok: true }, { headers: { ...noCacheHeaders(), 'Set-Cookie': sessionCookieHeader('', 0) } });
}
