'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from './userData';

export interface Session {
  id: string;
  email: string;
  name: string;
  surname: string;
  role: Role;
  forcePasswordChange: boolean;
}

const SESSION_KEY = 'haier_session';

export function useAuth(requiredRole?: Role | Role[]) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      router.replace('/login');
      return;
    }
    try {
      const s: Session = JSON.parse(raw);
      if (s.forcePasswordChange) {
        router.replace('/account?change-password=1');
        setLoading(false);
        return;
      }
      if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
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
  }, [router, requiredRole]);

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
