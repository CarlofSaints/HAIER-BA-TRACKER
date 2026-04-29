import { NextRequest, NextResponse } from 'next/server';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { loadUsers, saveUsers } from '@/lib/userData';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { email, cellNumber } = await req.json();
    const users = await loadUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (email && email !== users[idx].email) {
      // Check uniqueness
      if (users.some(u => u.id !== user.id && u.email.toLowerCase() === email.toLowerCase())) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      users[idx].email = email;
    }

    if (cellNumber !== undefined) {
      users[idx].cellNumber = cellNumber || undefined;
    }

    await saveUsers(users);

    const { passwordHash: _, ...safe } = users[idx];
    return NextResponse.json(safe, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Account update error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
