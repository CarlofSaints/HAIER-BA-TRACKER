'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface StoreMaster {
  siteCode: string;
  storeName: string;
  channelId: string;
  channelName?: string;
  area?: string;
  perigeeSiteCode?: string;
  assignedBaEmail?: string;
  assignedBaName?: string;
  assignedAt?: string;
  assignedBy?: string;
  derivedBaEmail?: string;
  derivedBaName?: string;
  derivedBaSince?: string;
  addedFrom?: ('data' | 'perigee')[];
  // Display-only fields the GET adds; stripped before saving.
  mainChannelId?: string;
  mainChannelName?: string;
}

function fmtDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString('en-ZA') : '';
}

/** "Data", "Perigee", or "Data/Perigee". Legacy stores (no field) show "Data". */
function sourcesLabel(addedFrom?: ('data' | 'perigee')[]): string {
  const order = ['data', 'perigee'] as const;
  const labels: Record<'data' | 'perigee', string> = { data: 'Data', perigee: 'Perigee' };
  if (!addedFrom || addedFrom.length === 0) return 'Data';
  const present = order.filter(s => addedFrom.includes(s));
  return present.length ? present.map(s => labels[s]).join('/') : 'Data';
}

interface Channel {
  id: string;
  name: string;
}

interface BAOption {
  email: string;
  repName: string;
  lastSeen: string;
}

export default function StoresPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [stores, setStores] = useState<StoreMaster[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [bas, setBas] = useState<BAOption[]>([]);
  const [dedicated, setDedicated] = useState<Set<string>>(new Set());
  // Stores whose BA was changed since the last save (their stamp is stale).
  const [baEdited, setBaEdited] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [dupCodes, setDupCodes] = useState<{ siteCode: string; storeName: string; channel: string; alsoIn: string[] }[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [storesRes, channelsRes, basRes, profRes] = await Promise.all([
        authFetch('/api/stores?derivedBa=1'),
        authFetch('/api/channels'),
        authFetch('/api/bas'),
        authFetch('/api/bas/profiles?allocations=0'),
      ]);
      if (storesRes.ok) setStores(await storesRes.json());
      if (channelsRes.ok) setChannels(await channelsRes.json());
      if (basRes.ok) setBas(await basRes.json());
      if (profRes.ok) {
        const d = await profRes.json() as { profiles: Record<string, { deployment?: string }> };
        setDedicated(new Set(Object.entries(d.profiles || {}).filter(([, p]) => p.deployment === 'dedicated').map(([e]) => e)));
      }
      setBaEdited(new Set());
    } catch { /* ignore */ }
    finally { setLoadingData(false); }
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  async function handleUploadSiteFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/stores/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) {
        setToast({
          msg: `Loaded ${d.rows} rows — ${d.created} new, ${d.updated} updated`
            + (d.channelsCreated?.length ? `, ${d.channelsCreated.length} channel(s) created` : '')
            + (d.skipped ? `, ${d.skipped} skipped` : '')
            + (d.duplicateCodes?.length ? `, ${d.duplicateCodes.length} cross-channel duplicate code(s)` : ''),
          type: 'success',
        });
        setDupCodes(Array.isArray(d.duplicateCodes) ? d.duplicateCodes : []);
        await loadData();
      } else {
        setToast({ msg: d.detail || d.error || 'Upload failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Upload failed', type: 'error' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleExport() {
    try {
      const res = await authFetch('/api/stores/export');
      if (!res.ok) { setToast({ msg: 'Export failed', type: 'error' }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HaierSiteControlFile_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setToast({ msg: 'Export failed', type: 'error' });
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return stores;
    const q = search.toLowerCase();
    return stores.filter(s =>
      s.storeName.toLowerCase().includes(q) ||
      s.siteCode.toLowerCase().includes(q) ||
      (s.area || '').toLowerCase().includes(q)
    );
  }, [stores, search]);

  function handleSiteCodeChange(idx: number, siteCode: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const updated = [...stores];
    updated[realIdx] = { ...updated[realIdx], siteCode };
    setStores(updated);
    setDirty(true);
  }

  function handlePerigeeCodeChange(idx: number, perigeeSiteCode: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const updated = [...stores];
    updated[realIdx] = { ...updated[realIdx], perigeeSiteCode };
    setStores(updated);
    setDirty(true);
  }

  function handleChannelChange(idx: number, channelId: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const updated = [...stores];
    updated[realIdx] = { ...updated[realIdx], channelId };
    setStores(updated);
    setDirty(true);
  }

  function handleAreaChange(idx: number, area: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const updated = [...stores];
    updated[realIdx] = { ...updated[realIdx], area };
    setStores(updated);
    setDirty(true);
  }

  function handleBaChange(idx: number, email: string) {
    const store = filtered[idx];
    const realIdx = stores.findIndex(s => s.siteCode === store.siteCode && s.storeName === store.storeName);
    if (realIdx === -1) return;
    const ba = bas.find(b => b.email === email);
    const updated = [...stores];

    // A Dedicated BA works one store: picking a new store for them moves them
    // off the old one(s), after a confirm. Roaming / not set: left alone.
    const key = (email || '').toLowerCase().trim();
    if (key && dedicated.has(key)) {
      const others = updated
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => i !== realIdx && (s.assignedBaEmail || '').toLowerCase().trim() === key);
      if (others.length) {
        const names = others.map(o => o.s.storeName).join(', ');
        const ok = window.confirm(
          `${ba?.repName || email} is a Dedicated BA and is assigned to ${names}.\n\n`
          + `Move them to ${store.storeName}? They will be taken off ${names} (set back to Auto from visits).\n\n`
          + `If they really cover more than one store, cancel and mark them Roaming on BA Management.`
        );
        if (!ok) return;
        for (const o of others) {
          updated[o.i] = { ...updated[o.i], assignedBaEmail: '', assignedBaName: '' };
        }
        setBaEdited(prev => {
          const n = new Set(prev);
          for (const o of others) n.add(`${o.s.siteCode}|${o.s.storeName}|${o.s.channelId}`);
          return n;
        });
      }
    }

    updated[realIdx] = {
      ...updated[realIdx],
      assignedBaEmail: email || '',
      assignedBaName: ba?.repName || '',
    };
    setBaEdited(prev => new Set(prev).add(`${store.siteCode}|${store.storeName}|${store.channelId}`));
    setStores(updated);
    setDirty(true);
  }

  async function handleDelete(store: StoreMaster) {
    const label = `${store.storeName}${store.siteCode ? ` (${store.siteCode})` : ''}`;
    const ok = window.confirm(
      `Delete "${label}" from ${store.channelName || 'no channel'}?\n\n`
      + `This only removes the store master record — its sales/stock data is not touched, `
      + `and the store will re-appear if a DISPO, Diamond Corner or Site Control File upload `
      + `contains it again.`
    );
    if (!ok) return;

    // Identity triple must match the server's lookup exactly — the same store can
    // exist twice under different channels with names differing only by case.
    const key = `${store.siteCode || ''}|${store.storeName}|${store.channelId || ''}`;
    setDeleting(key);
    try {
      const qs = new URLSearchParams({
        storeName: store.storeName,
        siteCode: store.siteCode || '',
        channelId: store.channelId || '',
      });
      const res = await authFetch(`/api/stores?${qs}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStores(prev => prev.filter(s =>
          !(s.storeName === store.storeName
            && (s.siteCode || '') === (store.siteCode || '')
            && (s.channelId || '') === (store.channelId || ''))
        ));
        setToast({ msg: `Deleted ${label}`, type: 'success' });
      } else {
        setToast({ msg: data.error || 'Delete failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Delete failed', type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Every stored field goes back (province, town/city, status from the Site
      // Control File used to be dropped here). Only the fields the GET adds for
      // display are stripped; the assignment date is re-stamped by the server.
      const payload = stores.map(({
        channelName: _cn, mainChannelId: _mi, mainChannelName: _mn,
        derivedBaEmail: _de, derivedBaName: _dn, derivedBaSince: _ds,
        ...rest
      }) => ({
        ...rest,
        siteCode: (rest.siteCode || '').trim(), area: rest.area || '',
        perigeeSiteCode: (rest.perigeeSiteCode || '').trim(),
        assignedBaEmail: rest.assignedBaEmail || '', assignedBaName: rest.assignedBaName || '',
        addedFrom: rest.addedFrom || [],
      }));
      const res = await authFetch('/api/stores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: payload }),
      });
      if (res.ok) {
        setDirty(false);
        setToast({ msg: 'Stores saved', type: 'success' });
        // Reload so the new assignment dates show.
        await loadData();
      } else {
        const data = await res.json().catch(() => ({}));
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

  const unassignedCount = stores.filter(s => !s.channelId).length;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Stores
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Manage store-to-channel assignments. Populate in bulk with <strong>Upload Site Control File</strong>
          (MASTER_SITE format — Site Num, Store Name, Channel, Sub_Channel, Province, Town/City, Status),
          or export the current list to edit and re-import. Stores also auto-populate from DISPO uploads.
        </p>

        {unassignedCount > 0 && (
          <div style={{ padding: '0.6rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.8rem', color: '#92400e', marginBottom: '1rem' }}>
            {unassignedCount} store{unassignedCount > 1 ? 's' : ''} without a channel assignment
          </div>
        )}

        {dupCodes.length > 0 && (
          <div style={{ padding: '0.75rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: '0.8rem', color: '#1e40af', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <strong>{dupCodes.length} site code(s) already existed in another channel</strong> — created as
                separate stores (Perigee allows the same code across channels; nothing was overwritten). Check
                these weren&apos;t accidental clashes:
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {dupCodes.slice(0, 30).map((d, i) => (
                    <li key={i} style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {d.siteCode} · {d.storeName} → <strong>{d.channel}</strong> (also in: {d.alsoIn.join(', ')})
                    </li>
                  ))}
                </ul>
              </div>
              <button className="btn" style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', flexShrink: 0 }} onClick={() => setDupCodes([])}>Dismiss</button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Search stores..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 200, maxWidth: 300 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
          {dirty && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Unsaved changes</span>}
          <button
            className="btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Upload a Site Control File (MASTER_SITE format) — upserts stores by Site Num, auto-creates channels"
            style={{ fontSize: '0.85rem' }}
          >
            {uploading ? 'Uploading…' : 'Upload Site Control File'}
          </button>
          <button className="btn" onClick={handleExport} title="Download the current stores as a Site Control File" style={{ fontSize: '0.85rem' }}>
            Export sites
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadSiteFile(f); }}
          />
          <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 'auto' }}>
            {filtered.length} of {stores.length} stores
          </span>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', flex: 1 }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Site Code</th>
                  <th style={{ width: 130 }}>Perigee Site Code</th>
                  <th>Store Name</th>
                  <th style={{ width: 110 }}>Added From</th>
                  <th style={{ width: 150 }}>Area</th>
                  <th style={{ width: 180 }}>Channel</th>
                  <th style={{ width: 200 }}>Assigned BA</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '2.5rem' }}>
                      <span className="stores-spinner" aria-hidden />
                      <span style={{ marginLeft: '0.6rem', verticalAlign: 'middle' }}>Loading stores…</span>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                      {stores.length === 0 ? 'No stores yet — upload a DISPO file to populate' : 'No matches'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((store, i) => (
                    <tr key={`${i}-${store.storeName}`} style={!store.channelId ? { background: '#fffbeb' } : undefined}>
                      <td>
                        <input
                          className="input"
                          value={store.siteCode || ''}
                          onChange={e => handleSiteCodeChange(i, e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'monospace' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={store.perigeeSiteCode || ''}
                          onChange={e => handlePerigeeCodeChange(i, e.target.value)}
                          placeholder="—"
                          title="Perigee's store code, if it differs from the Site Code. Perigee check-ins matching this code credit this store. Leave blank to match on Site Code only."
                          style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'monospace' }}
                        />
                      </td>
                      <td>{store.storeName}</td>
                      <td>
                        <span
                          title="Where this store was ingested from: a data load (DISPO/Diamond) and/or Perigee visits."
                          style={{
                            display: 'inline-block', fontSize: '0.7rem', fontWeight: 600,
                            padding: '0.15rem 0.5rem', borderRadius: 999,
                            background: (store.addedFrom || []).includes('perigee') ? '#eef2ff' : '#f0fdf4',
                            color: (store.addedFrom || []).includes('perigee') ? '#3730a3' : '#166534',
                            border: `1px solid ${(store.addedFrom || []).includes('perigee') ? '#c7d2fe' : '#bbf7d0'}`,
                          }}
                        >
                          {sourcesLabel(store.addedFrom)}
                        </span>
                      </td>
                      <td>
                        <input
                          className="input"
                          value={store.area || ''}
                          onChange={e => handleAreaChange(i, e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={store.channelId}
                          onChange={e => handleChannelChange(i, e.target.value)}
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        >
                          <option value="">— Select —</option>
                          {channels.map(ch => (
                            <option key={ch.id} value={ch.id}>{ch.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="select"
                          value={store.assignedBaEmail || ''}
                          onChange={e => handleBaChange(i, e.target.value)}
                          style={{ width: '100%', fontSize: '0.8rem' }}
                          title="Defaults to the BA from Perigee visits (stays live). Pick a BA to override; that assignment then wins everywhere."
                        >
                          <option value="">
                            {store.derivedBaName
                              ? `— Auto: ${store.derivedBaName} (from visits) —`
                              : '— Auto (no visits yet) —'}
                          </option>
                          {store.assignedBaEmail && !bas.some(b => b.email === store.assignedBaEmail) && (
                            <option value={store.assignedBaEmail}>{store.assignedBaName || store.assignedBaEmail}</option>
                          )}
                          {bas.map(b => (
                            <option key={b.email} value={b.email}>
                              {b.repName}{dedicated.has(b.email.toLowerCase()) ? ' (Dedicated)' : ''}
                            </option>
                          ))}
                        </select>
                        <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 2 }}>
                          {baEdited.has(`${store.siteCode}|${store.storeName}|${store.channelId}`)
                            ? 'Changed, not saved yet'
                            : store.assignedBaEmail
                              ? `Manual, ${store.assignedAt ? fmtDate(store.assignedAt) : 'date not recorded'}`
                              : store.derivedBaName
                                ? `Perigee, first visit ${fmtDate(store.derivedBaSince) || '?'}`
                                : ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn"
                          onClick={() => handleDelete(store)}
                          disabled={deleting !== null}
                          title="Delete this store from the store master (does not delete its sales data)"
                          style={{
                            padding: '0.2rem 0.5rem', fontSize: '0.72rem',
                            color: '#991b1b', borderColor: '#fca5a5', background: '#fef2f2',
                          }}
                        >
                          {deleting === `${store.siteCode || ''}|${store.storeName}|${store.channelId || ''}` ? '…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Footer />
      </main>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
