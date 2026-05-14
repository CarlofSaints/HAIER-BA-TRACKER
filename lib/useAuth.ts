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

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    router.push('/login');
  }

  return { session, loading, logout, setSession };
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let userId = '';
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Session>;
        userId = s?.id ?? '';
      }
    } catch { /* ignore */ }
  }

  const headers = new Headers(init.headers);
  if (userId) headers.set('x-user-id', userId);

  return fetch(input, { ...init, headers, cache: 'no-store' });
}
