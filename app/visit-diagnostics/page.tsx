'use client';

import { useState } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface DiagRow {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  storeName: string;
  storeCode: string;
  visitId: string;
  email: string;
  repName: string;
  uploadId: string;
  dedupeKey: string;
  kept: boolean;
}

interface DiagResult {
  summary: {
    rawMatched: number;
    survivesDedup: number;
    droppedAsDuplicate: number;
    distinctDates: number;
    distinctDedupeKeys: number;
    anyVisitId: boolean;
    anyBlankCheckInTime: boolean;
    anyBlankCheckInDate: boolean;
  };
  byDate: { date: string; count: number }[];
  byDedupeKey: { key: string; count: number }[];
  rows: DiagRow[];
}

function defaultMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` };
}

export default function VisitDiagnosticsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const range = defaultMonthRange();
  const [rep, setRep] = useState('');
  const [store, setStore] = useState('');
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagResult | null>(null);
  const [error, setError] = useState('');

  async function run() {
    if (!rep.trim()) { setError('Enter a rep email or name'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const params = new URLSearchParams({ rep: rep.trim() });
      if (store.trim()) params.set('store', store.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await authFetch(`/api/visits/diagnose?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); }
      else setResult(data);
    } catch {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const s = result?.summary;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Visit Diagnostics
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem', maxWidth: 720 }}>
          Shows the <strong>raw, un-deduplicated</strong> visit rows for a rep. The dashboard collapses
          rows that share a dedupe key (<code>visitId</code>, or else
          <code> email | storeCode | checkInDate | checkInTime</code>), so this reveals why many
          check-ins can show as one visit — e.g. repeated rows on the same date, or a blank
          check-in time/date.
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>Rep (email or name)</label>
            <input className="input" value={rep} onChange={e => setRep(e.target.value)} placeholder="ba@example.com or surname" style={{ minWidth: 240, fontSize: '0.85rem' }} onKeyDown={e => { if (e.key === 'Enter') run(); }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>Store (optional)</label>
            <input className="input" value={store} onChange={e => setStore(e.target.value)} placeholder="name or code" style={{ minWidth: 160, fontSize: '0.85rem' }} onKeyDown={e => { if (e.key === 'Enter') run(); }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>From</label>
            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: '0.85rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>To</label>
            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: '0.85rem' }} />
          </div>
          <button className="btn btn-primary" onClick={run} disabled={loading}>
            {loading ? 'Running…' : 'Diagnose'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.6rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.8rem', color: '#991b1b', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {s && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[
                { label: 'Raw rows matched', value: s.rawMatched, hint: 'before dedup' },
                { label: 'Survives dedup', value: s.survivesDedup, hint: 'what the dashboard counts' },
                { label: 'Dropped as duplicate', value: s.droppedAsDuplicate, hint: 'collapsed away', warn: s.droppedAsDuplicate > 0 },
                { label: 'Distinct dates', value: s.distinctDates, hint: 'unique check-in dates' },
                { label: 'Distinct dedupe keys', value: s.distinctDedupeKeys, hint: 'unique visit identities' },
              ].map(c => (
                <div key={c.label} style={{ flex: '1 1 150px', background: c.warn ? '#fffbeb' : 'white', border: `1px solid ${c.warn ? '#fde68a' : '#e5e7eb'}`, borderRadius: 10, padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{c.label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.warn ? '#92400e' : '#0054A6' }}>{c.value}</div>
                  <div style={{ fontSize: '0.66rem', color: '#9ca3af' }}>{c.hint}</div>
                </div>
              ))}
            </div>

            {/* Interpretation hints */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.75rem' }}>
              {!s.anyVisitId && <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: '#eef2ff', color: '#3730a3' }}>No visitId on any row → dedupe uses email|store|date|time</span>}
              {s.anyBlankCheckInTime && <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: '#fffbeb', color: '#92400e' }}>Some rows have a blank check-in time</span>}
              {s.anyBlankCheckInDate && <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: '#fef2f2', color: '#991b1b' }}>Some rows have a blank check-in date</span>}
              {s.distinctDates < s.rawMatched && <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: '#fffbeb', color: '#92400e' }}>Multiple rows share the same date</span>}
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* By date */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', minWidth: 220 }}>
                <div style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.8rem', borderBottom: '1px solid #f3f4f6' }}>Rows by check-in date</div>
                <div style={{ maxHeight: 420, overflow: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Date</th><th style={{ textAlign: 'right' }}>Rows</th></tr></thead>
                    <tbody>
                      {result.byDate.map(d => (
                        <tr key={d.date}><td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{d.date}</td><td style={{ textAlign: 'right', fontWeight: d.count > 1 ? 700 : 400, color: d.count > 1 ? '#92400e' : undefined }}>{d.count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Raw rows */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', flex: 1, minWidth: 480 }}>
                <div style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.8rem', borderBottom: '1px solid #f3f4f6' }}>Raw rows ({result.rows.length}) — dropped rows are shaded</div>
                <div style={{ maxHeight: 460, overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th><th>In</th><th>Out</th><th>Store</th><th>Code</th><th>visitId</th><th>Kept?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r, i) => (
                        <tr key={i} style={r.kept ? undefined : { background: '#fef2f2', color: '#9ca3af' }}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.checkInDate || '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.checkInTime || '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.checkOutTime || '—'}</td>
                          <td style={{ fontSize: '0.75rem' }}>{r.storeName || '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.storeCode || '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{r.visitId || '—'}</td>
                          <td style={{ fontWeight: 700, color: r.kept ? '#166534' : '#dc2626' }}>{r.kept ? '✓' : '✕ dup'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        <Footer />
      </main>
    </div>
  );
}
