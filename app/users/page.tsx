'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import type { Role } from '@/lib/userData';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';
import PasswordInput from '@/components/PasswordInput';

interface UserRow {
  id: string;
  email: string;
  name: string;
  surname: string;
  cellNumber?: string;
  role: Role;
  forcePasswordChange: boolean;
  createdAt: string;
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

interface UserForm {
  email: string;
  name: string;
  surname: string;
  cellNumber: string;
  role: Role;
  password: string;
  forcePasswordChange: boolean;
  sendWelcomeEmail: boolean;
}

export default function UsersPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>({ email: '', name: '', surname: '', cellNumber: '', role: 'client', password: '', forcePasswordChange: true, sendWelcomeEmail: true });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await authFetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadUsers();
  }, [session, loadUsers]);

  function openCreate() {
    setEditUser(null);
    setForm({ email: '', name: '', surname: '', cellNumber: '', role: 'client', password: '', forcePasswordChange: true, sendWelcomeEmail: true });
    setShowModal(true);
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setForm({ email: u.email, name: u.name, surname: u.surname, cellNumber: u.cellNumber || '', role: u.role, password: '', forcePasswordChange: false, sendWelcomeEmail: false });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editUser) {
        const body: Record<string, unknown> = {};
        if (form.name !== editUser.name) body.name = form.name;
        if (form.surname !== editUser.surname) body.surname = form.surname;
        if (form.email !== editUser.email) body.email = form.email;
        if (form.role !== editUser.role) body.role = form.role;
        if (form.cellNumber !== (editUser.cellNumber || '')) body.cellNumber = form.cellNumber;
        if (form.password) {
          body.password = form.password;
          body.forcePasswordChange = form.forcePasswordChange;
        }

        const res = await authFetch(`/api/users/${editUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          setToast({ msg: data.error || 'Update failed', type: 'error' });
          setSaving(false);
          return;
        }
        setToast({ msg: 'User updated', type: 'success' });
      } else {
        const res = await authFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setToast({ msg: data.error || 'Create failed', type: 'error' });
          setSaving(false);
          return;
        }
        setToast({ msg: 'User created', type: 'success' });
      }
      setShowModal(false);
      loadUsers();
    } catch {
      setToast({ msg: 'Failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ msg: 'User deleted', type: 'success' });
        loadUsers();
      } else {
        const data = await res.json();
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
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', margin: 0 }}>Users</h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0 0' }}>Manage system users</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Cell</th>
                <th>Role</th>
                <th>Created</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name} {u.surname}</td>
                  <td>{u.email}</td>
                  <td>{u.cellNumber || '-'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{u.role.replace('_', ' ')}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString('en-ZA')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openEdit(u)}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(u.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>No users</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Footer />

        {/* Modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowModal(false)}>
            <div style={{ background: 'white', borderRadius: 14, padding: '1.75rem', width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem' }}>
                {editUser ? 'Edit User' : 'Add User'}
              </h2>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Name</label>
                    <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Surname</label>
                    <input className="input" value={form.surname} onChange={e => setForm({ ...form, surname: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Email</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Cell Number</label>
                  <input className="input" type="tel" value={form.cellNumber} onChange={e => setForm({ ...form, cellNumber: e.target.value })} placeholder="e.g. 082 123 4567" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Role</label>
                  <select className="select" style={{ width: '100%' }} value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>
                    {ROLES.filter(r => session.role === 'super_admin' || r.value !== 'super_admin').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                    {editUser ? 'Reset Password (leave blank to keep)' : 'Password (leave blank for auto-generated)'}
                  </label>
                  <PasswordInput value={form.password} onChange={pw => setForm({ ...form, password: pw })} placeholder={editUser ? 'Leave blank to keep' : 'Auto-generated if empty'} />
                </div>

                {/* Checkboxes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.forcePasswordChange}
                      onChange={e => setForm({ ...form, forcePasswordChange: e.target.checked })}
                      style={{ width: 16, height: 16 }}
                    />
                    Force password change on first login
                  </label>
                  {!editUser && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.sendWelcomeEmail}
                        onChange={e => setForm({ ...form, sendWelcomeEmail: e.target.checked })}
                        style={{ width: 16, height: 16 }}
                      />
                      Send welcome email
                    </label>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.email || !form.name || !form.surname}>
                  {saving ? 'Saving...' : editUser ? 'Save' : 'Create'}
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
