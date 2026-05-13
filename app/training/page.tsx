'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface TrainingSummaryBA {
  email: string;
  repName: string;
  completedCount: number;
  minRequired: number;
  autoPoints: number;
  compliant: boolean;
}

interface TrainingSummary {
  month: string;
  minRequired: number;
  bas: TrainingSummaryBA[];
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

export default function TrainingPage() {
  const { session, loading: authLoading, logout } = useAuth(['admin', 'super_admin']);
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<TrainingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/training/summary?month=${month}`);
      if (res.ok) setData(await res.json());
      else setData(null);
    } catch { setData(null); }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  const stats = useMemo(() => {
    if (!data || data.bas.length === 0) {
      return { totalBAs: 0, totalSessions: 0, avgPerBA: 0, compliant: 0, complianceRate: 0 };
    }
    const totalBAs = data.bas.length;
    const totalSessions = data.bas.reduce((sum, b) => sum + b.completedCount, 0);
    const avgPerBA = totalSessions / totalBAs;
    const compliant = data.bas.filter(b => b.compliant).length;
    const complianceRate = Math.round((compliant / totalBAs) * 100);
    return { totalBAs, totalSessions, avgPerBA: Math.round(avgPerBA * 10) / 10, compliant, complianceRate };
  }, [data]);

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Training
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          BA training completion overview
        </p>

        {/* Controls */}
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
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading training data...</div>
        ) : !data || data.bas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No training data for {formatMonth(month)}. Upload training forms via the Data Upload page.
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>BAs Trained</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{stats.totalBAs}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Sessions</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{stats.totalSessions}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Avg per BA</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>{stats.avgPerBA}</div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Required: {data.minRequired}</div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Fully Compliant</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stats.complianceRate >= 80 ? '#059669' : stats.complianceRate >= 50 ? '#d97706' : '#dc2626' }}>
                  {stats.compliant}/{stats.totalBAs}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{stats.complianceRate}%</div>
              </div>
            </div>

            {/* Threshold info */}
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
              padding: '0.6rem 1rem', fontSize: '0.8rem', color: '#0c4a6e', marginBottom: '1rem',
            }}>
              Threshold: {data.minRequired} trainings/month. Auto-score: min(5, round((completed / {data.minRequired}) x 5))
            </div>

            {/* Training Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                Training Completion — {formatMonth(month)}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>BA Name</th>
                      <th style={{ minWidth: 200 }}>Email</th>
                      <th style={{ textAlign: 'center', minWidth: 100 }}>Completed</th>
                      <th style={{ textAlign: 'center', minWidth: 90 }}>Required</th>
                      <th style={{ textAlign: 'center', minWidth: 100 }}>Auto Score</th>
                      <th style={{ textAlign: 'center', minWidth: 100 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bas.map(ba => (
                      <tr key={ba.email}>
                        <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{ba.repName}</td>
                        <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{ba.email}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: ba.compliant ? '#059669' : '#dc2626' }}>
                          {ba.completedCount}
                        </td>
                        <td style={{ textAlign: 'center', color: '#6b7280' }}>{ba.minRequired}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: '#ede9fe', color: '#7c3aed', fontSize: '0.75rem',
                            fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          }}>
                            {ba.autoPoints}/5
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 10px',
                            borderRadius: 12,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: ba.compliant ? '#dcfce7' : '#fef2f2',
                            color: ba.compliant ? '#166534' : '#991b1b',
                          }}>
                            {ba.compliant ? 'Compliant' : 'Below Target'}
                          </span>
                        </td>
                      </tr>
                    ))}
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
