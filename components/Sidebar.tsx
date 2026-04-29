'use client';

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

interface SidebarProps {
  role: Role;
  name: string;
  onLogout: () => void;
}

export default function Sidebar({ role, name, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role));

  return (
    <aside
      style={{
        width: 240,
        minHeight: '100vh',
        background: '#1A1A2E',
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <img
          src="/haier-logo-white.png"
          alt="Haier"
          style={{ width: '100%', objectFit: 'contain' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginTop: 6 }}>
          BA Measurement
        </div>
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

      {/* User footer */}
      <div
        style={{
          padding: '1rem 1rem',
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
  );
}
