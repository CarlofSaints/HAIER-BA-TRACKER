'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface Channel {
  id: string;
  name: string;
  parentId?: string;
}

export default function ChannelsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin']);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState('');
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

  const mainChannels = channels.filter(c => !c.parentId);
  const getSubChannels = (parentId: string) => channels.filter(c => c.parentId === parentId);

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const body: { name: string; parentId?: string } = { name: newName.trim() };
      if (newParentId) body.parentId = newParentId;
      const res = await authFetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels);
        setNewName('');
        setNewParentId('');
        setToast({ msg: newParentId ? 'Sub-channel added' : 'Channel added', type: 'success' });
      } else {
        setToast({ msg: data.error || 'Failed to add', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed to add channel', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string, isMain: boolean) {
    const msg = isMain
      ? `Delete main channel "${name}" and all its sub-channels? Stores assigned to these channels will become unassigned.`
      : `Delete sub-channel "${name}"? Stores assigned to this channel will become unassigned.`;
    if (!confirm(msg)) return;
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

  function startEdit(ch: Channel) {
    setEditingId(ch.id);
    setEditName(ch.name);
    setEditParentId(ch.parentId || '');
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editName.trim(), parentId: editParentId || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels);
        setEditingId(null);
        setToast({ msg: 'Channel updated', type: 'success' });
      } else {
        setToast({ msg: data.error || 'Update failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Update failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const rowStyle = (indent: boolean) => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.65rem 1rem', borderBottom: '1px solid #f3f4f6',
    paddingLeft: indent ? '2.25rem' : '1rem',
    background: indent ? '#f9fafb' : 'white',
  });

  const badgeStyle = (main: boolean) => ({
    fontSize: '0.6rem', fontWeight: 600 as const, padding: '0.1rem 0.4rem',
    borderRadius: 4, marginLeft: '0.5rem',
    background: main ? '#dbeafe' : '#e0e7ff',
    color: main ? '#1d4ed8' : '#4338ca',
  });

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Sales Channels
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Manage main channels and sub-channels. Stores are assigned to sub-channels (or directly to main channels if no sub-channel exists).
        </p>

        {/* Add channel */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', maxWidth: 550, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Channel name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            style={{ flex: 1, minWidth: 160 }}
          />
          <select
            className="input"
            value={newParentId}
            onChange={e => setNewParentId(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="">Main Channel</option>
            {mainChannels.map(c => (
              <option key={c.id} value={c.id}>Sub of {c.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newName.trim()}>
            {saving ? '...' : 'Add'}
          </button>
        </div>

        {/* Channel list — hierarchical */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', maxWidth: 600 }}>
          {channels.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              No channels yet
            </div>
          ) : (
            mainChannels.map(main => {
              const subs = getSubChannels(main.id);
              return (
                <div key={main.id}>
                  {/* Main channel row */}
                  {editingId === main.id ? (
                    <div style={{ ...rowStyle(false), gap: '0.5rem' }}>
                      <input className="input" value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1, fontSize: '0.85rem' }} />
                      <button className="btn btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={handleSaveEdit} disabled={saving}>Save</button>
                      <button className="btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={rowStyle(false)}>
                      <div>
                        <span style={{ fontWeight: 600, color: '#374151', fontSize: '0.9rem' }}>{main.name}</span>
                        <span style={badgeStyle(true)}>MAIN</span>
                        {subs.length > 0 && (
                          <span style={{ color: '#9ca3af', fontSize: '0.7rem', marginLeft: '0.5rem' }}>
                            {subs.length} sub-channel{subs.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <div style={{ color: '#9ca3af', fontSize: '0.7rem' }}>ID: {main.id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button className="btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => startEdit(main)}>Edit</button>
                        <button className="btn btn-danger" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleDelete(main.id, main.name, true)}>Delete</button>
                      </div>
                    </div>
                  )}

                  {/* Sub-channel rows */}
                  {subs.map(sub => (
                    editingId === sub.id ? (
                      <div key={sub.id} style={{ ...rowStyle(true), gap: '0.5rem' }}>
                        <input className="input" value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1, fontSize: '0.85rem' }} />
                        <select className="input" value={editParentId} onChange={e => setEditParentId(e.target.value)} style={{ width: 150, fontSize: '0.8rem' }}>
                          <option value="">Make Main</option>
                          {mainChannels.filter(c => c.id !== sub.id).map(c => (
                            <option key={c.id} value={c.id}>Sub of {c.name}</option>
                          ))}
                        </select>
                        <button className="btn btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={handleSaveEdit} disabled={saving}>Save</button>
                        <button className="btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div key={sub.id} style={rowStyle(true)}>
                        <div>
                          <span style={{ color: '#6b7280', fontSize: '0.75rem', marginRight: '0.35rem' }}>└</span>
                          <span style={{ fontWeight: 500, color: '#4b5563', fontSize: '0.85rem' }}>{sub.name}</span>
                          <span style={badgeStyle(false)}>SUB</span>
                          <div style={{ color: '#9ca3af', fontSize: '0.7rem', paddingLeft: '1rem' }}>ID: {sub.id}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button className="btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => startEdit(sub)}>Edit</button>
                          <button className="btn btn-danger" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleDelete(sub.id, sub.name, false)}>Delete</button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              );
            })
          )}

          {/* Orphan channels — sub-channels whose parent was deleted */}
          {channels.filter(c => c.parentId && !channels.some(p => p.id === c.parentId)).map(orphan => (
            <div key={orphan.id} style={{ ...rowStyle(false), background: '#fef3c7' }}>
              <div>
                <span style={{ fontWeight: 500, color: '#92400e', fontSize: '0.85rem' }}>{orphan.name}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 4, marginLeft: '0.5rem', background: '#fde68a', color: '#92400e' }}>ORPHAN</span>
                <div style={{ color: '#b45309', fontSize: '0.7rem' }}>Parent &quot;{orphan.parentId}&quot; missing — edit to reassign</div>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button className="btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => startEdit(orphan)}>Edit</button>
                <button className="btn btn-danger" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleDelete(orphan.id, orphan.name, false)}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
