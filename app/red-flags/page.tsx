'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

/* ── Types ── */

interface RedFlagSummaryBA {
  email: string;
  repName: string;
  totalFlags: number;
  byType: Record<string, number>;
}

interface RedFlagSummary {
  month: string;
  bas: RedFlagSummaryBA[];
  typeTotals: Record<string, number>;
}

type FormRow = Record<string, string | number | null>;

interface FormDataResponse {
  month: string;
  headers: string[];
  imageColumns: string[];
  rows: FormRow[];
  rowCount: number;
}

/* ── Red Flag Type Icons (inline SVG) ── */

const FLAG_TYPE_CONFIG: { type: string; label: string; color: string; bgColor: string; icon: React.ReactNode }[] = [
  {
    type: 'OUT OF STOCK',
    label: 'Out of Stock',
    color: '#dc2626',
    bgColor: '#fef2f2',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <line x1="7.5" y1="4.27" x2="7.5" y2="4.27" />
        <line x1="3.29" y1="7" x2="20.71" y2="7" />
      </svg>
    ),
  },
  {
    type: 'MISSING PARTS',
    label: 'Missing Parts',
    color: '#ea580c',
    bgColor: '#fff7ed',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.439 13.44a2 2 0 00.586-1.414V10.97a2 2 0 00-.586-1.414l-1.414-1.414a2 2 0 00-1.414-.586h-1.058a2 2 0 01-1.414-.586l-1.414-1.414a2 2 0 00-1.414-.586H9.254a2 2 0 00-1.414.586L6.426 6.97a2 2 0 00-.586 1.414v1.058a2 2 0 01-.586 1.414L3.84 12.27a2 2 0 00-.586 1.414v1.058a2 2 0 00.586 1.414l1.414 1.414a2 2 0 001.414.586h1.058" />
        <circle cx="9" cy="12" r="1" fill="#ea580c" />
        <path d="M15 15l3 3m0-3l-3 3" />
      </svg>
    ),
  },
  {
    type: 'DENTED PRODUCTS',
    label: 'Dented Products',
    color: '#d97706',
    bgColor: '#fffbeb',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    type: 'SHOPFITTING',
    label: 'Shopfitting',
    color: '#7c3aed',
    bgColor: '#f5f3ff',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    type: 'POS SHORTAGE',
    label: 'POS Shortage',
    color: '#0284c7',
    bgColor: '#f0f9ff',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    type: 'ENERGY LABELS SHORTAGE',
    label: 'Energy Labels',
    color: '#059669',
    bgColor: '#ecfdf5',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
];

/* ── Column filtering ── */

const HIDDEN_PATTERNS = new Set([
  'id', 'email', 'customer', 'channel', 'store code', 'time',
  'visit uuid', 'visit id', 'visitid', 'tag', 'sync date', 'sync time',
  'rep name', 'representative name',
  'store', 'store name', 'place',
]);

const FIRST_NAME_PATTERNS = new Set(['first name', 'firstname', 'name']);
const LAST_NAME_PATTERNS = new Set(['last name', 'lastname', 'surname']);
const STORE_PATTERNS = new Set(['store', 'store name', 'place']);

function isHidden(header: string): boolean {
  const h = header.toLowerCase().trim();
  return HIDDEN_PATTERNS.has(h) || FIRST_NAME_PATTERNS.has(h) || LAST_NAME_PATTERNS.has(h);
}

function buildDisplayColumns(headers: string[]) {
  const firstNameCol = headers.find(h => FIRST_NAME_PATTERNS.has(h.toLowerCase().trim()));
  const lastNameCol = headers.find(h => LAST_NAME_PATTERNS.has(h.toLowerCase().trim()));
  const repNameCol = headers.find(h => {
    const l = h.toLowerCase().trim();
    return l === 'rep name' || l === 'representative name';
  });
  const storeCol = headers.find(h => STORE_PATTERNS.has(h.toLowerCase().trim()));

  const visible = headers.filter(h => !isHidden(h));
  return { columns: ['Name', 'Store', ...visible], firstNameCol, lastNameCol, repNameCol, storeCol };
}

function getRowName(row: FormRow, firstNameCol?: string, lastNameCol?: string, repNameCol?: string): string {
  const first = firstNameCol ? String(row[firstNameCol] ?? '').trim() : '';
  const last = lastNameCol ? String(row[lastNameCol] ?? '').trim() : '';
  const merged = [first, last].filter(Boolean).join(' ');
  if (merged) return merged;
  if (repNameCol) return String(row[repNameCol] ?? '').trim();
  return '';
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
          alt="Red flag photo"
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
const NAME_COL_W = 160;
const STORE_COL_W = 170;

/* ── Red Flag Type Columns for Summary Table ── */
const TYPE_KEYS = [
  'OUT OF STOCK',
  'MISSING PARTS',
  'DENTED PRODUCTS',
  'SHOPFITTING',
  'POS SHORTAGE',
  'ENERGY LABELS SHORTAGE',
];

/* ── Main Page ── */

export default function RedFlagsPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin', 'client']);
  const [month, setMonth] = useState(currentMonth());

  const [summaryData, setSummaryData] = useState<RedFlagSummary | null>(null);
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
      const res = await authFetch(`/api/red-flags/summary?month=${month}`);
      if (res.ok) setSummaryData(await res.json());
      else setSummaryData(null);
    } catch { setSummaryData(null); }
    setSummaryLoading(false);
  }, [month]);

  const loadFormData = useCallback(async () => {
    setFormLoading(true);
    try {
      const res = await authFetch(`/api/red-flags/form-data?month=${month}`);
      if (res.ok) setFormData(await res.json());
      else setFormData(null);
    } catch { setFormData(null); }
    setFormLoading(false);
  }, [month]);

  useEffect(() => {
    if (session) { loadSummary(); loadFormData(); }
  }, [session, loadSummary, loadFormData]);

  // Total flags
  const totalFlags = useMemo(() => {
    if (!summaryData) return 0;
    return summaryData.bas.reduce((sum, b) => sum + b.totalFlags, 0);
  }, [summaryData]);

  // Display columns (filtered + merged Name)
  const display = useMemo(() => {
    if (!formData) return null;
    return buildDisplayColumns(formData.headers);
  }, [formData]);

  // Filtered rows
  const filteredFormRows = useMemo(() => {
    if (!formData || !display) return [];
    const rows = formData.rows;
    if (!formSearch.trim()) return rows;
    const q = formSearch.toLowerCase();
    return rows.filter(row => {
      const name = getRowName(row, display.firstNameCol, display.lastNameCol, display.repNameCol);
      if (name.toLowerCase().includes(q)) return true;
      if (display.storeCol) {
        const sv = row[display.storeCol];
        if (sv && String(sv).toLowerCase().includes(q)) return true;
      }
      return display.columns.some(h => {
        if (h === 'Name' || h === 'Store') return false;
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
          Red Flags
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          In-store issues reported by BAs
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
            No red flag data for {formatMonth(month)}.
          </div>
        ) : (
          <>
            {/* Red Flag Type Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}>
              {FLAG_TYPE_CONFIG.map(cfg => {
                const count = summaryData.typeTotals[cfg.type] || 0;
                const hasFlags = count > 0;
                return (
                  <div
                    key={cfg.type}
                    style={{
                      background: hasFlags ? cfg.bgColor : '#f9fafb',
                      border: `1px solid ${hasFlags ? cfg.color + '30' : '#e5e7eb'}`,
                      borderRadius: 12,
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ opacity: hasFlags ? 1 : 0.4 }}>
                      {cfg.icon}
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: hasFlags ? cfg.color : '#9ca3af',
                    }}>
                      {count}
                    </div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: hasFlags ? cfg.color : '#9ca3af',
                      textAlign: 'center',
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}>
                      {cfg.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total flags info */}
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '0.6rem 1rem', fontSize: '0.8rem', color: '#991b1b', marginBottom: '1rem',
            }}>
              Total: {totalFlags} red flag{totalFlags !== 1 ? 's' : ''} reported by {summaryData.bas.length} BA{summaryData.bas.length !== 1 ? 's' : ''} in {formatMonth(month)}.
            </div>

            {/* Summary Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '2rem' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                Red Flags by BA — {formatMonth(month)}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>BA Name</th>
                      <th style={{ minWidth: 200 }}>Email</th>
                      <th style={{ textAlign: 'center', minWidth: 70 }}>Total</th>
                      {TYPE_KEYS.map(t => {
                        const cfg = FLAG_TYPE_CONFIG.find(c => c.type === t);
                        return (
                          <th key={t} style={{ textAlign: 'center', minWidth: 60, fontSize: '0.65rem', lineHeight: 1.2 }}>
                            {cfg?.label || t}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.bas.map(ba => (
                      <tr key={ba.email}>
                        <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{ba.repName}</td>
                        <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{ba.email}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{ba.totalFlags}</td>
                        {TYPE_KEYS.map(t => {
                          const count = ba.byType[t] || 0;
                          const cfg = FLAG_TYPE_CONFIG.find(c => c.type === t);
                          return (
                            <td key={t} style={{ textAlign: 'center' }}>
                              {count > 0 ? (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: cfg?.bgColor || '#f3f4f6',
                                  color: cfg?.color || '#374151',
                                }}>
                                  {count}
                                </span>
                              ) : (
                                <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>
                              )}
                            </td>
                          );
                        })}
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
              Upload red flag form files to populate form data.
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

            {/* Form Data Table — frozen # + Name + Store columns */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                Red Flag Form Responses — {formatMonth(month)}
              </div>
              <div ref={scrollRef} style={{ overflow: 'auto', flex: 1, minHeight: 200, maxHeight: 'calc(100vh - 300px)' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      {/* Frozen # header */}
                      <th style={{
                        position: 'sticky', left: 0, top: 0, zIndex: 4,
                        width: NUM_COL_W, minWidth: NUM_COL_W, maxWidth: NUM_COL_W,
                        background: '#0054A6', textAlign: 'center', fontSize: '0.75rem',
                        padding: '8px 4px', borderBottom: '2px solid #003d7a', borderRight: '1px solid rgba(255,255,255,0.2)',
                        fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                      }}>
                        #
                      </th>
                      {/* Frozen Name header */}
                      <th style={{
                        position: 'sticky', left: NUM_COL_W, top: 0, zIndex: 4,
                        width: NAME_COL_W, minWidth: NAME_COL_W,
                        background: '#0054A6', fontSize: '0.75rem', fontWeight: 600, color: 'white',
                        padding: '8px 10px', borderBottom: '2px solid #003d7a', borderRight: '1px solid rgba(255,255,255,0.2)',
                        whiteSpace: 'normal', lineHeight: 1.3,
                      }}>
                        Name
                      </th>
                      {/* Frozen Store header */}
                      <th style={{
                        position: 'sticky', left: NUM_COL_W + NAME_COL_W, top: 0, zIndex: 4,
                        width: STORE_COL_W, minWidth: STORE_COL_W,
                        background: '#0054A6', fontSize: '0.75rem', fontWeight: 600, color: 'white',
                        padding: '8px 10px', borderBottom: '2px solid #003d7a', borderRight: '2px solid rgba(255,255,255,0.3)',
                        whiteSpace: 'normal', lineHeight: 1.3,
                      }}>
                        Store
                      </th>
                      {/* Scrollable column headers */}
                      {display.columns.slice(2).map(h => {
                        const isImg = formData.imageColumns.includes(h);
                        const w = widths[h] || (isImg ? 110 : 150);
                        return (
                          <th
                            key={h}
                            style={{
                              position: 'sticky', top: 0, zIndex: 2,
                              width: w, minWidth: 60,
                              background: '#0054A6', fontSize: '0.75rem', fontWeight: 600, color: 'white',
                              padding: '8px 10px', borderBottom: '2px solid #003d7a',
                              whiteSpace: 'normal', lineHeight: 1.3,
                              userSelect: 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                              <span style={{ flex: 1 }}>{h}</span>
                              <div
                                style={{
                                  width: 4, alignSelf: 'stretch', cursor: 'col-resize',
                                  marginLeft: 4, marginRight: -10,
                                  borderRight: '2px solid transparent',
                                }}
                                onMouseDown={e => { e.preventDefault(); startResize(h, e.clientX); }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderRightColor = 'rgba(255,255,255,0.4)'; }}
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
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', background: 'white' }}>
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
                            padding: '6px 10px', borderRight: '1px solid #e5e7eb',
                            width: NAME_COL_W, minWidth: NAME_COL_W,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                            title={name}
                          >
                            {name || <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                          {/* Frozen Store cell */}
                          <td style={{
                            position: 'sticky', left: NUM_COL_W + NAME_COL_W, zIndex: 1,
                            background: 'white', fontSize: '0.8rem', color: '#374151',
                            padding: '6px 10px', borderRight: '2px solid #d1d5db',
                            width: STORE_COL_W, minWidth: STORE_COL_W,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                            title={display.storeCol ? String(row[display.storeCol] ?? '') : ''}
                          >
                            {display.storeCol && row[display.storeCol]
                              ? String(row[display.storeCol])
                              : <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                          {/* Scrollable data cells */}
                          {display.columns.slice(2).map(h => {
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
                        <td colSpan={display.columns.length + 2} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
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
