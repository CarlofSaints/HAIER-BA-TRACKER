import { loadUsers, User, Role } from './userData';
import { readCookie, userFromSession } from './session';

/** The signed-in user from the session cookie (lib/session.ts), re-loaded on every call. */
export async function requireLogin(req: Request): Promise<User | null> {
  const raw = readCookie(req);
  if (!raw) return null;
  return userFromSession(raw, await loadUsers());
}

export async function requireRole(req: Request, roles: Role[]): Promise<User | null> {
  const user = await requireLogin(req);
  if (!user || !roles.includes(user.role)) return null;
  return user;
}

export async function requireAnyUser(req: Request): Promise<User | null> {
  return requireLogin(req);
}

export function noCacheHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  };
}
