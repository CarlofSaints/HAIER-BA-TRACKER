'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';
import type { RoleConfig, PermissionDef } from '@/lib/roleData';
import { ALL_PERMISSIONS, PERMISSION_CATEGORIES } from '@/lib/roleData';

const ROLE_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  super_admin: { bg: '#fef2f2', fg: '#991b1b', dot: '#dc2626' },
  admin: { bg: '#eff6ff', fg: '#1e40af', dot: '#2563eb' },
  client: { bg: '#f0fdf4', fg: '#166534', dot: '#16a34a' },
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: 'Full system access. All permissions locked on.',
  admin: 'Day-to-day management. Most permissions enabled.',
  client: 'Read-only access to dashboards and reports.',
};

export default function RolesPage() {
  const { session, loading: authLoading, logout } = useAuth('super_admin');
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');

  const loadRoles = useCallback(async () => {
    try {
      const res = await authFetch('/api/roles');
      if (res.ok) {
        setRoles(await res.json());
        setDirty(false);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadRoles();
  }, [session, loadRoles]);

  function togglePermission(roleName: string, permKey: string) {
    if (roleName === 'super_admin') return; // locked
    setRoles(prev => prev.map(r => {
      if (r.name !== roleName) return r;
      const perms = new Set(r.permissions);
      if (perms.has(permKey)) perms.delete(permKey);
      else perms.add(permKey);
      return { ...r, permissions: [...perms] };
    }));
    setDirty(true);
  }

  function toggleCategoryForRole(roleName: string, category: string) {
    if (roleName === 'super_admin') return;
    const catPerms = ALL_PERMISSIONS.filter(p => p.category === category).map(p => p.key);
    setRoles(prev => prev.map(r => {
      if (r.name !== roleName) return r;
      const perms = new Set(r.permissions);
      const allOn = catPerms.every(k => perms.has(k));
      for (const k of catPerms) {
        if (allOn) perms.delete(k); else perms.add(k);
      }
      return { ...r, permissions: [...perms] };
    }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roles),
      });
      if (res.ok) {
        setToast({ msg: 'Permissions saved', type: 'success' });
        setDirty(false);
      } else {
        setToast({ msg: 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed to save', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    loadRoles();
  }

  function handleAddRole() {
    const name = newRoleName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const label = newRoleLabel.trim();
    if (!name || !label) return;
    if (roles.some(r => r.name === name)) {
      setToast({ msg: 'Role name already exists', type: 'error' });
      return;
    }
    setRoles(prev => [...prev, { name, label, permissions: [] }]);
    setDirty(true);
    setShowAddModal(false);
    setNewRoleName('');
    setNewRoleLabel('');
  }

  function handleDeleteRole(roleName: string) {
    if (roleName === 'super_admin') return;
    if (!confirm(`Delete role "${roleName}"? This cannot be undone.`)) return;
    setRoles(prev => prev.filter(r => r.name !== roleName));
    setDirty(true);
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const permsByCategory: Record<string, PermissionDef[]> = {};
  for (const cat of PERMISSION_CATEGORIES) {
    permsByCategory[cat] = ALL_PERMISSIONS.filter(p => p.category === cat);
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Roles & Permissions
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0 0' }}>
              Configure what each role can access
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {dirty && (
              <>
                <button
                  onClick={handleDiscard}
                  style={{
                    padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 500,
                    border: '1px solid #d1d5db', borderRadius: 8, background: 'white',
                    color: '#374151', cursor: 'pointer',
                  }}
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                    border: 'none', borderRadius: 8, background: '#0054A6',
                    color: 'white', cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}
            <button
              onClick={() => { setNewRoleName(''); setNewRoleLabel(''); setShowAddModal(true); }}
              style={{
                padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                border: '1px solid #0054A6', borderRadius: 8, background: 'white',
                color: '#0054A6', cursor: 'pointer',
              }}
            >
              + Add Role
            </button>
          </div>
        </div>

        {/* Permission Matrix */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', flex: 1 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40%' }} />
                {roles.map(r => (
                  <col key={r.name} style={{ width: `${60 / roles.length}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{
                    textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.7rem',
                    fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
                    letterSpacing: '0.05em', background: '#f9fafb',
                  }}>
                    Permission
                  </th>
                  {roles.map(r => {
                    const colors = ROLE_COLORS[r.name] || { bg: '#f3f4f6', fg: '#374151', dot: '#6b7280' };
                    return (
                      <th key={r.name} style={{
                        textAlign: 'center', padding: '0.75rem 0.5rem', background: '#f9fafb',
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '3px 10px', borderRadius: 999,
                            background: colors.bg, fontSize: '0.7rem', fontWeight: 600, color: colors.fg,
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.dot, display: 'inline-block' }} />
                            {r.label}
                          </div>
                          {r.name === 'super_admin' ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Locked">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          ) : (
                            <button
                              onClick={() => handleDeleteRole(r.name)}
                              title={`Delete ${r.label}`}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: 2, lineHeight: 0, color: '#9ca3af',
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" /><path d="M14 11v6" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {PERMISSION_CATEGORIES.map(cat => {
                const catPerms = permsByCategory[cat];
                return (
                  <tbody key={cat}>
                    {/* Category header row */}
                    <tr style={{ background: '#f9fafb' }}>
                      <td style={{
                        padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.7rem',
                        color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em',
                        borderTop: '1px solid #e5e7eb', background: '#f9fafb',
                      }}>
                        {cat}
                      </td>
                      {roles.map(r => {
                        const catKeys = catPerms.map(p => p.key);
                        const allOn = catKeys.every(k => r.permissions.includes(k));
                        const someOn = catKeys.some(k => r.permissions.includes(k));
                        return (
                          <td key={r.name} style={{
                            textAlign: 'center', padding: '0.5rem',
                            borderTop: '1px solid #e5e7eb',
                          }}>
                            <input
                              type="checkbox"
                              checked={allOn}
                              ref={el => {
                                if (el) el.indeterminate = !allOn && someOn;
                              }}
                              onChange={() => toggleCategoryForRole(r.name, cat)}
                              disabled={r.name === 'super_admin'}
                              style={{
                                width: 15, height: 15, accentColor: '#0054A6',
                                cursor: r.name === 'super_admin' ? 'not-allowed' : 'pointer',
                                opacity: r.name === 'super_admin' ? 0.5 : 1,
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                    {/* Permission rows */}
                    {catPerms.map(perm => (
                      <tr key={perm.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{
                          padding: '0.4rem 1rem 0.4rem 2rem', color: '#374151',
                          background: 'white',
                        }}>
                          <div style={{ fontWeight: 500 }}>{perm.label}</div>
                          <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>{perm.key}</div>
                        </td>
                        {roles.map(r => {
                          const has = r.permissions.includes(perm.key);
                          return (
                            <td key={r.name} style={{ textAlign: 'center', padding: '0.4rem' }}>
                              <input
                                type="checkbox"
                                checked={has}
                                onChange={() => togglePermission(r.name, perm.key)}
                                disabled={r.name === 'super_admin'}
                                style={{
                                  width: 15, height: 15, accentColor: '#0054A6',
                                  cursor: r.name === 'super_admin' ? 'not-allowed' : 'pointer',
                                  opacity: r.name === 'super_admin' ? 0.5 : 1,
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        </div>

        {/* Role descriptions legend */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          {roles.map(r => {
            const colors = ROLE_COLORS[r.name] || { bg: '#f3f4f6', fg: '#374151', dot: '#6b7280' };
            const desc = ROLE_DESCRIPTIONS[r.name] || '';
            return (
              <div key={r.name} style={{
                flex: '1 1 200px', padding: '0.75rem 1rem', borderRadius: 8,
                border: '1px solid #e5e7eb', background: 'white', fontSize: '0.8rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: colors.dot, display: 'inline-block' }} />
                  <span style={{ fontWeight: 600, color: colors.fg }}>{r.label}</span>
                  <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                    ({r.permissions.length}/{ALL_PERMISSIONS.length})
                  </span>
                </div>
                {desc && <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{desc}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
      {/* Add Role Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: 'white', borderRadius: 14, padding: '1.75rem', width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', margin: '0 0 1.25rem' }}>Add Role</h2>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Display Name</label>
                <input
                  className="input"
                  value={newRoleLabel}
                  onChange={e => {
                    setNewRoleLabel(e.target.value);
                    if (!newRoleName || newRoleName === newRoleLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')) {
                      setNewRoleName(e.target.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                    }
                  }}
                  placeholder="e.g. Regional Manager"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>System Name</label>
                <input
                  className="input"
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. regional_manager"
                  style={{ fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2 }}>Lowercase, underscores only. Used internally.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 500,
                  border: '1px solid #d1d5db', borderRadius: 8, background: 'white',
                  color: '#374151', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddRole}
                disabled={!newRoleName.trim() || !newRoleLabel.trim()}
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                  border: 'none', borderRadius: 8, background: '#0054A6',
                  color: 'white', cursor: !newRoleName.trim() || !newRoleLabel.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newRoleName.trim() || !newRoleLabel.trim() ? 0.5 : 1,
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
