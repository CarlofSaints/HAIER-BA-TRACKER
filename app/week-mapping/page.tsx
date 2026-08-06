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

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The Monday on or before the given date. Mirrors resolveYearConfig() in lib/weekMapping.ts. */
function mondayOnOrBefore(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay(); // 0 = Sun
  out.setDate(out.getDate() - (dow === 0 ? 6 : dow - 1));
  return out;
}

/**
 * What the server derives when a year has no saved entry: the Monday on or
 * before 1 January. Used as the form's starting value so "Save" makes the
 * current behaviour explicit rather than changing it.
 */
function defaultWeek1Start(year: number): string {
  return toIsoDate(mondayOnOrBefore(new Date(year, 0, 1)));
}

export default function WeekMappingPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [config, setConfig] = useState<WeekMappingConfig>({ years: [] });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  // The Week 1 start date is a real date in its own right — it is NOT constrained
  // to the year being defined. A retail year almost always starts in the previous
  // December (2026 starts Mon 29 Dec 2025). The old picker was year + month + day
  // where the year was the year being DEFINED, so the only reachable prior-year
  // date was a single hard-coded "December {year-1}" option.
  const [week1Start, setWeek1Start] = useState(() => defaultWeek1Start(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Fetches the whole config, so it does NOT depend on selectedYear. It used to,
  // which meant every year change refetched and could stomp an in-progress edit.
  // Populating the date field is the single effect below.
  const loadConfig = useCallback(async () => {
    try {
      const res = await authFetch('/api/week-mapping');
      if (res.ok) setConfig(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadConfig();
  }, [session, loadConfig]);

  // Show the saved start date for the selected year, or the date the server
  // would derive if nothing is saved.
  useEffect(() => {
    const existing = config.years.find(y => y.year === selectedYear);
    setWeek1Start(existing ? existing.week1Start : defaultWeek1Start(selectedYear));
  }, [selectedYear, config.years]);

  const parsedStart = new Date(week1Start + 'T00:00:00');
  const validDate = week1Start !== '' && !isNaN(parsedStart.getTime());
  const dayOfWeek = validDate ? parsedStart.toLocaleDateString('en-US', { weekday: 'long' }) : '';
  // Weeks run in 7-day blocks from this date, so a non-Monday start silently
  // shifts every week boundary — the exact trap that ran 2026 Thu-Wed.
  const startsOnMonday = validDate && parsedStart.getDay() === 1;
  // resolveYearConfig() ignores a future week1Start and falls back, so saving one
  // looks successful but changes nothing.
  const startsInFuture = validDate && parsedStart > new Date();

  const weeks = useMemo(() => getWeeksPreview(week1Start), [week1Start]);

  const existingConfig = config.years.find(y => y.year === selectedYear);
  const hasChanges = validDate && (!existingConfig || existingConfig.week1Start !== week1Start);

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

          {/* Step 1 — which year is being defined. */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4, fontWeight: 600 }}>
              What year are you setting Week 1 for?
            </label>
            <select
              className="input"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              style={{ width: 120 }}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Step 2 — a real date, with its own year. A retail year normally
              starts in the previous December, so this must not be tied to the
              year above. */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4, fontWeight: 600 }}>
              What date does Week 1 of {selectedYear} start on?
            </label>
            <input
              type="date"
              className="input"
              value={week1Start}
              onChange={e => setWeek1Start(e.target.value)}
              style={{ width: 200 }}
            />
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>
              Can be any date, including one in {selectedYear - 1} — retail years usually
              start in the previous December.
            </div>
          </div>

          {/* Summary */}
          {validDate ? (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 600 }}>
                Week 1 of {selectedYear} starts on {dayOfWeek}, {fmtDate(parsedStart)}
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
              {!startsOnMonday && (
                <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: 6 }}>
                  ⚠ This is a {dayOfWeek}. Every week will then run {dayOfWeek}–
                  {new Date(parsedStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', { weekday: 'long' })}.
                </div>
              )}
              {startsInFuture && (
                <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: 6 }}>
                  ⚠ This date is in the future, so reports will ignore it and fall back
                  until it arrives.
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#b91c1c' }}>
              Pick a valid start date.
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* The BA Work report's weekly columns are numbered against THIS year's
            Week 1. With no entry saved it falls back to the Monday on or before
            1 January — usually right, but nobody chose it. Say so. */}
        {!config.years.some(y => y.year === new Date().getFullYear()) && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
            padding: '0.75rem 1rem', marginBottom: '1.5rem', maxWidth: 500,
            fontSize: '0.8rem', color: '#92400e',
          }}>
            <strong>No week mapping saved for {new Date().getFullYear()}.</strong> Weekly
            columns on the BA Work report currently fall back to the Monday on or before
            1 January. Pick {new Date().getFullYear()} above and save the real Week 1 start
            to make it explicit.
          </div>
        )}

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
