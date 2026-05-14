'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface MonthScore {
  total: number;
  monthlySales: number;
  checkInOnTime: number;
  feedback: number;
  displayInspection: number;
  training: number;
  salesVol?: number;
  salesVal?: number;
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

export default function LeaderboardPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [showTrend, setShowTrend] = useState(false);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const trendMonths = useMemo(() => getLastNMonths(6), []);

  // Column resize state
  const DEFAULT_WIDTHS = useMemo(() => [60, 180, 160, 200, 70, 70, 60, 60, 60, 60, 80, 80], []);
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
      .map(e => {
        const ms = e.scores[selectedMonth];
        return {
          ...e,
          total: ms?.total ?? 0,
          monthlySales: ms?.monthlySales ?? 0,
          checkInOnTime: ms?.checkInOnTime ?? 0,
          feedback: ms?.feedback ?? 0,
          displayInspection: ms?.displayInspection ?? 0,
          training: ms?.training ?? 0,
          salesVol: ms?.salesVol,
          salesVal: ms?.salesVal,
        };
      });

    entries.sort((a, b) => {
      const diff = sortDir === 'desc' ? b.total - a.total : a.total - b.total;
      return diff || a.repName.localeCompare(b.repName);
    });

    return entries;
  }, [data, selectedMonth, sortDir]);

  // Check if any entry has sales data
  const hasDispoData = useMemo(() => {
    return ranked.some(e => e.salesVol !== undefined || e.salesVal !== undefined);
  }, [ranked]);

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const colCount = 10 + (hasDispoData ? 2 : 0) + (showTrend ? trendMonths.length - 1 : 0);

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
            <input className="input" type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ width: 180 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#374151', cursor: 'pointer', paddingBottom: 6 }}>
            <input type="checkbox" checked={showTrend} onChange={e => setShowTrend(e.target.checked)} style={{ width: 16, height: 16 }} />
            Show monthly trend
          </label>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading leaderboard...</div>
        ) : (
          <>
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
                      <th style={{ textAlign: 'center', cursor: 'pointer', position: 'relative' }} onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}>
                        Total{sortDir === 'desc' ? ' \u25BC' : ' \u25B2'}{resizeHandle(4)}
                      </th>
                      <th style={{ textAlign: 'center', position: 'relative' }}>
                        <div>Sales</div>
                        <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>/40</div>
                        {resizeHandle(5)}
                      </th>
                      <th style={{ textAlign: 'center', position: 'relative' }}>
                        <div>Visits</div>
                        <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>/10</div>
                        {resizeHandle(6)}
                      </th>
                      <th style={{ textAlign: 'center', position: 'relative' }}>
                        <div>Display</div>
                        <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>/15</div>
                        {resizeHandle(7)}
                      </th>
                      <th style={{ textAlign: 'center', position: 'relative' }}>
                        <div>Training</div>
                        <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>/15</div>
                        {resizeHandle(8)}
                      </th>
                      <th style={{ textAlign: 'center', position: 'relative' }}>
                        <div>Feedback</div>
                        <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>/10</div>
                        {resizeHandle(9)}
                      </th>
                      {hasDispoData && (
                        <>
                          <th style={{ textAlign: 'right', position: 'relative' }}>Sales Vol{resizeHandle(10)}</th>
                          <th style={{ textAlign: 'right', position: 'relative' }}>Sales Val{resizeHandle(11)}</th>
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
                        <td colSpan={colCount} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                          No scores for {formatMonth(selectedMonth)}
                        </td>
                      </tr>
                    ) : ranked.map((entry, i) => {
                      const rank = i + 1;
                      const barPct = Math.min((entry.total / 100) * 100, 100);
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
                                  width: `${barPct}%`, height: '100%',
                                  background: scoreBarColor(entry.total), borderRadius: 4,
                                  transition: 'width 0.3s ease',
                                }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: scoreColor(entry.total) }}>
                            {entry.total}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#374151' }}>{entry.monthlySales}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#374151' }}>{entry.checkInOnTime}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#374151' }}>{entry.displayInspection}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#374151' }}>{entry.training}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#374151' }}>{entry.feedback}</td>
                          {hasDispoData && (
                            <>
                              <td style={{ textAlign: 'right', fontSize: '0.8rem', color: '#374151' }}>
                                {entry.salesVol != null ? entry.salesVol.toLocaleString() : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontSize: '0.8rem', color: '#374151' }}>
                                {entry.salesVal != null ? `R ${entry.salesVal.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : '-'}
                              </td>
                            </>
                          )}
                          {showTrend && trendMonths.slice(1).map(m => {
                            const ms = data.find(d => d.email === entry.email)?.scores[m];
                            return (
                              <td key={m} style={{ textAlign: 'center', fontSize: '0.8rem', color: ms ? scoreColor(ms.total) : '#d1d5db' }}>
                                {ms ? ms.total : '-'}
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
