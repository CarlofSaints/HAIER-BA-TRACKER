'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface QueryTiming {
  ms: number;
  rows: number;
  ok: boolean;
  error?: string;
}
interface SyncCounts {
  stores: number;
  products: number;
  salesRows: number;
  sohRows: number;
  months: number;
}
interface SyncMeta {
  lastSync?: string;
  lastSyncSource?: string;
  lastAutoSync?: string;
  lastSyncDurationMs?: number;
  lastSyncQueryTimings?: Record<string, QueryTiming>;
  counts?: SyncCounts;
  lastError?: string;
}
interface LogEntry {
  at: string;
  source: string;
  durationMs: number;
  ok: boolean;
  counts?: SyncCounts;
  queries: Record<string, QueryTiming>;
  error?: string;
}

const HAIER_BLUE = '#0054A6';

function fmtMs(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
function fmtDateTime(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtNum(n?: number): string {
  return (n ?? 0).toLocaleString('en-ZA');
}

function StatCard({ label, value, tint, sub }: { label: string; value: string; tint?: string; sub?: string }) {
  return (
    <div style={{
      background: tint || '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: '0.9rem 1.1rem',
      minWidth: 150,
      flex: '1 1 150px',
    }}>
      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function SamsSyncPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [meta, setMeta] = useState<SyncMeta>({});
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeJson, setProbeJson] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    authFetch('/api/sams/sync')
      .then(r => r.json())
      .then(d => {
        if (d.meta) setMeta(d.meta);
        if (typeof d.configured === 'boolean') setConfigured(d.configured);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session) return;
    loadStatus();
  }, [session, loadStatus]);

  async function loadLog() {
    try {
      const r = await authFetch('/api/sams/sync/log');
      const d = await r.json();
      setLog(Array.isArray(d.log) ? d.log : []);
    } catch {
      setLog([]);
    }
  }

  function toggleLog() {
    const next = !showLog;
    setShowLog(next);
    if (next) loadLog();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await authFetch('/api/sams/sync', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || 'Sync failed');
      if (d.meta) setMeta(d.meta);
      const c = d.meta?.counts;
      setToast({
        msg: c
          ? `Synced — ${fmtNum(c.salesRows)} sales cells, ${fmtNum(c.stores)} stores, ${fmtNum(c.products)} products across ${c.months} months.`
          : 'SAMS sync complete.',
        type: 'success',
      });
      if (showLog) loadLog();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Sync failed', type: 'error' });
    } finally {
      setSyncing(false);
    }
  }

  async function runProbe() {
    setProbing(true);
    setProbeJson(null);
    try {
      const r = await authFetch('/api/sams/probe');
      const d = await r.json();
      setProbeJson(JSON.stringify(d, null, 2));
    } catch (e) {
      setProbeJson('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProbing(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const timings = meta.lastSyncQueryTimings || {};
  const timingRows = Object.entries(timings);

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '0.35rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>Data Sync (SAMS)</h1>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>
            Pull the latest sales &amp; stock data from SQL Server (SAMS) via the Railway proxy.
            This replaces the DISPO Excel upload as Haier&apos;s data source.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading…</div>
        ) : (
          <>
            {!configured && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                borderRadius: 10, padding: '0.85rem 1rem', margin: '0.75rem 0', fontSize: '0.82rem',
              }}>
                <strong>SQL proxy not configured.</strong> Set <code>SQL_PROXY_URL</code> and{' '}
                <code>SQL_PROXY_API_KEY</code> in this project&apos;s Vercel environment
                (same values ARIA uses — Railway <code>API_KEY</code> → <code>SQL_PROXY_API_KEY</code>,
                and the proxy&apos;s public domain → <code>SQL_PROXY_URL</code>), then redeploy.
              </div>
            )}

            {/* Stat cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', margin: '1rem 0' }}>
              <StatCard
                label="Last Sync"
                value={fmtDateTime(meta.lastSync)}
                sub={meta.lastSyncSource ? meta.lastSyncSource.charAt(0).toUpperCase() + meta.lastSyncSource.slice(1) : undefined}
                tint="#fdf2f8"
              />
              <StatCard label="Stores" value={fmtNum(meta.counts?.stores)} tint="#fdf2f8" />
              <StatCard label="Products" value={fmtNum(meta.counts?.products)} tint="#fdf2f8" />
              <StatCard label="Sales cells" value={fmtNum(meta.counts?.salesRows)} tint="#ecfdf5" />
              <StatCard label="SOH snapshots" value={fmtNum(meta.counts?.sohRows)} tint="#fff7ed" />
              <StatCard label="Months" value={fmtNum(meta.counts?.months)} tint="#eff6ff" />
            </div>

            {/* Sync button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.5rem 0 1rem' }}>
              <button
                onClick={handleSync}
                disabled={syncing || !configured}
                style={{
                  background: syncing || !configured ? '#9ca3af' : HAIER_BLUE,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.6rem 1.4rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: syncing || !configured ? 'not-allowed' : 'pointer',
                }}
              >
                {syncing ? 'Syncing…' : 'Sync from SAMS'}
              </button>
              {meta.lastSyncDurationMs !== undefined && (
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  last run: {fmtMs(meta.lastSyncDurationMs)}
                </span>
              )}
              {syncing && (
                <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                  pulling the full fact set — this can take a while…
                </span>
              )}
            </div>

            {meta.lastError && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1rem', fontSize: '0.78rem',
              }}>
                Last run reported an error: {meta.lastError}
              </div>
            )}

            {/* Probe — temporary diagnostic (read-only; no data written) */}
            <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={runProbe}
                  disabled={probing || !configured}
                  style={{
                    background: probing || !configured ? '#9ca3af' : '#334155',
                    color: '#fff', border: 'none', borderRadius: 8,
                    padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600,
                    cursor: probing || !configured ? 'not-allowed' : 'pointer',
                  }}
                >
                  {probing ? 'Probing…' : 'Run probe (diagnostic)'}
                </button>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Read-only — SAMS columns + store/product dimension shapes. Nothing is written.
                </span>
                {probeJson && (
                  <button
                    onClick={() => navigator.clipboard.writeText(probeJson)}
                    style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.35rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer', color: '#334155' }}
                  >
                    Copy JSON
                  </button>
                )}
              </div>
              {probeJson && (
                <pre style={{ marginTop: '0.75rem', background: '#0f172a', color: '#e2e8f0', padding: '0.85rem', borderRadius: 8, fontSize: '0.72rem', overflowX: 'auto', maxHeight: 380, whiteSpace: 'pre' }}>
                  {probeJson}
                </pre>
              )}
            </div>

            {/* Query timings */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 600, color: '#111827' }}>Query timings (last run)</div>
                <button
                  onClick={toggleLog}
                  style={{ background: 'none', border: 'none', color: HAIER_BLUE, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  {showLog ? 'Hide history' : `History (${log.length || ''})`}
                </button>
              </div>

              {timingRows.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '0.82rem', padding: '0.5rem 0' }}>
                  No sync has run yet. Click “Sync from SAMS” to pull data.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0' }}>Query</th>
                      <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>Duration</th>
                      <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>Rows</th>
                      <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timingRows.map(([name, t]) => (
                      <tr key={name} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.45rem 0', fontFamily: 'monospace', color: '#374151' }}>{name}</td>
                        <td style={{ padding: '0.45rem 0', textAlign: 'right' }}>{fmtMs(t.ms)}</td>
                        <td style={{ padding: '0.45rem 0', textAlign: 'right' }}>{fmtNum(t.rows)}</td>
                        <td style={{ padding: '0.45rem 0', textAlign: 'right', color: t.ok ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {t.ok ? 'ok' : 'failed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* History */}
              {showLog && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                  <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                    Recent runs
                  </div>
                  {log.length === 0 ? (
                    <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No history yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                          <th style={{ padding: '0.35rem 0' }}>When</th>
                          <th style={{ padding: '0.35rem 0' }}>Source</th>
                          <th style={{ padding: '0.35rem 0', textAlign: 'right' }}>Duration</th>
                          <th style={{ padding: '0.35rem 0', textAlign: 'right' }}>Sales cells</th>
                          <th style={{ padding: '0.35rem 0', textAlign: 'right' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {log.map((e, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.4rem 0' }}>{fmtDateTime(e.at)}</td>
                            <td style={{ padding: '0.4rem 0', textTransform: 'capitalize' }}>{e.source}</td>
                            <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>{fmtMs(e.durationMs)}</td>
                            <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>{fmtNum(e.counts?.salesRows)}</td>
                            <td style={{ padding: '0.4rem 0', textAlign: 'right', color: e.ok ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                              {e.ok ? 'ok' : 'failed'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <Footer />
          </>
        )}
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
