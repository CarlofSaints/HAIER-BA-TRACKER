'use client';

import { useAuth } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

const BRAND = '#0054A6';

interface KPIRow {
  num: number;
  icon: React.ReactNode;
  name: string;
  maxPts: number;
  source: string;
  description: string;
  isBonus?: boolean;
}

function SvgIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const KPI_ROWS: KPIRow[] = [
  {
    num: 1,
    icon: (
      <SvgIcon>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </SvgIcon>
    ),
    name: 'Monthly Sales vs Target',
    maxPts: 30,
    source: 'Manual (binary)',
    description: 'Hit monthly sales target = 30 points. Miss = 0. All-or-nothing.',
  },
  {
    num: 2,
    icon: (
      <SvgIcon>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </SvgIcon>
    ),
    name: 'Daily Sales vs Target',
    maxPts: 20,
    source: 'Manual (0–20)',
    description: 'Scored based on consistency of daily sales against target. Admin enters 0–20.',
  },
  {
    num: 3,
    icon: (
      <SvgIcon>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </SvgIcon>
    ),
    name: 'Check-in on Time',
    maxPts: 10,
    source: 'Auto-calculated from visits',
    description: 'Percentage of visits where check-in was before 09:00 with CHECKED_OUT status, scaled 0–10. Can be overridden manually.',
  },
  {
    num: 4,
    icon: (
      <SvgIcon>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </SvgIcon>
    ),
    name: 'Feedback',
    maxPts: 5,
    source: 'Manual (0–5)',
    description: 'Quality and timeliness of feedback provided by the BA to management.',
  },
  {
    num: 5,
    icon: (
      <SvgIcon>
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </SvgIcon>
    ),
    name: 'Display Inspection',
    maxPts: 15,
    source: 'Manual (0–15)',
    description: 'Quality of in-store product display maintenance, merchandising standards, and POP material.',
  },
  {
    num: 6,
    icon: (
      <SvgIcon>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </SvgIcon>
    ),
    name: 'Weekly Summaries',
    maxPts: 10,
    source: 'Manual (0–10)',
    description: 'Submission and quality of weekly activity summary reports.',
  },
  {
    num: 7,
    icon: (
      <SvgIcon>
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </SvgIcon>
    ),
    name: 'Training',
    maxPts: 10,
    source: 'Manual (0–10)',
    description: 'Attendance and engagement in training sessions, product knowledge assessments.',
  },
  {
    num: 8,
    icon: (
      <SvgIcon>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </SvgIcon>
    ),
    name: 'Bonus Suggestions',
    maxPts: 10,
    source: 'Manual bonus (0–10)',
    description: 'Extra points for proactive suggestions, initiative, and going above and beyond expectations.',
    isBonus: true,
  },
];

export default function GuidePage() {
  const { session, loading: authLoading, logout } = useAuth();

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Scoring Guide
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          How BA performance scores are calculated
        </p>

        {/* Overview card */}
        <div style={{
          background: `linear-gradient(135deg, ${BRAND}, #00A0E9)`,
          borderRadius: 12, padding: '1.5rem', marginBottom: '2rem', color: 'white',
        }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: 4 }}>Core KPIs (7)</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>100 <span style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.8 }}>points</span></div>
            </div>
            <div style={{ fontSize: '1.5rem', opacity: 0.5 }}>+</div>
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: 4 }}>Bonus</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>10 <span style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.8 }}>points</span></div>
            </div>
            <div style={{ fontSize: '1.5rem', opacity: 0.5 }}>=</div>
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: 4 }}>Maximum</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>110 <span style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.8 }}>points</span></div>
            </div>
          </div>
        </div>

        {/* Score thresholds */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1.25rem', flex: 1, minWidth: 160 }}>
            <div style={{ color: '#059669', fontWeight: 700, fontSize: '1.1rem' }}>80–100</div>
            <div style={{ color: '#065f46', fontSize: '0.8rem' }}>Excellent performance</div>
          </div>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1.25rem', flex: 1, minWidth: 160 }}>
            <div style={{ color: '#d97706', fontWeight: 700, fontSize: '1.1rem' }}>60–79</div>
            <div style={{ color: '#92400e', fontSize: '0.8rem' }}>Meets expectations</div>
          </div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1.25rem', flex: 1, minWidth: 160 }}>
            <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '1.1rem' }}>&lt;60</div>
            <div style={{ color: '#991b1b', fontSize: '0.8rem' }}>At risk — needs improvement</div>
          </div>
        </div>

        {/* KPI Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
            KPI Breakdown
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>#</th>
                  <th style={{ width: 44 }}></th>
                  <th style={{ minWidth: 180 }}>KPI</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Max Pts</th>
                  <th style={{ minWidth: 160 }}>Source</th>
                  <th style={{ minWidth: 240 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {KPI_ROWS.map(row => (
                  <tr key={row.num}>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: BRAND }}>{row.num}</td>
                    <td style={{ textAlign: 'center' }}>{row.icon}</td>
                    <td style={{ fontWeight: 500 }}>
                      {row.name}
                      {row.isBonus && (
                        <span style={{
                          marginLeft: 8, fontSize: '0.65rem', background: '#dbeafe',
                          color: BRAND, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                        }}>
                          BONUS
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: BRAND, fontSize: '1rem' }}>{row.maxPts}</td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{row.source}</td>
                    <td style={{ fontSize: '0.8rem', color: '#374151' }}>{row.description}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ background: '#f9fafb', fontWeight: 600 }}>
                  <td colSpan={3} style={{ textAlign: 'right', paddingRight: '1rem' }}>
                    Core Total + Bonus
                  </td>
                  <td style={{ textAlign: 'center', color: BRAND, fontSize: '1.1rem' }}>110</td>
                  <td colSpan={2} style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    100 core + 10 bonus
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* How it works section */}
        <div style={{ marginTop: '2rem', background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>How It Works</h2>
          <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.85rem', color: '#374151' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <span style={{ color: BRAND, fontWeight: 700, minWidth: 20 }}>1.</span>
              <span>Visit data is uploaded from Perigee. <strong>Check-in on Time</strong> scores are auto-calculated from this data.</span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <span style={{ color: BRAND, fontWeight: 700, minWidth: 20 }}>2.</span>
              <span>Admins manually enter the remaining 6 core KPIs and the bonus score on the <strong>Score Entry</strong> page each month.</span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <span style={{ color: BRAND, fontWeight: 700, minWidth: 20 }}>3.</span>
              <span>The <strong>Leaderboard</strong> ranks all BAs by their total score. Top 3 receive gold, silver, and bronze badges.</span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <span style={{ color: BRAND, fontWeight: 700, minWidth: 20 }}>4.</span>
              <span>Click any BA on the leaderboard to see their <strong>detailed breakdown</strong> with radar chart and monthly trend.</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
