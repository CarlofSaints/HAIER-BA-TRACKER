'use client';

import { useState } from 'react';

interface Props {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  id?: string;
}

export default function Accordion({ title, icon, defaultOpen = false, children, id }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      id={id}
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: '#1f2937',
        }}
      >
        {icon && <span style={{ fontSize: '1.1rem' }}>{icon}</span>}
        <span style={{ flex: 1 }}>{title}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            color: '#9ca3af',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', lineHeight: 1.7, color: '#374151', fontSize: '0.88rem' }}>
          {children}
        </div>
      )}
    </div>
  );
}
