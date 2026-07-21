'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/useAuth';

interface Freshness {
  latestDataDate: string | null;
  lastSync: string | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysAgo(iso: string): number | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/*
  Small top-right card that surfaces how up to date the SAMS data is:
  the latest date present in the SAMS facts, plus when it was last pulled.
  Reads /api/sams/freshness (any logged-in user). Renders nothing until data
  is available, so deployments with no SAMS sync yet don't show an empty card.
*/
export default function SamsFreshnessCard() {
  const [data, setData] = useState<Freshness | null>(null);

  useEffect(() => {
    let alive = true;
    authFetch('/api/sams/freshness')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setData(d); })
      .catch(() => { /* ignore — card just stays hidden */ });
    return () => { alive = false; };
  }, []);

  if (!data || (!data.latestDataDate && !data.lastSync)) return null;

  const stale = data.latestDataDate ? (daysAgo(data.latestDataDate) ?? 0) : null;
  const dot = stale === null ? '#9ca3af' : stale <= 7 ? '#16a34a' : stale <= 21 ? '#d97706' : '#dc2626';

  return (
    <div
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        padding: '0.6rem 0.85rem', minWidth: 180, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
      title={data.lastSync ? `SAMS last pulled ${fmtDate(data.lastSync)}` : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em', color: '#6b7280', textTransform: 'uppercase' }}>
          SAMS Data
        </span>
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
        {data.latestDataDate ? `Up to ${fmtDate(data.latestDataDate)}` : 'Awaiting sync'}
      </div>
      {data.lastSync && (
        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
          Synced {fmtDate(data.lastSync)}
        </div>
      )}
    </div>
  );
}
