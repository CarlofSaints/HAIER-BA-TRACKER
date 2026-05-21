'use client';

import { useState } from 'react';
import PasswordInput from '@/components/PasswordInput';

const SESSION_KEY = 'haier_session';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotMsg('');
    setForgotLoading(true);
    try {
      await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotMsg('If that email exists, a reset link has been sent. Check your inbox.');
    } catch {
      setForgotMsg('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      window.location.href = data.forcePasswordChange ? '/account?change-password=1' : '/dashboard';
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

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
      {/* Dark overlay */}
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
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <h1 style={{ fontSize: '1.1rem', color: '#374151', margin: 0, fontWeight: 600 }}>
            BA Measurement
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '4px 0 0' }}>
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4, fontWeight: 500 }}>
              Email
            </label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@company.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4, fontWeight: 500 }}>
              Password
            </label>
            <PasswordInput value={password} onChange={setPassword} placeholder="Enter password" required />
          </div>

          {error && (
            <div style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '0.65rem', fontSize: '0.9rem' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button
            onClick={() => { setShowForgot(!showForgot); setForgotMsg(''); }}
            style={{ background: 'none', border: 'none', color: '#0054A6', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Forgot My Password?
          </button>
        </div>

        {showForgot && (
          <form onSubmit={handleForgot} style={{ marginTop: '1rem', padding: '1rem', background: '#f3f4f6', borderRadius: 8 }}>
            <p style={{ fontSize: '0.8rem', color: '#374151', margin: '0 0 0.75rem' }}>
              Enter your email and we&apos;ll send you a reset link.
            </p>
            <input
              className="input"
              type="email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              required
              placeholder="you@company.com"
              style={{ marginBottom: '0.75rem' }}
            />
            {forgotMsg && (
              <div style={{ fontSize: '0.8rem', color: forgotMsg.includes('error') ? '#dc2626' : '#059669', marginBottom: '0.75rem' }}>
                {forgotMsg}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={forgotLoading}
              style={{ width: '100%', justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem' }}
            >
              {forgotLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
