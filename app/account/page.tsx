'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import PasswordInput from '@/components/PasswordInput';
import Footer from '@/components/Footer';

export default function AccountPage() {
  const { session, loading: authLoading, logout, setSession } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Profile fields
  const [email, setEmail] = useState('');
  const [cellNumber, setCellNumber] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Avatar
  const [avatarKey, setAvatarKey] = useState(Date.now());
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Init profile fields from session
  useEffect(() => {
    if (session) {
      setEmail(session.email);
      setCellNumber(session.cellNumber || '');
    }
  }, [session]);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setToast({ msg: 'Image too large (max 2MB)', type: 'error' });
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await authFetch('/api/account/avatar', { method: 'POST', body: fd });
      if (res.ok) {
        setAvatarKey(Date.now());
        setToast({ msg: 'Profile picture updated', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ msg: data.error || 'Upload failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Upload failed', type: 'error' });
    } finally {
      setAvatarUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  async function handleProfileSave() {
    if (!email.trim()) {
      setToast({ msg: 'Email is required', type: 'error' });
      return;
    }
    setProfileSaving(true);
    try {
      const res = await authFetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), cellNumber: cellNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Save failed', type: 'error' });
      } else {
        setToast({ msg: 'Profile updated', type: 'success' });
        // Update local session
        if (session) {
          const updated = { ...session, email: data.email, cellNumber: data.cellNumber };
          localStorage.setItem('haier_session', JSON.stringify(updated));
          setSession(updated);
        }
      }
    } catch {
      setToast({ msg: 'Failed', type: 'error' });
    } finally {
      setProfileSaving(false);
    }
  }

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

  const initials = `${session.name?.[0] || ''}${session.surname?.[0] || ''}`.toUpperCase();

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>Account</h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '2rem' }}>Manage your profile and password</p>

        {/* Profile Card */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', marginBottom: '2rem', maxWidth: 500 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: '#374151' }}>Profile</h2>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#0054A6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <img
                key={avatarKey}
                src={`/api/account/avatar/${session.id}?v=${avatarKey}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    const span = parent.querySelector('span');
                    if (span) span.style.display = 'flex';
                  }
                }}
              />
              <span
                style={{
                  display: 'none',
                  color: 'white',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  position: 'absolute',
                  alignItems: 'center',
                  justifyContent: 'center',
                  inset: 0,
                }}
              >
                {initials}
              </span>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>{session.name} {session.surname}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', textTransform: 'capitalize', marginBottom: 8 }}>{session.role.replace('_', ' ')}</div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
              <button
                className="btn btn-outline"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? 'Uploading...' : 'Change Photo'}
              </button>
            </div>
          </div>

          {/* Editable fields */}
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Cell Number</label>
              <input className="input" type="tel" value={cellNumber} onChange={e => setCellNumber(e.target.value)} placeholder="e.g. 082 123 4567" />
            </div>
            <button
              className="btn btn-primary"
              style={{ justifySelf: 'start' }}
              onClick={handleProfileSave}
              disabled={profileSaving}
            >
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Change Password */}
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
                <PasswordInput value={currentPw} onChange={setCurrentPw} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>New Password</label>
                <PasswordInput value={newPw} onChange={setNewPw} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Confirm New Password</label>
                <PasswordInput value={confirmPw} onChange={setConfirmPw} required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ justifySelf: 'start' }}>
                {saving ? 'Saving...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
