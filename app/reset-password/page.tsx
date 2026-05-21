'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) setError('Missing reset token. Please use the link from your email.');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed');
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#059669', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Password reset successfully.
        </div>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            background: '#0054A6',
            color: 'white',
            padding: '0.65rem 2rem',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          Sign In
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4, fontWeight: 500 }}>
          New Password
        </label>
        <PasswordInput value={password} onChange={setPassword} placeholder="Min 6 characters" required />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4, fontWeight: 500 }}>
          Confirm Password
        </label>
        <PasswordInput value={confirm} onChange={setConfirm} placeholder="Re-enter password" required />
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading || !token}
        style={{ width: '100%', justifyContent: 'center', padding: '0.65rem', fontSize: '0.9rem' }}
      >
        {loading ? 'Resetting...' : 'Reset Password'}
      </button>

      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <a href="/login" style={{ color: '#0054A6', fontSize: '0.8rem', textDecoration: 'none' }}>
          Back to Sign In
        </a>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: 'url(/haier-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0054A6',
        padding: '1rem',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(0,84,166,0.85) 0%, rgba(26,26,46,0.9) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 16,
          padding: '2.5rem 2rem',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/haier-logo-blue.png"
            alt="Haier"
            style={{ height: 48, objectFit: 'contain', marginBottom: 12 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 style={{ fontSize: '1.1rem', color: '#374151', margin: 0, fontWeight: 600 }}>
            Reset Password
          </h1>
        </div>

        <Suspense fallback={<div style={{ textAlign: 'center', color: '#6b7280', padding: '1rem' }}>Loading...</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
