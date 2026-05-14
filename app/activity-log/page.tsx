'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  actorName: string;
  resource: string;
  summary: string;
  details?: Record<string, unknown>;
}

const ACTION_GROUPS: Record<string, string[]> = {
  'Uploads': ['upload_visits', 'upload_dispo', 'upload_training', 'upload_targets', 'upload_display'],
  'Deletions': ['delete_visits', 'delete_dispo', 'delete_training', 'delete_targets', 'delete_display'],
  'Users': ['user_create', 'user_edit', 'user_delete', 'user_purge'],
  'Scores': ['scores_save'],
  'System': ['cron_import'],
};

const ACTION_LABELS: Record<string, string> = {
  upload_visits: 'Upload Visits', upload_dispo: 'Upload DISPO', upload_training: 'Upload Training',
  upload_targets: 'Upload Targets', upload_display: 'Upload Display',
  delete_visits: 'Delete Visits', delete_dispo: 'Delete DISPO', delete_training: 'Delete Training',
  delete_targets: 'Delete Targets', delete_display: 'Delete Display',
  cron_import: 'Cron Import',
  user_create: 'Create User', user_edit: 'Edit User', user_delete: 'Delete User', user_purge: 'Purge User',
  scores_save: 'Save Scores',
};

function badgeStyle(action: string): React.CSSProperties {
  if (action.startsWith('upload_')) return { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' };
  if (action.startsWith('delete_')) return { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' };
  if (action.startsWith('user_')) return { background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe' };
  if (action.startsWith('scores_')) return { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' };
  return { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
}

function monthOptions(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export default function ActivityLogPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter) params.set('action', actionFilter);
      if (monthFilter) params.set('months', monthFilter);
      const res = await authFetch(`/api/activity-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, actionFilter, monthFilter]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>Activity Log</h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          {total} event{total !== 1 ? 's' : ''} recorded
        </p>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <select
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem', background: 'white' }}
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
              <optgroup key={group} label={group}>
                {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
              </optgroup>
            ))}
          </select>

          <select
            value={monthFilter}
            onChange={e => { setMonthFilter(e.target.value); setPage(1); }}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem', background: 'white' }}
          >
            <option value="">Last 3 Months</option>
            {monthOptions().map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No activity found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Timestamp</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Action</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>User</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <>
                    <tr
                      key={entry.id}
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        cursor: entry.details ? 'pointer' : 'default',
                        background: expanded === entry.id ? '#f9fafb' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (expanded !== entry.id) (e.currentTarget as HTMLElement).style.background = '#fafbfc'; }}
                      onMouseLeave={e => { if (expanded !== entry.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '0.55rem 0.75rem', color: '#6b7280', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {new Date(entry.timestamp).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem' }}>
                        <span style={{
                          ...badgeStyle(entry.action),
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.72rem',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', color: '#374151', whiteSpace: 'nowrap' }}>
                        {entry.actorName}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', color: '#374151' }}>
                        {entry.summary}
                        {entry.details && (
                          <span style={{ color: '#9ca3af', marginLeft: 6, fontSize: '0.7rem' }}>
                            {expanded === entry.id ? '▼' : '▶'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {expanded === entry.id && entry.details && (
                      <tr key={`${entry.id}-detail`}>
                        <td colSpan={4} style={{ padding: '0.5rem 0.75rem 0.75rem 2.5rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <pre style={{ margin: 0, fontSize: '0.72rem', color: '#6b7280', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
            <button
              className="btn btn-outline"
              style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Prev
            </button>
            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
              Page {page} of {totalPages}
            </span>
            <button
              className="btn btn-outline"
              style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        )}

        <Footer />
      </main>
    </div>
  );
}
