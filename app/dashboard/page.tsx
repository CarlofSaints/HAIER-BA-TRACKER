'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface Visit {
  email: string;
  repName: string;
  channel: string;
  storeName: string;
  storeCode: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  checkInDistance: string;
  checkOutDistance: string;
  visitDuration: string;
  formsCompleted: number;
  picsUploaded: number;
  status: string;
  networkOnCheckIn: string;
}

const PIE_COLORS = ['#0054A6', '#00A0E9', '#1A1A2E', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
const PAGE_SIZE = 100;

type SortKey = keyof Visit;

export default function DashboardPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('checkInDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadVisits = useCallback(async () => {
    setLoadingData(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await authFetch(`/api/visits?${params}`);
      if (res.ok) setVisits(await res.json());
    } catch { /* ignore */ }
    setLoadingData(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    if (session) loadVisits();
  }, [session, loadVisits]);

  // Channel filter applied client-side
  const filtered = useMemo(() => {
    if (!channelFilter) return visits;
    return visits.filter(v => v.channel === channelFilter);
  }, [visits, channelFilter]);

  // Unique channels for dropdown
  const channels = useMemo(() => {
    const set = new Set(visits.map(v => v.channel).filter(Boolean));
    return Array.from(set).sort();
  }, [visits]);

  // KPIs
  const kpis = useMemo(() => {
    const totalVisits = filtered.length;
    const uniqueStores = new Set(filtered.map(v => v.storeCode || v.storeName)).size;
    const uniqueReps = new Set(filtered.map(v => v.email || v.repName)).size;
    const totalForms = filtered.reduce((s, v) => s + v.formsCompleted, 0);
    const totalPics = filtered.reduce((s, v) => s + v.picsUploaded, 0);

    // Avg visit duration — parse "HH:MM" or "MM:SS" format
    let totalMinutes = 0;
    let durCount = 0;
    for (const v of filtered) {
      if (v.visitDuration) {
        const parts = v.visitDuration.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          totalMinutes += parts[0] * 60 + parts[1];
          durCount++;
        }
      }
    }
    const avgDurMin = durCount > 0 ? Math.round(totalMinutes / durCount) : 0;
    const avgDurStr = durCount > 0 ? `${Math.floor(avgDurMin / 60)}h ${avgDurMin % 60}m` : 'N/A';

    return { totalVisits, uniqueStores, uniqueReps, totalForms, totalPics, avgDurStr };
  }, [filtered]);

  // Chart: visits per day
  const visitsPerDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of filtered) {
      if (v.checkInDate) {
        map.set(v.checkInDate, (map.get(v.checkInDate) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
  }, [filtered]);

  // Chart: visits by channel
  const visitsByChannel = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of filtered) {
      const ch = v.channel || 'Unknown';
      map.set(ch, (map.get(ch) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Chart: forms per rep (top 15)
  const formsPerRep = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of filtered) {
      const name = v.repName || v.email || 'Unknown';
      map.set(name, (map.get(name) || 0) + v.formsCompleted);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, forms]) => ({ name: name.length > 20 ? name.slice(0, 18) + '...' : name, forms }));
  }, [filtered]);

  // Chart: visit duration distribution
  const durationDist = useMemo(() => {
    const buckets: Record<string, number> = {
      '0-5m': 0, '5-15m': 0, '15-30m': 0, '30-60m': 0, '1-2h': 0, '2h+': 0,
    };
    for (const v of filtered) {
      if (!v.visitDuration) continue;
      const parts = v.visitDuration.split(':').map(Number);
      if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;
      const mins = parts[0] * 60 + parts[1];
      if (mins < 5) buckets['0-5m']++;
      else if (mins < 15) buckets['5-15m']++;
      else if (mins < 30) buckets['15-30m']++;
      else if (mins < 60) buckets['30-60m']++;
      else if (mins < 120) buckets['1-2h']++;
      else buckets['2h+']++;
    }
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  }, [filtered]);

  // Sorted + paginated data
  const sortedData = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return sorted;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  const pageData = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          BA Scorecard Dashboard
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Business Analyst performance overview
        </p>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>From</label>
            <input className="input" type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} style={{ width: 160 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>To</label>
            <input className="input" type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} style={{ width: 160 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Channel</label>
            <select className="select" value={channelFilter} onChange={e => { setChannelFilter(e.target.value); setPage(1); }} style={{ minWidth: 160 }}>
              <option value="">All Channels</option>
              {channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          <button className="btn btn-outline" onClick={() => { setFromDate(''); setToDate(''); setChannelFilter(''); setPage(1); }}>
            Clear Filters
          </button>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading visits data...</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Visits</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.totalVisits.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Unique Stores</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.uniqueStores.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Avg Duration</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.avgDurStr}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Forms</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.totalForms.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Pics</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.totalPics.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Active Reps</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.uniqueReps.toLocaleString()}</div>
              </div>
            </div>

            {/* Charts */}
            {filtered.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Visits per day */}
                <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Visits per Day</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={visitsPerDay}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0054A6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Visits by channel */}
                <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Visits by Channel</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={visitsByChannel} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        {visitsByChannel.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Forms per rep */}
                <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Forms Completed per Rep (Top 15)</h3>
                  <ResponsiveContainer width="100%" height={Math.max(240, formsPerRep.length * 28)}>
                    <BarChart data={formsPerRep} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip />
                      <Bar dataKey="forms" fill="#00A0E9" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Duration distribution */}
                <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Visit Duration Distribution</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={durationDist}>
                      <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#1A1A2E" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Data Grid */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                  All Visits ({filtered.length.toLocaleString()} rows)
                </h3>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 500 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort('repName')}>Rep{sortArrow('repName')}</th>
                      <th onClick={() => toggleSort('channel')}>Channel{sortArrow('channel')}</th>
                      <th onClick={() => toggleSort('storeName')}>Store{sortArrow('storeName')}</th>
                      <th onClick={() => toggleSort('checkInDate')}>Date{sortArrow('checkInDate')}</th>
                      <th onClick={() => toggleSort('checkInTime')}>In{sortArrow('checkInTime')}</th>
                      <th onClick={() => toggleSort('checkOutTime')}>Out{sortArrow('checkOutTime')}</th>
                      <th onClick={() => toggleSort('visitDuration')}>Duration{sortArrow('visitDuration')}</th>
                      <th onClick={() => toggleSort('formsCompleted')}>Forms{sortArrow('formsCompleted')}</th>
                      <th onClick={() => toggleSort('picsUploaded')}>Pics{sortArrow('picsUploaded')}</th>
                      <th onClick={() => toggleSort('status')}>Status{sortArrow('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((v, i) => (
                      <tr key={i}>
                        <td>{v.repName}</td>
                        <td>{v.channel}</td>
                        <td>{v.storeName}</td>
                        <td>{v.checkInDate}</td>
                        <td>{v.checkInTime}</td>
                        <td>{v.checkOutTime}</td>
                        <td>{v.visitDuration}</td>
                        <td>{v.formsCompleted}</td>
                        <td>{v.picsUploaded}</td>
                        <td>{v.status}</td>
                      </tr>
                    ))}
                    {pageData.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                          {visits.length === 0 ? 'No visit data uploaded yet' : 'No visits match the current filters'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination" style={{ padding: '0.75rem' }}>
                  <button disabled={page <= 1} onClick={() => setPage(1)}>First</button>
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Page {page} of {totalPages}
                  </span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
                </div>
              )}
            </div>
          </>
        )}
        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
