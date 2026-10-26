import { NextRequest } from 'next/server';
import { loadUsers } from '@/lib/userData';
import { hubMessage, verifyHubToken } from '@/lib/hubSso';

export const dynamic = 'force-dynamic';

const MODULE = 'haier-ba';

/**
 * Sign-in from the Atomic Marketing Hub (lib/hubSso.ts). Existing users only, matched by email.
 * Writes the same localStorage session app/login/page.tsx stores after /api/auth, via a tiny
 * page (a redirect alone can't reach localStorage), then opens the dashboard.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.AM_SSO_SECRET;
  if (!secret) return hubMessage('Hub sign-in is not set up', 'AM_SSO_SECRET is missing on this deployment.', 503);

  const hub = verifyHubToken(req.nextUrl.searchParams.get('token'), secret);
  if (!hub) return hubMessage('This sign-in link has expired', 'Go back to the Hub and open Haier BA Measurement again.', 401);
  if (!hub.modules.includes(MODULE)) return hubMessage('No access', 'Your Hub account does not include Haier BA Measurement. Ask a Hub admin to switch it on.', 403);

  const email = hub.email.toLowerCase().trim();
  const user = (await loadUsers()).find(u => u.email.toLowerCase().trim() === email);
  if (!user) {
    return hubMessage('No Haier BA Measurement account', `There is no Haier BA Measurement user for ${hub.email}. Ask your admin to add you.`, 403);
  }

  // Same shape as /api/auth. JSON in a <script>: escape '<' so no value can close the tag.
  const session = JSON.stringify({
    id: user.id,
    email: user.email,
    name: user.name,
    surname: user.surname,
    cellNumber: user.cellNumber || '',
    role: user.role,
    forcePasswordChange: user.forcePasswordChange,
  }).replace(/</g, '\\u003c');
  const next = user.forcePasswordChange ? '/account?change-password=1' : '/dashboard';
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Signing in…</title><body style="font-family:Arial,sans-serif">Signing in…` +
    `<script>localStorage.setItem('haier_session', JSON.stringify(${session}));location.replace(${JSON.stringify(next)});</script></body>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
