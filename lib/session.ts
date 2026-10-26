import crypto from 'crypto';
import type { User } from './userData';

/**
 * Signed, httpOnly session cookie. API routes used to trust an `x-user-id` header
 * the browser sent; now they trust only this cookie, which the browser cannot read
 * or forge. The localStorage `haier_session` copy is for rendering only.
 *
 * `pv` is a short hash of the user's password hash, so ANY password change
 * (own change, admin set, reset link) signs out every older session by itself.
 */
export const SESSION_COOKIE = 'haier_auth';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

function secret(): string | null {
  return process.env.HAIER_SESSION_SECRET || (process.env.VERCEL ? null : 'local-dev-only-secret');
}

const sign = (body: string, key: string) => crypto.createHmac('sha256', key).update(body).digest('base64url');
const pwVersion = (u: Pick<User, 'passwordHash'>) =>
  crypto.createHash('sha256').update(u.passwordHash || '').digest('base64url').slice(0, 12);

/** Null when HAIER_SESSION_SECRET is missing on Vercel: sign-in then fails closed. */
export function createSession(user: Pick<User, 'id' | 'passwordHash'>): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify({ uid: user.id, pv: pwVersion(user), exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

/** The user this cookie belongs to, or null (bad signature, expired, password changed, user gone). */
export function userFromSession(raw: string | undefined, users: User[]): User | null {
  const key = secret();
  if (!key || !raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body, key));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { uid: string; pv: string; exp: number };
    if (p.exp < Date.now() / 1000) return null;
    const user = users.find(u => u.id === p.uid);
    return user && pwVersion(user) === p.pv ? user : null;
  } catch {
    return null;
  }
}

/** Read one cookie off a plain Request (route handlers get Request, not NextRequest). */
export function readCookie(req: Request, name = SESSION_COOKIE): string | undefined {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function sessionCookieHeader(value: string, maxAge = MAX_AGE): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.VERCEL ? '; Secure' : ''}`;
}
