import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { loadUsers, saveUsers } from '@/lib/userData';
import { requireRole, noCacheHeaders } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const users = await loadUsers();
  const target = users.find(u => u.id === id);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { passwordHash: _, ...safe } = target;
  return NextResponse.json(safe, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const users = await loadUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only super_admin can change roles to/from super_admin
  if (body.role === 'super_admin' && user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Cannot set super_admin role' }, { status: 403 });
  }
  if (users[idx].role === 'super_admin' && user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Cannot modify super_admin user' }, { status: 403 });
  }

  if (body.name) users[idx].name = body.name;
  if (body.surname) users[idx].surname = body.surname;
  if (body.email) users[idx].email = body.email;
  if (body.role) users[idx].role = body.role;
  if (body.password) {
    users[idx].passwordHash = await bcrypt.hash(body.password, 10);
    users[idx].forcePasswordChange = body.forcePasswordChange !== undefined ? body.forcePasswordChange : true;
  }

  await saveUsers(users);
  const { passwordHash: _, ...safe } = users[idx];
  return NextResponse.json(safe, { headers: noCacheHeaders() });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  const users = await loadUsers();
  const target = users.find(u => u.id === id);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (target.role === 'super_admin' && user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Cannot delete super_admin user' }, { status: 403 });
  }

  const filtered = users.filter(u => u.id !== id);
  await saveUsers(filtered);
  return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
}
