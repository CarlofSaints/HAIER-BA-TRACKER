'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface RoleConfig {
  name: string;
  label: string;
  permissions: string[];
}

const PERMISSION_GROUPS: { category: string; perms: { key: string; label: string }[] }[] = [
  {
    category: 'Dashboard',
    perms: [
      { key: 'dashboard.view', label: 'View Dashboard' },
    ],
  },
  {
    category: 'Data',
    perms: [
      { key: 'upload.visits', label: 'Upload Visit Data' },
    ],
  },
  {
    category: 'Users',
    perms: [
      { key: 'users.view', label: 'View Users' },
      { key: 'users.manage', label: 'Create / Edit / Delete Users' },
    ],
  },
  {
    category: 'Administration',
    perms: [
      { key: 'roles.manage', label: 'Manage Roles & Permissions' },
      { key: 'settings.view', label: 'View Settings' },
      { key: 'settings.manage', label: 'Edit Settings' },
    ],
  },
];

const ALL_PERM_KEYS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key));

export default function RolesPage() {
  const { session, loading: authLoading, logout } = useAuth('super_admin');
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; role?: RoleConfig } | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
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
    setRoleName('');
    setRoleLabel('');
    setRolePerms(new Set());
    setModal({ mode: 'create' });
  }

  function openEdit(r: RoleConfig) {
    setRoleName(r.name);
    setRoleLabel(r.label);
    setRolePerms(new Set(r.permissions));
    setModal({ mode: 'edit', role: r });
  }

  function togglePerm(key: string) {
    setRolePerms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!roleName || !roleLabel || !modal) return;
    setSaving(true);
    try {
      let updated: RoleConfig[];
      if (modal.mode === 'edit') {
        updated = roles.map(r =>
          r.name === modal.role!.name
            ? { name: roleName, label: roleLabel, permissions: Array.from(rolePerms) }
            : r
        );
      } else {
        if (roles.some(r => r.name === roleName)) {
          setToast({ msg: 'Role name already exists', type: 'error' });
          setSaving(false);
          return;
        }
        updated = [...roles, { name: roleName, label: roleLabel, permissions: Array.from(rolePerms) }];
      }

      const res = await authFetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setToast({ msg: modal.mode === 'create' ? 'Role created' : 'Role updated', type: 'success' });
        setModal(null);
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
    if (!confirm('Delete this role? This cannot be undone.')) return;
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
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ background: 'white', borderRadius: 12, borderLeft: '4px solid #0054A6', padding: '1rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: 0 }}>Roles & Permissions</h1>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '4px 0 0' }}>Manage who can do what in the system</p>
        </div>

        {/* Roles Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              All Roles ({roles.length})
            </span>
            <button className="btn btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }} onClick={openCreate}>
              + New Role
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '0.6rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}># Permissions</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                  <th style={{ padding: '0.6rem 1.5rem', width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {roles.map(r => {
                  const isBuiltIn = ['super_admin', 'admin', 'client'].includes(r.name);
                  return (
                    <tr key={r.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.6rem 1.5rem', fontWeight: 500, color: '#111827' }}>{r.label}</td>
                      <td style={{ padding: '0.6rem 1.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{r.name}</td>
                      <td style={{ padding: '0.6rem 1.5rem', color: '#374151' }}>
                        {r.permissions.length} / {ALL_PERM_KEYS.length}
                      </td>
                      <td style={{ padding: '0.6rem 1.5rem' }}>
                        {isBuiltIn ? (
                          <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280' }}>System</span>
                        ) : (
                          <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#eff6ff', color: '#0054A6' }}>Custom</span>
                        )}
                      </td>
                      <td style={{ padding: '0.6rem 1.5rem' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEdit(r)} style={{ fontSize: '0.75rem', color: '#0054A6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Edit</button>
                          {!isBuiltIn && (
                            <button onClick={() => handleDelete(r.name)} style={{ fontSize: '0.75rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {roles.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>No roles configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Footer />
      </main>

      {/* Role Modal */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setModal(null)}
        >
          <div
            style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1.25rem' }}>
              {modal.mode === 'create' ? 'Create Role' : `Edit Role \u2014 ${modal.role?.label}`}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>
                      Role Key <span style={{ color: '#9ca3af' }}>(lowercase, underscores)</span>
                    </label>
                    <input
                      className="input"
                      value={roleName}
                      onChange={e => setRoleName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      disabled={modal.mode === 'edit'}
                      placeholder="e.g. regional_manager"
                      required
                      style={modal.mode === 'edit' ? { background: '#f9fafb', color: '#6b7280' } : {}}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>Display Name</label>
                    <input className="input" value={roleLabel} onChange={e => setRoleLabel(e.target.value)} placeholder="e.g. Regional Manager" required />
                  </div>
                </div>

                {/* Permissions grouped by category */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: 8 }}>Permissions</label>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '1rem', maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {PERMISSION_GROUPS.map(group => (
                      <div key={group.category}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                          {group.category}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                          {group.perms.map(p => (
                            <label
                              key={p.key}
                              style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <input
                                type="checkbox"
                                checked={rolePerms.has(p.key)}
                                onChange={() => togglePerm(p.key)}
                                style={{ width: 16, height: 16, marginTop: 1, accentColor: '#0054A6' }}
                              />
                              <div>
                                <div style={{ fontWeight: 500 }}>{p.label}</div>
                                <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontFamily: 'monospace' }}>{p.key}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={saving || !roleName || !roleLabel}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
