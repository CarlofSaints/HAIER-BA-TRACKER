'use client';

import { useState, useEffect } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface PollSlot {
  id: string;
  time: string;
  type: 'short' | 'long';
  enabled: boolean;
}

interface PollSchedule {
  slots: PollSlot[];
  timezone: string;
}

interface PerigeeConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  lastPolledAt: string | null;
  requestBody?: string;
}

interface CronLogEntry {
  timestamp: string;
  matched: boolean;
  slotTime?: string;
  slotType?: string;
  result?: string;
  imported?: number;
  skipped?: number;
  error?: string;
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
  const [schedule, setSchedule] = useState<PollSchedule>({ slots: [], timezone: 'Africa/Johannesburg' });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scoringThresholds, setScoringThresholds] = useState({ lateCheckinTime: '09:10', earlyCheckoutTime: '16:50' });
  const [savingScoring, setSavingScoring] = useState(false);
  const [cronLogs, setCronLogs] = useState<CronLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [testingCron, setTestingCron] = useState(false);

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
    authFetch('/api/config/perigee-schedule')
      .then(r => r.json())
      .then(data => { if (data.slots) setSchedule(data); })
      .catch(() => {});
    authFetch('/api/config/scoring')
      .then(r => r.json())
      .then(data => { if (data.lateCheckinTime) setScoringThresholds(data); })
      .catch(() => {});
    loadCronLogs();
  }, [session]);

  function loadCronLogs() {
    setLoadingLogs(true);
    authFetch('/api/cron/logs')
      .then(r => r.json())
      .then(data => { if (data.logs) setCronLogs(data.logs); })
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }

  async function testCronNow() {
    setTestingCron(true);
    try {
      const res = await authFetch('/api/cron/poll-visits');
      const data = await res.json();
      setToast({
        msg: data.ok
          ? `Cron test: ${data.action} — imported: ${data.imported ?? 0}, skipped: ${data.skipped ?? 0}${data.reason ? ` (${data.reason})` : ''}`
          : `Cron error: ${data.error || 'Unknown'}`,
        type: data.ok ? (data.imported > 0 ? 'success' : 'info') : 'error',
      });
      loadCronLogs();
    } catch {
      setToast({ msg: 'Failed to trigger cron', type: 'error' });
    } finally {
      setTestingCron(false);
    }
  }

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

  function addPollSlot() {
    setSchedule(s => ({
      ...s,
      slots: [...s.slots, { id: crypto.randomUUID(), time: '08:00', type: 'short', enabled: true }],
    }));
  }

  function updateSlot(id: string, field: keyof PollSlot, value: string | boolean) {
    setSchedule(s => ({
      ...s,
      slots: s.slots.map(sl => sl.id === id ? { ...sl, [field]: value } : sl),
    }));
  }

  function removeSlot(id: string) {
    setSchedule(s => ({ ...s, slots: s.slots.filter(sl => sl.id !== id) }));
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    try {
      const res = await authFetch('/api/config/perigee-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
      });
      if (res.ok) {
        setToast({ msg: 'Poll schedule saved', type: 'success' });
      } else {
        setToast({ msg: 'Failed to save schedule', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed to save schedule', type: 'error' });
    } finally {
      setSavingSchedule(false);
    }
  }

  async function saveScoring() {
    setSavingScoring(true);
    try {
      const res = await authFetch('/api/config/scoring', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scoringThresholds),
      });
      if (res.ok) {
        setToast({ msg: 'Scoring thresholds saved', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ msg: data.error || 'Failed to save', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed to save scoring thresholds', type: 'error' });
    } finally {
      setSavingScoring(false);
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

        {/* Scoring Thresholds */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 620, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
            Scoring Thresholds
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Check-in on Time KPI: score = max(0, onTime% &times; 10 &minus; earlyCheckout% &times; 10)
          </p>

          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                Late Check-in After
              </label>
              <input
                className="input"
                type="time"
                value={scoringThresholds.lateCheckinTime}
                onChange={e => setScoringThresholds(s => ({ ...s, lateCheckinTime: e.target.value }))}
              />
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
                Check-in after this time = late
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                Early Check-out Before
              </label>
              <input
                className="input"
                type="time"
                value={scoringThresholds.earlyCheckoutTime}
                onChange={e => setScoringThresholds(s => ({ ...s, earlyCheckoutTime: e.target.value }))}
              />
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
                Check-out before this time = early
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={saveScoring} disabled={savingScoring}>
              {savingScoring ? 'Saving...' : 'Save Thresholds'}
            </button>
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
        {/* Polling Schedule */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 620, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
            Polling Schedule
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Configure automated polling times (SAST). Cron runs every 30 minutes and fires on matching slots.
          </p>

          {schedule.slots.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '0.8rem', fontStyle: 'italic' }}>No poll slots configured.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {schedule.slots.map(slot => (
                <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: '#f9fafb', borderRadius: 8 }}>
                  <input
                    type="time"
                    value={slot.time}
                    onChange={e => updateSlot(slot.id, 'time', e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                  />
                  <select
                    value={slot.type}
                    onChange={e => updateSlot(slot.id, 'type', e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                  >
                    <option value="short">Short (today only)</option>
                    <option value="long">Long (last 7 days)</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={e => updateSlot(slot.id, 'enabled', e.target.checked)}
                    />
                    Enabled
                  </label>
                  <button
                    onClick={() => removeSlot(slot.id)}
                    style={{ marginLeft: 'auto', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 8px' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button className="btn btn-outline" onClick={addPollSlot}>
              + Add Poll Slot
            </button>
            <button className="btn btn-primary" onClick={saveSchedule} disabled={savingSchedule}>
              {savingSchedule ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>

        {/* Cron Activity Log */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 620, marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                Cron Activity Log
              </h2>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
                Recent automated polling attempts
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" onClick={loadCronLogs} disabled={loadingLogs} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                {loadingLogs ? 'Loading...' : 'Refresh'}
              </button>
              <button className="btn btn-primary" onClick={testCronNow} disabled={testingCron} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                {testingCron ? 'Running...' : 'Test Cron Now'}
              </button>
            </div>
          </div>

          {cronLogs.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '0.8rem', fontStyle: 'italic' }}>
              {loadingLogs ? 'Loading logs...' : 'No cron activity recorded yet. The cron may not have run, or logs are empty.'}
            </p>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Time (SAST)</th>
                    <th style={{ padding: '6px 8px' }}>Matched</th>
                    <th style={{ padding: '6px 8px' }}>Slot</th>
                    <th style={{ padding: '6px 8px' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {cronLogs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: log.error ? '#fef2f2' : log.imported && log.imported > 0 ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ color: log.matched ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                          {log.matched ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {log.slotTime ? `${log.slotTime} (${log.slotType})` : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', color: log.error ? '#dc2626' : '#374151' }}>
                        {log.error
                          ? log.error.slice(0, 60)
                          : log.imported !== undefined
                            ? `+${log.imported} imported, ${log.skipped ?? 0} skipped`
                            : log.result || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Footer />
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
