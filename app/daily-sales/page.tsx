'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import { monthLabel, lastDayOfMonth } from '@/lib/dailySalesWeeks';

type CellStatus = 'submitted' | 'missed' | 'none';

interface ComplianceCell {
  date: string;
  status: CellStatus;
  submissions: number;
  qty: number;
  value: number;
}

interface ComplianceRow {
  email: string;
  repName: string;
  cells: ComplianceCell[];
  submitted: number;
  missed: number;
  expected: number;
}

interface WeekOption { start: string; end: string; label: string }

interface Summary {
  today: string;
  compliance: {
    mode: 'week' | 'rolling';
    weekStart: string;
    days: { date: string; label: string; dow: string }[];
    rows: ComplianceRow[];
    dayTotals: { date: string; submitted: number; expected: number }[];
  };
  sales: {
    from: string;
    to: string;
    submissions: number;
    totalQty: number;
    totalValue: number;
    byProduct: { product: string; qty: number; value: number; submissions: number }[];
    byBa: { email: string; repName: string; qty: number; value: number; submissions: number }[];
    detail: { email: string; repName: string; product: string; qty: number; value: number }[];
  };
  options: { weeks: WeekOption[]; months: string[]; dataMonths: string[] };
  hasData: boolean;
}

type SalesView = 'product' | 'ba' | 'detail';

function money(n: number): string {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** One cell of the compliance grid. */
function StatusCell({ cell }: { cell: ComplianceCell }) {
  if (cell.status === 'submitted') {
    return (
      <td
        style={{ textAlign: 'center', background: '#f0fdf4' }}
        title={`${cell.submissions} submission${cell.submissions === 1 ? '' : 's'}, ${cell.qty} unit${cell.qty === 1 ? '' : 's'}, ${money(cell.value)}`}
      >
        <span style={{ color: '#059669', fontSize: '1rem', fontWeight: 700 }}>✓</span>
      </td>
    );
  }
  if (cell.status === 'missed') {
    return (
      <td style={{ textAlign: 'center', background: '#fef2f2' }} title="Checked into a store that day but no daily sales form was submitted">
        <span style={{ color: '#dc2626', fontSize: '1rem', fontWeight: 700 }}>✗</span>
      </td>
    );
  }
  return (
    <td style={{ textAlign: 'center' }} title="No store visit logged that day">
      <span style={{ color: '#d1d5db' }}>–</span>
    </td>
  );
}

export default function DailySalesPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Compliance grid: '' = rolling last 7 days, otherwise a Monday.
  const [weekStart, setWeekStart] = useState('');

  // Sales grid range.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [salesView, setSalesView] = useState<SalesView>('product');
  const [productSearch, setProductSearch] = useState('');

  /** The server picks the opening range (latest month with data). Adopt it once
   *  so the Month dropdown shows what is actually on screen, then leave the
   *  pickers entirely to the user. */
  const adoptedRange = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (weekStart) params.set('weekStart', weekStart);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await authFetch(`/api/daily-sales/summary?${params}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Failed to load daily sales data');
      } else {
        setData(body);
        if (!adoptedRange.current && !fromDate && !toDate && body?.sales) {
          adoptedRange.current = true;
          setFromDate(body.sales.from);
          setToDate(body.sales.to);
        }
      }
    } catch {
      setError('Failed to load daily sales data');
    }
    setLoading(false);
  }, [weekStart, fromDate, toDate]);

  useEffect(() => { if (session) load(); }, [session, load]);

  // Which month the current from/to matches exactly, if any.
  const selectedMonth = useMemo(() => {
    if (!fromDate || !toDate) return '';
    const month = fromDate.slice(0, 7);
    if (toDate.slice(0, 7) !== month) return '';
    if (fromDate !== `${month}-01`) return '';
    if (toDate !== lastDayOfMonth(month)) return '';
    return month;
  }, [fromDate, toDate]);

  function pickMonth(month: string) {
    if (!month) { setFromDate(''); setToDate(''); return; }
    setFromDate(`${month}-01`);
    setToDate(lastDayOfMonth(month));
  }

  const salesRows = useMemo(() => {
    if (!data) return [];
    const q = productSearch.trim().toLowerCase();
    if (salesView === 'product') {
      return data.sales.byProduct
        .filter(r => !q || r.product.toLowerCase().includes(q))
        .map(r => ({ key: r.product, a: r.product, b: '', qty: r.qty, value: r.value }));
    }
    if (salesView === 'ba') {
      return data.sales.byBa
        .filter(r => !q || r.repName.toLowerCase().includes(q))
        .map(r => ({ key: r.email || r.repName, a: r.repName, b: '', qty: r.qty, value: r.value }));
    }
    return data.sales.detail
      .filter(r => !q || r.product.toLowerCase().includes(q) || r.repName.toLowerCase().includes(q))
      .map(r => ({ key: `${r.email}|${r.product}`, a: r.repName, b: r.product, qty: r.qty, value: r.value }));
  }, [data, salesView, productSearch]);

  const shownQty = salesRows.reduce((s, r) => s + r.qty, 0);
  const shownValue = salesRows.reduce((s, r) => s + r.value, 0);

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const comp = data?.compliance;
  const totalSubmitted = comp?.dayTotals.reduce((s, d) => s + d.submitted, 0) ?? 0;
  const totalExpected = comp?.dayTotals.reduce((s, d) => s + d.expected, 0) ?? 0;
  const compliancePct = totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 100) : 0;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Daily Sales Submissions
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Who submitted their daily sales form, and what they sold
        </p>

        {error && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading daily sales data...</div>
        ) : !data ? null : !data.hasData ? (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧾</div>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>No daily sales submissions loaded yet</div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              Load a Perigee Daily Sales export on the Data Upload page to populate this view.
            </div>
          </div>
        ) : (
          <>
            {/* ── Submission compliance ── */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '2rem' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                    Submission Tracker
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                    {totalSubmitted} of {totalExpected} expected submissions received ({compliancePct}%)
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Week</label>
                    <select
                      className="select"
                      value={weekStart}
                      onChange={e => setWeekStart(e.target.value)}
                      style={{ minWidth: 200 }}
                    >
                      <option value="">Last 7 days (rolling)</option>
                      {data.options.weeks.map(w => (
                        <option key={w.start} value={w.start}>{w.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.72rem', color: '#6b7280' }}>
                <span><span style={{ color: '#059669', fontWeight: 700 }}>✓</span> form submitted</span>
                <span><span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span> worked that day, no form</span>
                <span><span style={{ color: '#d1d5db', fontWeight: 700 }}>–</span> no store visit logged</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 190 }}>BA</th>
                      {comp!.days.map(d => (
                        <th key={d.date} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{d.label}</th>
                      ))}
                      <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comp!.rows.map(row => (
                      <tr key={row.email} style={{ opacity: row.expected === 0 && row.submitted === 0 ? 0.55 : 1 }}>
                        <td style={{ whiteSpace: 'nowrap' }}>{row.repName}</td>
                        {row.cells.map(c => <StatusCell key={c.date} cell={c} />)}
                        <td style={{ textAlign: 'center', fontWeight: 600, color: row.missed > 0 ? '#dc2626' : '#374151' }}>
                          {row.submitted}/{row.expected}
                        </td>
                      </tr>
                    ))}
                    {comp!.rows.length === 0 && (
                      <tr>
                        <td colSpan={comp!.days.length + 2} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                          No BAs on the roster yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f9fafb', fontWeight: 600 }}>
                      <td>Total</td>
                      {comp!.dayTotals.map(t => (
                        <td key={t.date} style={{ textAlign: 'center', fontSize: '0.78rem', color: t.submitted < t.expected ? '#dc2626' : '#059669' }}>
                          {t.submitted}/{t.expected}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center' }}>{totalSubmitted}/{totalExpected}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Sales from the submissions ── */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                  Sales from Daily Sales Forms
                </h3>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                  Value is QTY sold multiplied by Unit price, as captured on the form
                </div>
              </div>

              {/* Filters */}
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Month</label>
                  <select className="select" value={selectedMonth} onChange={e => pickMonth(e.target.value)} style={{ minWidth: 150 }}>
                    <option value="">Custom range</option>
                    {data.options.months.map(m => (
                      <option key={m} value={m}>{monthLabel(m)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>From</label>
                  <input className="input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 160 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>To</label>
                  <input className="input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 160 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Search</label>
                  <input
                    className="input"
                    type="text"
                    placeholder={salesView === 'ba' ? 'BA name' : 'Product or BA'}
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    style={{ width: 200 }}
                  />
                </div>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    adoptedRange.current = false; // fall back to the server's default range
                    setFromDate('');
                    setToDate('');
                    setProductSearch('');
                  }}
                >
                  Clear Filters
                </button>

                {/* View toggle */}
                <div style={{ display: 'flex', marginLeft: 'auto', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
                  {([['product', 'Product View'], ['ba', 'BA View'], ['detail', 'Detail View']] as [SalesView, string][]).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setSalesView(v)}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: salesView === v ? '#0054A6' : 'white',
                        color: salesView === v ? 'white' : '#374151',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Submissions</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0054A6' }}>{data.sales.submissions.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Units Sold</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0054A6' }}>{shownQty.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Sales Value</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#059669' }}>{money(shownValue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Period</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', paddingTop: 4 }}>
                    {data.sales.from} to {data.sales.to}
                  </div>
                </div>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {salesView === 'detail' ? (
                        <>
                          <th style={{ minWidth: 170 }}>BA</th>
                          <th>Product</th>
                        </>
                      ) : (
                        <th>{salesView === 'product' ? 'Product' : 'BA'}</th>
                      )}
                      <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Qty Sold</th>
                      <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Value Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesRows.map(r => (
                      <tr key={r.key}>
                        <td>{r.a}</td>
                        {salesView === 'detail' && <td>{r.b}</td>}
                        <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{money(r.value)}</td>
                      </tr>
                    ))}
                    {salesRows.length === 0 && (
                      <tr>
                        <td colSpan={salesView === 'detail' ? 4 : 3} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                          No sales in this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {salesRows.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                        <td>Total</td>
                        {salesView === 'detail' && <td />}
                        <td style={{ textAlign: 'right' }}>{shownQty.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{money(shownValue)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
