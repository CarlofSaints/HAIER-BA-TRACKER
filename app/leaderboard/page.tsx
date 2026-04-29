'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface MonthScore {
  total: number;
  grandTotal: number;
}

interface LeaderboardEntry {
  email: string;
  repName: string;
  scores: Record<string, MonthScore>;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

function rankBadge(rank: number) {
  if (rank === 1) return '\u{1F947}';
  if (rank === 2) return '\u{1F948}';
  if (rank === 3) return '\u{1F949}';
  return `#${rank}`;
}

function scoreColor(total: number): string {
  if (total >= 80) return '#059669';
  if (total >= 60) return '#d97706';
  return '#dc2626';
}

function scoreBarColor(total: number): string {
  if (total >= 80) return '#059669';
  if (total >= 60) return '#d97706';
  return '#dc2626';
}

type SortField = 'total' | 'grandTotal';

export default function LeaderboardPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [showTrend, setShowTrend] = useState(false);
  const [sortField, setSortField] = useState<SortField>('grandTotal');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const trendMonths = useMemo(() => getLastNMonths(6), []);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await authFetch('/api/scores/leaderboard?months=12');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  // Ranked entries for selected month
  const ranked = useMemo(() => {
    const entries = data
      .filter(e => e.scores[selectedMonth])
      .map(e => ({
        ...e,
        total: e.scores[selectedMonth]?.total ?? 0,
        grandTotal: e.scores[selectedMonth]?.grandTotal ?? 0,
      }));

    entries.sort((a, b) => {
      const diff = sortDir === 'desc'
        ? b[sortField] - a[sortField]
        : a[sortField] - b[sortField];
      return diff || a.repName.localeCompare(b.repName);
    });

    return entries;
  }, [data, selectedMonth, sortField, sortDir]);

  // KPI summary cards
  const kpis = useMemo(() => {
    if (ranked.length === 0) return { avgScore: 0, topPerformer: '-', basScored: 0, atRisk: 0 };
    const totals = ranked.map(r => r.total);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const top = ranked[0];
    const atRisk = ranked.filter(r => r.total < 60).length;
    return {
      avgScore: Math.round(avg),
      topPerformer: top?.repName || '-',
      basScored: ranked.length,
      atRisk,
    };
  }, [ranked]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const sortArrow = (field: SortField) => sortField === field ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : '';

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Leaderboard
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          BA performance ranking
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Month</label>
            <input
              className="input"
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ width: 180 }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#374151', cursor: 'pointer', paddingBottom: 6 }}>
            <input
              type="checkbox"
              checked={showTrend}
              onChange={e => setShowTrend(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Show monthly trend
          </label>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading leaderboard...</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Avg Score</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: scoreColor(kpis.avgScore) }}>{kpis.avgScore}/100</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Top Performer</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0054A6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {kpis.topPerformer}
                </div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>BAs Scored</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{kpis.basScored}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>BAs at Risk (&lt;60%)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: kpis.atRisk > 0 ? '#dc2626' : '#059669' }}>{kpis.atRisk}</div>
              </div>
            </div>

            {/* Ranking Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                Rankings — {formatMonth(selectedMonth)}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60, textAlign: 'center' }}>Rank</th>
                      <th style={{ minWidth: 180 }}>BA Name</th>
                      <th style={{ minWidth: 200 }}>Score</th>
                      <th style={{ textAlign: 'center', cursor: 'pointer', minWidth: 80 }} onClick={() => toggleSort('total')}>
                        Score/100{sortArrow('total')}
                      </th>
                      <th style={{ textAlign: 'center', minWidth: 60 }}>Bonus</th>
                      <th style={{ textAlign: 'center', cursor: 'pointer', minWidth: 80 }} onClick={() => toggleSort('grandTotal')}>
                        Grand Total{sortArrow('grandTotal')}
                      </th>
                      {showTrend && trendMonths.slice(1).map(m => (
                        <th key={m} style={{ textAlign: 'center', minWidth: 70, fontSize: '0.7rem' }}>
                          {formatMonth(m)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.length === 0 ? (
                      <tr>
                        <td colSpan={6 + (showTrend ? trendMonths.length - 1 : 0)} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                          No scores for {formatMonth(selectedMonth)}
                        </td>
                      </tr>
                    ) : ranked.map((entry, i) => {
                      const rank = i + 1;
                      const barPct = Math.min((entry.total / 100) * 100, 100);
                      const bonus = entry.grandTotal - entry.total;
                      return (
                        <tr
                          key={entry.email}
                          onClick={() => router.push(`/leaderboard/${encodeURIComponent(entry.email)}`)}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <td style={{ textAlign: 'center', fontSize: rank <= 3 ? '1.2rem' : '0.85rem', fontWeight: rank <= 3 ? 700 : 400 }}>
                            {rankBadge(rank)}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{entry.repName}</div>
                            <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{entry.email}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${barPct}%`,
                                  height: '100%',
                                  background: scoreBarColor(entry.total),
                                  borderRadius: 4,
                                  transition: 'width 0.3s ease',
                                }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: scoreColor(entry.total) }}>
                            {entry.total}
                          </td>
                          <td style={{ textAlign: 'center', color: bonus > 0 ? '#0054A6' : '#9ca3af' }}>
                            +{bonus}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#0054A6', fontSize: '1rem' }}>
                            {entry.grandTotal}
                          </td>
                          {showTrend && trendMonths.slice(1).map(m => {
                            const ms = data.find(d => d.email === entry.email)?.scores[m];
                            return (
                              <td key={m} style={{ textAlign: 'center', fontSize: '0.8rem', color: ms ? scoreColor(ms.total) : '#d1d5db' }}>
                                {ms ? ms.grandTotal : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
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
