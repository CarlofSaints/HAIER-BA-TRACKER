'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import type { BAScore } from '@/lib/scoreData';
import { KPI_DEFS, CORE_KPI_DEFS } from '@/lib/scoreData';

interface AutoCalcItem {
  email: string;
  repName: string;
  score: number;
  totalVisits: number;
  onTimeVisits: number;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clamp(v: number, max: number) {
  return Math.max(0, Math.min(Math.round(v), max));
}

export default function ScoreEntryPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [month, setMonth] = useState(currentMonth());
  const [scores, setScores] = useState<BAScore[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoCalcing, setAutoCalcing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState('');

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      // Load existing scores + visit-derived BA list in parallel
      const [scoresRes, visitsRes] = await Promise.all([
        authFetch(`/api/scores?month=${month}`),
        authFetch('/api/visits'),
      ]);
      const existingScores: BAScore[] = scoresRes.ok ? await scoresRes.json() : [];
      const visits = visitsRes.ok ? await visitsRes.json() : [];

      // Build BA list from visits
      const baMap = new Map<string, string>(); // email -> repName
      for (const v of visits) {
        const email = (v.email || '').toLowerCase();
        if (email && !baMap.has(email)) {
          baMap.set(email, v.repName || v.email);
        }
      }
      // Also include any BAs already in scores
      for (const s of existingScores) {
        const email = s.email.toLowerCase();
        if (!baMap.has(email)) {
          baMap.set(email, s.repName);
        }
      }

      // Merge: use existing scores where available, create empty for new BAs
      const scoreMap = new Map<string, BAScore>();
      for (const s of existingScores) {
        scoreMap.set(s.email.toLowerCase(), s);
      }

      const merged: BAScore[] = [];
      for (const [email, repName] of baMap) {
        if (scoreMap.has(email)) {
          merged.push(scoreMap.get(email)!);
        } else {
          merged.push({
            email, repName, month,
            monthlySales: 0, dailySales: 0, checkInOnTime: 0,
            feedback: 0, displayInspection: 0, weeklySummaries: 0,
            training: 0, bonusSuggestions: 0,
            updatedAt: '', updatedBy: '',
          });
        }
      }

      // Sort by name
      merged.sort((a, b) => a.repName.localeCompare(b.repName));
      setScores(merged);
    } catch { /* ignore */ }
    setLoadingData(false);
  }, [month]);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  function updateScore(index: number, key: keyof BAScore, value: number | string) {
    setScores(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function calcRowTotal(s: BAScore) {
    return Math.min(
      s.monthlySales + s.dailySales + s.checkInOnTime +
      s.feedback + s.displayInspection + s.weeklySummaries + s.training,
      100
    );
  }

  function calcRowGrand(s: BAScore) {
    return Math.min(calcRowTotal(s) + s.bonusSuggestions, 110);
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

      setScores(prev => {
        const next = [...prev];
        for (const r of results) {
          const idx = next.findIndex(s => s.email.toLowerCase() === r.email.toLowerCase());
          if (idx >= 0) {
            next[idx] = { ...next[idx], checkInOnTime: r.score };
          }
        }
        return next;
      });
      showToast(`Check-in scores calculated for ${results.length} BAs`);
    } catch {
      showToast('Auto-calc failed');
    }
    setAutoCalcing(false);
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
      // Reload current month's data
      loadData();
    } catch {
      showToast('Failed to seed scores from visits');
    }
    setSeeding(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch('/api/scores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, scores }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Scores saved successfully');
    } catch {
      showToast('Failed to save scores');
    }
    setSaving(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // Short labels for table header
  const kpiShortLabels: Record<string, string> = {
    monthlySales: 'Monthly Sales',
    dailySales: 'Daily Sales',
    checkInOnTime: 'Check-in',
    feedback: 'Feedback',
    displayInspection: 'Display',
    weeklySummaries: 'Weekly',
    training: 'Training',
    bonusSuggestions: 'Bonus',
  };

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Score Entry
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Enter monthly KPI scores for each BA
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
          <button
            className="btn btn-outline"
            onClick={handleAutoCalc}
            disabled={autoCalcing || loadingData}
          >
            {autoCalcing ? 'Calculating...' : 'Auto-Calculate Check-in'}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleSeedFromVisits}
            disabled={seeding || loadingData}
            style={{ borderColor: '#00A0E9', color: '#00A0E9' }}
          >
            {seeding ? 'Seeding...' : 'Seed All Months from Visits'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || loadingData || scores.length === 0}
          >
            {saving ? 'Saving...' : 'Save Scores'}
          </button>
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
        ) : scores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No BAs found. Upload visit data first, then return here to enter scores.
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.8rem', color: '#6b7280' }}>
              {scores.length} BAs — enter scores for {month}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: '#f9fafb', zIndex: 2, minWidth: 160 }}>BA Name</th>
                    {KPI_DEFS.map(kpi => (
                      <th key={kpi.key} style={{ textAlign: 'center', minWidth: 80 }}>
                        <div>{kpiShortLabels[kpi.key]}</div>
                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 400 }}>
                          max {kpi.max}{kpi.isBonus ? ' (bonus)' : ''}
                        </div>
                      </th>
                    ))}
                    <th style={{ textAlign: 'center', minWidth: 60 }}>Total</th>
                    <th style={{ textAlign: 'center', minWidth: 60 }}>Grand</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s, i) => {
                    const total = calcRowTotal(s);
                    const grand = calcRowGrand(s);
                    return (
                      <tr key={s.email}>
                        <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1, fontWeight: 500, fontSize: '0.8rem' }}>
                          <div>{s.repName}</div>
                          <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{s.email}</div>
                        </td>
                        {KPI_DEFS.map(kpi => {
                          const key = kpi.key as keyof BAScore;
                          const val = Number(s[key]) || 0;
                          // Monthly sales is checkbox (hit target = 30 or miss = 0)
                          if (kpi.key === 'monthlySales') {
                            return (
                              <td key={kpi.key} style={{ textAlign: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={val === 30}
                                    onChange={e => updateScore(i, 'monthlySales', e.target.checked ? 30 : 0)}
                                    style={{ width: 16, height: 16 }}
                                  />
                                  <span style={{ fontSize: '0.75rem', color: val === 30 ? '#059669' : '#9ca3af' }}>
                                    {val === 30 ? '30' : '0'}
                                  </span>
                                </label>
                              </td>
                            );
                          }
                          return (
                            <td key={kpi.key} style={{ textAlign: 'center' }}>
                              <input
                                type="number"
                                min={0}
                                max={kpi.max}
                                value={val}
                                onChange={e => {
                                  const n = clamp(Number(e.target.value) || 0, kpi.max);
                                  updateScore(i, key, n);
                                }}
                                style={{
                                  width: 52, textAlign: 'center', padding: '3px 4px',
                                  border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem',
                                }}
                              />
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 600, color: total >= 80 ? '#059669' : total >= 60 ? '#d97706' : '#dc2626' }}>
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
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
