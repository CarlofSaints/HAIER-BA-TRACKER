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

interface DispoSalesData {
  sales: Record<string, Record<string, Record<string, number>>>;
  stock: Record<string, Record<string, { soh: number; soo: number }>>;
  prices: Record<string, { inclSP: number; promSP: number }>;
  ytd: Record<string, Record<string, number>>;
  uploads: unknown[];
}

interface TopPerformer {
  label: string;
  name: string;
  store: string;
  score: string;
  color: string;
}

interface LBEntry {
  email: string;
  repName: string;
  storeName: string;
  scores: Record<string, { total: number; monthlySales: number; checkInOnTime: number; feedback: number; displayInspection: number; training: number }>;
}

const PIE_COLORS = ['#0054A6', '#00A0E9', '#1A1A2E', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
const PAGE_SIZE = 100;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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
  const [dispoData, setDispoData] = useState<DispoSalesData | null>(null);
  const [lbData, setLbData] = useState<LBEntry[]>([]);
  const [formSummary, setFormSummary] = useState<{ name: string; training: number; display: number; redFlags: number; total: number }[]>([]);
  const [formTypeFilter, setFormTypeFilter] = useState<'all' | 'training' | 'display' | 'redFlags'>('all');

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

  const loadFormSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await authFetch(`/api/forms/summary?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFormSummary(data.reps || []);
      }
    } catch { /* ignore */ }
  }, [fromDate, toDate]);

  useEffect(() => {
    if (session) {
      loadVisits();
      loadFormSummary();
      authFetch('/api/dispo')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setDispoData(d); })
        .catch(() => {});
      authFetch('/api/scores/leaderboard?months=1')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setLbData(d); })
        .catch(() => {});
    }
  }, [session, loadVisits, loadFormSummary]);

  // Top performers per KPI
  const topPerformers = useMemo<TopPerformer[]>(() => {
    const month = currentMonth();
    const entries = lbData
      .filter(e => e.scores[month])
      .map(e => ({ ...e, ms: e.scores[month] }));
    if (entries.length === 0) return [];

    const kpis: { key: keyof LBEntry['scores'][string]; label: string; max: number; color: string }[] = [
      { key: 'monthlySales', label: 'Top Seller', max: 40, color: '#059669' },
      { key: 'checkInOnTime', label: 'Best Attendee', max: 10, color: '#0054A6' },
      { key: 'displayInspection', label: 'Best Display', max: 15, color: '#7c3aed' },
      { key: 'training', label: 'Best Trainer', max: 15, color: '#d97706' },
      { key: 'feedback', label: 'Best Feedback', max: 10, color: '#0891b2' },
    ];

    const result: TopPerformer[] = [];
    for (const kpi of kpis) {
      let best: typeof entries[0] | null = null;
      let bestVal = -1;
      for (const e of entries) {
        const val = (e.ms[kpi.key] as number) || 0;
        if (val > bestVal) { bestVal = val; best = e; }
      }
      if (best && bestVal > 0) {
        result.push({
          label: kpi.label,
          name: best.repName,
          store: best.storeName || '-',
          score: `${bestVal}/${kpi.max}`,
          color: kpi.color,
        });
      }
    }
    return result;
  }, [lbData]);

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

  // Helper: parse "HH:MM" or "HH:MM:SS" to minutes since midnight
  function timeToMinutes(t: string): number | null {
    if (!t) return null;
    const p = t.split(':').map(Number);
    if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
    return p[0] * 60 + p[1];
  }

  // Compute per-visit durations: earliest check-in → latest check-out per (user+store+date)
  const visitDurations = useMemo(() => {
    const groups = new Map<string, { minIn: number; maxOut: number }>();
    for (const v of filtered) {
      const key = `${(v.email || v.repName).toLowerCase()}|${v.storeCode || v.storeName}|${v.checkInDate}`;
      const inMin = timeToMinutes(v.checkInTime);
      const outMin = timeToMinutes(v.checkOutTime);
      if (inMin === null && outMin === null) continue;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          minIn: inMin ?? Infinity,
          maxOut: outMin ?? -Infinity,
        });
      } else {
        if (inMin !== null && inMin < existing.minIn) existing.minIn = inMin;
        if (outMin !== null && outMin > existing.maxOut) existing.maxOut = outMin;
      }
    }
    const durations: number[] = [];
    for (const { minIn, maxOut } of groups.values()) {
      if (minIn !== Infinity && maxOut !== -Infinity && maxOut > minIn) {
        durations.push(maxOut - minIn);
      }
    }
    return durations;
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const totalVisits = filtered.length;
    const uniqueStores = new Set(filtered.map(v => v.storeCode || v.storeName)).size;
    const uniqueReps = new Set(filtered.map(v => v.email || v.repName)).size;
    const totalForms = filtered.reduce((s, v) => s + v.formsCompleted, 0);
    const totalPics = filtered.reduce((s, v) => s + v.picsUploaded, 0);
    const uniqueVisits = new Set(
      filtered.map(v => `${(v.email || v.repName).toLowerCase()}|${v.storeCode || v.storeName}|${v.checkInDate}`)
    ).size;

    // Avg visit duration from computed per-visit durations
    const avgDurMin = visitDurations.length > 0
      ? Math.round(visitDurations.reduce((s, d) => s + d, 0) / visitDurations.length)
      : 0;
    const avgDurStr = visitDurations.length > 0
      ? `${Math.floor(avgDurMin / 60)}h ${avgDurMin % 60}m`
      : 'N/A';

    return { totalVisits, uniqueVisits, uniqueStores, uniqueReps, totalForms, totalPics, avgDurStr };
  }, [filtered, visitDurations]);

  // DISPO sales KPIs
  const dispoKpis = useMemo(() => {
    if (!dispoData || !dispoData.sales) return { volume: 0, value: 0 };
    let totalUnits = 0;
    let totalValue = 0;
    for (const monthData of Object.values(dispoData.sales)) {
      for (const products of Object.values(monthData)) {
        for (const [article, units] of Object.entries(products)) {
          totalUnits += units;
          const p = dispoData.prices[article];
          if (p) {
            const price = p.promSP > 0 ? p.promSP : p.inclSP;
            totalValue += units * price;
          }
        }
      }
    }
    return { volume: totalUnits, value: totalValue };
  }, [dispoData]);

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

  // Chart: forms per rep (top 15) — from uploaded form data
  const formsPerRep = useMemo(() => {
    return formSummary
      .map(r => {
        const count = formTypeFilter === 'all' ? r.total
          : formTypeFilter === 'training' ? r.training
          : formTypeFilter === 'display' ? r.display
          : r.redFlags;
        return { name: r.name.length > 20 ? r.name.slice(0, 18) + '...' : r.name, forms: count };
      })
      .filter(r => r.forms > 0)
      .sort((a, b) => b.forms - a.forms);
  }, [formSummary, formTypeFilter]);

  // Total form submissions from uploaded data
  const totalFormSubmissions = useMemo(() => {
    return formSummary.reduce((sum, r) => sum + r.total, 0);
  }, [formSummary]);

  // Chart: visits per rep (top 15) — unique visits per BA
  const visitsPerRep = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of filtered) {
      const name = v.repName || v.email || 'Unknown';
      if (!map.has(name)) map.set(name, new Set());
      const visitKey = `${v.storeCode || v.storeName}|${v.checkInDate}`;
      map.get(name)!.add(visitKey);
    }
    return Array.from(map.entries())
      .map(([name, visits]) => ({ name: name.length > 20 ? name.slice(0, 18) + '...' : name, visits: visits.size }))
      .sort((a, b) => b.visits - a.visits);
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
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Visit Channel</label>
            <select className="select" value={channelFilter} onChange={e => { setChannelFilter(e.target.value); setPage(1); }} style={{ minWidth: 160 }}>
              <option value="">All Visit Channels</option>
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
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Visits</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.uniqueVisits.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Check-ins</div>
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
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{totalFormSubmissions.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Pics</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.totalPics.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Active Reps</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.uniqueReps.toLocaleString()}</div>
              </div>
              {dispoData && dispoKpis.volume > 0 && (
                <>
                  <div className="kpi-card">
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Sales Volume (units)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>{dispoKpis.volume.toLocaleString()}</div>
                  </div>
                  <div className="kpi-card">
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Sales Value</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#059669' }}>R {dispoKpis.value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                  </div>
                </>
              )}
            </div>

            {/* DISPO sales warning */}
            {dispoData && dispoKpis.volume > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '0.5rem 0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.7rem', color: '#92400e' }}>
                Sales value is calculated (units x price) and not supplied directly from channel.
              </div>
            )}

            {/* Top Performers per KPI */}
            {topPerformers.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {topPerformers.map(tp => (
                  <div key={tp.label} style={{
                    background: 'white', borderRadius: 12, padding: '1rem 1.25rem',
                    border: '1px solid #e5e7eb', borderLeft: `4px solid ${tp.color}`,
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {tp.label}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tp.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tp.store}
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: tp.color }}>
                      {tp.score}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Charts */}
            {filtered.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Visits per day */}
                <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Check-ins per Day</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={visitsPerDay}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0054A6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Check-ins by visit channel */}
                <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Check-ins by Visit Channel</h3>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>Forms Completed per Rep</h3>
                    <select
                      className="select"
                      value={formTypeFilter}
                      onChange={e => setFormTypeFilter(e.target.value as typeof formTypeFilter)}
                      style={{ fontSize: '0.75rem', padding: '4px 8px', minWidth: 120 }}
                    >
                      <option value="all">All Forms</option>
                      <option value="training">Training</option>
                      <option value="display">Display</option>
                      <option value="redFlags">Red Flags</option>
                    </select>
                  </div>
                  {formsPerRep.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(240, formsPerRep.length * 28)}>
                      <BarChart data={formsPerRep} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip />
                        <Bar dataKey="forms" fill="#00A0E9" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                      No form data uploaded yet
                    </div>
                  )}
                </div>

                {/* Visits per rep */}
                <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Visits per Rep</h3>
                  {visitsPerRep.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(240, visitsPerRep.length * 28)}>
                      <BarChart data={visitsPerRep} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip />
                        <Bar dataKey="visits" fill="#0054A6" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                      No visit data available
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Data Grid */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                  All Check-ins ({filtered.length.toLocaleString()} rows)
                </h3>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 500 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort('repName')}>Rep{sortArrow('repName')}</th>
                      <th onClick={() => toggleSort('channel')}>Visit Channel{sortArrow('channel')}</th>
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
