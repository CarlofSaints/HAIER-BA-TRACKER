import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadUsers, saveUsers } from '@/lib/userData';
import { sendEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const admin = await requireRole(req, ['admin', 'super_admin']);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { userId } = await req.json() as { userId: string };
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const users = await loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate random temp password
    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 4).toUpperCase();
    const hash = await bcrypt.hash(tempPassword, 10);

    // Update user record
    users[idx] = { ...users[idx], passwordHash: hash, forcePasswordChange: true };
    await saveUsers(users);

    const user = users[idx];
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://haier-ba-measurement.vercel.app';

    // Try sending email
    let emailSent = false;
    try {
      await sendEmail({
        to: user.email,
        subject: 'Haier BA Measurement — Your Login Credentials',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px;">
            <h2 style="color: #0054A6;">Welcome to Haier BA Measurement</h2>
            <p>Hi ${user.name},</p>
            <p>Your account has been created. Use the credentials below to log in:</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Email:</strong> ${user.email}</p>
              <p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
            </div>
            <p>You will be prompted to change your password on first login.</p>
            <p><a href="${siteUrl}" style="color: #0054A6;">Log in here</a></p>
          </div>
        `,
      });
      emailSent = true;
    } catch {
      // Email failed — return temp password so admin can share manually
    }

    return NextResponse.json({
      ok: true,
      emailSent,
      ...(emailSent ? {} : { tempPassword }),
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Send welcome error:', err);
    return NextResponse.json({ error: 'Failed to send welcome email' }, { status: 500 });
  }
}
