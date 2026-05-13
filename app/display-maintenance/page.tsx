'use client';

import { useAuth } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

export default function DisplayMaintenancePage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin', 'client']);

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Display Maintenance
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Display maintenance tracking and scoring
        </p>

        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          background: 'white', borderRadius: 12, border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🖥️</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Coming Soon
          </div>
          <div style={{ color: '#9ca3af', fontSize: '0.9rem', maxWidth: 400, margin: '0 auto' }}>
            Display maintenance scoring will be available here once the feature is configured.
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
