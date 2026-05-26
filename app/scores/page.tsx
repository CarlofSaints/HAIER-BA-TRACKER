'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import type { BAScore } from '@/lib/scoreData';
import { KPI_DEFS } from '@/lib/scoreData';
import type { WeeklyBAScore } from '@/lib/weeklyScoreData';
import { getWeeksForMonth, getCurrentWeek } from '@/lib/weekUtils';
import type { WeekDef } from '@/lib/weekUtils';

interface AutoCalcItem {
  email: string;
  repName: string;
  score: number;
  totalVisits: number;
  onTimeVisits: number;
}

interface TrainingAutoItem {
  email: string;
  repName: string;
  completedCount: number;
  minRequired: number;
  autoPoints: number;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function clamp(v: number, max: number) {
  return Math.max(0, Math.min(round2(v), max));
}

function monthLabel(month: string) {
  const [y, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

/** selectedWeek = 0 means MTD (month-to-date summary view) */
const MTD = 0;

export default function ScoreEntryPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [month, setMonth] = useState(currentMonth());
  const [weeks, setWeeks] = useState<WeekDef[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(MTD);

  // Monthly scores (auto-calc values + aggregated totals)
  const [monthlyScores, setMonthlyScores] = useState<BAScore[]>([]);
  // Current week's editable scores (empty when MTD)
  const [weeklyScores, setWeeklyScores] = useState<WeeklyBAScore[]>([]);
  // All weeks' data for running totals
  const [allWeeksMap, setAllWeeksMap] = useState<Map<number, WeeklyBAScore[]>>(new Map());

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoCalcing, setAutoCalcing] = useState(false);
  const [trainingAutoCalcing, setTrainingAutoCalcing] = useState(false);
  const [salesAutoCalcing, setSalesAutoCalcing] = useState(false);
  const [displayAutoCalcing, setDisplayAutoCalcing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState('');

  const isMTD = selectedWeek === MTD;

  // Compute weeks when month changes
  useEffect(() => {
    const w = getWeeksForMonth(month);
    setWeeks(w);
    const cw = getCurrentWeek(month);
    setSelectedWeek(cw);
  }, [month]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      // Base fetches: monthly scores + visit-derived BA list
      const fetches: Promise<Response>[] = [
        authFetch(`/api/scores?month=${month}`),
        authFetch('/api/visits'),
      ];
      // If a specific week is selected, also fetch that week's scores
      if (!isMTD) {
        fetches.push(authFetch(`/api/scores/weekly?month=${month}&week=${selectedWeek}`));
      }

      const responses = await Promise.all(fetches);
      const existingScores: BAScore[] = responses[0].ok ? await responses[0].json() : [];
      const visits = responses[1].ok ? await responses[1].json() : [];
      const existingWeekly: WeeklyBAScore[] = (!isMTD && responses[2]?.ok) ? await responses[2].json() : [];

      // Load all weeks for running totals / MTD view
      const allWeekPromises = weeks.map(w =>
        authFetch(`/api/scores/weekly?month=${month}&week=${w.week}`)
          .then(r => r.ok ? r.json() : [])
          .then((scores: WeeklyBAScore[]) => [w.week, scores] as [number, WeeklyBAScore[]])
      );
      const allWeekResults = await Promise.all(allWeekPromises);
      const weekMap = new Map<number, WeeklyBAScore[]>(allWeekResults);
      setAllWeeksMap(weekMap);

      // Build BA list from visits
      const baMap = new Map<string, string>();
      for (const v of visits) {
        const email = (v.email || '').toLowerCase();
        if (email && !baMap.has(email)) {
          baMap.set(email, v.repName || v.email);
        }
      }
      for (const s of existingScores) {
        const email = s.email.toLowerCase();
        if (!baMap.has(email)) {
          baMap.set(email, s.repName);
        }
      }

      // Merge monthly scores
      const scoreMap = new Map<string, BAScore>();
      for (const s of existingScores) {
        scoreMap.set(s.email.toLowerCase(), s);
      }

      const merged: BAScore[] = [];
      for (const [email, repName] of baMap) {
        if (scoreMap.has(email)) {
          merged.push({ ...scoreMap.get(email)!, repName });
        } else {
          merged.push({
            email, repName, month,
            monthlySales: 0, dailySales: 0, checkInOnTime: 0,
            feedback: 0, feedbackAuto: 0, displayInspection: 0, weeklySummaries: 0,
            training: 0, trainingAuto: 0, displayAuto: 0, bonusSuggestions: 0,
            updatedAt: '', updatedBy: '',
          });
        }
      }
      merged.sort((a, b) => a.repName.localeCompare(b.repName));
      setMonthlyScores(merged);

      // Build weekly scores for this week, matched to BA list
      if (!isMTD) {
        const weekMap2 = new Map<string, WeeklyBAScore>();
        for (const ws of existingWeekly) {
          weekMap2.set(ws.email.toLowerCase(), ws);
        }
        const weekLabel = weeks.find(w => w.week === selectedWeek)?.label || `Week ${selectedWeek}`;
        const mergedWeekly: WeeklyBAScore[] = merged.map(s => {
          const email = s.email.toLowerCase();
          const existing = weekMap2.get(email);
          if (existing) return { ...existing, repName: s.repName };
          return {
            email, repName: s.repName, month, week: selectedWeek, weekLabel,
            displayManual: 0, weeklySummaries: 0, trainingManual: 0, bonusSuggestions: 0,
            updatedAt: '', updatedBy: '',
          };
        });
        setWeeklyScores(mergedWeekly);
      } else {
        setWeeklyScores([]);
      }
    } catch { /* ignore */ }
    setLoadingData(false);
  }, [month, selectedWeek, weeks, isMTD]);

  useEffect(() => {
    if (session && weeks.length > 0) loadData();
  }, [session, loadData, weeks]);

  function updateWeeklyScore(index: number, key: keyof WeeklyBAScore, value: number) {
    setWeeklyScores(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  /**
   * Calculate the monthly manual sum for a given BA across all weeks.
   * When a specific week is selected, uses live-edited values for that week.
   * When MTD, sums all weeks from allWeeksMap (no live edits).
   */
  function getMonthlyManualSum(email: string, field: 'displayManual' | 'weeklySummaries' | 'trainingManual' | 'bonusSuggestions'): number {
    const emailLc = email.toLowerCase();
    let sum = 0;

    if (isMTD) {
      // Sum all weeks from saved data
      for (const [, weekScores] of allWeeksMap) {
        const ws = weekScores.find(s => s.email.toLowerCase() === emailLc);
        if (ws) sum += ws[field] || 0;
      }
    } else {
      // Sum other weeks from saved data, use live data for selected week
      for (const [weekNum, weekScores] of allWeeksMap) {
        if (weekNum === selectedWeek) continue;
        const ws = weekScores.find(s => s.email.toLowerCase() === emailLc);
        if (ws) sum += ws[field] || 0;
      }
      const currentWs = weeklyScores.find(s => s.email.toLowerCase() === emailLc);
      if (currentWs) sum += currentWs[field] || 0;
    }

    return round2(sum);
  }

  function calcRunningTotal(s: BAScore, email: string): number {
    const trainingAuto = s.trainingAuto || 0;
    const displayAuto = s.displayAuto || 0;
    const trainingManualSum = Math.min(15, getMonthlyManualSum(email, 'trainingManual'));
    const displayManualSum = Math.min(15, getMonthlyManualSum(email, 'displayManual'));
    const weeklySumSum = Math.min(10, getMonthlyManualSum(email, 'weeklySummaries'));

    const training = Math.min(20, trainingAuto + trainingManualSum);
    const display = Math.min(20, displayAuto + displayManualSum);
    const total = s.monthlySales + s.checkInOnTime + display + weeklySumSum + training;
    return round2(Math.min(total, 100));
  }

  function calcRunningGrand(s: BAScore, email: string): number {
    const total = calcRunningTotal(s, email);
    const bonusSum = Math.min(10, getMonthlyManualSum(email, 'bonusSuggestions'));
    return round2(Math.min(total + bonusSum, 110));
  }

  async function handleAutoCalc() {
    setAutoCalcing(true);
    try {
      const res = await authFetch('/api/scores/auto-calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) throw new Error('Auto-calc failed');
      const results: AutoCalcItem[] = await res.json();

      setMonthlyScores(prev => {
        const next = [...prev];
        for (const r of results) {
          const idx = next.findIndex(s => s.email.toLowerCase() === r.email.toLowerCase());
          if (idx >= 0) {
            next[idx] = { ...next[idx], checkInOnTime: r.score };
          }
        }
        return next;
      });
      showToast(`Visit scores calculated for ${results.length} BAs`);
    } catch {
      showToast('Auto-calc failed');
    }
    setAutoCalcing(false);
  }

  async function handleTrainingAutoCalc() {
    setTrainingAutoCalcing(true);
    try {
      const res = await authFetch('/api/scores/auto-calc-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) throw new Error('Training auto-calc failed');
      const results: TrainingAutoItem[] = await res.json();

      const updated = [...monthlyScores];
      for (const r of results) {
        const idx = updated.findIndex(s => s.email.toLowerCase() === r.email.toLowerCase());
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], trainingAuto: r.autoPoints };
        }
      }
      setMonthlyScores(updated);

      const saveRes = await authFetch('/api/scores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, scores: updated }),
      });
      if (!saveRes.ok) throw new Error('Failed to save scores');

      showToast(`Training auto-scores calculated and saved for ${results.length} BAs`);
    } catch {
      showToast('Training auto-calc failed');
    }
    setTrainingAutoCalcing(false);
  }

  async function handleSalesAutoCalc() {
    setSalesAutoCalcing(true);
    try {
      const res = await authFetch('/api/scores/auto-calc-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Sales auto-calc failed');
      }
      const results: { email: string; repName: string; points: number; variance: number }[] = await res.json();

      const updated = [...monthlyScores];
      let updatedCount = 0;
      for (const r of results) {
        const idx = updated.findIndex(s => s.email.toLowerCase() === r.email.toLowerCase());
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], monthlySales: r.points, salesVariance: r.variance };
          updatedCount++;
        }
      }
      setMonthlyScores(updated);

      const saveRes = await authFetch('/api/scores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, scores: updated }),
      });
      if (!saveRes.ok) throw new Error('Failed to save scores');

      showToast(`Sales scores calculated and saved for ${updatedCount} BAs`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sales auto-calc failed');
    }
    setSalesAutoCalcing(false);
  }

  async function handleDisplayAutoCalc() {
    setDisplayAutoCalcing(true);
    try {
      const res = await authFetch('/api/scores/auto-calc-display', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) throw new Error('Display auto-calc failed');
      const results: { email: string; repName: string; completedCount: number; autoPoints: number }[] = await res.json();

      const updated = [...monthlyScores];
      for (const r of results) {
        const idx = updated.findIndex(s => s.email.toLowerCase() === r.email.toLowerCase());
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], displayAuto: r.autoPoints };
        }
      }
      setMonthlyScores(updated);

      const saveRes = await authFetch('/api/scores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, scores: updated }),
      });
      if (!saveRes.ok) throw new Error('Failed to save scores');

      showToast(`Display auto-scores calculated and saved for ${results.length} BAs`);
    } catch {
      showToast('Display auto-calc failed');
    }
    setDisplayAutoCalcing(false);
  }

  async function handleSeedFromVisits() {
    setSeeding(true);
    try {
      const res = await authFetch('/api/scores/seed-from-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Seed failed');
      const result = await res.json();
      showToast(`Seeded ${result.bas} BA scores across ${result.months} months from visit data`);
      loadData();
    } catch {
      showToast('Failed to seed scores from visits');
    }
    setSeeding(false);
  }

  async function handleSaveWeek() {
    if (isMTD) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/scores/weekly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, week: selectedWeek, scores: weeklyScores }),
      });
      if (!res.ok) throw new Error('Save failed');

      setAllWeeksMap(prev => {
        const next = new Map(prev);
        next.set(selectedWeek, [...weeklyScores]);
        return next;
      });

      const scoresRes = await authFetch(`/api/scores?month=${month}`);
      if (scoresRes.ok) {
        const updated: BAScore[] = await scoresRes.json();
        const scoreMap = new Map<string, BAScore>();
        for (const s of updated) scoreMap.set(s.email.toLowerCase(), s);
        setMonthlyScores(prev =>
          prev.map(s => {
            const u = scoreMap.get(s.email.toLowerCase());
            return u ? { ...u, repName: s.repName } : s;
          })
        );
      }

      showToast('Week scores saved successfully');
    } catch {
      showToast('Failed to save week scores');
    }
    setSaving(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const currentWeekDef = weeks.find(w => w.week === selectedWeek);
  const viewLabel = isMTD ? `MTD — ${monthLabel(month)}` : `${currentWeekDef?.label || `Week ${selectedWeek}`} of ${monthLabel(month)}`;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Score Entry
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Enter weekly KPI scores for each BA — monthly totals build up automatically
        </p>

        {/* Controls row */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Month</label>
            <input
              className="input"
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              style={{ width: 180 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>View</label>
            <select
              className="input"
              value={selectedWeek}
              onChange={e => setSelectedWeek(Number(e.target.value))}
              style={{ width: 180 }}
            >
              <option value={MTD}>MTD (Full Month)</option>
              {weeks.map(w => (
                <option key={w.week} value={w.week}>{w.label}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-outline"
            onClick={handleAutoCalc}
            disabled={autoCalcing || loadingData}
          >
            {autoCalcing ? 'Calculating...' : 'Auto-Calculate Visits'}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleTrainingAutoCalc}
            disabled={trainingAutoCalcing || loadingData}
            style={{ borderColor: '#7c3aed', color: '#7c3aed' }}
          >
            {trainingAutoCalcing ? 'Calculating...' : 'Auto-Calculate Training'}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleSalesAutoCalc}
            disabled={salesAutoCalcing || loadingData}
            style={{ borderColor: '#d97706', color: '#d97706' }}
          >
            {salesAutoCalcing ? 'Calculating...' : 'Auto-Calculate Sales'}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleDisplayAutoCalc}
            disabled={displayAutoCalcing || loadingData}
            style={{ borderColor: '#0054A6', color: '#0054A6' }}
          >
            {displayAutoCalcing ? 'Calculating...' : 'Auto-Calculate Display'}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleSeedFromVisits}
            disabled={seeding || loadingData}
            style={{ borderColor: '#00A0E9', color: '#00A0E9' }}
          >
            {seeding ? 'Seeding...' : 'Seed All Months from Visits'}
          </button>
          {!isMTD && (
            <button
              className="btn btn-primary"
              onClick={handleSaveWeek}
              disabled={saving || loadingData || weeklyScores.length === 0}
            >
              {saving ? 'Saving...' : 'Save Week Scores'}
            </button>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 20, right: 20, zIndex: 1000,
            background: toast.includes('fail') || toast.includes('Failed') ? '#dc2626' : '#059669',
            color: 'white', padding: '0.75rem 1.25rem', borderRadius: 8,
            fontSize: '0.85rem', fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            {toast}
          </div>
        )}

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading scores...</div>
        ) : monthlyScores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No BAs found. Upload visit data first, then return here to enter scores.
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.8rem', color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {monthlyScores.length} BAs — {viewLabel}
                {isMTD && (
                  <span style={{
                    marginLeft: 8, background: '#dbeafe', color: '#1e40af',
                    fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  }}>
                    Read-only summary
                  </span>
                )}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                {isMTD
                  ? 'Showing monthly totals across all weeks. Select a week to edit.'
                  : 'Auto-calc KPIs are monthly. Manual KPIs are entered per week and sum to monthly totals.'
                }
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: '#f9fafb', zIndex: 2, minWidth: 160 }}>BA Name</th>
                    <th style={{ textAlign: 'center', minWidth: 80 }}>
                      <div>Monthly Sales</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>auto / max 40</div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: 80 }}>
                      <div>Visits</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>auto / max 10</div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: 130 }}>
                      <div>Display</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>
                        {isMTD ? 'auto 5 + manual 15 / max 20' : 'auto 5 + weekly manual 15'}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: 100 }}>
                      <div>Weekly Summaries</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>
                        {isMTD ? 'max 10' : 'weekly / max 10'}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: 130 }}>
                      <div>Training</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>
                        {isMTD ? 'auto 5 + manual 15 / max 20' : 'auto 5 + weekly manual 15'}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: 100 }}>
                      <div>Bonus</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>
                        {isMTD ? 'max 10' : 'weekly / max 10'}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: 60 }}>
                      <div>Total</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>/100</div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: 60 }}>
                      <div>Grand</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 400 }}>/110</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyScores.map((s, i) => {
                    const ws = weeklyScores[i]; // undefined in MTD mode
                    const total = calcRunningTotal(s, s.email);
                    const grand = calcRunningGrand(s, s.email);

                    // Monthly manual sums for sub-labels and MTD display
                    const displayManualSum = getMonthlyManualSum(s.email, 'displayManual');
                    const displayManualCapped = round2(Math.min(15, displayManualSum));
                    const displayAutoVal = s.displayAuto || 0;
                    const displayTotal = round2(Math.min(20, displayAutoVal + displayManualCapped));

                    const trainingManualSum = getMonthlyManualSum(s.email, 'trainingManual');
                    const trainingManualCapped = round2(Math.min(15, trainingManualSum));
                    const trainingAutoVal = s.trainingAuto || 0;
                    const trainingTotal = round2(Math.min(20, trainingAutoVal + trainingManualCapped));

                    const weeklySumSum = getMonthlyManualSum(s.email, 'weeklySummaries');
                    const weeklySumCapped = round2(Math.min(10, weeklySumSum));

                    const bonusSum = getMonthlyManualSum(s.email, 'bonusSuggestions');
                    const bonusCapped = round2(Math.min(10, bonusSum));

                    return (
                      <tr key={s.email}>
                        <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1, fontWeight: 500, fontSize: '0.8rem' }}>
                          <div>{s.repName}</div>
                          <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{s.email}</div>
                        </td>

                        {/* Monthly Sales — locked auto badge */}
                        <td style={{ textAlign: 'center' }}>
                          <div
                            title={s.salesVariance != null ? `${s.salesVariance}% of target achieved` : 'Auto-calculated from DISPO sales data'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              background: '#f3f4f6', borderRadius: 4, padding: '3px 8px',
                              fontSize: '0.8rem', fontWeight: 600, color: s.monthlySales === 40 ? '#059669' : '#9ca3af',
                              border: '1px solid #e5e7eb', minWidth: 52,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            {s.monthlySales}
                          </div>
                          {s.salesVariance != null && (
                            <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 1 }}>{s.salesVariance}%</div>
                          )}
                        </td>

                        {/* Check-in — locked auto badge */}
                        <td style={{ textAlign: 'center' }}>
                          <div
                            title="Auto-calculated from visit check-in data"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              background: '#f3f4f6', borderRadius: 4, padding: '3px 8px',
                              fontSize: '0.8rem', fontWeight: 600, color: s.checkInOnTime > 0 ? '#0054A6' : '#9ca3af',
                              border: '1px solid #e5e7eb', minWidth: 52,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            {s.checkInOnTime}
                          </div>
                        </td>

                        {/* Display: auto + manual */}
                        <td style={{ textAlign: 'center' }}>
                          {isMTD ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, minWidth: 28, textAlign: 'center' }}
                                  title={`Auto: ${displayAutoVal}/5`}>{displayAutoVal}</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>+</span>
                                <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.8rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', minWidth: 42, textAlign: 'center' }}
                                  title={`Manual total across weeks: ${displayManualCapped}/15`}>{displayManualCapped}</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>=</span>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: displayTotal >= 20 ? '#059669' : '#374151' }}>{displayTotal}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <span
                                  style={{ background: '#dbeafe', color: '#1e40af', fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, minWidth: 28, textAlign: 'center' }}
                                  title={`Auto-calculated: ${displayAutoVal}/5`}
                                >{displayAutoVal}</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>+</span>
                                <input
                                  type="number" min={0} max={15} step="0.01"
                                  value={ws?.displayManual || 0}
                                  onChange={e => {
                                    const v = clamp(Number(e.target.value) || 0, 15);
                                    updateWeeklyScore(i, 'displayManual', v);
                                  }}
                                  style={{ width: 48, textAlign: 'center', padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem' }}
                                />
                              </div>
                              <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>
                                MTD: <span style={{ color: '#1e40af' }}>auto {displayAutoVal}</span> + <span style={{ color: '#374151' }}>manual {displayManualCapped}</span> = <b>{displayTotal}</b>/20
                              </div>
                            </>
                          )}
                        </td>

                        {/* Weekly Summaries */}
                        <td style={{ textAlign: 'center' }}>
                          {isMTD ? (
                            <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.8rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', display: 'inline-block', minWidth: 42 }}>
                              {weeklySumCapped}
                            </span>
                          ) : (
                            <>
                              <input
                                type="number" min={0} max={10} step="0.01"
                                value={ws?.weeklySummaries || 0}
                                onChange={e => {
                                  const v = clamp(Number(e.target.value) || 0, 10);
                                  updateWeeklyScore(i, 'weeklySummaries', v);
                                }}
                                style={{ width: 52, textAlign: 'center', padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem' }}
                              />
                              <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>
                                MTD: <b>{weeklySumCapped}</b>/10
                              </div>
                            </>
                          )}
                        </td>

                        {/* Training: auto + manual */}
                        <td style={{ textAlign: 'center' }}>
                          {isMTD ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, minWidth: 28, textAlign: 'center' }}
                                  title={`Auto: ${trainingAutoVal}/5`}>{trainingAutoVal}</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>+</span>
                                <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.8rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', minWidth: 42, textAlign: 'center' }}
                                  title={`Manual total across weeks: ${trainingManualCapped}/15`}>{trainingManualCapped}</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>=</span>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: trainingTotal >= 20 ? '#059669' : '#374151' }}>{trainingTotal}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <span
                                  style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, minWidth: 28, textAlign: 'center' }}
                                  title={`Auto-calculated: ${trainingAutoVal}/5`}
                                >{trainingAutoVal}</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>+</span>
                                <input
                                  type="number" min={0} max={15} step="0.01"
                                  value={ws?.trainingManual || 0}
                                  onChange={e => {
                                    const v = clamp(Number(e.target.value) || 0, 15);
                                    updateWeeklyScore(i, 'trainingManual', v);
                                  }}
                                  style={{ width: 48, textAlign: 'center', padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem' }}
                                />
                              </div>
                              <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>
                                MTD: <span style={{ color: '#7c3aed' }}>auto {trainingAutoVal}</span> + <span style={{ color: '#374151' }}>manual {trainingManualCapped}</span> = <b>{trainingTotal}</b>/20
                              </div>
                            </>
                          )}
                        </td>

                        {/* Bonus */}
                        <td style={{ textAlign: 'center' }}>
                          {isMTD ? (
                            <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.8rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', display: 'inline-block', minWidth: 42 }}>
                              {bonusCapped}
                            </span>
                          ) : (
                            <>
                              <input
                                type="number" min={0} max={10} step="0.01"
                                value={ws?.bonusSuggestions || 0}
                                onChange={e => {
                                  const v = clamp(Number(e.target.value) || 0, 10);
                                  updateWeeklyScore(i, 'bonusSuggestions', v);
                                }}
                                style={{ width: 52, textAlign: 'center', padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem' }}
                              />
                              <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>
                                MTD: <b>{bonusCapped}</b>/10
                              </div>
                            </>
                          )}
                        </td>

                        {/* Total */}
                        <td style={{ textAlign: 'center', fontWeight: 600, color: total >= 80 ? '#059669' : total >= 60 ? '#d97706' : '#dc2626' }}>
                          {total}
                        </td>
                        {/* Grand */}
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
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
