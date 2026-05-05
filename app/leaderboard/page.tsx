'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface DispoSalesData {
  sales: Record<string, Record<string, Record<string, number>>>;
  stock: Record<string, Record<string, { soh: number; soo: number }>>;
  prices: Record<string, { inclSP: number; promSP: number }>;
  ytd: Record<string, Record<string, number>>;
  uploads: unknown[];
}

interface MonthScore {
  total: number;
  grandTotal: number;
}

interface LeaderboardEntry {
  email: string;
  repName: string;
  storeName: string;
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
  const [dispoData, setDispoData] = useState<DispoSalesData | null>(null);
  const [visitsData, setVisitsData] = useState<{ email: string; repName: string; storeName: string; formsCompleted: number }[]>([]);

  // Column resize state
  const DEFAULT_WIDTHS = useMemo(() => [60, 180, 160, 200, 80, 60, 100, 80, 100], []);
  const [colWidths, setColWidths] = useState<number[]>(DEFAULT_WIDTHS);
  const [trendColWidth, setTrendColWidth] = useState(70);
  const dragRef = useRef<{ colIdx: number; startX: number; startW: number; isTrend: boolean } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent, colIdx: number, isTrend = false) => {
    e.preventDefault();
    e.stopPropagation();
    const startW = isTrend ? trendColWidth : colWidths[colIdx];
    dragRef.current = { colIdx, startX: e.clientX, startW, isTrend };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colWidths, trendColWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const delta = e.clientX - d.startX;
      const newW = Math.max(40, d.startW + delta);
      if (d.isTrend) {
        setTrendColWidth(newW);
      } else {
        setColWidths(prev => {
          const next = [...prev];
          next[d.colIdx] = newW;
          return next;
        });
      }
    }
    function onMouseUp() {
      if (dragRef.current) {
        dragRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const resizeHandle = useCallback((colIdx: number, isTrend = false) => (
    <div
      onMouseDown={e => onResizeStart(e, colIdx, isTrend)}
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
        cursor: 'col-resize', zIndex: 1,
      }}
    />
  ), [onResizeStart]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [lbRes, dispoRes, visitsRes] = await Promise.all([
        authFetch('/api/scores/leaderboard?months=12'),
        authFetch('/api/dispo'),
        authFetch('/api/visits'),
      ]);
      if (lbRes.ok) setData(await lbRes.json());
      if (dispoRes.ok) setDispoData(await dispoRes.json());
      if (visitsRes.ok) setVisitsData(await visitsRes.json());
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

  // DISPO sales per store (all products combined)
  const storeSales = useMemo(() => {
    if (!dispoData) return new Map<string, { vol: number; val: number }>();
    const map = new Map<string, { vol: number; val: number }>();
    for (const monthData of Object.values(dispoData.sales)) {
      for (const [store, products] of Object.entries(monthData)) {
        if (!map.has(store)) map.set(store, { vol: 0, val: 0 });
        const entry = map.get(store)!;
        for (const [article, units] of Object.entries(products)) {
          entry.vol += units;
          const p = dispoData.prices[article];
          if (p) {
            const price = p.promSP > 0 ? p.promSP : p.inclSP;
            entry.val += units * price;
          }
        }
      }
    }
    return map;
  }, [dispoData]);

  const hasDispoData = storeSales.size > 0;

  // Top Sales Store (store with highest total sales value)
  const topSalesStore = useMemo(() => {
    if (!hasDispoData) return null;
    let best: { store: string; val: number; ba: string } | null = null;
    for (const [store, { val }] of storeSales.entries()) {
      if (!best || val > best.val) {
        // Find BA assigned to this store
        const ba = data.find(d => d.storeName === store);
        best = { store, val, ba: ba?.repName || '' };
      }
    }
    return best;
  }, [storeSales, hasDispoData, data]);

  // Top Form Compliance (BA with most forms completed)
  const topFormBA = useMemo(() => {
    if (visitsData.length === 0) return null;
    const formMap = new Map<string, { name: string; forms: number }>();
    for (const v of visitsData) {
      const key = (v.email || v.repName || '').toLowerCase();
      if (!key) continue;
      if (!formMap.has(key)) formMap.set(key, { name: v.repName || v.email || key, forms: 0 });
      formMap.get(key)!.forms += v.formsCompleted || 0;
    }
    let best: { name: string; forms: number } | null = null;
    for (const entry of formMap.values()) {
      if (!best || entry.forms > best.forms) best = entry;
    }
    return best;
  }, [visitsData]);

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
              {topSalesStore && (
                <div className="kpi-card">
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Top Sales Store</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {topSalesStore.store}
                  </div>
                  {topSalesStore.ba && (
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {topSalesStore.ba}
                    </div>
                  )}
                </div>
              )}
              {topFormBA && (
                <div className="kpi-card">
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Top Form Compliance</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0054A6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {topFormBA.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 2 }}>
                    {topFormBA.forms.toLocaleString()} forms
                  </div>
                </div>
              )}
            </div>

            {/* Ranking Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                Rankings — {formatMonth(selectedMonth)}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
                  <colgroup>
                    {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                    {showTrend && trendMonths.slice(1).map(m => (
                      <col key={m} style={{ width: trendColWidth }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center', position: 'relative' }}>Rank{resizeHandle(0)}</th>
                      <th style={{ position: 'relative' }}>BA Name{resizeHandle(1)}</th>
                      <th style={{ position: 'relative' }}>Store{resizeHandle(2)}</th>
                      <th style={{ position: 'relative' }}>Score{resizeHandle(3)}</th>
                      <th style={{ textAlign: 'center', cursor: 'pointer', position: 'relative' }} onClick={() => toggleSort('total')}>
                        Score/100{sortArrow('total')}{resizeHandle(4)}
                      </th>
                      <th style={{ textAlign: 'center', position: 'relative' }}>Bonus{resizeHandle(5)}</th>
                      <th style={{ textAlign: 'center', cursor: 'pointer', position: 'relative' }} onClick={() => toggleSort('grandTotal')}>
                        Grand Total{sortArrow('grandTotal')}{resizeHandle(6)}
                      </th>
                      {hasDispoData && (
                        <>
                          <th style={{ textAlign: 'right', position: 'relative' }}>Sales Vol{resizeHandle(7)}</th>
                          <th style={{ textAlign: 'right', position: 'relative' }}>Sales Val{resizeHandle(8)}</th>
                        </>
                      )}
                      {showTrend && trendMonths.slice(1).map(m => (
                        <th key={m} style={{ textAlign: 'center', fontSize: '0.7rem', position: 'relative' }}>
                          {formatMonth(m)}{resizeHandle(0, true)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.length === 0 ? (
                      <tr>
                        <td colSpan={7 + (hasDispoData ? 2 : 0) + (showTrend ? trendMonths.length - 1 : 0)} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
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
                          <td style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.repName}</div>
                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.email}</div>
                          </td>
                          <td style={{ color: '#374151', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.storeName || <span style={{ color: '#d1d5db' }}>—</span>}
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
                          {hasDispoData && (() => {
                            const ss = storeSales.get(entry.storeName);
                            return (
                              <>
                                <td style={{ textAlign: 'right', fontSize: '0.8rem', color: '#374151' }}>
                                  {ss ? ss.vol.toLocaleString() : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontSize: '0.8rem', color: '#374151' }}>
                                  {ss ? `R ${ss.val.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : '-'}
                                </td>
                              </>
                            );
                          })()}
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

            {/* DISPO sales warning */}
            {hasDispoData && (
              <div style={{ marginTop: '1rem', padding: '0.5rem 0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.7rem', color: '#92400e' }}>
                Sales value is calculated (units x price) and not supplied directly from channel.
              </div>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
