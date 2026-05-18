'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';
import dynamic from 'next/dynamic';
import RecurrenceBuilder from '@/components/RecurrenceBuilder';
import MultiUserSelect from '@/components/MultiUserSelect';
import type { EmailReminder, RecurrenceRule } from '@/lib/reminderData';
import { describeRecurrence } from '@/lib/reminderData';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false });

interface UserOption {
  id: string;
  name: string;
  surname: string;
  email: string;
}

const DEFAULT_RULE: RecurrenceRule = { type: 'weekly', time: '09:00', daysOfWeek: [1] };

interface ReminderForm {
  name: string;
  subject: string;
  body: string;
  to: string[];
  cc: string[];
  bcc: string[];
  recurrence: RecurrenceRule;
  startDate: string;
  endDate: string;
  enabled: boolean;
}

const emptyForm = (): ReminderForm => ({
  name: '',
  subject: '',
  body: '',
  to: [],
  cc: [],
  bcc: [],
  recurrence: { ...DEFAULT_RULE },
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  enabled: true,
});

export default function RemindersPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [reminders, setReminders] = useState<EmailReminder[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editReminder, setEditReminder] = useState<EmailReminder | null>(null);
  const [form, setForm] = useState<ReminderForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [remRes, usrRes] = await Promise.all([
        authFetch('/api/reminders'),
        authFetch('/api/users'),
      ]);
      if (remRes.ok) setReminders(await remRes.json());
      if (usrRes.ok) setUsers(await usrRes.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  function openCreate() {
    setEditReminder(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(r: EmailReminder) {
    setEditReminder(r);
    setForm({
      name: r.name,
      subject: r.subject,
      body: r.body,
      to: r.to,
      cc: r.cc,
      bcc: r.bcc,
      recurrence: { ...r.recurrence },
      startDate: r.startDate,
      endDate: r.endDate || '',
      enabled: r.enabled,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || !form.subject || !form.body || form.to.length === 0) {
      setToast({ msg: 'Name, subject, body, and at least one TO recipient are required', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        subject: form.subject,
        body: form.body,
        to: form.to,
        cc: form.cc,
        bcc: form.bcc,
        recurrence: form.recurrence,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        enabled: form.enabled,
      };

      const url = editReminder ? `/api/reminders/${editReminder.id}` : '/api/reminders';
      const method = editReminder ? 'PUT' : 'POST';
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (res.ok) {
        setToast({ msg: editReminder ? 'Reminder updated' : 'Reminder created', type: 'success' });
        setShowModal(false);
        loadData();
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        setToast({ msg: err.error || 'Failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Network error', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: EmailReminder) {
    if (!confirm(`Delete reminder "${r.name}"?`)) return;
    try {
      const res = await authFetch(`/api/reminders/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ msg: 'Reminder deleted', type: 'success' });
        loadData();
      }
    } catch {
      setToast({ msg: 'Delete failed', type: 'error' });
    }
  }

  async function handleToggle(r: EmailReminder) {
    try {
      const res = await authFetch(`/api/reminders/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !r.enabled }),
      });
      if (res.ok) loadData();
    } catch { /* ignore */ }
  }

  function recipientCount(r: EmailReminder): number {
    return r.to.length + r.cc.length + r.bcc.length;
  }

  function formatDt(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'short', timeStyle: 'short' });
  }

  if (authLoading || !session) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', marginLeft: 240 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', margin: 0 }}>Email Reminders</h1>
              <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0 0' }}>Schedule recurring email notifications to users</p>
            </div>
            <button
              onClick={openCreate}
              style={{
                padding: '0.5rem 1rem',
                background: '#0054A6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              + New Reminder
            </button>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {reminders.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                No reminders yet. Click &quot;+ New Reminder&quot; to create one.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Schedule</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Recipients</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Enabled</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Last Sent</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Next Due</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminders.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.name}</td>
                        <td style={{ padding: '10px 12px', color: '#6b7280' }}>{describeRecurrence(r.recurrence)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{recipientCount(r)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleToggle(r)}
                            style={{
                              background: r.enabled ? '#059669' : '#d1d5db',
                              border: 'none',
                              borderRadius: 12,
                              width: 40,
                              height: 22,
                              cursor: 'pointer',
                              position: 'relative',
                              transition: 'background 0.2s',
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                top: 2,
                                left: r.enabled ? 20 : 2,
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                background: '#fff',
                                transition: 'left 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }}
                            />
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: '0.8rem' }}>{formatDt(r.lastSentAt)}</td>
                        <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: '0.8rem' }}>{formatDt(r.nextDueAt)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              onClick={() => openEdit(r)}
                              style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(r)}
                              style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: 4, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <Footer />
      </main>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '3rem 1rem',
            overflowY: 'auto',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 680,
              padding: '1.5rem',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            }}
          >
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1.25rem', color: '#1f2937' }}>
              {editReminder ? 'Edit Reminder' : 'New Reminder'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Name */}
              <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Reminder Name
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Weekly Sales Data Reminder"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.45rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
                />
              </label>

              {/* Subject */}
              <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Email Subject
                <input
                  type="text"
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                  placeholder="e.g. Reminder: Please upload your sales data"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.45rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
                />
              </label>

              {/* Body */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 4 }}>Email Body</div>
                <RichTextEditor value={form.body} onChange={body => setForm(prev => ({ ...prev, body }))} />
              </div>

              {/* Recipients */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <MultiUserSelect users={users} selected={form.to} onChange={to => setForm({ ...form, to })} label="TO (required)" />
                <MultiUserSelect users={users} selected={form.cc} onChange={cc => setForm({ ...form, cc })} label="CC" />
                <MultiUserSelect users={users} selected={form.bcc} onChange={bcc => setForm({ ...form, bcc })} label="BCC" />
              </div>

              {/* Recurrence */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Schedule</div>
                <RecurrenceBuilder value={form.recurrence} onChange={recurrence => setForm({ ...form, recurrence })} />
              </div>

              {/* Start/End dates */}
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', flex: 1 }}>
                  Start Date
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm({ ...form, startDate: e.target.value })}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.45rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
                  />
                </label>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', flex: 1 }}>
                  End Date (optional)
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm({ ...form, endDate: e.target.value })}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.45rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
                  />
                </label>
              </div>

              {/* Enabled */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => setForm({ ...form, enabled: e.target.checked })}
                  style={{ accentColor: '#0054A6', width: 16, height: 16 }}
                />
                Enabled (will send on schedule)
              </label>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: saving ? '#9ca3af' : '#0054A6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: saving ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : editReminder ? 'Update Reminder' : 'Create Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
