import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadReminders, saveReminders, computeNextDue } from '@/lib/reminderData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const reminders = await loadReminders();
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(reminder, { headers: noCacheHeaders() });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const reminders = await loadReminders();
    const idx = reminders.findIndex(r => r.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const existing = reminders[idx];
    const updated = {
      ...existing,
      name: body.name ?? existing.name,
      subject: body.subject ?? existing.subject,
      body: body.body ?? existing.body,
      to: body.to ?? existing.to,
      cc: body.cc ?? existing.cc,
      bcc: body.bcc ?? existing.bcc,
      recurrence: body.recurrence ?? existing.recurrence,
      startDate: body.startDate ?? existing.startDate,
      endDate: body.endDate !== undefined ? body.endDate || undefined : existing.endDate,
      enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
      updatedAt: new Date().toISOString(),
    };

    // Recompute nextDueAt if recurrence or enabled changed
    if (body.recurrence || body.enabled !== undefined || body.startDate || body.endDate !== undefined) {
      const now = new Date();
      updated.nextDueAt = updated.enabled
        ? computeNextDue(updated.recurrence, now, updated.startDate, updated.endDate)
        : undefined;
    }

    reminders[idx] = updated;
    await saveReminders(reminders);

    logFromUser(user, 'reminder_edit', `reminder/${id}`, `Updated reminder "${updated.name}"`);
    return NextResponse.json(updated, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Update reminder error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const reminders = await loadReminders();
  const idx = reminders.findIndex(r => r.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = reminders.splice(idx, 1)[0];
  await saveReminders(reminders);

  logFromUser(user, 'reminder_delete', `reminder/${id}`, `Deleted reminder "${removed.name}"`);
  return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
}
