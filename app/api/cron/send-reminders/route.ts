import { NextRequest, NextResponse } from 'next/server';
import { loadReminders, saveReminders, computeNextDue } from '@/lib/reminderData';
import { loadUsers } from '@/lib/userData';
import { sendEmail } from '@/lib/email';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET bearer token or super_admin
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCronAuth = !cronSecret || authHeader === `Bearer ${cronSecret}`;

  if (!isCronAuth) {
    // Also allow super_admin to trigger manually
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Quick check — not worth full requireRole import for cron
    const users = await loadUsers();
    const caller = users.find(u => u.id === userId);
    if (!caller || caller.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const reminders = await loadReminders();
    const users = await loadUsers();
    let sentCount = 0;
    let dirty = false;

    for (const reminder of reminders) {
      if (!reminder.enabled || !reminder.nextDueAt) continue;

      const dueAt = new Date(reminder.nextDueAt);
      if (dueAt > now) continue;

      // Resolve user IDs to emails
      const resolveEmails = (ids: string[]): string[] =>
        ids.map(id => users.find(u => u.id === id)?.email).filter((e): e is string => !!e);

      const toEmails = resolveEmails(reminder.to);
      const ccEmails = resolveEmails(reminder.cc);
      const bccEmails = resolveEmails(reminder.bcc);

      if (toEmails.length === 0) {
        // Skip — no valid recipients
        continue;
      }

      try {
        await sendEmail({
          to: toEmails,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          bcc: bccEmails.length > 0 ? bccEmails : undefined,
          subject: reminder.subject,
          html: reminder.body,
        });

        reminder.lastSentAt = now.toISOString();
        reminder.nextDueAt = computeNextDue(
          reminder.recurrence,
          now,
          reminder.startDate,
          reminder.endDate,
        );
        dirty = true;
        sentCount++;

        // If no more occurrences, disable
        if (!reminder.nextDueAt) {
          reminder.enabled = false;
        }

        logActivity(
          'reminder_sent',
          'System (Cron)',
          'System',
          `reminder/${reminder.id}`,
          `Sent reminder "${reminder.name}" to ${toEmails.length} recipient(s)`,
          { to: toEmails, cc: ccEmails, bcc: bccEmails },
        ).catch(() => {});
      } catch (emailErr) {
        console.error(`Failed to send reminder ${reminder.id}:`, emailErr);
      }
    }

    if (dirty) {
      await saveReminders(reminders);
    }

    return NextResponse.json({ ok: true, sent: sentCount });
  } catch (err) {
    console.error('Send reminders cron error:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 });
  }
}
