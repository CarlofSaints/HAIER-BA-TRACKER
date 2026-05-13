'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

/* ── Column filtering ── */

const HIDDEN_PATTERNS = new Set([
  'id', 'email', 'customer', 'channel', 'store code', 'time',
  'visit uuid', 'visit id', 'visitid', 'tag', 'sync date', 'sync time',
  'did you complete training', 'did you complete training?',
  'rep name', 'representative name',
]);

const FIRST_NAME_PATTERNS = new Set(['first name', 'firstname', 'name']);
const LAST_NAME_PATTERNS = new Set(['last name', 'lastname', 'surname']);

function isHidden(header: string): boolean {
  const h = header.toLowerCase().trim();
  return HIDDEN_PATTERNS.has(h) || FIRST_NAME_PATTERNS.has(h) || LAST_NAME_PATTERNS.has(h);
}

/** Build display columns: merged Name + filtered visible headers */
function buildDisplayColumns(headers: string[]) {
  const firstNameCol = headers.find(h => FIRST_NAME_PATTERNS.has(h.toLowerCase().trim()));
  const lastNameCol = headers.find(h => LAST_NAME_PATTERNS.has(h.toLowerCase().trim()));
  const repNameCol = headers.find(h => {
    const l = h.toLowerCase().trim();
    return l === 'rep name' || l === 'representative name';
  });

  const visible = headers.filter(h => !isHidden(h));
  // Prepend "Name" as first column
  return { columns: ['Name', ...visible], firstNameCol, lastNameCol, repNameCol };
}

function getRowName(row: FormRow, firstNameCol?: string, lastNameCol?: string, repNameCol?: string): string {
  const first = firstNameCol ? String(row[firstNameCol] ?? '').trim() : '';
  const last = lastNameCol ? String(row[lastNameCol] ?? '').trim() : '';
  const merged = [first, last].filter(Boolean).join(' ');
  if (merged) return merged;
  if (repNameCol) return String(row[repNameCol] ?? '').trim();
  return '';
}

/* ── FSP Count ── */

function findFspColumn(headers: string[]): string | undefined {
  return headers.find(h => h.toLowerCase().includes('fsp') && h.toLowerCase().includes('train'));
}

function sumFspValues(rows: FormRow[], fspCol: string): number {
  let total = 0;
  for (const r of rows) {
    const v = r[fspCol];
    if (v !== null && v !== undefined) {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (!isNaN(n)) total += n;
    }
  }
  return total;
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

function isImageUrl(val: unknown): val is string {
  return typeof val === 'string' && val.startsWith('https://');
}

const PERIGEE_PREFIX = 'https://live.perigeeportal.co.za';

function resolveImageUrl(originalUrl: string): string {
  if (originalUrl.startsWith(PERIGEE_PREFIX)) {
    return `/api/image?url=${encodeURIComponent(originalUrl)}`;
  }
  return originalUrl;
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

/* ── Column Resize Hook ── */

function useColumnResize(defaultWidth: number) {
  const [widths, setWidths] = useState<Record<string, number>>({});

  const startResize = useCallback((col: string, startX: number) => {
    const startW = widths[col] || defaultWidth;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setWidths(prev => ({ ...prev, [col]: Math.max(60, startW + delta) }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [widths, defaultWidth]);

  return { widths, startResize };
}

/* ── Sticky column constants ── */
const NUM_COL_W = 36;
const NAME_COL_W = 180;

/* ── Main Page ── */

export default function TrainingPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [month, setMonth] = useState(currentMonth());

  const [summaryData, setSummaryData] = useState<TrainingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [formData, setFormData] = useState<FormDataResponse | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [formSearch, setFormSearch] = useState('');
  const { widths, startResize } = useColumnResize(150);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (session) { loadSummary(); loadFormData(); }
  }, [session, loadSummary, loadFormData]);

  // Summary stats
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

  // Display columns (filtered + merged Name)
  const display = useMemo(() => {
    if (!formData) return null;
    return buildDisplayColumns(formData.headers);
  }, [formData]);

  // FSP total from form data
  const fspTotal = useMemo(() => {
    if (!formData) return 0;
    const col = findFspColumn(formData.headers);
    if (!col) return 0;
    return sumFspValues(formData.rows, col);
  }, [formData]);

  // Filtered rows
  const filteredFormRows = useMemo(() => {
    if (!formData || !display) return [];
    const rows = formData.rows;
    if (!formSearch.trim()) return rows;
    const q = formSearch.toLowerCase();
    return rows.filter(row => {
      // Search across visible columns + merged name
      const name = getRowName(row, display.firstNameCol, display.lastNameCol, display.repNameCol);
      if (name.toLowerCase().includes(q)) return true;
      return display.columns.some(h => {
        if (h === 'Name') return false; // already checked
        const v = row[h];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      });
    });
  }, [formData, display, formSearch]);

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Training
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          BA training completion overview
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Month</label>
            <input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 180 }} />
          </div>
        </div>

        {/* ── Summary Section ── */}
        {summaryLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Loading summary...</div>
        ) : !summaryData || summaryData.bas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', marginBottom: '2rem' }}>
            No training data for {formatMonth(month)}.
          </div>
        ) : (
          <>
            {/* Summary Cards — compact/square */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {[
                { label: "FSP's Trained", value: fspTotal, color: '#0054A6' },
                { label: 'Total Sessions', value: stats.totalSessions, color: '#0054A6' },
                { label: 'Avg per BA', value: stats.avgPerBA, color: '#0054A6', sub: `Required: ${summaryData.minRequired}` },
                {
                  label: 'Fully Compliant',
                  value: `${stats.compliant}/${stats.totalBAs}`,
                  color: stats.complianceRate >= 80 ? '#059669' : stats.complianceRate >= 50 ? '#d97706' : '#dc2626',
                  sub: `${stats.complianceRate}%`,
                },
              ].map(card => (
                <div
                  key={card.label}
                  className="kpi-card"
                  style={{ width: 130, minWidth: 130, maxWidth: 130, flex: 'none' }}
                >
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: 4, lineHeight: 1.2 }}>{card.label}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: card.color }}>{card.value}</div>
                  {card.sub && <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{card.sub}</div>}
                </div>
              ))}
            </div>

            {/* Threshold info */}
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
              padding: '0.6rem 1rem', fontSize: '0.8rem', color: '#0c4a6e', marginBottom: '1rem',
            }}>
              Threshold: {summaryData.minRequired} trainings/month. Auto-score: min(5, round((completed / {summaryData.minRequired}) x 5))
            </div>

            {/* Summary Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '2rem' }}>
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
                        <td style={{ textAlign: 'center', fontWeight: 600, color: ba.compliant ? '#059669' : '#dc2626' }}>{ba.completedCount}</td>
                        <td style={{ textAlign: 'center', color: '#6b7280' }}>{ba.minRequired}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>
                            {ba.autoPoints}/5
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
                            background: ba.compliant ? '#dcfce7' : '#fef2f2', color: ba.compliant ? '#166534' : '#991b1b',
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

        {/* ── Form Data Section ── */}
        {formLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Loading form data...</div>
        ) : !formData || formData.rowCount === 0 || !display ? (
          <div style={{
            textAlign: 'center', padding: '2rem', color: '#9ca3af',
            background: 'white', borderRadius: 12, border: '1px solid #e5e7eb',
          }}>
            No form data for {formatMonth(month)}.
            <br />
            <span style={{ fontSize: '0.8rem' }}>
              Re-upload training files to populate form data.
            </span>
          </div>
        ) : (
          <>
            {/* Search + count */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input" type="text" placeholder="Search form data..."
                value={formSearch} onChange={e => setFormSearch(e.target.value)}
                style={{ width: 260 }}
              />
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {filteredFormRows.length} of {formData.rowCount} records
              </span>
            </div>

            {/* Form Data Table — frozen # + Name columns, wrapped headers, resizable */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                Training Form Responses — {formatMonth(month)}
              </div>
              <div ref={scrollRef} style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      {/* Frozen # header */}
                      <th style={{
                        position: 'sticky', left: 0, top: 0, zIndex: 4,
                        width: NUM_COL_W, minWidth: NUM_COL_W, maxWidth: NUM_COL_W,
                        background: '#f9fafb', textAlign: 'center', fontSize: '0.75rem',
                        padding: '8px 4px', borderBottom: '2px solid #e5e7eb', borderRight: '1px solid #e5e7eb',
                        fontWeight: 600, color: '#6b7280',
                      }}>
                        #
                      </th>
                      {/* Frozen Name header */}
                      <th style={{
                        position: 'sticky', left: NUM_COL_W, top: 0, zIndex: 4,
                        width: NAME_COL_W, minWidth: NAME_COL_W,
                        background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#374151',
                        padding: '8px 10px', borderBottom: '2px solid #e5e7eb', borderRight: '2px solid #d1d5db',
                        whiteSpace: 'normal', lineHeight: 1.3,
                      }}>
                        Name
                      </th>
                      {/* Scrollable column headers */}
                      {display.columns.slice(1).map(h => {
                        const isImg = formData.imageColumns.includes(h);
                        const w = widths[h] || (isImg ? 110 : 150);
                        return (
                          <th
                            key={h}
                            style={{
                              position: 'sticky', top: 0, zIndex: 2,
                              width: w, minWidth: 60,
                              background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#374151',
                              padding: '8px 10px', borderBottom: '2px solid #e5e7eb',
                              whiteSpace: 'normal', lineHeight: 1.3,
                              userSelect: 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                              <span style={{ flex: 1 }}>{h}</span>
                              {/* Resize handle */}
                              <div
                                style={{
                                  width: 4, alignSelf: 'stretch', cursor: 'col-resize',
                                  marginLeft: 4, marginRight: -10,
                                  borderRight: '2px solid transparent',
                                }}
                                onMouseDown={e => { e.preventDefault(); startResize(h, e.clientX); }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderRightColor = '#93c5fd'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderRightColor = 'transparent'; }}
                              />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFormRows.map((row, idx) => {
                      const name = getRowName(row, display.firstNameCol, display.lastNameCol, display.repNameCol);
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          {/* Frozen # cell */}
                          <td style={{
                            position: 'sticky', left: 0, zIndex: 1,
                            background: 'white', textAlign: 'center', fontSize: '0.7rem', color: '#9ca3af',
                            padding: '6px 4px', borderRight: '1px solid #e5e7eb',
                            width: NUM_COL_W, minWidth: NUM_COL_W, maxWidth: NUM_COL_W,
                          }}>
                            {idx + 1}
                          </td>
                          {/* Frozen Name cell */}
                          <td style={{
                            position: 'sticky', left: NUM_COL_W, zIndex: 1,
                            background: 'white', fontWeight: 500, fontSize: '0.82rem',
                            padding: '6px 10px', borderRight: '2px solid #d1d5db',
                            width: NAME_COL_W, minWidth: NAME_COL_W,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                            title={name}
                          >
                            {name || <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                          {/* Scrollable data cells */}
                          {display.columns.slice(1).map(h => {
                            const val = row[h];
                            const isImg = formData.imageColumns.includes(h);

                            if (isImg) {
                              if (isImageUrl(val)) {
                                const src = resolveImageUrl(val);
                                return (
                                  <td key={h} style={{ padding: '4px 8px' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={src} alt={h}
                                      style={{
                                        height: 56, width: 72, objectFit: 'cover',
                                        borderRadius: 4, border: '1px solid #e5e7eb',
                                        cursor: 'pointer', transition: 'opacity 0.15s',
                                      }}
                                      onClick={() => setLightboxUrl(src)}
                                      loading="lazy"
                                      onMouseOver={e => { (e.target as HTMLImageElement).style.opacity = '0.8'; }}
                                      onMouseOut={e => { (e.target as HTMLImageElement).style.opacity = '1'; }}
                                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  </td>
                                );
                              }
                              return <td key={h} style={{ fontSize: '0.75rem', color: '#d1d5db', padding: '4px 8px' }}>—</td>;
                            }

                            return (
                              <td key={h} style={{ fontSize: '0.8rem', padding: '6px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {val !== null && val !== undefined && val !== '' ? (
                                  <span title={String(val)}>{String(val)}</span>
                                ) : (
                                  <span style={{ color: '#d1d5db' }}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {filteredFormRows.length === 0 && (
                      <tr>
                        <td colSpan={display.columns.length + 1} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
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

        <Footer />
      </main>

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
