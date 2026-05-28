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

  const { name, parentId } = await req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const channels = await loadChannels();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (channels.some(c => c.id === id)) {
    return NextResponse.json({ error: 'Channel already exists' }, { status: 409 });
  }

  if (parentId && !channels.some(c => c.id === parentId && !c.parentId)) {
    return NextResponse.json({ error: 'Parent channel not found' }, { status: 400 });
  }

  const entry: { id: string; name: string; parentId?: string } = { id, name: name.trim().toUpperCase() };
  if (parentId) entry.parentId = parentId;
  channels.push(entry);
  await saveChannels(channels);

  return NextResponse.json({ ok: true, channels }, { headers: noCacheHeaders() });
}

export async function PATCH(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, name, parentId } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const channels = await loadChannels();
  const idx = channels.findIndex(c => c.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // Prevent setting parentId to self or to a sub-channel
  if (parentId === id) {
    return NextResponse.json({ error: 'Channel cannot be its own parent' }, { status: 400 });
  }
  if (parentId && !channels.some(c => c.id === parentId && !c.parentId)) {
    return NextResponse.json({ error: 'Parent must be a main channel' }, { status: 400 });
  }

  // If converting a main channel to sub-channel, orphan its children first
  if (parentId && !channels[idx].parentId) {
    for (const ch of channels) {
      if (ch.parentId === id) delete ch.parentId;
    }
  }

  if (name) channels[idx].name = name.trim().toUpperCase();
  if (parentId) {
    channels[idx].parentId = parentId;
  } else if (parentId === null || parentId === '') {
    delete channels[idx].parentId;
  }

  await saveChannels(channels);
  return NextResponse.json({ ok: true, channels }, { headers: noCacheHeaders() });
}

export async function DELETE(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });

  const channels = await loadChannels();
  const target = channels.find(c => c.id === id);
  if (!target) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  // If deleting a main channel, also remove its sub-channels
  const filtered = channels.filter(c => c.id !== id && c.parentId !== id);

  await saveChannels(filtered);
  return NextResponse.json({ ok: true, channels: filtered }, { headers: noCacheHeaders() });
}
