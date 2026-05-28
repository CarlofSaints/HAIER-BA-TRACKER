'use client';

import { useState } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

export default function ReportsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await authFetch('/api/reports/ba-work');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        setToast({ msg: err.error || 'Download failed', type: 'error' });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="(.+?)"/);
      const fileName = match?.[1] || `HSA-BA_WORK.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setToast({ msg: 'Report downloaded', type: 'success' });
    } catch {
      setToast({ msg: 'Download failed', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Reports
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Download generated reports. Data is pulled from DISPO uploads, visits, display checks, and store configuration.
        </p>

        {/* BA Work Report */}
        <div style={{
          background: 'white', borderRadius: 12, border: '1px solid #e5e7eb',
          padding: '1.25rem', maxWidth: 550, marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                BA Work Report
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.8rem', lineHeight: 1.5 }}>
                Comprehensive BA data export matching HSA-BA WORK format.
                Includes channels, stores, BAs, monthly sales (DISPO), display status,
                SOH, and weekly breakdown columns.
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {['Channels', 'Stores', 'BAs', 'Sales', 'Display', 'SOH', 'Weekly'].map(tag => (
                  <span key={tag} style={{
                    fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 4,
                    background: '#f0f9ff', color: '#0369a1', fontWeight: 500,
                  }}>
                    {tag}
                  </span>
                ))}
                {['Industry', 'End Position', 'Flooring', 'POSM'].map(tag => (
                  <span key={tag} style={{
                    fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 4,
                    background: '#fef3c7', color: '#92400e', fontWeight: 500,
                  }}>
                    {tag} (pending)
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={downloading}
            style={{ marginTop: '1rem' }}
          >
            {downloading ? 'Generating...' : 'Download .xlsx'}
          </button>
        </div>

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
