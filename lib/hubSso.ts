import crypto from 'crypto';

/*
  Sign-in from the Atomic Marketing Hub. The Hub opens `<this app>/sso/callback?token=…`
  with an HMAC-SHA256 JWT (5-minute expiry) signed with AM_SSO_SECRET, shared by the
  Hub and every module. The token says who the person is; this app still decides what
  they may do, from its own user record matched by email. Same file in every AM module.
*/

export interface HubToken {
  sub: string;
  email: string;
  name: string;
  surname: string;
  hubRole: 'super-admin' | 'user';
  modules: string[];
  iat: number;
  exp: number;
}

export function verifyHubToken(token: string | null, secret: string): HubToken | null {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as HubToken;
    return typeof p.email === 'string' && Array.isArray(p.modules) && p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

/** A plain page for the dead ends (expired link, no access, no account), with a way back. */
export function hubMessage(title: string, detail: string, status: number): Response {
  const hub = process.env.NEXT_PUBLIC_AM_HUB_URL || 'https://am-hub.vercel.app';
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<body style="font-family:Arial,sans-serif;background:#111;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">` +
    `<div style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:20px">${esc(title)}</h1>` +
    `<p style="color:#ccc;line-height:1.5">${esc(detail)}</p>` +
    `<a href="${esc(hub)}" style="display:inline-block;margin-top:12px;background:#C42028;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Back to the Atomic Marketing Hub</a></div></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
