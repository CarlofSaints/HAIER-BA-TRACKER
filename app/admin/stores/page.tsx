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
  area?: string;
  assignedBaEmail?: string;
  assignedBaName?: string;
}

interface Channel {
  id: string;
  name: string;
}

interface BAOption {
  email: string;
  repName: string;
  lastSeen: string;
}

export default function StoresPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [stores, setStores] = useState<StoreMaster[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [bas, setBas] = useState<BAOption[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Add-store modal
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newStore, setNewStore] = useState({ siteCode: '', storeName: '', channelId: '', area: '', assignedBaEmail: '' });

  const loadData = useCallback(async () => {
    try {
      const [storesRes, channelsRes, basRes] = await Promise.all([
        authFetch('/api/stores'),
        authFetch('/api/channels'),
        authFetch('/api/bas'),
      ]);
      if (storesRes.ok) setStores(await storesRes.json());
      if (channelsRes.ok) setChannels(await channelsRes.json());
      if (basRes.ok) setBas(await basRes.json());
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
      s.siteCode.toLowerCase().includes(q) ||
      (s.area || '').toLowerCase().includes(q)
    );
  }, [stores, search]);

  function handleChannelChange(idx: number, channelId: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const updated = [...stores];
    updated[realIdx] = { ...updated[realIdx], channelId };
    setStores(updated);
    setDirty(true);
  }

  function handleAreaChange(idx: number, area: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const updated = [...stores];
    updated[realIdx] = { ...updated[realIdx], area };
    setStores(updated);
    setDirty(true);
  }

  function handleBaChange(idx: number, email: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const ba = bas.find(b => b.email === email);
    const updated = [...stores];
    updated[realIdx] = {
      ...updated[realIdx],
      assignedBaEmail: email || '',
      assignedBaName: ba?.repName || '',
    };
    setStores(updated);
    setDirty(true);
  }

  function storesPayload(list: StoreMaster[]) {
    return list.map(({ siteCode, storeName, channelId, area, assignedBaEmail, assignedBaName }) => ({
      siteCode, storeName, channelId, area: area || '',
      assignedBaEmail: assignedBaEmail || '', assignedBaName: assignedBaName || '',
    }));
  }

  async function handleAddStore() {
    const siteCode = newStore.siteCode.trim();
    const storeName = newStore.storeName.trim();
    if (!storeName) { setToast({ msg: 'Store name is required', type: 'error' }); return; }
    if (stores.some(s => s.storeName.toLowerCase() === storeName.toLowerCase())) {
      setToast({ msg: 'A store with that name already exists', type: 'error' }); return;
    }
    if (siteCode && stores.some(s => s.siteCode && s.siteCode.toLowerCase() === siteCode.toLowerCase())) {
      setToast({ msg: 'A store with that site code already exists', type: 'error' }); return;
    }
    const ba = bas.find(b => b.email === newStore.assignedBaEmail);
    const entry: StoreMaster = {
      siteCode, storeName, channelId: newStore.channelId,
      area: newStore.area.trim(),
      assignedBaEmail: newStore.assignedBaEmail || '',
      assignedBaName: ba?.repName || '',
    };
    const updated = [entry, ...stores];
    setAdding(true);
    try {
      // Persist the whole list (including any pending table edits) so the new
      // store exists immediately — e.g. for the Diamond Corner PDF upload.
      const res = await authFetch('/api/stores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: storesPayload(updated) }),
      });
      if (res.ok) {
        setStores(updated);
        setDirty(false);
        setShowAdd(false);
        setNewStore({ siteCode: '', storeName: '', channelId: '', area: '', assignedBaEmail: '' });
        setToast({ msg: `Store "${storeName}" added`, type: 'success' });
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ msg: data.error || 'Add failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Add failed', type: 'error' });
    } finally {
      setAdding(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = stores.map(({ siteCode, storeName, channelId, area, assignedBaEmail, assignedBaName }) => ({
        siteCode, storeName, channelId, area: area || '',
        assignedBaEmail: assignedBaEmail || '', assignedBaName: assignedBaName || '',
      }));
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
          Manage store-to-channel assignments. Stores are auto-populated from DISPO uploads — use
          <strong> Add Store</strong> for channels without a DISPO feed (e.g. Diamond Corner).
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
            onClick={() => setShowAdd(true)}
          >
            + Add Store
          </button>
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
                  <th style={{ width: 150 }}>Area</th>
                  <th style={{ width: 180 }}>Channel</th>
                  <th style={{ width: 200 }}>Assigned BA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                      {stores.length === 0 ? 'No stores yet — upload a DISPO file or click “+ Add Store”' : 'No matches'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((store, i) => (
                    <tr key={`${store.siteCode}-${store.storeName}`} style={!store.channelId ? { background: '#fffbeb' } : undefined}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{store.siteCode || '—'}</td>
                      <td>{store.storeName}</td>
                      <td>
                        <input
                          className="input"
                          value={store.area || ''}
                          onChange={e => handleAreaChange(i, e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
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
                      <td>
                        <select
                          className="select"
                          value={store.assignedBaEmail || ''}
                          onChange={e => handleBaChange(i, e.target.value)}
                          style={{ width: '100%', fontSize: '0.8rem' }}
                          title="Override which BA gets credited for this store's sales. Leave on Auto to derive from Perigee visits."
                        >
                          <option value="">— Auto (from visits) —</option>
                          {store.assignedBaEmail && !bas.some(b => b.email === store.assignedBaEmail) && (
                            <option value={store.assignedBaEmail}>{store.assignedBaName || store.assignedBaEmail}</option>
                          )}
                          {bas.map(b => (
                            <option key={b.email} value={b.email}>{b.repName}</option>
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

      {showAdd && (
        <div
          onClick={() => !adding && setShowAdd(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, padding: '1.5rem',
              width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Add Store</h2>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Manually add a store for channels without a DISPO feed (e.g. Diamond Corner).
            </p>

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Store Name *</label>
            <input
              className="input"
              value={newStore.storeName}
              onChange={e => setNewStore(s => ({ ...s, storeName: e.target.value }))}
              placeholder="e.g. DIAMOND CORNER WOODMEAD"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              autoFocus
            />

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Site Code</label>
            <input
              className="input"
              value={newStore.siteCode}
              onChange={e => setNewStore(s => ({ ...s, siteCode: e.target.value }))}
              placeholder="optional"
              style={{ width: '100%', marginBottom: '0.75rem', fontFamily: 'monospace' }}
            />

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Area</label>
            <input
              className="input"
              value={newStore.area}
              onChange={e => setNewStore(s => ({ ...s, area: e.target.value }))}
              placeholder="optional"
              style={{ width: '100%', marginBottom: '0.75rem' }}
            />

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Channel</label>
            <select
              className="select"
              value={newStore.channelId}
              onChange={e => setNewStore(s => ({ ...s, channelId: e.target.value }))}
              style={{ width: '100%', marginBottom: '0.75rem' }}
            >
              <option value="">— Select —</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Assigned BA</label>
            <select
              className="select"
              value={newStore.assignedBaEmail}
              onChange={e => setNewStore(s => ({ ...s, assignedBaEmail: e.target.value }))}
              style={{ width: '100%', marginBottom: '1.25rem' }}
              title="Which BA gets credited for this store's sales. Leave on Auto to derive from Perigee visits."
            >
              <option value="">— Auto (from visits) —</option>
              {bas.map(b => (
                <option key={b.email} value={b.email}>{b.repName}</option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn" onClick={() => setShowAdd(false)} disabled={adding}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddStore} disabled={adding}>
                {adding ? 'Adding…' : 'Add Store'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
