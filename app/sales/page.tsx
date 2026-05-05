'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface DispoSalesData {
  sales: Record<string, Record<string, Record<string, number>>>;
  stock: Record<string, Record<string, { soh: number; soo: number }>>;
  prices: Record<string, { inclSP: number; promSP: number }>;
  uploads: { id: string; fileName: string; uploadedAt: string; rowCount: number }[];
}

type ViewMode = 'store' | 'product' | 'detail';

function calcValue(units: number, prices: { inclSP: number; promSP: number } | undefined): number {
  if (!prices) return 0;
  const price = prices.promSP > 0 ? prices.promSP : prices.inclSP;
  return units * price;
}

function formatCurrency(val: number): string {
  return 'R ' + val.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonthLabel(key: string): string {
  const [mm, yyyy] = key.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mm, 10) - 1]} ${yyyy}`;
}

export default function SalesPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<DispoSalesData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('store');
  const [monthFilter, setMonthFilter] = useState('all');

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await authFetch('/api/dispo');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  // Available months from data
  const months = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.sales).sort((a, b) => {
      // Sort by year then month descending
      const [am, ay] = a.split('-').map(Number);
      const [bm, by] = b.split('-').map(Number);
      if (ay !== by) return by - ay;
      return bm - am;
    });
  }, [data]);

  // Store summary
  const storeSummary = useMemo(() => {
    if (!data) return [];
    const storeMap = new Map<string, { units: number; value: number; soh: number; soo: number }>();

    const monthsToUse = monthFilter === 'all' ? Object.keys(data.sales) : [monthFilter];

    for (const month of monthsToUse) {
      const monthData = data.sales[month];
      if (!monthData) continue;
      for (const [store, products] of Object.entries(monthData)) {
        if (!storeMap.has(store)) storeMap.set(store, { units: 0, value: 0, soh: 0, soo: 0 });
        const entry = storeMap.get(store)!;
        for (const [article, units] of Object.entries(products)) {
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
        }
      }
    }

    // Add stock data
    for (const [store, products] of Object.entries(data.stock)) {
      if (!storeMap.has(store)) storeMap.set(store, { units: 0, value: 0, soh: 0, soo: 0 });
      const entry = storeMap.get(store)!;
      for (const { soh, soo } of Object.values(products)) {
        entry.soh += soh;
        entry.soo += soo;
      }
    }

    return Array.from(storeMap.entries())
      .map(([store, d]) => ({ store, ...d }))
      .sort((a, b) => b.value - a.value);
  }, [data, monthFilter]);

  // Product summary
  const productSummary = useMemo(() => {
    if (!data) return [];
    const prodMap = new Map<string, { units: number; value: number; soh: number; soo: number }>();

    const monthsToUse = monthFilter === 'all' ? Object.keys(data.sales) : [monthFilter];

    for (const month of monthsToUse) {
      const monthData = data.sales[month];
      if (!monthData) continue;
      for (const products of Object.values(monthData)) {
        for (const [article, units] of Object.entries(products)) {
          if (!prodMap.has(article)) prodMap.set(article, { units: 0, value: 0, soh: 0, soo: 0 });
          const entry = prodMap.get(article)!;
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
        }
      }
    }

    // Add stock data
    for (const products of Object.values(data.stock)) {
      for (const [article, { soh, soo }] of Object.entries(products)) {
        if (!prodMap.has(article)) prodMap.set(article, { units: 0, value: 0, soh: 0, soo: 0 });
        const entry = prodMap.get(article)!;
        entry.soh += soh;
        entry.soo += soo;
      }
    }

    return Array.from(prodMap.entries())
      .map(([article, d]) => ({ article, ...d }))
      .sort((a, b) => b.value - a.value);
  }, [data, monthFilter]);

  // Detail table
  const detailRows = useMemo(() => {
    if (!data) return [];
    const rows: { store: string; article: string; units: number; value: number; soh: number; soo: number; monthUnits: Record<string, number> }[] = [];

    const monthsToUse = monthFilter === 'all' ? Object.keys(data.sales) : [monthFilter];

    // Build store/article combos
    const combos = new Map<string, { units: number; value: number; monthUnits: Record<string, number> }>();

    for (const month of monthsToUse) {
      const monthData = data.sales[month];
      if (!monthData) continue;
      for (const [store, products] of Object.entries(monthData)) {
        for (const [article, units] of Object.entries(products)) {
          const key = `${store}|||${article}`;
          if (!combos.has(key)) combos.set(key, { units: 0, value: 0, monthUnits: {} });
          const entry = combos.get(key)!;
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
          entry.monthUnits[month] = (entry.monthUnits[month] || 0) + units;
        }
      }
    }

    for (const [key, d] of combos.entries()) {
      const [store, article] = key.split('|||');
      const stockEntry = data.stock[store]?.[article];
      rows.push({
        store,
        article,
        units: d.units,
        value: d.value,
        soh: stockEntry?.soh || 0,
        soo: stockEntry?.soo || 0,
        monthUnits: d.monthUnits,
      });
    }

    return rows.sort((a, b) => b.value - a.value);
  }, [data, monthFilter]);

  // Export to Excel
  async function exportToExcel(tableType: ViewMode) {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    let wsData: unknown[][] = [];

    if (tableType === 'store') {
      wsData = [['Store', 'Total Units', 'Total Value', 'SOH', 'SOO']];
      for (const r of storeSummary) {
        wsData.push([r.store, r.units, r.value, r.soh, r.soo]);
      }
    } else if (tableType === 'product') {
      wsData = [['Article', 'Total Units', 'Total Value', 'SOH', 'SOO']];
      for (const r of productSummary) {
        wsData.push([r.article, r.units, r.value, r.soh, r.soo]);
      }
    } else {
      const monthCols = monthFilter === 'all' ? months : [monthFilter];
      wsData = [['Store', 'Article', ...monthCols.map(formatMonthLabel), 'Total Units', 'Total Value', 'SOH', 'SOO']];
      for (const r of detailRows) {
        wsData.push([
          r.store, r.article,
          ...monthCols.map(m => r.monthUnits[m] || 0),
          r.units, r.value, r.soh, r.soo,
        ]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Sales & Stock');
    XLSX.writeFile(wb, `dispo_${tableType}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Sales & Stock
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          DISPO sales, stock on hand, and stock on order data
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>View</label>
            <select className="select" value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)} style={{ minWidth: 160 }}>
              <option value="store">Store Summary</option>
              <option value="product">Product Summary</option>
              <option value="detail">Detail (Store × Product)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Month</label>
            <select className="select" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="all">All Months</option>
              {months.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
            </select>
          </div>
          <button className="btn btn-outline" onClick={() => exportToExcel(viewMode)}>
            Export to Excel
          </button>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading sales data...</div>
        ) : !data || Object.keys(data.sales).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No DISPO data uploaded yet. Upload files via Settings.
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Sales (units)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>
                  {storeSummary.reduce((s, r) => s + r.units, 0).toLocaleString()}
                </div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Sales Value</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0054A6' }}>
                  {formatCurrency(storeSummary.reduce((s, r) => s + r.value, 0))}
                </div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total SOH</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>
                  {storeSummary.reduce((s, r) => s + r.soh, 0).toLocaleString()}
                </div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total SOO</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>
                  {storeSummary.reduce((s, r) => s + r.soo, 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                  {viewMode === 'store' ? 'Store Summary' : viewMode === 'product' ? 'Product Summary' : 'Detail View'}
                  {' '}({viewMode === 'store' ? storeSummary.length : viewMode === 'product' ? productSummary.length : detailRows.length} rows)
                </h3>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                {viewMode === 'store' && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th style={{ textAlign: 'right' }}>Units</th>
                        <th style={{ textAlign: 'right' }}>Value</th>
                        <th style={{ textAlign: 'right' }}>SOH</th>
                        <th style={{ textAlign: 'right' }}>SOO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storeSummary.map((r, i) => (
                        <tr key={i}>
                          <td>{r.store}</td>
                          <td style={{ textAlign: 'right' }}>{r.units.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(r.value)}</td>
                          <td style={{ textAlign: 'right' }}>{r.soh.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soo.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {viewMode === 'product' && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th style={{ textAlign: 'right' }}>Units</th>
                        <th style={{ textAlign: 'right' }}>Value</th>
                        <th style={{ textAlign: 'right' }}>SOH</th>
                        <th style={{ textAlign: 'right' }}>SOO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSummary.map((r, i) => (
                        <tr key={i}>
                          <td>{r.article}</td>
                          <td style={{ textAlign: 'right' }}>{r.units.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(r.value)}</td>
                          <td style={{ textAlign: 'right' }}>{r.soh.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soo.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {viewMode === 'detail' && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th>Article</th>
                        {(monthFilter === 'all' ? months : [monthFilter]).map(m => (
                          <th key={m} style={{ textAlign: 'right' }}>{formatMonthLabel(m)}</th>
                        ))}
                        <th style={{ textAlign: 'right' }}>Total Units</th>
                        <th style={{ textAlign: 'right' }}>Value</th>
                        <th style={{ textAlign: 'right' }}>SOH</th>
                        <th style={{ textAlign: 'right' }}>SOO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.slice(0, 500).map((r, i) => (
                        <tr key={i}>
                          <td>{r.store}</td>
                          <td>{r.article}</td>
                          {(monthFilter === 'all' ? months : [monthFilter]).map(m => (
                            <td key={m} style={{ textAlign: 'right' }}>{(r.monthUnits[m] || 0).toLocaleString()}</td>
                          ))}
                          <td style={{ textAlign: 'right' }}>{r.units.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(r.value)}</td>
                          <td style={{ textAlign: 'right' }}>{r.soh.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soo.toLocaleString()}</td>
                        </tr>
                      ))}
                      {detailRows.length > 500 && (
                        <tr>
                          <td colSpan={99} style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>
                            Showing first 500 of {detailRows.length.toLocaleString()} rows. Use Excel export for full data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Warning */}
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.8rem', color: '#92400e' }}>
              Sales value is calculated (units x price) and not supplied directly from channel.
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
