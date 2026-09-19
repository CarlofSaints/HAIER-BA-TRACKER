'use client';

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

const HAIER_BLUE = '#0054A6';

interface Schedule {
  enabled: boolean;
  hours: number[];
  days: number[];
  timezone: string;
}

// Display order Mon→Sun, but stored values use JS getDay() (0=Sun).
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

interface Sales7Email {
  enabled: boolean;
  to: string[];
  cc: string[];
  lastSentDataDate: string;
  lastSentAt: string;
  lastSentTo: string[];
  lastError: string;
  lastErrorAt: string;
}

/** "2026-09-17" → "Thu 17 Sep 2026" */
function fmtDataDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function fmtDateTime(iso?: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SamsSchedulePage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [sched, setSched] = useState<Schedule>({ enabled: true, hours: [5], days: [0, 1, 2, 3, 4, 5, 6], timezone: 'Africa/Johannesburg' });
  const [lastAutoSync, setLastAutoSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [mail, setMail] = useState<Sales7Email | null>(null);
  const [mailTo, setMailTo] = useState('');
  const [mailCc, setMailCc] = useState('');
  const [mailBusy, setMailBusy] = useState<'' | 'save' | 'test' | 'send'>('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(() => {
    authFetch('/api/config/sams-schedule')
      .then(r => r.json())
      .then(d => {
        if (d.schedule) setSched(d.schedule);
        setLastAutoSync(d.lastAutoSync ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadMail = useCallback(() => {
    authFetch('/api/config/sales-7-days-email')
      .then(r => r.json())
      .then(d => {
        if (!d.config) return;
        setMail(d.config);
        setMailTo(d.config.to.join(', '));
        setMailCc(d.config.cc.join(', '));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { if (session) { load(); loadMail(); } }, [session, load, loadMail]);

  async function saveMail(enabled: boolean) {
    setMailBusy('save');
    try {
      const res = await authFetch('/api/config/sales-7-days-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, to: mailTo, cc: mailCc }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Save failed');
      setMail(d.config);
      setMailTo(d.config.to.join(', '));
      setMailCc(d.config.cc.join(', '));
      setToast({ msg: 'Email settings saved', type: 'success' });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Save failed', type: 'error' });
    } finally {
      setMailBusy('');
    }
  }

  async function sendMail(mode: 'test' | 'send') {
    if (mode === 'send' && !confirm(`Email the report to ${mail?.to.join(', ')} now?`)) return;
    setMailBusy(mode);
    try {
      const res = await authFetch('/api/reports/sales-7-days-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const { result } = await res.json();
      if (result?.action !== 'sent') throw new Error(result?.error || result?.reason || 'Send failed');
      setToast({ msg: `Sent to ${result.to.join(', ')} (data up to ${fmtDataDay(result.dataDate)})`, type: 'success' });
      loadMail();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Send failed', type: 'error' });
    } finally {
      setMailBusy('');
    }
  }

  function toggleDay(v: number) {
    setSched(s => ({ ...s, days: s.days.includes(v) ? s.days.filter(d => d !== v) : [...s.days, v].sort((a, b) => a - b) }));
  }
  function toggleHour(h: number) {
    setSched(s => ({ ...s, hours: s.hours.includes(h) ? s.hours.filter(x => x !== h) : [...s.hours, h].sort((a, b) => a - b) }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await authFetch('/api/config/sams-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sched),
      });
      const d = await res.json();
      if (res.ok) {
        if (d.schedule) setSched(d.schedule);
        setToast({ msg: 'Schedule saved', type: 'success' });
      } else {
        setToast({ msg: d.error || 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await authFetch('/api/sams/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || 'Sync failed');
      const c = d.meta?.counts;
      setToast({ msg: c ? `Synced — ${c.stores} stores, ${c.salesRows} sales cells.` : 'Sync complete.', type: 'success' });
      load();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Sync failed', type: 'error' });
    } finally {
      setRunning(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const summary = !sched.enabled
    ? 'Automatic sync is OFF.'
    : (sched.hours.length && sched.days.length)
      ? `Runs at ${sched.hours.map(hh).join(', ')} on ${DAYS.filter(d => sched.days.includes(d.value)).map(d => d.label).join(', ')} (SAST).`
      : 'Pick at least one time and one day.';

  const chip = (active: boolean): CSSProperties => ({
    padding: '0.4rem 0.7rem', borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer',
    border: `1px solid ${active ? HAIER_BLUE : '#d1d5db'}`,
    background: active ? HAIER_BLUE : '#fff', color: active ? '#fff' : '#374151',
    fontWeight: active ? 600 : 400, userSelect: 'none',
  });

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>Sync Schedule</h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: 640 }}>
          When the automatic <a href="/sams-sync" style={{ color: HAIER_BLUE, fontWeight: 600 }}>SAMS data sync</a> runs.
          A background job checks every hour and syncs at the times you pick — all SAMS-marked channels, no redeploy
          needed. Times are South African (SAST).
        </p>

        {loading ? (
          <div style={{ color: '#6b7280', padding: '2rem' }}>Loading…</div>
        ) : (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Enabled */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#111827' }}>Automatic sync</div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>{summary}</div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={sched.enabled} onChange={e => setSched(s => ({ ...s, enabled: e.target.checked }))} style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: sched.enabled ? '#16a34a' : '#6b7280' }}>{sched.enabled ? 'On' : 'Off'}</span>
              </label>
            </div>

            {/* Times */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem 1.25rem', opacity: sched.enabled ? 1 : 0.55 }}>
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.15rem' }}>Time(s) of day</div>
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.75rem' }}>Runs at the top of each selected hour.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '0.4rem' }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} onClick={() => sched.enabled && toggleHour(h)} style={chip(sched.hours.includes(h))}>{hh(h)}</div>
                ))}
              </div>
            </div>

            {/* Days */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem 1.25rem', opacity: sched.enabled ? 1 : 0.55 }}>
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>Days of the week</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {DAYS.map(d => (
                  <div key={d.value} onClick={() => sched.enabled && toggleDay(d.value)} style={chip(sched.days.includes(d.value))}>{d.label}</div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={save} disabled={saving} style={{ background: saving ? '#9ca3af' : HAIER_BLUE, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.4rem', fontSize: '0.88rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save schedule'}
              </button>
              <button onClick={runNow} disabled={running} title="Run a full SAMS sync right now (ignores the schedule)" style={{ background: 'none', color: HAIER_BLUE, border: `1px solid ${HAIER_BLUE}`, borderRadius: 8, padding: '0.6rem 1.2rem', fontSize: '0.88rem', fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1 }}>
                {running ? 'Syncing…' : 'Run a sync now'}
              </button>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Last automatic sync: {fmtDateTime(lastAutoSync)}</span>
            </div>

            {/* Daily Sales: Last 7 Days email */}
            {mail && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem 1.25rem', marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#111827' }}>Daily email: Sales, Last 7 Days</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                      Emails the <a href="/sales-7-days" style={{ color: HAIER_BLUE }}>Sales: Last 7 Days</a> report (Excel: By Store, By SKU,
                      By SKU and Store) once each time a new day of SAMS data arrives. Checked every hour.
                    </div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={mail.enabled} disabled={mailBusy !== ''} onChange={e => saveMail(e.target.checked)} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: mail.enabled ? '#16a34a' : '#6b7280' }}>{mail.enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: '0.5rem 0.75rem', alignItems: 'center', marginTop: '0.9rem' }}>
                  <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>To</label>
                  <input className="input" value={mailTo} onChange={e => setMailTo(e.target.value)} placeholder="name@haier.com, other@haier.com" />
                  <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>CC</label>
                  <input className="input" value={mailCc} onChange={e => setMailCc(e.target.value)} placeholder="Optional" />
                </div>

                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.75rem', lineHeight: 1.5 }}>
                  {mail.lastSentDataDate
                    ? <>Last sent for data up to <b>{fmtDataDay(mail.lastSentDataDate)}</b>{mail.lastSentAt ? `, on ${fmtDateTime(mail.lastSentAt)}` : ''}. The next one goes out when data for a later day arrives.</>
                    : <>Nothing sent yet. {mail.enabled ? 'The next hourly check sends the current report.' : 'Once switched on, the next hourly check sends the current report.'}</>}
                  {mail.lastError && (
                    <div style={{ color: '#b91c1c', marginTop: 4 }}>Last attempt failed ({fmtDateTime(mail.lastErrorAt)}): {mail.lastError}. It retries every hour.</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
                  <button onClick={() => saveMail(mail.enabled)} disabled={mailBusy !== ''} style={{ background: HAIER_BLUE, color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: mailBusy ? 0.6 : 1 }}>
                    {mailBusy === 'save' ? 'Saving…' : 'Save recipients'}
                  </button>
                  <button onClick={() => sendMail('test')} disabled={mailBusy !== ''} title="Sends the current report to you only. Does not count as the day's send." style={{ background: 'none', color: HAIER_BLUE, border: `1px solid ${HAIER_BLUE}`, borderRadius: 8, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: mailBusy ? 0.6 : 1 }}>
                    {mailBusy === 'test' ? 'Sending…' : 'Send a test to me'}
                  </button>
                  <button onClick={() => sendMail('send')} disabled={mailBusy !== '' || mail.to.length === 0} title="Sends to the saved recipients now and marks this day as sent" style={{ background: 'none', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: mailBusy ? 0.6 : 1 }}>
                    {mailBusy === 'send' ? 'Sending…' : 'Send to recipients now'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
