'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import { toPng } from 'html-to-image';
import type { BAScore } from '@/lib/scoreData';
import { KPI_DEFS, CORE_KPI_DEFS, calcTotal, calcGrandTotal } from '@/lib/scoreData';

function formatMonth(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

function scoreColor(total: number): string {
  if (total >= 80) return '#059669';
  if (total >= 60) return '#d97706';
  return '#dc2626';
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
  return months.reverse();
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BADetailPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const params = useParams();
  const router = useRouter();
  const email = decodeURIComponent(params.email as string);

  const [allScores, setAllScores] = useState<Record<string, BAScore>>({});
  const [loadingData, setLoadingData] = useState(true);
  const captureRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const months = useMemo(() => getLastNMonths(12), []);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const scoreMap: Record<string, BAScore> = {};
      // Load each month's scores and find this BA
      for (const month of months) {
        const res = await authFetch(`/api/scores?month=${month}`);
        if (res.ok) {
          const scores: BAScore[] = await res.json();
          const match = scores.find(s => s.email.toLowerCase() === email.toLowerCase());
          if (match) scoreMap[month] = match;
        }
      }
      setAllScores(scoreMap);
    } catch { /* ignore */ }
    setLoadingData(false);
  }, [email, months]);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  const curMonth = currentMonth();
  const currentScore = allScores[curMonth];
  const repName = currentScore?.repName || Object.values(allScores)[0]?.repName || email;

  // Radar data: 7 core KPIs normalized to percentage (actual/max * 100)
  const radarData = useMemo(() => {
    if (!currentScore) return [];
    return CORE_KPI_DEFS.map(kpi => ({
      kpi: kpi.label.length > 12 ? kpi.label.substring(0, 11) + '...' : kpi.label,
      fullLabel: kpi.label,
      actual: Number(currentScore[kpi.key as keyof BAScore]) || 0,
      max: kpi.max,
      pct: Math.round(((Number(currentScore[kpi.key as keyof BAScore]) || 0) / kpi.max) * 100),
    }));
  }, [currentScore]);

  // Trend line data
  const trendData = useMemo(() => {
    return months
      .filter(m => allScores[m])
      .map(m => {
        const s = allScores[m];
        return {
          month: formatMonth(m),
          total: calcTotal(s),
          grandTotal: calcGrandTotal(s),
        };
      });
  }, [allScores, months]);

  async function handleCapture() {
    if (!captureRef.current) return;
    setCapturing(true);
    setCapturedBlob(null);
    try {
      const dataUrl = await toPng(captureRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      setCapturedBlob(blob);
    } catch { /* ignore */ }
    setCapturing(false);
  }

  function handleDownload() {
    if (!capturedBlob) return;
    const url = URL.createObjectURL(capturedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${repName.replace(/\s+/g, '_')}-scorecard.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `${repName.replace(/\s+/g, '_')}-scorecard.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${repName} Scorecard` });
      } catch { /* user cancelled */ }
    } else {
      handleDownload();
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const curTotal = currentScore ? calcTotal(currentScore) : 0;
  const curGrand = currentScore ? calcGrandTotal(currentScore) : 0;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Back button */}
        <button
          onClick={() => router.push('/leaderboard')}
          style={{
            background: 'none', border: 'none', color: '#0054A6', cursor: 'pointer',
            fontSize: '0.85rem', marginBottom: '1rem', padding: 0, display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          ← Back to Leaderboard
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
              {repName}
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>{email}</p>
          </div>
          {currentScore && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Score</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: scoreColor(curTotal) }}>
                  {curTotal}/100
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Grand Total</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>
                  {curGrand}/110
                </div>
              </div>
            </div>
          )}

          {/* Screenshot / Share buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {capturedBlob ? (
              <>
                <button
                  onClick={handleDownload}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    background: '#0054A6', color: 'white', border: 'none', borderRadius: 6,
                    fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                  Download
                </button>
                <button
                  onClick={handleShare}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    background: '#059669', color: 'white', border: 'none', borderRadius: 6,
                    fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  Share
                </button>
                <button
                  onClick={() => setCapturedBlob(null)}
                  style={{ padding: '6px', color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer' }}
                  title="Dismiss"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </>
            ) : (
              <button
                onClick={handleCapture}
                disabled={capturing || Object.keys(allScores).length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  background: '#0054A6', color: 'white', border: 'none', borderRadius: 6,
                  fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                  opacity: (capturing || Object.keys(allScores).length === 0) ? 0.5 : 1,
                }}
                title="Screenshot scorecard"
              >
                {capturing ? (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                ) : (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
                Screenshot
              </button>
            )}
          </div>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading BA data...</div>
        ) : Object.keys(allScores).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No score data found for this BA.
          </div>
        ) : (
          <div ref={captureRef} style={{ background: 'white', padding: '1rem', borderRadius: 12 }}>
            {/* Captured header — visible in screenshot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{repName}</div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{email}</div>
              </div>
              {currentScore && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>Score</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: scoreColor(curTotal) }}>{curTotal}/100</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>Grand Total</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0054A6' }}>{curGrand}/110</div>
                  </div>
                </div>
              )}
            </div>

            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
              {/* Radar chart */}
              <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  KPI Breakdown — {formatMonth(curMonth)}
                </h3>
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="kpi" tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Radar name="Score %" dataKey="pct" stroke="#0054A6" fill="#0054A6" fillOpacity={0.25} strokeWidth={2} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const d = payload[0].payload as { fullLabel: string; actual: number; max: number; pct: number };
                          return (
                            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: '0.8rem' }}>
                              <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.fullLabel}</div>
                              <div>{d.actual}/{d.max} ({d.pct}%)</div>
                            </div>
                          );
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>No data for current month</div>
                )}
              </div>

              {/* Trend line chart */}
              <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Monthly Trend
                </h3>
                {trendData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendData}>
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis domain={[0, 110]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="total" name="Score (100)" stroke="#0054A6" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="grandTotal" name="Grand Total (110)" stroke="#00A0E9" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : trendData.length === 1 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Only 1 month of data — trend requires 2+ months</div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>No trend data available</div>
                )}
              </div>
            </div>

            {/* Scores table — all months */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                All Monthly Scores
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      {KPI_DEFS.map(kpi => (
                        <th key={kpi.key} style={{ textAlign: 'center', fontSize: '0.7rem' }}>
                          {kpi.label.length > 14 ? kpi.label.substring(0, 13) + '...' : kpi.label}
                          <div style={{ color: '#9ca3af', fontWeight: 400 }}>/{kpi.max}</div>
                        </th>
                      ))}
                      <th style={{ textAlign: 'center' }}>Total</th>
                      <th style={{ textAlign: 'center' }}>Grand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.filter(m => allScores[m]).reverse().map(m => {
                      const s = allScores[m];
                      const total = calcTotal(s);
                      const grand = calcGrandTotal(s);
                      return (
                        <tr key={m}>
                          <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{formatMonth(m)}</td>
                          {KPI_DEFS.map(kpi => {
                            const val = Number(s[kpi.key as keyof BAScore]) || 0;
                            return (
                              <td key={kpi.key} style={{ textAlign: 'center', color: val === kpi.max ? '#059669' : val === 0 ? '#d1d5db' : '#374151' }}>
                                {val}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'center', fontWeight: 600, color: scoreColor(total) }}>
                            {total}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#0054A6' }}>
                            {grand}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
