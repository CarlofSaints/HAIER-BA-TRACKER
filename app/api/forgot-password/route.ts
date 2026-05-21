import { NextRequest, NextResponse } from 'next/server';
import { loadUsers, saveUsers } from '@/lib/userData';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://haier-ba-measurement.vercel.app';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const users = await loadUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());

    // Always return success to avoid leaking whether email exists
    if (idx === -1) {
      return NextResponse.json({ ok: true });
    }

    const token = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    users[idx].resetToken = token;
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
            <p>Hi ${user.name},</p>
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
