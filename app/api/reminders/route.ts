import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadReminders, saveReminders, computeNextDue, EmailReminder } from '@/lib/reminderData';
import { logFromUser } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reminders = await loadReminders();
  return NextResponse.json(reminders, { headers: noCacheHeaders() });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, subject, body: emailBody, to, cc, bcc, recurrence, startDate, endDate, enabled } = body;

    if (!name || !subject || !emailBody || !to?.length || !recurrence || !startDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const now = new Date();
    const nextDueAt = enabled !== false
      ? computeNextDue(recurrence, now, startDate, endDate)
      : undefined;

    const reminder: EmailReminder = {
      id: crypto.randomUUID(),
      name,
      subject,
      body: emailBody,
      to: to || [],
      cc: cc || [],
      bcc: bcc || [],
      recurrence,
      startDate,
      endDate: endDate || undefined,
      enabled: enabled !== false,
      createdBy: user.email,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextDueAt,
    };

    const reminders = await loadReminders();
    reminders.push(reminder);
    await saveReminders(reminders);

    logFromUser(user, 'reminder_create', `reminder/${reminder.id}`, `Created reminder "${name}"`);
    return NextResponse.json(reminder, { status: 201, headers: noCacheHeaders() });
  } catch (err) {
    console.error('Create reminder error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
