import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadChannels, saveChannels } from '@/lib/channelData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin', 'client']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const channels = await loadChannels();
  return NextResponse.json(channels, { headers: noCacheHeaders() });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const channels = await loadChannels();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (channels.some(c => c.id === id)) {
    return NextResponse.json({ error: 'Channel already exists' }, { status: 409 });
  }

  channels.push({ id, name: name.trim().toUpperCase() });
  await saveChannels(channels);

  return NextResponse.json({ ok: true, channels }, { headers: noCacheHeaders() });
}

export async function DELETE(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });

  const channels = await loadChannels();
  const filtered = channels.filter(c => c.id !== id);

  if (filtered.length === channels.length) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  await saveChannels(filtered);
  return NextResponse.json({ ok: true, channels: filtered }, { headers: noCacheHeaders() });
}
