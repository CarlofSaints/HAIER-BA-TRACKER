'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/userData';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'BA Scorecard', href: '/dashboard', icon: '📊', roles: ['super_admin', 'admin', 'client'] },
  { label: 'Upload Data', href: '/upload', icon: '📤', roles: ['super_admin', 'admin'] },
  { label: 'Users', href: '/users', icon: '👥', roles: ['super_admin', 'admin'] },
  { label: 'Roles', href: '/roles', icon: '🔑', roles: ['super_admin'] },
  { label: 'Settings', href: '/settings', icon: '⚙️', roles: ['super_admin'] },
  { label: 'Account', href: '/account', icon: '👤', roles: ['super_admin', 'admin', 'client'] },
];

const SIDEBAR_KEY = 'haier_sidebar_open';
const SIDEBAR_W = 240;
const TOPBAR_H = 52;

interface SidebarProps {
  role: Role;
  name: string;
  onLogout: () => void;
}

function BurgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function Sidebar({ role, name, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role));

  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(SIDEBAR_KEY) !== 'false';
  });

  // Sync body data attribute for CSS margin/padding rules
  useEffect(() => {
    document.body.dataset.sidebarClosed = String(!open);
  }, [open]);

  function toggle() {
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  return (
    <>
      {/* Top bar — visible when sidebar is closed */}
      {!open && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: TOPBAR_H,
            background: '#1A1A2E',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0 1rem',
            zIndex: 101,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}
        >
          <button
            onClick={toggle}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            title="Open menu"
          >
            <BurgerIcon />
          </button>
          <img
            src="/haier-logo-white.png"
            alt="Haier"
            style={{ height: 28, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>BA Measurement</span>
        </div>
      )}

      {/* Sidebar drawer */}
      <aside
        style={{
          width: SIDEBAR_W,
          minHeight: '100vh',
          background: '#1A1A2E',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: open ? 0 : -SIDEBAR_W,
          top: 0,
          bottom: 0,
          zIndex: 102,
          transition: 'left 0.25s ease',
        }}
      >
        {/* Logo + burger toggle */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <img
              src="/haier-logo-white.png"
              alt="Haier"
              style={{ width: 160, objectFit: 'contain' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginTop: 4 }}>
              BA Measurement
            </div>
          </div>
          <button
            onClick={toggle}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            title="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.75rem 0.5rem' }}>
          {visibleItems.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 8,
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  background: active ? '#0054A6' : 'transparent',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: active ? 600 : 400,
                  marginBottom: 2,
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Atomic Marketing section */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.6rem', marginBottom: 8, letterSpacing: '0.03em' }}>
            An Atomic Marketing Initiative
          </div>
          <div style={{ background: 'white', borderRadius: 8, padding: '6px 12px', display: 'inline-block' }}>
            <img
              src="/atomic-logo.png"
              alt="Atomic Marketing"
              style={{ height: 24, objectFit: 'contain', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        </div>

        {/* User footer */}
        <div
          style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ fontWeight: 500, color: '#fff', marginBottom: 4 }}>{name}</div>
          <div style={{ marginBottom: 8, textTransform: 'capitalize' }}>{role.replace('_', ' ')}</div>
          <button
            onClick={onLogout}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              padding: '0.35rem 0.75rem',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.75rem',
              width: '100%',
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
