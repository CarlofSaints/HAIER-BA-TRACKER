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
  requestBody?: string;
}

interface TestResult {
  ok?: boolean;
  error?: string;
  detail?: string;
  totalRows?: number;
  responseKeys?: string[];
  sample?: Record<string, unknown>[];
  rawTopLevelKeys?: string[];
  meta?: Record<string, unknown>;
  sentBody?: Record<string, unknown>;
}

const DEFAULT_BODY = JSON.stringify({
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  channels: [],
  stores: [],
  provinces: [],
  users: [],
  tags: [],
  customers: [],
  userStatus: ['ACTIVE', 'INACTIVE'],
  userAccess: ['ENABLED', 'SUSPENDED'],
  userTags: [],
  includeDataUsage: 'YES',
  includeNotificationData: 'NO',
  includeTravelDistance: 'YES',
  includeRecessData: 'NO',
  earlyCheckoutTime: '16:50',
  lateCheckinTime: '09:10',
}, null, 2);

export default function SettingsPage() {
  const { session, loading: authLoading, logout } = useAuth('super_admin');
  const [config, setConfig] = useState<PerigeeConfig | null>(null);
  const [form, setForm] = useState({ apiKey: '', endpoint: '', enabled: false });
  const [requestBody, setRequestBody] = useState(DEFAULT_BODY);
  const [bodyError, setBodyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (!session) return;
    authFetch('/api/config/perigee')
      .then(r => r.json())
      .then(data => {
        setConfig(data);
        setForm({ apiKey: '', endpoint: data.endpoint || '', enabled: data.enabled || false });
        if (data.requestBody) setRequestBody(data.requestBody);
      })
      .catch(() => {});
  }, [session]);

  // Validate JSON as user types
  function handleBodyChange(val: string) {
    setRequestBody(val);
    try {
      JSON.parse(val);
      setBodyError('');
    } catch (e) {
      setBodyError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Validate JSON before saving
      try { JSON.parse(requestBody); } catch {
        setToast({ msg: 'Fix the JSON errors before saving', type: 'error' });
        setSaving(false);
        return;
      }

      const body: Record<string, unknown> = {
        endpoint: form.endpoint,
        enabled: form.enabled,
        requestBody,
      };
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

  async function callPoll(mode: 'test' | 'import') {
    // Validate JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(requestBody);
    } catch {
      setToast({ msg: 'Fix the JSON errors first', type: 'error' });
      return;
    }

    if (!parsed.startDate) {
      setToast({ msg: 'startDate is required in the request body', type: 'error' });
      return;
    }

    if (mode === 'test') {
      setTesting(true);
      setTestResult(null);
    } else {
      if (!confirm(`Import visits from ${parsed.startDate}? This will create a new upload batch.`)) return;
      setImporting(true);
    }

    try {
      const res = await authFetch('/api/perigee/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, mode }),
      });
      const data = await res.json();

      if (mode === 'test') {
        setTestResult(data);
        setToast({ msg: data.ok ? `Test OK — ${data.totalRows} visits returned` : (data.error || 'Test failed'), type: data.ok ? 'success' : 'error' });
      } else {
        setToast({ msg: data.ok ? `Imported ${data.importedRows} visits` : (data.error || 'Import failed'), type: data.ok ? 'success' : 'error' });
      }
    } catch {
      setToast({ msg: `${mode === 'test' ? 'Connection' : 'Import'} failed`, type: 'error' });
    } finally {
      setTesting(false);
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
            Perigee API Connection
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Endpoint and authentication
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
            </div>

            {config?.lastPolledAt && (
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Last polled: {new Date(config.lastPolledAt).toLocaleString('en-ZA')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Request Body + Fetch */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 620, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
            Request Body
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            JSON body sent to Perigee — edit filters, dates, and options below
          </p>

          <textarea
            className="input"
            value={requestBody}
            onChange={e => handleBodyChange(e.target.value)}
            rows={20}
            style={{ fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.5, resize: 'vertical' }}
            spellCheck={false}
          />
          {bodyError && (
            <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: 4 }}>
              {bodyError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-outline" onClick={() => callPoll('test')} disabled={testing || !!bodyError}>
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button className="btn btn-primary" onClick={() => callPoll('import')} disabled={importing || !!bodyError}>
              {importing ? 'Importing...' : 'Import Visits'}
            </button>
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
                  {testResult.meta && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: '#374151' }}>Perigee response metadata</summary>
                      <pre style={{ marginTop: 4, overflow: 'auto', maxHeight: 200, fontSize: '0.7rem', background: '#f9fafb', padding: 8, borderRadius: 4 }}>
                        {JSON.stringify(testResult.meta, null, 2)}
                      </pre>
                    </details>
                  )}
                  {testResult.sentBody && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: '#374151' }}>Request body sent to Perigee</summary>
                      <pre style={{ marginTop: 4, overflow: 'auto', maxHeight: 200, fontSize: '0.7rem', background: '#f9fafb', padding: 8, borderRadius: 4 }}>
                        {JSON.stringify(testResult.sentBody, null, 2)}
                      </pre>
                    </details>
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
