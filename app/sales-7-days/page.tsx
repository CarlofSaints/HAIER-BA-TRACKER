'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import SamsFreshnessCard from '@/components/SamsFreshnessCard';
import {
  aggregateRolling7, rolling7Sheet, dayLabel, newestFirst,
  type BaSource, type Rolling7Mode, type Rolling7Row, type Rolling7ViewRow,
} from '@/lib/rolling7View';
import { buildRolling7Workbook } from '@/lib/rolling7Excel';

type Row = Rolling7Row;
type ViewMode = Rolling7Mode;
type SortDir = 'asc' | 'desc';

interface Channel {
  id: string;
  name: string;
  parentId: string;
}

interface Payload {
  days: string[];
  rows: Row[];
  channels: Channel[];
}

function formatCurrency(val: number): string {
  return 'R ' + val.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const NO_BA = 'No BA';
const BA_SOURCE_HINT: Record<BaSource, string> = {
  assigned: 'Assigned on the Stores page',
  visits: 'From the most recent Perigee check-in at this store',
  none: 'No BA assigned and no Perigee check-ins at this store',
};

export default function Sales7DaysPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [viewMode, setViewMode] = useState<ViewMode>('store');
  const [channelFilter, setChannelFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [baFilter, setBaFilter] = useState('');

  const [sortKey, setSortKey] = useState('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoadingData(true);
      try {
        const res = await authFetch('/api/sales/rolling-7');
        if (res.ok) setData(await res.json());
        else setLoadError(`Could not load sales (HTTP ${res.status}).`);
      } catch {
        setLoadError('Could not load sales.');
      }
      setLoadingData(false);
    })();
  }, [session]);

  const days = data?.days || [];
  const rows = data?.rows || [];
  // Day columns are shown newest first; the data arrays stay oldest first.
  const dayOrder = newestFirst(days.length);

  // Main channels, each followed by its sub-channels.
  const channelOptions = useMemo(() => {
    const chans = data?.channels || [];
    const out: { id: string; label: string }[] = [];
    const mains = chans.filter(c => !c.parentId || !chans.some(p => p.id === c.parentId));
    for (const m of mains.sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ id: m.id, label: m.name });
      for (const s of chans.filter(c => c.parentId === m.id).sort((a, b) => a.name.localeCompare(b.name))) {
        out.push({ id: s.id, label: `   ${m.name} › ${s.name}` });
      }
    }
    return out;
  }, [data]);

  // Picking a main channel includes its sub-channels.
  const channelMatches = (r: Row) =>
    channelFilter === 'all' || r.channelId === channelFilter || r.mainChannelId === channelFilter;

  const filtered = useMemo(
    () =>
      rows.filter(
        r =>
          channelMatches(r) &&
          (!storeFilter || r.store === storeFilter) &&
          (!productFilter || r.article === productFilter) &&
          (!baFilter || (r.ba || NO_BA) === baFilter),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, channelFilter, storeFilter, productFilter, baFilter],
  );

  const storeOptions = useMemo(() => [...new Set(rows.filter(channelMatches).map(r => r.store))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, channelFilter]);
  const productOptions = useMemo(() => [...new Set(rows.map(r => r.article))].sort(), [rows]);
  const baOptions = useMemo(() => [...new Set(rows.filter(channelMatches).map(r => r.ba || NO_BA))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, channelFilter]);

  const viewRows = useMemo<Rolling7ViewRow[]>(() => {
    const out = aggregateRolling7(filtered, viewMode, days.length);

    const val = (r: Rolling7ViewRow): string | number =>
      sortKey.startsWith('d') && /^d\d+$/.test(sortKey)
        ? r.daily[Number(sortKey.slice(1))]
        : (r as unknown as Record<string, string | number>)[sortKey];
    return out.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, viewMode, days.length, sortKey, sortDir]);

  const totals = useMemo(() => {
    const daily = new Array(days.length).fill(0);
    let units = 0, value = 0, soh = 0;
    for (const r of viewRows) {
      r.daily.forEach((u, i) => (daily[i] += u));
      units += r.units;
      value += r.value;
      soh += r.soh;
    }
    return { daily, units, value, soh };
  }, [viewRows, days.length]);

  const storesSelling = useMemo(() => new Set(filtered.filter(r => r.units > 0).map(r => r.store)).size, [filtered]);
  const basSelling = useMemo(() => new Set(filtered.filter(r => r.units > 0 && r.ba).map(r => r.ba)).size, [filtered]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(['channel', 'store', 'ba', 'article'].includes(key) ? 'asc' : 'desc');
    }
  }

  function clearFilters() {
    setChannelFilter('all');
    setStoreFilter('');
    setProductFilter('');
    setBaFilter('');
  }
  const hasFilters = channelFilter !== 'all' || !!storeFilter || !!productFilter || !!baFilter;

  const showStore = viewMode !== 'product';
  const showArticle = viewMode !== 'store';

  async function exportView() {
    const buf = await buildRolling7Workbook([rolling7Sheet(viewRows, viewMode, days)]);
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_7_days_${viewMode}_${days[days.length - 1] || 'none'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ctr: React.CSSProperties = { textAlign: 'center' };
  const rgt: React.CSSProperties = { textAlign: 'right' };

  function sortHeader(label: string, key: string, align: 'left' | 'center' | 'right' = 'left') {
    const arrow = sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <th key={key} onClick={() => toggleSort(key)} style={{ textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {label}{arrow}
      </th>
    );
  }

  function baCell(r: Rolling7ViewRow) {
    if (!r.ba) return <td style={{ color: '#9ca3af' }} title={BA_SOURCE_HINT.none}>No BA</td>;
    return (
      <td title={BA_SOURCE_HINT[r.baSource]}>
        {r.ba}
        {r.baSource === 'visits' && <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}> (visits)</span>}
      </td>
    );
  }

  const selectStyle: React.CSSProperties = { minWidth: 160 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 };

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const rangeLabel = days.length ? `${dayLabel(days[0])} to ${dayLabel(days[days.length - 1])}` : '';

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
              Sales: Last 7 Days
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Daily sales for the most recent 7 days of data{rangeLabel ? `: ${rangeLabel}` : ''}.
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '1.25rem' }}>
              Only channels loaded from SAMS have daily figures. DISPO, Excel and PDF channels arrive as monthly
              totals, so they show on Sales &amp; Stock but not here.
            </p>
          </div>
          <SamsFreshnessCard />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>View</label>
            <select className="select" value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)} style={selectStyle}>
              <option value="store">By Store</option>
              <option value="product">By SKU</option>
              <option value="detail">By SKU and Store</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sales Channel</label>
            <select className="select" value={channelFilter} onChange={e => { setChannelFilter(e.target.value); setStoreFilter(''); setBaFilter(''); }} style={{ minWidth: 180 }}>
              <option value="all">All Sales Channels</option>
              {channelOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Store</label>
            <select className="select" value={storeFilter} onChange={e => setStoreFilter(e.target.value)} style={selectStyle}>
              <option value="">All Stores</option>
              {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>BA</label>
            <select className="select" value={baFilter} onChange={e => setBaFilter(e.target.value)} style={selectStyle}>
              <option value="">All BAs</option>
              {baOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>SKU</label>
            <select className="select" value={productFilter} onChange={e => setProductFilter(e.target.value)} style={selectStyle}>
              <option value="">All SKUs</option>
              {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {hasFilters && (
            <button className="btn btn-outline" onClick={clearFilters} style={{ fontSize: '0.8rem' }}>Clear Filters</button>
          )}
          <button className="btn btn-outline" onClick={exportView} disabled={viewRows.length === 0} style={{ marginLeft: 'auto' }}>
            Export to Excel
          </button>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading sales data...</div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#991b1b' }}>{loadError}</div>
        ) : days.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No daily SAMS sales yet. Run a sync on Data Sync (SAMS) to load them.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Units (7 days)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{totals.units.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Value (7 days, ex VAT)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0054A6' }}>{formatCurrency(totals.value)}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Stores with sales</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{storesSelling.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>BAs with sales</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{basSelling.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                  {viewMode === 'store' ? 'By Store' : viewMode === 'product' ? 'By SKU' : 'By SKU and Store'} ({viewRows.length} rows)
                  <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.8rem' }}> · daily figures are units</span>
                </h3>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {showStore && sortHeader('Sales Channel', 'channel')}
                      {showStore && sortHeader('Store', 'store')}
                      {showStore && sortHeader('BA', 'ba')}
                      {showArticle && sortHeader('SKU', 'article')}
                      {dayOrder.map(i => sortHeader(dayLabel(days[i]), `d${i}`, 'center'))}
                      {sortHeader('Total Units', 'units', 'center')}
                      {sortHeader('Value (ex VAT)', 'value', 'right')}
                      {sortHeader('Contrib Val%', 'contribVal', 'center')}
                      {sortHeader('SOH', 'soh', 'center')}
                    </tr>
                  </thead>
                  <tbody>
                    {viewRows.slice(0, 1000).map(r => (
                      <tr key={r.key}>
                        {showStore && <td>{r.channel}</td>}
                        {showStore && <td>{r.store}</td>}
                        {showStore && baCell(r)}
                        {showArticle && <td>{r.article}</td>}
                        {dayOrder.map(i => r.daily[i]).map((u, i) => (
                          <td key={i} style={{ ...ctr, color: u === 0 ? '#d1d5db' : undefined }}>{u.toLocaleString()}</td>
                        ))}
                        <td style={{ ...ctr, fontWeight: 600 }}>{r.units.toLocaleString()}</td>
                        <td style={rgt}>{formatCurrency(r.value)}</td>
                        <td style={ctr}>{r.contribVal.toFixed(1)}%</td>
                        <td style={ctr}>{r.soh.toLocaleString()}</td>
                      </tr>
                    ))}
                    {viewRows.length > 1000 && (
                      <tr>
                        <td colSpan={99} style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>
                          Showing first 1,000 of {viewRows.length.toLocaleString()} rows. Use Export to Excel for all of them.
                        </td>
                      </tr>
                    )}
                    {viewRows.length > 0 && (
                      <tr style={{ fontWeight: 700, background: '#f9fafb' }}>
                        {showStore && <td>Total</td>}
                        {showStore && <td />}
                        {showStore && <td />}
                        {showArticle && <td>{showStore ? '' : 'Total'}</td>}
                        {dayOrder.map(i => totals.daily[i]).map((u, i) => <td key={i} style={ctr}>{u.toLocaleString()}</td>)}
                        <td style={ctr}>{totals.units.toLocaleString()}</td>
                        <td style={rgt}>{formatCurrency(totals.value)}</td>
                        <td style={ctr}>100.0%</td>
                        <td style={ctr}>{totals.soh.toLocaleString()}</td>
                      </tr>
                    )}
                    {viewRows.length === 0 && (
                      <tr>
                        <td colSpan={99} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                          No sales match these filters in the last 7 days.
                        </td>
                      </tr>
                    )}
                  </tbody>
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
