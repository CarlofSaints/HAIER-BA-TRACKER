import { loadUsers, User, Role } from './userData';

export async function requireLogin(req: Request): Promise<User | null> {
  const userId = req.headers.get('x-user-id');
  if (!userId) return null;
  const users = await loadUsers();
  return users.find(u => u.id === userId) ?? null;
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
