'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface Channel {
  id: string;
  name: string;
}

export default function ChannelsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin']);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const res = await authFetch('/api/channels');
      if (res.ok) setChannels(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadChannels();
  }, [session, loadChannels]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels);
        setNewName('');
        setToast({ msg: 'Channel added', type: 'success' });
      } else {
        setToast({ msg: data.error || 'Failed to add', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed to add channel', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete channel "${name}"? Stores assigned to this channel will become unassigned.`)) return;
    try {
      const res = await authFetch(`/api/channels?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels);
        setToast({ msg: 'Channel deleted', type: 'success' });
      } else {
        setToast({ msg: data.error || 'Delete failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Delete failed', type: 'error' });
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
          Sales Channels
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Manage sales channels (e.g. Makro, Walmart, DC). These group stores for DISPO sales reporting.
        </p>

        {/* Add channel */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', maxWidth: 400 }}>
          <input
            className="input"
            placeholder="Channel name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newName.trim()}>
            {saving ? '...' : 'Add'}
          </button>
        </div>

        {/* Channel list */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', maxWidth: 500 }}>
          {channels.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              No channels yet
            </div>
          ) : (
            channels.map(ch => (
              <div
                key={ch.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.9rem' }}>{ch.name}</div>
                  <div style={{ color: '#9ca3af', fontSize: '0.7rem' }}>ID: {ch.id}</div>
                </div>
                <button
                  className="btn btn-danger"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => handleDelete(ch.id, ch.name)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
