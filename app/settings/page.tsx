'use client';

import { useState, useEffect } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';

interface PerigeeConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  lastPolledAt: string | null;
}

export default function SettingsPage() {
  const { session, loading: authLoading, logout } = useAuth('super_admin');
  const [config, setConfig] = useState<PerigeeConfig | null>(null);
  const [form, setForm] = useState({ apiKey: '', endpoint: '', enabled: false });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (!session) return;
    authFetch('/api/config/perigee')
      .then(r => r.json())
      .then(data => {
        setConfig(data);
        setForm({ apiKey: '', endpoint: data.endpoint || '', enabled: data.enabled || false });
      })
      .catch(() => {});
  }, [session]);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { endpoint: form.endpoint, enabled: form.enabled };
      if (form.apiKey) body.apiKey = form.apiKey;

      const res = await authFetch('/api/config/perigee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast({ msg: 'Settings saved', type: 'success' });
        setForm(f => ({ ...f, apiKey: '' }));
        // Reload config
        const r2 = await authFetch('/api/config/perigee');
        setConfig(await r2.json());
      } else {
        setToast({ msg: 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPoll() {
    try {
      const res = await authFetch('/api/perigee/poll', { method: 'POST' });
      const data = await res.json();
      setToast({ msg: data.message || 'Response received', type: 'info' });
    } catch {
      setToast({ msg: 'Poll failed', type: 'error' });
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
          Settings
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '2rem' }}>
          System configuration (Super Admin only)
        </p>

        {/* Perigee API Config */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 560 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
            Perigee API Configuration
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Configure automatic visit data polling from Perigee (coming soon)
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>API Endpoint</label>
              <input
                className="input"
                value={form.endpoint}
                onChange={e => setForm({ ...form, endpoint: e.target.value })}
                placeholder="https://api.perigee.co.za/v1/visits"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                API Key {config?.apiKey && <span style={{ color: '#9ca3af' }}>(current: {config.apiKey})</span>}
              </label>
              <input
                className="input"
                type="password"
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                placeholder="Leave blank to keep current key"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled}
                onChange={e => setForm({ ...form, enabled: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              <label htmlFor="enabled" style={{ fontSize: '0.85rem', color: '#374151' }}>
                Enable automatic polling
              </label>
            </div>

            {config?.lastPolledAt && (
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Last polled: {new Date(config.lastPolledAt).toLocaleString('en-ZA')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              <button className="btn btn-outline" onClick={handleTestPoll} disabled={!form.endpoint}>
                Test Connection
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: 8, fontSize: '0.8rem', color: '#6b7280' }}>
            Automatic polling is not yet implemented. Use the Upload page to manually import visit data from Perigee Excel exports.
          </div>
        </div>
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
