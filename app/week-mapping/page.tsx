'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface WeekMappingYear {
  year: number;
  week1Start: string;
}

interface WeekMappingConfig {
  years: WeekMappingYear[];
}

function getWeeksPreview(week1Start: string): { weekNum: number; start: string; end: string }[] {
  const weeks: { weekNum: number; start: string; end: string }[] = [];
  const w1 = new Date(week1Start + 'T00:00:00');
  if (isNaN(w1.getTime())) return [];

  // Generate weeks for a full year from the start date
  const oneYearLater = new Date(w1);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  const current = new Date(w1);
  let weekNum = 1;
  while (current < oneYearLater) {
    const end = new Date(current);
    end.setDate(end.getDate() + 6);
    weeks.push({
      weekNum,
      start: fmtDate(current),
      end: fmtDate(end),
    });
    current.setDate(current.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Month options: 0 = December of previous year, 1-12 = Jan-Dec of selected year */
function getMonthOptions(year: number): { value: number; label: string }[] {
  return [
    { value: 0, label: `December ${year - 1}` },
    ...MONTHS.map((name, i) => ({ value: i + 1, label: name })),
  ];
}

export default function WeekMappingPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [config, setConfig] = useState<WeekMappingConfig>({ years: [] });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await authFetch('/api/week-mapping');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        // Load existing values for the selected year if they exist
        const existing = data.years?.find((y: WeekMappingYear) => y.year === selectedYear);
        if (existing) {
          const d = new Date(existing.week1Start + 'T00:00:00');
          const m = d.getMonth() + 1;
          const yr = d.getFullYear();
          if (m === 12 && yr === selectedYear - 1) {
            setMonth(0);
          } else {
            setMonth(m);
          }
          setDay(d.getDate());
        }
      }
    } catch { /* ignore */ }
  }, [selectedYear]);

  useEffect(() => {
    if (session) loadConfig();
  }, [session, loadConfig]);

  // When year changes, load existing config for that year
  useEffect(() => {
    const existing = config.years.find(y => y.year === selectedYear);
    if (existing) {
      const d = new Date(existing.week1Start + 'T00:00:00');
      const m = d.getMonth() + 1; // 1-12
      const yr = d.getFullYear();
      // If the start date is in December of the previous year, set month=0
      if (m === 12 && yr === selectedYear - 1) {
        setMonth(0);
      } else {
        setMonth(m);
      }
      setDay(d.getDate());
    } else {
      setMonth(1);
      setDay(1);
    }
  }, [selectedYear, config.years]);

  // month=0 means December of the previous year
  const dateYear = month === 0 ? selectedYear - 1 : selectedYear;
  const dateMonth = month === 0 ? 12 : month;
  const maxDay = daysInMonth(dateYear, dateMonth);
  const effectiveDay = Math.min(day, maxDay);

  const week1Start = toIsoDate(dateYear, dateMonth, effectiveDay);
  const dayOfWeek = new Date(week1Start + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  const weeks = useMemo(() => getWeeksPreview(week1Start), [week1Start]);

  const existingConfig = config.years.find(y => y.year === selectedYear);
  const hasChanges = !existingConfig || existingConfig.week1Start !== week1Start;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch('/api/week-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear, week1Start }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfig(data.config);
        setToast({ msg: `Week mapping saved for ${selectedYear}`, type: 'success' });
      } else {
        setToast({ msg: data.error || 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Week Mapping
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Set the start date for Week 1 of each year. All subsequent weeks follow sequentially (7 days each).
          This determines how weekly sales are calculated from DISPO data.
        </p>

        {/* Year + Date Selection */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: '1.25rem', marginBottom: '1.5rem', maxWidth: 500 }}>
          <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Week 1 Start Date
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {/* Year */}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#6b7280', marginBottom: 4, fontWeight: 500 }}>Year</label>
              <select
                className="input"
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                style={{ width: 100 }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#6b7280', marginBottom: 4, fontWeight: 500 }}>Month</label>
              <select
                className="input"
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                style={{ width: 170 }}
              >
                {getMonthOptions(selectedYear).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Day */}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#6b7280', marginBottom: 4, fontWeight: 500 }}>Day</label>
              <select
                className="input"
                value={effectiveDay}
                onChange={e => setDay(Number(e.target.value))}
                style={{ width: 80 }}
              >
                {Array.from({ length: maxDay }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 600 }}>
              Week 1 starts on {dayOfWeek}, {fmtDate(new Date(week1Start + 'T00:00:00'))}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#0c4a6e', marginTop: 2 }}>
              {weeks.length} weeks in {selectedYear}
              {existingConfig && (
                <span style={{ marginLeft: '0.5rem', color: hasChanges ? '#dc2626' : '#16a34a' }}>
                  {hasChanges ? '(unsaved changes)' : '(saved)'}
                </span>
              )}
              {!existingConfig && <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>(not yet saved)</span>}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Saved years overview */}
        {config.years.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: '1rem', marginBottom: '1.5rem', maxWidth: 500 }}>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Configured Years
            </div>
            {config.years.map(y => {
              const d = new Date(y.week1Start + 'T00:00:00');
              const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
              const wks = getWeeksPreview(y.week1Start);
              return (
                <div key={y.year} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{y.year}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      W1: {dow} {fmtDate(d)} ({wks.length} weeks)
                    </span>
                  </div>
                  <button
                    className="btn"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    onClick={() => setSelectedYear(y.year)}
                  >
                    Edit
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Week preview table */}
        {weeks.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', maxWidth: 500 }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontWeight: 600, color: '#374151', fontSize: '0.85rem' }}>
                Week Preview — {selectedYear}
              </span>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Week</th>
                    <th>Start</th>
                    <th>End</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map(w => {
                    // Highlight current week
                    const now = new Date();
                    const ws = new Date(week1Start + 'T00:00:00');
                    ws.setDate(ws.getDate() + (w.weekNum - 1) * 7);
                    const we = new Date(ws);
                    we.setDate(we.getDate() + 6);
                    const isCurrent = now >= ws && now <= we;
                    return (
                      <tr key={w.weekNum} style={isCurrent ? { background: '#eff6ff', fontWeight: 600 } : undefined}>
                        <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                          W{w.weekNum}
                          {isCurrent && <span style={{ fontSize: '0.6rem', color: '#2563eb', marginLeft: 4 }}>NOW</span>}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{w.start}</td>
                        <td style={{ fontSize: '0.8rem' }}>{w.end}</td>
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
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
