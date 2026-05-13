'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

/* ── Types ── */

interface TrainingSummaryBA {
  email: string;
  repName: string;
  completedCount: number;
  minRequired: number;
  autoPoints: number;
  compliant: boolean;
}

interface TrainingSummary {
  month: string;
  minRequired: number;
  bas: TrainingSummaryBA[];
}

type FormRow = Record<string, string | number | null>;

interface FormDataResponse {
  month: string;
  headers: string[];
  imageColumns: string[];
  rows: FormRow[];
  rowCount: number;
}

/* ── Helpers ── */

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

const PERIGEE_PREFIX = 'https://live.perigeeportal.co.za';

function isImageUrl(val: unknown): val is string {
  return typeof val === 'string' && val.startsWith(PERIGEE_PREFIX);
}

function proxyUrl(originalUrl: string): string {
  return `/api/image?url=${encodeURIComponent(originalUrl)}`;
}

/* ── Lightbox ── */

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', cursor: 'zoom-out',
      }}
      onClick={onClose}
    >
      <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: -32, right: 0,
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)',
            fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close (Esc)
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Training photo"
          style={{ maxHeight: '85vh', maxWidth: '100%', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', cursor: 'default' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function TrainingPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState<'summary' | 'form'>('summary');

  // Summary state
  const [summaryData, setSummaryData] = useState<TrainingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Form data state
  const [formData, setFormData] = useState<FormDataResponse | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Search filter for form data
  const [formSearch, setFormSearch] = useState('');

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await authFetch(`/api/training/summary?month=${month}`);
      if (res.ok) setSummaryData(await res.json());
      else setSummaryData(null);
    } catch { setSummaryData(null); }
    setSummaryLoading(false);
  }, [month]);

  const loadFormData = useCallback(async () => {
    setFormLoading(true);
    try {
      const res = await authFetch(`/api/training/form-data?month=${month}`);
      if (res.ok) setFormData(await res.json());
      else setFormData(null);
    } catch { setFormData(null); }
    setFormLoading(false);
  }, [month]);

  useEffect(() => {
    if (session) {
      loadSummary();
      loadFormData();
    }
  }, [session, loadSummary, loadFormData]);

  const stats = useMemo(() => {
    if (!summaryData || summaryData.bas.length === 0) {
      return { totalBAs: 0, totalSessions: 0, avgPerBA: 0, compliant: 0, complianceRate: 0 };
    }
    const totalBAs = summaryData.bas.length;
    const totalSessions = summaryData.bas.reduce((sum, b) => sum + b.completedCount, 0);
    const avgPerBA = totalSessions / totalBAs;
    const compliant = summaryData.bas.filter(b => b.compliant).length;
    const complianceRate = Math.round((compliant / totalBAs) * 100);
    return { totalBAs, totalSessions, avgPerBA: Math.round(avgPerBA * 10) / 10, compliant, complianceRate };
  }, [summaryData]);

  // Filter form data rows by search
  const filteredFormRows = useMemo(() => {
    if (!formData) return [];
    if (!formSearch.trim()) return formData.rows;
    const q = formSearch.toLowerCase();
    return formData.rows.filter(row =>
      formData.headers.some(h => {
        const v = row[h];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      })
    );
  }, [formData, formSearch]);

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const tabStyle = (active: boolean) => ({
    padding: '0.5rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: active ? 600 : 400,
    color: active ? '#0054A6' : '#6b7280',
    borderBottom: active ? '2px solid #0054A6' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid' as const,
    borderBottomColor: active ? '#0054A6' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Training
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          BA training completion overview
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Month</label>
            <input
              className="input"
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              style={{ width: 180 }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
          <button style={tabStyle(tab === 'summary')} onClick={() => setTab('summary')}>
            Summary
          </button>
          <button style={tabStyle(tab === 'form')} onClick={() => setTab('form')}>
            Form Data {formData ? `(${formData.rowCount})` : ''}
          </button>
        </div>

        {/* ── Summary Tab ── */}
        {tab === 'summary' && (
          <>
            {summaryLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading training data...</div>
            ) : !summaryData || summaryData.bas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                No training data for {formatMonth(month)}. Upload training forms via the Data Upload page.
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                  <div className="kpi-card">
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>BAs Trained</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{stats.totalBAs}</div>
                  </div>
                  <div className="kpi-card">
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Sessions</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{stats.totalSessions}</div>
                  </div>
                  <div className="kpi-card">
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Avg per BA</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{stats.avgPerBA}</div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Required: {summaryData.minRequired}</div>
                  </div>
                  <div className="kpi-card">
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Fully Compliant</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stats.complianceRate >= 80 ? '#059669' : stats.complianceRate >= 50 ? '#d97706' : '#dc2626' }}>
                      {stats.compliant}/{stats.totalBAs}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{stats.complianceRate}%</div>
                  </div>
                </div>

                {/* Threshold info */}
                <div style={{
                  background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
                  padding: '0.6rem 1rem', fontSize: '0.8rem', color: '#0c4a6e', marginBottom: '1rem',
                }}>
                  Threshold: {summaryData.minRequired} trainings/month. Auto-score: min(5, round((completed / {summaryData.minRequired}) x 5))
                </div>

                {/* Training Table */}
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                    Training Completion — {formatMonth(month)}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ minWidth: 700 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: 180 }}>BA Name</th>
                          <th style={{ minWidth: 200 }}>Email</th>
                          <th style={{ textAlign: 'center', minWidth: 100 }}>Completed</th>
                          <th style={{ textAlign: 'center', minWidth: 90 }}>Required</th>
                          <th style={{ textAlign: 'center', minWidth: 100 }}>Auto Score</th>
                          <th style={{ textAlign: 'center', minWidth: 100 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.bas.map(ba => (
                          <tr key={ba.email}>
                            <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{ba.repName}</td>
                            <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{ba.email}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: ba.compliant ? '#059669' : '#dc2626' }}>
                              {ba.completedCount}
                            </td>
                            <td style={{ textAlign: 'center', color: '#6b7280' }}>{ba.minRequired}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                background: '#ede9fe', color: '#7c3aed', fontSize: '0.75rem',
                                fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                              }}>
                                {ba.autoPoints}/5
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 10px',
                                borderRadius: 12,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: ba.compliant ? '#dcfce7' : '#fef2f2',
                                color: ba.compliant ? '#166534' : '#991b1b',
                              }}>
                                {ba.compliant ? 'Compliant' : 'Below Target'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Form Data Tab ── */}
        {tab === 'form' && (
          <>
            {formLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading form data...</div>
            ) : !formData || formData.rowCount === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                No form data for {formatMonth(month)}. Upload training forms via the Data Upload page.
                <br />
                <span style={{ fontSize: '0.8rem' }}>
                  Note: Form data is only available for files uploaded after this feature was added. Re-upload existing files to populate form data.
                </span>
              </div>
            ) : (
              <>
                {/* Search + count */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Search form data..."
                    value={formSearch}
                    onChange={e => setFormSearch(e.target.value)}
                    style={{ width: 260 }}
                  />
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    {filteredFormRows.length} of {formData.rowCount} records
                    {formData.imageColumns.length > 0 && (
                      <> &middot; {formData.imageColumns.length} image column{formData.imageColumns.length > 1 ? 's' : ''} detected</>
                    )}
                  </span>
                </div>

                {/* Form Data Table */}
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                    Training Form Responses — {formatMonth(month)}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ minWidth: formData.headers.length * 140 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: 40, textAlign: 'center' }}>#</th>
                          {formData.headers.map(h => (
                            <th
                              key={h}
                              style={{
                                minWidth: formData.imageColumns.includes(h) ? 110 : 140,
                                fontSize: '0.75rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {h}
                              {formData.imageColumns.includes(h) && (
                                <span style={{ marginLeft: 4, fontSize: '0.65rem', color: '#9ca3af' }}>(img)</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFormRows.map((row, idx) => (
                          <tr key={idx}>
                            <td style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af' }}>{idx + 1}</td>
                            {formData.headers.map(h => {
                              const val = row[h];
                              const isImage = formData.imageColumns.includes(h);

                              if (isImage) {
                                if (isImageUrl(val)) {
                                  const proxied = proxyUrl(val);
                                  return (
                                    <td key={h} style={{ padding: '4px 8px' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={proxied}
                                          alt={h}
                                          style={{
                                            height: 64, width: 80, objectFit: 'cover',
                                            borderRadius: 4, border: '1px solid #e5e7eb',
                                            cursor: 'pointer', transition: 'opacity 0.15s',
                                          }}
                                          onClick={() => setLightboxUrl(proxied)}
                                          loading="lazy"
                                          onMouseOver={e => { (e.target as HTMLImageElement).style.opacity = '0.8'; }}
                                          onMouseOut={e => { (e.target as HTMLImageElement).style.opacity = '1'; }}
                                          onError={e => {
                                            const img = e.target as HTMLImageElement;
                                            img.style.display = 'none';
                                            const span = img.nextElementSibling as HTMLElement;
                                            if (span) span.style.display = 'inline';
                                          }}
                                        />
                                        <span style={{ display: 'none', fontSize: '0.7rem', color: '#9ca3af' }}>
                                          Failed to load
                                        </span>
                                      </div>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={h} style={{ fontSize: '0.75rem', color: '#d1d5db', padding: '4px 8px' }}>
                                    —
                                  </td>
                                );
                              }

                              // Regular text cell
                              return (
                                <td key={h} style={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {val !== null && val !== undefined && val !== '' ? (
                                    <span title={String(val)}>{String(val)}</span>
                                  ) : (
                                    <span style={{ color: '#d1d5db' }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {filteredFormRows.length === 0 && (
                          <tr>
                            <td colSpan={formData.headers.length + 1} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                              No matching records
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>

      {/* Lightbox overlay */}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
