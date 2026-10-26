'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from './userData';

export interface Session {
  id: string;
  email: string;
  name: string;
  surname: string;
  cellNumber?: string;
  role: Role;
  forcePasswordChange: boolean;
}

const SESSION_KEY = 'haier_session';

export function useAuth(requiredRole?: Role | Role[]) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Stabilize the dependency — array literals like ['super_admin','admin']
  // create a new reference every render, which re-triggers the effect and
  // causes an infinite loop (JSON.parse always returns a new object → setSession
  // triggers re-render → new array ref → effect fires again).
  const rolesKey = requiredRole
    ? (Array.isArray(requiredRole) ? requiredRole.join(',') : requiredRole)
    : '';

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      router.replace('/login');
      return;
    }
    try {
      const s: Session = JSON.parse(raw);
      if (s.forcePasswordChange && typeof window !== 'undefined' && window.location.pathname !== '/account') {
        router.replace('/account?change-password=1');
        setLoading(false);
        return;
      }
      if (rolesKey) {
        const roles = rolesKey.split(',') as Role[];
        if (!roles.includes(s.role)) {
          router.replace('/');
          setLoading(false);
          return;
        }
      }
      setSession(s);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }, [router, rolesKey]);

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
    localStorage.removeItem(SESSION_KEY);
    router.push('/login');
  }

  return { session, loading, logout, setSession };
}

/**
 * Fetch for this app's API. Auth is the httpOnly session cookie (lib/session.ts), sent by the
 * browser itself. A 401 means that session is gone (expired, password changed, or signed in
 * before cookies existed), so drop the display copy and go to the login page.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, { credentials: 'same-origin', ...init, cache: 'no-store' });
  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = '/login';
  }
  return res;
}
