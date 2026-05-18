'use client';

import { useState, useRef, useEffect } from 'react';

interface UserOption {
  id: string;
  name: string;
  surname: string;
  email: string;
}

interface Props {
  users: UserOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

export default function MultiUserSelect({ users, selected, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.surname.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter(s => s !== id)
        : [...selected, id],
    );
  };

  const removeChip = (id: string) => {
    onChange(selected.filter(s => s !== id));
  };

  const selectedUsers = selected
    .map(id => users.find(u => u.id === id))
    .filter((u): u is UserOption => !!u);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {label && (
        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 4 }}>{label}</div>
      )}

      {/* Chips + trigger */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '6px 8px',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          minHeight: 38,
          cursor: 'pointer',
          background: '#fff',
          alignItems: 'center',
        }}
      >
        {selectedUsers.length === 0 && (
          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Select users...</span>
        )}
        {selectedUsers.map(u => (
          <span
            key={u.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              background: '#e0e7ff',
              borderRadius: 12,
              fontSize: '0.78rem',
              color: '#3730a3',
              fontWeight: 500,
            }}
          >
            {u.name} {u.surname}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeChip(u.id); }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6366f1',
                fontWeight: 700,
                fontSize: '0.85rem',
                padding: 0,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            marginTop: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            maxHeight: 240,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              padding: '8px 10px',
              border: 'none',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px', color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center' }}>
                No users found
              </div>
            )}
            {filtered.map(u => {
              const checked = selected.includes(u.id);
              return (
                <label
                  key={u.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    background: checked ? '#f0f4ff' : 'transparent',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                  onMouseEnter={e => {
                    if (!checked) (e.currentTarget as HTMLElement).style.background = '#f9fafb';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = checked ? '#f0f4ff' : 'transparent';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(u.id)}
                    style={{ accentColor: '#0054A6' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, color: '#1f2937' }}>{u.name} {u.surname}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{u.email}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
