import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { loadUsers, saveUsers, User } from '@/lib/userData';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await loadUsers();
  const safe = users.map(({ passwordHash: _, ...rest }) => rest);
  return NextResponse.json(safe, { headers: noCacheHeaders() });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { email, name, surname, role, password, forcePasswordChange, sendWelcomeEmail } = await req.json();
    if (!email || !name || !surname || !role) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const users = await loadUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    if (role === 'super_admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Cannot create super_admin' }, { status: 403 });
    }

    const tempPassword = password || Math.random().toString(36).slice(2, 10);
    const newUser: User = {
      id: crypto.randomUUID(),
      email,
      name,
      surname,
      passwordHash: await bcrypt.hash(tempPassword, 10),
      role,
      forcePasswordChange: forcePasswordChange !== false,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    await saveUsers(users);

    // Send welcome email only if requested
    if (sendWelcomeEmail !== false) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://haier-ba-measurement.vercel.app';
        await sendEmail({
          to: email,
          subject: 'Welcome to Haier BA Measurement',
          html: `
            <h2>Welcome, ${name}!</h2>
            <p>Your account has been created.</p>
            <p><strong>Email:</strong> ${email}<br/>
            <strong>Temporary password:</strong> ${tempPassword}</p>
            <p>Please log in and change your password: <a href="${siteUrl}/login">${siteUrl}/login</a></p>
          `,
        });
      } catch (emailErr) {
        console.error('Welcome email failed:', emailErr);
      }
    }

    const { passwordHash: _, ...safe } = newUser;
    return NextResponse.json(safe, { status: 201, headers: noCacheHeaders() });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
