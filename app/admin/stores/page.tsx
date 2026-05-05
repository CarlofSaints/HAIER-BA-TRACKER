'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface StoreMaster {
  siteCode: string;
  storeName: string;
  channelId: string;
  channelName?: string;
}

interface Channel {
  id: string;
  name: string;
}

export default function StoresPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [stores, setStores] = useState<StoreMaster[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [storesRes, channelsRes] = await Promise.all([
        authFetch('/api/stores'),
        authFetch('/api/channels'),
      ]);
      if (storesRes.ok) setStores(await storesRes.json());
      if (channelsRes.ok) setChannels(await channelsRes.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stores;
    const q = search.toLowerCase();
    return stores.filter(s =>
      s.storeName.toLowerCase().includes(q) ||
      s.siteCode.toLowerCase().includes(q)
    );
  }, [stores, search]);

  function handleChannelChange(idx: number, channelId: string) {
    // Find the store in the full stores array using the filtered index
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const updated = [...stores];
    updated[realIdx] = { ...updated[realIdx], channelId };
    setStores(updated);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = stores.map(({ siteCode, storeName, channelId }) => ({ siteCode, storeName, channelId }));
      const res = await authFetch('/api/stores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: payload }),
      });
      if (res.ok) {
        setDirty(false);
        setToast({ msg: 'Stores saved', type: 'success' });
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ msg: data.error || 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const unassignedCount = stores.filter(s => !s.channelId).length;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Stores
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Manage store-to-channel assignments. Stores are auto-populated from DISPO uploads.
        </p>

        {unassignedCount > 0 && (
          <div style={{ padding: '0.6rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.8rem', color: '#92400e', marginBottom: '1rem' }}>
            {unassignedCount} store{unassignedCount > 1 ? 's' : ''} without a channel assignment
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Search stores..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 200, maxWidth: 300 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
          {dirty && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Unsaved changes</span>}
          <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 'auto' }}>
            {filtered.length} of {stores.length} stores
          </span>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', flex: 1 }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Site Code</th>
                  <th>Store Name</th>
                  <th style={{ width: 180 }}>Channel</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                      {stores.length === 0 ? 'No stores yet — upload a DISPO file to populate' : 'No matches'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((store, i) => (
                    <tr key={`${store.siteCode}-${store.storeName}`} style={!store.channelId ? { background: '#fffbeb' } : undefined}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{store.siteCode || '—'}</td>
                      <td>{store.storeName}</td>
                      <td>
                        <select
                          className="select"
                          value={store.channelId}
                          onChange={e => handleChannelChange(i, e.target.value)}
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        >
                          <option value="">— Select —</option>
                          {channels.map(ch => (
                            <option key={ch.id} value={ch.id}>{ch.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
