'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';

interface RoleConfig {
  name: string;
  label: string;
  permissions: string[];
}

const ALL_PERMISSIONS = [
  { key: 'dashboard.view', label: 'View Dashboard' },
  { key: 'upload.visits', label: 'Upload Visit Data' },
  { key: 'users.view', label: 'View Users' },
  { key: 'users.manage', label: 'Create / Edit / Delete Users' },
  { key: 'roles.manage', label: 'Manage Roles & Permissions' },
  { key: 'settings.view', label: 'View Settings' },
  { key: 'settings.manage', label: 'Edit Settings' },
];

export default function RolesPage() {
  const { session, loading: authLoading, logout } = useAuth('super_admin');
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [editRole, setEditRole] = useState<RoleConfig | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', label: '', permissions: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadRoles = useCallback(async () => {
    try {
      const res = await authFetch('/api/roles');
      if (res.ok) setRoles(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadRoles();
  }, [session, loadRoles]);

  function openCreate() {
    setEditRole(null);
    setForm({ name: '', label: '', permissions: [] });
    setShowModal(true);
  }

  function openEdit(r: RoleConfig) {
    setEditRole(r);
    setForm({ name: r.name, label: r.label, permissions: [...r.permissions] });
    setShowModal(true);
  }

  function togglePermission(key: string) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }));
  }

  async function handleSave() {
    if (!form.name || !form.label) return;
    setSaving(true);
    try {
      let updated: RoleConfig[];
      if (editRole) {
        updated = roles.map(r => r.name === editRole.name ? { name: form.name, label: form.label, permissions: form.permissions } : r);
      } else {
        if (roles.some(r => r.name === form.name)) {
          setToast({ msg: 'Role name already exists', type: 'error' });
          setSaving(false);
          return;
        }
        updated = [...roles, { name: form.name, label: form.label, permissions: form.permissions }];
      }

      const res = await authFetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setToast({ msg: editRole ? 'Role updated' : 'Role created', type: 'success' });
        setShowModal(false);
        loadRoles();
      } else {
        setToast({ msg: 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    if (['super_admin', 'admin', 'client'].includes(name)) {
      setToast({ msg: 'Cannot delete built-in roles', type: 'error' });
      return;
    }
    if (!confirm('Delete this role?')) return;
    const updated = roles.filter(r => r.name !== name);
    try {
      const res = await authFetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setToast({ msg: 'Role deleted', type: 'success' });
        loadRoles();
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
      <main style={{ marginLeft: 240, flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', margin: 0 }}>Roles & Permissions</h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0 0' }}>Manage user roles and their permissions</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Role</button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {roles.map(r => {
            const isBuiltIn = ['super_admin', 'admin', 'client'].includes(r.name);
            return (
              <div key={r.name} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>{r.label}</span>
                    <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>{r.name}</span>
                    {isBuiltIn && <span style={{ marginLeft: 8, fontSize: '0.65rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: 4, color: '#6b7280' }}>Built-in</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openEdit(r)}>Edit</button>
                    {!isBuiltIn && (
                      <button className="btn btn-danger" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(r.name)}>Delete</button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {r.permissions.length === 0 ? (
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No permissions</span>
                  ) : (
                    r.permissions.map(p => {
                      const perm = ALL_PERMISSIONS.find(ap => ap.key === p);
                      return (
                        <span key={p} style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#0054A6', padding: '3px 8px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                          {perm?.label || p}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowModal(false)}>
            <div style={{ background: 'white', borderRadius: 14, padding: '1.75rem', width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem' }}>
                {editRole ? 'Edit Role' : 'Add Role'}
              </h2>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Role Name (key)</label>
                    <input
                      className="input"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                      disabled={!!editRole}
                      placeholder="e.g. regional_manager"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Display Label</label>
                    <input className="input" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Regional Manager" />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 8 }}>Permissions</label>
                  <div style={{ display: 'grid', gap: '0.4rem', background: '#f9fafb', padding: '0.75rem', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    {ALL_PERMISSIONS.map(p => (
                      <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(p.key)}
                          onChange={() => togglePermission(p.key)}
                          style={{ width: 16, height: 16 }}
                        />
                        {p.label}
                        <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>({p.key})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.label}>
                  {saving ? 'Saving...' : editRole ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
