'use client';

import { useState, ReactNode } from 'react';

interface CollapsibleCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Rendered on the right of the header row, e.g. an export button.
   *  Clicks inside it do NOT toggle the card. */
  headerRight?: ReactNode;
  /** Small status pill next to the title, e.g. "3 uploads". */
  badge?: ReactNode;
  /** Cards start collapsed — the Data Upload page has 8 of them. */
  defaultCollapsed?: boolean;
  style?: React.CSSProperties;
  children: ReactNode;
}

/**
 * White card with a clickable header that expands/collapses its body.
 *
 * Collapsed by default so the Data Upload page opens as a short menu of
 * sections instead of a very long scroll.
 */
export default function CollapsibleCard({
  title,
  subtitle,
  headerRight,
  badge,
  defaultCollapsed = true,
  style,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        marginBottom: '1rem',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
          padding: open ? '1.25rem 1.5rem 0.75rem' : '1rem 1.5rem',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          title={open ? 'Collapse' : 'Expand'}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              flexShrink: 0,
              borderRadius: 4,
              background: '#f3f4f6',
              color: '#6b7280',
              fontSize: '0.7rem',
              lineHeight: 1,
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          >
            ▶
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              {title}
              {badge}
            </span>
            {subtitle && (
              <span
                style={{
                  display: 'block',
                  color: '#9ca3af',
                  fontSize: '0.8rem',
                  marginTop: '0.15rem',
                }}
              >
                {subtitle}
              </span>
            )}
          </span>
        </button>

        {headerRight && (
          <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {headerRight}
          </div>
        )}
      </div>

      {open && <div style={{ padding: '0 1.5rem 1.5rem' }}>{children}</div>}
    </div>
  );
}
