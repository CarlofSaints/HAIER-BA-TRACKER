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

interface GuidanceData {
  sales: {
    valueTarget: number; actualValue: number; variance: number;
    threshold: number; points: number; maxPoints: number;
    amountLeft: number; toThreshold: number;
  };
  checkin: {
    totalVisits: number; onTimeVisits: number; earlyCheckouts: number;
    lateVisits: number; points: number; maxPoints: number;
    lateCheckinTime: string; earlyCheckoutTime: string;
  };
  display: {
    completedChecks: number; minRequired: number; autoPoints: number;
    manualPoints: number; maxAutoPoints: number; maxManualPoints: number;
    maxPoints: number; totalPoints: number;
  };
  training: {
    completedTrainings: number; minRequired: number; autoPoints: number;
    manualPoints: number; maxAutoPoints: number; maxManualPoints: number;
    maxPoints: number; totalPoints: number;
  };
  weeklySummaries: { current: number; maxPoints: number };
  bonus: { current: number; maxPoints: number };
}

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
  const [guidance, setGuidance] = useState<GuidanceData | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
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

  // Load guidance data for current month
  const curMonth = currentMonth();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setGuidanceLoading(true);
      try {
        const res = await authFetch(`/api/scores/guidance?month=${curMonth}&email=${encodeURIComponent(email)}`);
        if (res.ok && !cancelled) {
          setGuidance(await res.json());
        }
      } catch { /* ignore */ }
      if (!cancelled) setGuidanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session, curMonth, email]);
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

            {/* KPI Guidance Cards */}
            {guidance && !guidanceLoading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {/* Sales Card */}
                {(() => {
                  const g = guidance.sales;
                  const isMax = g.points >= g.maxPoints;
                  const belowThreshold = g.variance < g.threshold && g.valueTarget > 0;
                  const pct = g.maxPoints > 0 ? Math.round((g.points / g.maxPoints) * 100) : 0;
                  const borderColor = isMax ? '#059669' : g.points === 0 ? '#dc2626' : '#d97706';
                  const bgColor = isMax ? '#f0fdf4' : g.points === 0 ? '#fef2f2' : '#fffbeb';
                  return (
                    <div style={{ background: bgColor, borderRadius: 10, padding: '0.85rem', border: `2px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={borderColor} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Sales vs Target</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: borderColor }}>{g.points}/{g.maxPoints}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                        {isMax ? 'Target achieved!' : belowThreshold
                          ? `Below ${g.threshold}% threshold — need R${g.toThreshold.toLocaleString()} more to start earning points`
                          : g.valueTarget === 0
                            ? 'No target data available'
                            : `R${g.amountLeft.toLocaleString()} left to reach 100% of target`}
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ background: borderColor, height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                      {g.valueTarget > 0 && <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 3 }}>{g.variance}% of target achieved</div>}
                    </div>
                  );
                })()}

                {/* Check-in Card */}
                {(() => {
                  const g = guidance.checkin;
                  const isMax = g.points >= g.maxPoints;
                  const hasIssues = g.lateVisits > 0 || g.earlyCheckouts > 0;
                  const pct = g.maxPoints > 0 ? Math.round((g.points / g.maxPoints) * 100) : 0;
                  const borderColor = isMax ? '#059669' : g.points === 0 && g.totalVisits > 0 ? '#dc2626' : hasIssues ? '#d97706' : '#059669';
                  const bgColor = isMax ? '#f0fdf4' : g.points === 0 && g.totalVisits > 0 ? '#fef2f2' : hasIssues ? '#fffbeb' : '#f0fdf4';
                  const msgs: string[] = [];
                  if (g.totalVisits === 0) msgs.push('No visits recorded this month');
                  else if (!hasIssues) msgs.push('All check-ins on time!');
                  else {
                    if (g.lateVisits > 0) msgs.push(`${g.lateVisits} late arrival${g.lateVisits > 1 ? 's' : ''} — check in before ${g.lateCheckinTime}`);
                    if (g.earlyCheckouts > 0) msgs.push(`${g.earlyCheckouts} early departure${g.earlyCheckouts > 1 ? 's' : ''} — stay until ${g.earlyCheckoutTime}`);
                  }
                  return (
                    <div style={{ background: bgColor, borderRadius: 10, padding: '0.85rem', border: `2px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={borderColor} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Check-in on Time</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: borderColor }}>{g.points}/{g.maxPoints}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                        {msgs.map((m, i) => <div key={i}>{m}</div>)}
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ background: borderColor, height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                      {g.totalVisits > 0 && <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 3 }}>{g.onTimeVisits}/{g.totalVisits} on-time check-ins</div>}
                    </div>
                  );
                })()}

                {/* Display Inspection Card */}
                {(() => {
                  const g = guidance.display;
                  const isMax = g.totalPoints >= g.maxPoints;
                  const pct = g.maxPoints > 0 ? Math.round((g.totalPoints / g.maxPoints) * 100) : 0;
                  const borderColor = isMax ? '#059669' : g.totalPoints === 0 ? '#dc2626' : '#3b82f6';
                  const bgColor = isMax ? '#f0fdf4' : g.totalPoints === 0 ? '#fef2f2' : '#eff6ff';
                  const autoRemaining = Math.max(0, g.minRequired - g.completedChecks);
                  const manualRemaining = Math.max(0, g.maxManualPoints - g.manualPoints);
                  const msgs: string[] = [];
                  if (isMax) { msgs.push('All checks done!'); }
                  else {
                    if (autoRemaining > 0) msgs.push(`Complete ${autoRemaining} more display check${autoRemaining > 1 ? 's' : ''} this month`);
                    else if (g.autoPoints < g.maxAutoPoints) msgs.push(`${g.completedChecks}/${g.minRequired} checks done`);
                    else msgs.push('Auto-score at maximum (5/5)');
                    if (manualRemaining > 0) msgs.push(`Manual: ${g.manualPoints}/${g.maxManualPoints} (admin-assessed)`);
                  }
                  return (
                    <div style={{ background: bgColor, borderRadius: 10, padding: '0.85rem', border: `2px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={borderColor} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Display Inspection</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: borderColor }}>{g.totalPoints}/{g.maxPoints}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                        {msgs.map((m, i) => <div key={i}>{m}</div>)}
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ background: borderColor, height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 3 }}>{g.completedChecks} checks completed (need {g.minRequired})</div>
                    </div>
                  );
                })()}

                {/* Training Card */}
                {(() => {
                  const g = guidance.training;
                  const isMax = g.totalPoints >= g.maxPoints;
                  const pct = g.maxPoints > 0 ? Math.round((g.totalPoints / g.maxPoints) * 100) : 0;
                  const borderColor = isMax ? '#059669' : g.totalPoints === 0 ? '#dc2626' : '#8b5cf6';
                  const bgColor = isMax ? '#f0fdf4' : g.totalPoints === 0 ? '#fef2f2' : '#f5f3ff';
                  const autoRemaining = Math.max(0, g.minRequired - g.completedTrainings);
                  const manualRemaining = Math.max(0, g.maxManualPoints - g.manualPoints);
                  const msgs: string[] = [];
                  if (isMax) { msgs.push('All trainings done!'); }
                  else {
                    if (autoRemaining > 0) msgs.push(`Complete ${autoRemaining} more training${autoRemaining > 1 ? 's' : ''} this month`);
                    else if (g.autoPoints < g.maxAutoPoints) msgs.push(`${g.completedTrainings}/${g.minRequired} trainings done`);
                    else msgs.push('Auto-score at maximum (5/5)');
                    if (manualRemaining > 0) msgs.push(`Manual: ${g.manualPoints}/${g.maxManualPoints} (admin-assessed)`);
                  }
                  return (
                    <div style={{ background: bgColor, borderRadius: 10, padding: '0.85rem', border: `2px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={borderColor} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Training</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: borderColor }}>{g.totalPoints}/{g.maxPoints}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                        {msgs.map((m, i) => <div key={i}>{m}</div>)}
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ background: borderColor, height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 3 }}>{g.completedTrainings} trainings completed (need {g.minRequired})</div>
                    </div>
                  );
                })()}

                {/* Weekly Summaries Card */}
                {(() => {
                  const g = guidance.weeklySummaries;
                  const isMax = g.current >= g.maxPoints;
                  const pct = g.maxPoints > 0 ? Math.round((g.current / g.maxPoints) * 100) : 0;
                  const borderColor = isMax ? '#059669' : g.current === 0 ? '#dc2626' : '#f59e0b';
                  const bgColor = isMax ? '#f0fdf4' : g.current === 0 ? '#fef2f2' : '#fffbeb';
                  const needed = Math.max(0, g.maxPoints - g.current);
                  return (
                    <div style={{ background: bgColor, borderRadius: 10, padding: '0.85rem', border: `2px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={borderColor} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Weekly Summaries</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: borderColor }}>{g.current}/{g.maxPoints}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                        {isMax ? 'Full marks!' : `${needed} more point${needed > 1 ? 's' : ''} needed (admin-assessed)`}
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ background: borderColor, height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Bonus Suggestions Card */}
                {(() => {
                  const g = guidance.bonus;
                  const isMax = g.current >= g.maxPoints;
                  const pct = g.maxPoints > 0 ? Math.round((g.current / g.maxPoints) * 100) : 0;
                  const borderColor = isMax ? '#059669' : g.current === 0 ? '#9ca3af' : '#0ea5e9';
                  const bgColor = isMax ? '#f0fdf4' : g.current === 0 ? '#f9fafb' : '#f0f9ff';
                  const available = Math.max(0, g.maxPoints - g.current);
                  return (
                    <div style={{ background: bgColor, borderRadius: 10, padding: '0.85rem', border: `2px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={borderColor} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Bonus Suggestions</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: borderColor }}>{g.current}/{g.maxPoints}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                        {isMax ? 'Max bonus earned!' : `${available} bonus point${available > 1 ? 's' : ''} available (admin-assessed)`}
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ background: borderColor, height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {guidanceLoading && (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
                Loading guidance...
              </div>
            )}

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
