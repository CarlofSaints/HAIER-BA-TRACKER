'use client';

import type { RecurrenceRule } from '@/lib/reminderData';

interface Props {
  value: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const selectStyle: React.CSSProperties = {
  padding: '0.45rem 0.6rem',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: '0.85rem',
  background: '#fff',
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  width: 80,
};

export default function RecurrenceBuilder({ value, onChange }: Props) {
  const update = (patch: Partial<RecurrenceRule>) => {
    onChange({ ...value, ...patch });
  };

  const toggleDay = (day: number) => {
    const current = value.daysOfWeek || [];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort();
    update({ daysOfWeek: next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Row 1: Type + Time */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          Frequency
          <select
            value={value.type}
            onChange={e => update({ type: e.target.value as RecurrenceRule['type'] })}
            style={{ ...selectStyle, display: 'block', marginTop: 4 }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom Interval</option>
          </select>
        </label>

        <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          Time (SAST)
          <input
            type="time"
            value={value.time}
            onChange={e => update({ time: e.target.value })}
            style={{ ...selectStyle, display: 'block', marginTop: 4 }}
          />
        </label>
      </div>

      {/* Conditional: Weekly days */}
      {value.type === 'weekly' && (
        <div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 6 }}>Days of the week</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {DAY_LABELS.map((label, i) => {
              const active = value.daysOfWeek?.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: active ? '#0054A6' : '#d1d5db',
                    background: active ? '#0054A6' : '#fff',
                    color: active ? '#fff' : '#374151',
                    fontSize: '0.8rem',
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Conditional: Monthly day */}
      {value.type === 'monthly' && (
        <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          Day of month
          <input
            type="number"
            min={1}
            max={31}
            value={value.dayOfMonth || 1}
            onChange={e => update({ dayOfMonth: parseInt(e.target.value) || 1 })}
            style={{ ...inputStyle, display: 'block', marginTop: 4 }}
          />
        </label>
      )}

      {/* Conditional: Custom interval */}
      {value.type === 'custom' && (
        <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          Every N days
          <input
            type="number"
            min={1}
            value={value.intervalDays || 1}
            onChange={e => update({ intervalDays: parseInt(e.target.value) || 1 })}
            style={{ ...inputStyle, display: 'block', marginTop: 4 }}
          />
        </label>
      )}
    </div>
  );
}
