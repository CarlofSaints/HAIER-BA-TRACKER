'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface BA {
  email: string;
  repName: string;
  visitCount: number;
  trainingCount: number;
  storeCount: number;
  stores: string[];
  firstSeen: string;
  lastSeen: string;
}

type Deployment = 'dedicated' | 'roaming';

interface Allocation {
  storeName: string;
  siteCode: string;
  via: 'manual' | 'perigee';
  since: string;
  by?: string;
  visitCount?: number;
}

type TypeFilter = 'all' | 'unset' | 'dedicated' | 'roaming' | 'attention';

function fmtDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString('en-ZA') : '';
}

export default function BAsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [bas, setBas] = useState<BA[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [purging, setPurging] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Record<string, Deployment | undefined>>({});
  const [allocations, setAllocations] = useState<Record<string, Allocation[]>>({});
  const [savingType, setSavingType] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadBAs = useCallback(async () => {
    setLoading(true);
    try {
      const [res, profRes] = await Promise.all([
        authFetch('/api/bas'),
        authFetch('/api/bas/profiles'),
      ]);
      if (res.ok) setBas(await res.json());
      if (profRes.ok) {
        const d = await profRes.json() as { profiles: Record<string, { deployment?: Deployment }>; allocations: Record<string, Allocation[]> };
        setDeployments(Object.fromEntries(Object.entries(d.profiles || {}).map(([e, p]) => [e, p.deployment])));
        setAllocations(d.allocations || {});
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) loadBAs();
  }, [session, loadBAs]);

  async function handlePurge(ba: BA) {
    const confirmed = confirm(
      `PURGE ${ba.repName} (${ba.email})?\n\n` +
      `This will permanently delete:\n` +
      `- All score records (all months)\n` +
      `- ${ba.visitCount} visit records\n` +
      `- ${ba.trainingCount} training records\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;

    setPurging(ba.email);
    try {
      const res = await authFetch('/api/bas/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ba.email }),
      });
      const data = await res.json();
      if (res.ok) {
        const p = data.purged;
        setToast({
          msg: `Purged ${p.email}: ${p.scoresRemoved} scores, ${p.visitsRemoved} visits, ${p.trainingRemoved} training records removed`,
          type: 'success',
        });
        loadBAs();
      } else {
        setToast({ msg: data.error || 'Purge failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Purge failed', type: 'error' });
    } finally {
      setPurging(null);
    }
  }

  // Ticking the box that is already ticked clears it back to "Not set".
  async function handleTypeToggle(ba: BA, clicked: Deployment) {
    const key = ba.email.toLowerCase();
    const previous = deployments[key];
    const next = previous === clicked ? undefined : clicked;
    setDeployments(d => ({ ...d, [key]: next }));
    setSavingType(key);
    try {
      const res = await authFetch('/api/bas/profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: key, deployment: next ?? null }),
      });
      if (!res.ok) throw new Error();
      setToast({ msg: `${ba.repName}: ${next === 'dedicated' ? 'Dedicated' : next === 'roaming' ? 'Roaming' : 'Not set'}`, type: 'success' });
    } catch {
      // Put the tick back where the server still has it.
      setDeployments(d => ({ ...d, [key]: previous }));
      setToast({ msg: 'Could not save Dedicated/Roaming', type: 'error' });
    } finally {
      setSavingType(null);
    }
  }

  const allocsOf = (ba: BA) => allocations[ba.email.toLowerCase()] || [];
  // Counts MANUAL assignments only: those are what the admin can clear on the
  // Stores page. A Perigee allocation (last visitor to an unassigned store) is
  // shown but can't be "fixed" there, so it must not keep a BA flagged.
  const manualCount = (ba: BA) => allocsOf(ba).filter(a => a.via === 'manual').length;
  const needsAttention = (ba: BA) => deployments[ba.email.toLowerCase()] === 'dedicated' && manualCount(ba) > 1;
  const attentionCount = bas.filter(needsAttention).length;

  const filteredBAs = bas
    .filter(b => {
      const t = deployments[b.email.toLowerCase()];
      if (typeFilter === 'unset') return !t;
      if (typeFilter === 'dedicated') return t === 'dedicated';
      if (typeFilter === 'roaming') return t === 'roaming';
      if (typeFilter === 'attention') return needsAttention(b);
      return true;
    })
    .filter(b => !search.trim() ||
      b.repName.toLowerCase().includes(search.toLowerCase()) ||
      b.email.toLowerCase().includes(search.toLowerCase())
    );

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            BA Management
          </h1>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {bas.length} BAs found
          </span>
        </div>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Brand Ambassadors aggregated from visit and training data
        </p>

        {/* Search + type filter */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input" type="text" placeholder="Search by name or email..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
          <select className="select" value={typeFilter} onChange={e => setTypeFilter(e.target.value as TypeFilter)} style={{ width: 300 }}>
            <option value="all">All BAs</option>
            <option value="unset">Dedicated/Roaming not set</option>
            <option value="dedicated">Dedicated</option>
            <option value="roaming">Roaming</option>
            <option value="attention">Dedicated but assigned to more than one store ({attentionCount})</option>
          </select>
        </div>
        {attentionCount > 0 && typeFilter !== 'attention' && (
          <div style={{ marginBottom: '1rem', padding: '0.6rem 0.9rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: '0.85rem' }}>
            {attentionCount} Dedicated BA{attentionCount === 1 ? ' is' : 's are'} assigned to more than one store. On the Stores page, set Assigned BA
            back to Auto on the stores they no longer work, then Save.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading BA data...</div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Name</th>
                  <th style={{ minWidth: 220 }}>Email</th>
                  <th style={{ minWidth: 190 }} title="Dedicated = works one store only. Roaming = covers several stores.">Dedicated / Roaming</th>
                  <th style={{ minWidth: 300 }} title="Manual = assigned on the Stores page (date it was saved). Perigee = most recent visitor to a store with no assignment (date of their first check-in there).">Allocated Stores</th>
                  <th style={{ textAlign: 'center', minWidth: 80 }}>Visits</th>
                  <th style={{ textAlign: 'center', minWidth: 90 }}>Training</th>
                  <th style={{ textAlign: 'center', minWidth: 80 }}>Stores</th>
                  <th style={{ minWidth: 100 }}>First Seen</th>
                  <th style={{ minWidth: 100 }}>Last Seen</th>
                  {session.role === 'super_admin' && (
                    <th style={{ width: 90 }}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredBAs.map(ba => (
                  <tr key={ba.email}>
                    <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{ba.repName}</td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{ba.email}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {(['dedicated', 'roaming'] as const).map(t => (
                        <label key={t} style={{ marginRight: '0.75rem', cursor: savingType ? 'wait' : 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={deployments[ba.email.toLowerCase()] === t}
                            disabled={savingType !== null}
                            onChange={() => handleTypeToggle(ba, t)}
                            style={{ marginRight: 4 }}
                          />
                          {t === 'dedicated' ? 'Dedicated' : 'Roaming'}
                        </label>
                      ))}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {needsAttention(ba) && (
                        <div style={{ color: '#991b1b', fontWeight: 600, marginBottom: 2 }}>
                          Dedicated but assigned to {manualCount(ba)} stores
                        </div>
                      )}
                      {allocsOf(ba).length === 0 && <span style={{ color: '#9ca3af' }}>None</span>}
                      {allocsOf(ba).map(a => (
                        <div key={`${a.siteCode}|${a.storeName}`} style={{ whiteSpace: 'nowrap' }}>
                          {a.storeName}{a.siteCode ? ` (${a.siteCode})` : ''}
                          <span style={{
                            marginLeft: 6, padding: '0 5px', borderRadius: 4, fontSize: '0.68rem',
                            background: a.via === 'manual' ? '#dbeafe' : '#f3f4f6',
                            color: a.via === 'manual' ? '#1e40af' : '#374151',
                          }}>
                            {a.via === 'manual'
                              ? `Manual ${a.since ? fmtDate(a.since) : '(date not recorded)'}`
                              : `Perigee since ${fmtDate(a.since) || '?'}, ${a.visitCount ?? 0} visit${a.visitCount === 1 ? '' : 's'}`}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#0054A6' }}>{ba.visitCount}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#7c3aed' }}>{ba.trainingCount}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span title={ba.stores.join(', ')} style={{ cursor: ba.stores.length > 0 ? 'help' : 'default' }}>
                        {ba.storeCount}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {ba.firstSeen ? new Date(ba.firstSeen).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {ba.lastSeen ? new Date(ba.lastSeen).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    {session.role === 'super_admin' && (
                      <td>
                        <button
                          style={{
                            padding: '0.2rem 0.5rem', fontSize: '0.75rem',
                            background: purging === ba.email ? '#7c3aed' : '#9333ea',
                            color: 'white', border: 'none', borderRadius: 6,
                            cursor: purging === ba.email ? 'wait' : 'pointer',
                            opacity: purging === ba.email ? 0.7 : 1,
                          }}
                          onClick={() => handlePurge(ba)}
                          disabled={purging !== null}
                        >
                          {purging === ba.email ? 'Purging...' : 'Purge'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredBAs.length === 0 && (
                  <tr>
                    <td colSpan={session.role === 'super_admin' ? 10 : 9} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                      {search || typeFilter !== 'all' ? 'No matching BAs' : 'No BA data found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
