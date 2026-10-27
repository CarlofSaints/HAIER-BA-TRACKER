import { NextRequest, NextResponse, after } from 'next/server';
import { createHash } from 'crypto';
import { loadUsers, saveUsers } from '@/lib/userData';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://haier-ba-measurement.vercel.app';

/**
 * Replies at once, the same way for every email, and does the lookup, token write and email
 * afterwards, so neither the reply nor its timing shows whether an account exists.
 * Only the token's SHA-256 is stored; the raw token exists only in the emailed link.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }
  after(() => sendReset(email.trim()));
  return NextResponse.json({ ok: true });
}

async function sendReset(email: string) {
  try {

    const users = await loadUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());

    if (idx === -1) return;

    const token = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    users[idx].resetToken = createHash('sha256').update(token).digest('hex');
    users[idx].resetTokenExpiry = expiry;
    await saveUsers(users);

    const resetLink = `${SITE_URL}/reset-password?token=${token}`;
    const user = users[idx];

    await sendEmail({
      to: user.email,
      subject: 'Password Reset — Haier BA Measurement',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: #0054A6; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Password Reset</h2>
          </div>
          <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p>Hi ${user.name.replace(/[&<>"]/g, '')},</p>
            <p>A password reset was requested for your account. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${resetLink}" style="background: #0054A6; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 0.85rem;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          </div>
        </div>
      `,
    });

  } catch (err) {
    console.error('Forgot password error:', err);
  }
}
