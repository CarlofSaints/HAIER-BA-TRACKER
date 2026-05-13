'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface BA {
  email: string;
  repName: string;
  visitCount: number;
  trainingCount: number;
  storeCount: number;
  stores: string[];
  firstSeen: string;
  lastSeen: string;
}

export default function BAsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [bas, setBas] = useState<BA[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [purging, setPurging] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadBAs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/bas');
      if (res.ok) setBas(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) loadBAs();
  }, [session, loadBAs]);

  async function handlePurge(ba: BA) {
    const confirmed = confirm(
      `PURGE ${ba.repName} (${ba.email})?\n\n` +
      `This will permanently delete:\n` +
      `- All score records (all months)\n` +
      `- ${ba.visitCount} visit records\n` +
      `- ${ba.trainingCount} training records\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;

    setPurging(ba.email);
    try {
      const res = await authFetch('/api/bas/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ba.email }),
      });
      const data = await res.json();
      if (res.ok) {
        const p = data.purged;
        setToast({
          msg: `Purged ${p.email}: ${p.scoresRemoved} scores, ${p.visitsRemoved} visits, ${p.trainingRemoved} training records removed`,
          type: 'success',
        });
        loadBAs();
      } else {
        setToast({ msg: data.error || 'Purge failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Purge failed', type: 'error' });
    } finally {
      setPurging(null);
    }
  }

  const filteredBAs = search.trim()
    ? bas.filter(b =>
        b.repName.toLowerCase().includes(search.toLowerCase()) ||
        b.email.toLowerCase().includes(search.toLowerCase())
      )
    : bas;

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            BA Management
          </h1>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {bas.length} BAs found
          </span>
        </div>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Brand Ambassadors aggregated from visit and training data
        </p>

        {/* Search */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            className="input" type="text" placeholder="Search by name or email..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading BA data...</div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Name</th>
                  <th style={{ minWidth: 220 }}>Email</th>
                  <th style={{ textAlign: 'center', minWidth: 80 }}>Visits</th>
                  <th style={{ textAlign: 'center', minWidth: 90 }}>Training</th>
                  <th style={{ textAlign: 'center', minWidth: 80 }}>Stores</th>
                  <th style={{ minWidth: 100 }}>First Seen</th>
                  <th style={{ minWidth: 100 }}>Last Seen</th>
                  {session.role === 'super_admin' && (
                    <th style={{ width: 90 }}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredBAs.map(ba => (
                  <tr key={ba.email}>
                    <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{ba.repName}</td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{ba.email}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#0054A6' }}>{ba.visitCount}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#7c3aed' }}>{ba.trainingCount}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span title={ba.stores.join(', ')} style={{ cursor: ba.stores.length > 0 ? 'help' : 'default' }}>
                        {ba.storeCount}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {ba.firstSeen ? new Date(ba.firstSeen).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {ba.lastSeen ? new Date(ba.lastSeen).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    {session.role === 'super_admin' && (
                      <td>
                        <button
                          style={{
                            padding: '0.2rem 0.5rem', fontSize: '0.75rem',
                            background: purging === ba.email ? '#7c3aed' : '#9333ea',
                            color: 'white', border: 'none', borderRadius: 6,
                            cursor: purging === ba.email ? 'wait' : 'pointer',
                            opacity: purging === ba.email ? 0.7 : 1,
                          }}
                          onClick={() => handlePurge(ba)}
                          disabled={purging !== null}
                        >
                          {purging === ba.email ? 'Purging...' : 'Purge'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredBAs.length === 0 && (
                  <tr>
                    <td colSpan={session.role === 'super_admin' ? 8 : 7} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                      {search ? 'No matching BAs' : 'No BA data found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
