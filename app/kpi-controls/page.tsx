'use client';

import { useState, useEffect } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

export default function KPIControlsPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [minTrainings, setMinTrainings] = useState(4);
  const [minVisits, setMinVisits] = useState(20);
  const [salesThreshold, setSalesThreshold] = useState(80);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const isSuperAdmin = session?.role === 'super_admin';

  useEffect(() => {
    if (!session) return;
    authFetch('/api/config/kpi-controls')
      .then(r => r.json())
      .then(data => {
        if (data.minTrainingsPerMonth) setMinTrainings(data.minTrainingsPerMonth);
        if (data.minVisitsPerMonth) setMinVisits(data.minVisitsPerMonth);
        if (data.salesThresholdPct) setSalesThreshold(data.salesThresholdPct);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch('/api/config/kpi-controls', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minTrainingsPerMonth: minTrainings, minVisitsPerMonth: minVisits, salesThresholdPct: salesThreshold }),
      });
      if (res.ok) {
        setToast({ msg: 'KPI controls saved', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ msg: data.error || 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed to save KPI controls', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          KPI Base Controls
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '2rem' }}>
          Configure thresholds used for automated KPI scoring
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading...</div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', maxWidth: 520 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
              Training Threshold
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              Minimum number of completed trainings per month for a BA to earn full auto-score points (5/5).
              Points are proportional: if a BA completes fewer trainings, they earn a proportional share.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                Minimum Trainings per Month
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={31}
                value={minTrainings}
                onChange={e => setMinTrainings(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                disabled={!isSuperAdmin}
                style={{ width: 120 }}
              />
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>
                Range: 1–31. Default: 4
              </div>
            </div>

            {/* Scoring example */}
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
              padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#0c4a6e', marginBottom: '1rem',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Scoring Formula</div>
              <div>autoPoints = min(5, round((completedTrainings / {minTrainings}) &times; 5))</div>
              <div style={{ marginTop: 6, color: '#6b7280', fontSize: '0.75rem' }}>
                Example: {minTrainings} trainings completed = 5/5 auto pts.{' '}
                {Math.max(1, Math.floor(minTrainings / 2))} completed = {Math.min(5, Math.round((Math.max(1, Math.floor(minTrainings / 2)) / minTrainings) * 5))}/5 auto pts.
              </div>
            </div>

            {/* Visits Threshold */}
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                Visits Threshold
              </h2>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Minimum number of store visits per month for a BA. Used to evaluate check-in performance.
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                  Minimum Visits per Month
                </label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={minVisits}
                  onChange={e => setMinVisits(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  disabled={!isSuperAdmin}
                  style={{ width: 120 }}
                />
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>
                  Range: 1–100. Default: 20
                </div>
              </div>

              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#14532d', marginBottom: '1rem',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>How it works</div>
                <div>BAs are expected to complete at least {minVisits} store visits per month.</div>
                <div style={{ marginTop: 6, color: '#6b7280', fontSize: '0.75rem' }}>
                  Check-in scores are auto-calculated based on on-time visit check-ins relative to this threshold.
                </div>
              </div>
            </div>

            {/* Sales Threshold */}
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                Sales Threshold
              </h2>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Minimum % of target a BA must achieve before earning Monthly Sales points (40 pts max).
                Below this threshold, the BA gets 0 points. At or above, points are proportional to achievement.
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                  Minimum Achievement %
                </label>
                <input
                  className="input"
                  type="number"
                  min={50}
                  max={100}
                  value={salesThreshold}
                  onChange={e => setSalesThreshold(Math.max(50, Math.min(100, Number(e.target.value) || 80)))}
                  disabled={!isSuperAdmin}
                  style={{ width: 120 }}
                />
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>
                  Range: 50–100%. Default: 80%
                </div>
              </div>

              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#92400e', marginBottom: '1rem',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Scoring Formula</div>
                <div>variance = (actualSalesValue / proratedTarget) &times; 100</div>
                <div style={{ marginTop: 4 }}>
                  If variance &lt; {salesThreshold}% &rarr; <strong>0 points</strong>
                </div>
                <div>
                  If variance &ge; {salesThreshold}% &rarr; <strong>min(40, round(variance / 100 &times; 40))</strong>
                </div>
                <div style={{ marginTop: 6, color: '#6b7280', fontSize: '0.75rem' }}>
                  Targets are prorated based on the DISPO export date for mid-month comparisons.
                  E.g. if the DISPO was exported on the 15th of a 30-day month, the target is halved.
                </div>
              </div>
            </div>

            {isSuperAdmin ? (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Controls'}
              </button>
            ) : (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>
                Only Super Admins can modify KPI controls.
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
