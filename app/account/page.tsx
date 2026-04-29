'use client';

import { useState } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';

export default function AccountPage() {
  const { session, loading: authLoading, logout, setSession } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setToast({ msg: 'Passwords do not match', type: 'error' });
      return;
    }
    if (newPw.length < 6) {
      setToast({ msg: 'Password must be at least 6 characters', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Failed', type: 'error' });
      } else {
        setToast({ msg: 'Password changed', type: 'success' });
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
        // Update session to clear forcePasswordChange
        if (session?.forcePasswordChange) {
          const updated = { ...session, forcePasswordChange: false };
          localStorage.setItem('haier_session', JSON.stringify(updated));
          setSession(updated);
        }
      }
    } catch {
      setToast({ msg: 'Failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ marginLeft: 240, flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Account
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '2rem' }}>
          Manage your profile and password
        </p>

        {/* Profile card */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', marginBottom: '2rem', maxWidth: 500 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Profile</h2>
          <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
            <div><strong>Name:</strong> {session.name} {session.surname}</div>
            <div><strong>Email:</strong> {session.email}</div>
            <div><strong>Role:</strong> <span style={{ textTransform: 'capitalize' }}>{session.role.replace('_', ' ')}</span></div>
          </div>
        </div>

        {/* Change password */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 500 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Change Password</h2>
          {session.forcePasswordChange && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '0.75rem', fontSize: '0.8rem', color: '#92400e', marginBottom: '1rem' }}>
              You must change your password before continuing.
            </div>
          )}
          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Current Password</label>
                <input className="input" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>New Password</label>
                <input className="input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Confirm New Password</label>
                <input className="input" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ justifySelf: 'start' }}>
                {saving ? 'Saving...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
