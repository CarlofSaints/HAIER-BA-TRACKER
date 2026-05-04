'use client';

import { useState, useEffect } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface PerigeeConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  lastPolledAt: string | null;
}

interface TestResult {
  ok?: boolean;
  error?: string;
  detail?: string;
  totalRows?: number;
  responseKeys?: string[];
  sample?: Record<string, unknown>[];
  rawTopLevelKeys?: string[];
}

export default function SettingsPage() {
  const { session, loading: authLoading, logout } = useAuth('super_admin');
  const [config, setConfig] = useState<PerigeeConfig | null>(null);
  const [form, setForm] = useState({ apiKey: '', endpoint: '', enabled: false });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testDate, setTestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
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
    setTesting(true);
    setTestResult(null);
    try {
      const reqBody: Record<string, string> = { startDate: testDate, mode: 'test' };
      if (endDate) reqBody.endDate = endDate;

      const res = await authFetch('/api/perigee/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        setToast({ msg: `Test OK — ${data.totalRows} visits returned`, type: 'success' });
      } else {
        setToast({ msg: data.error || 'Test failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Connection failed', type: 'error' });
    } finally {
      setTesting(false);
    }
  }

  async function handleImport() {
    if (!confirm(`Import visits from ${testDate}${endDate ? ` to ${endDate}` : ''}? This will create a new upload batch.`)) return;
    setImporting(true);
    try {
      const reqBody: Record<string, string> = { startDate: testDate, mode: 'import' };
      if (endDate) reqBody.endDate = endDate;

      const res = await authFetch('/api/perigee/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ msg: `Imported ${data.importedRows} visits`, type: 'success' });
      } else {
        setToast({ msg: data.error || 'Import failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Import failed', type: 'error' });
    } finally {
      setImporting(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Settings
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '2rem' }}>
          System configuration (Super Admin only)
        </p>

        {/* Perigee API Config */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 620 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
            Perigee API Configuration
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Connect to the Perigee Portal to pull visit data via API
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>API Endpoint</label>
              <input
                className="input"
                value={form.endpoint}
                onChange={e => setForm({ ...form, endpoint: e.target.value })}
                placeholder="https://live.perigeeportal.co.za/api/visits"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                Bearer Token {config?.apiKey && <span style={{ color: '#9ca3af' }}>(current: {config.apiKey})</span>}
              </label>
              <input
                className="input"
                type="password"
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                placeholder="Leave blank to keep current token"
              />
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
                Format: user_XX.abc123... (from Perigee Portal)
              </p>
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
            </div>
          </div>
        </div>

        {/* Test / Import Section */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 620, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
            Fetch Visits
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Test the connection or import visits from Perigee
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Start Date</label>
                <input
                  className="input"
                  type="date"
                  value={testDate}
                  onChange={e => setTestDate(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>End Date (optional)</label>
                <input
                  className="input"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" onClick={handleTestPoll} disabled={testing || !testDate}>
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing || !testDate}>
                {importing ? 'Importing...' : 'Import Visits'}
              </button>
            </div>
          </div>

          {/* Test Results */}
          {testResult && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: testResult.ok ? '#f0fdf4' : '#fef2f2', borderRadius: 8, fontSize: '0.8rem', border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}` }}>
              {testResult.ok ? (
                <>
                  <div style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>
                    Connection successful — {testResult.totalRows} visits returned
                  </div>
                  {testResult.responseKeys && testResult.responseKeys.length > 0 && (
                    <div style={{ color: '#374151', marginBottom: 4 }}>
                      <strong>Response fields:</strong> {testResult.responseKeys.join(', ')}
                    </div>
                  )}
                  {testResult.rawTopLevelKeys && (
                    <div style={{ color: '#6b7280', marginBottom: 4 }}>
                      <strong>Top-level keys:</strong> {testResult.rawTopLevelKeys.join(', ')}
                    </div>
                  )}
                  {testResult.sample && testResult.sample.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: '#374151' }}>Sample data ({testResult.sample.length} rows)</summary>
                      <pre style={{ marginTop: 4, overflow: 'auto', maxHeight: 200, fontSize: '0.7rem', background: '#f9fafb', padding: 8, borderRadius: 4 }}>
                        {JSON.stringify(testResult.sample, null, 2)}
                      </pre>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>
                    {testResult.error}
                  </div>
                  {testResult.detail && (
                    <pre style={{ overflow: 'auto', maxHeight: 150, fontSize: '0.7rem', color: '#6b7280' }}>
                      {testResult.detail}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <Footer />
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
