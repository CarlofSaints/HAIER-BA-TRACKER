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
  derivedBaEmail?: string;
  derivedBaName?: string;
  addedFrom?: ('data' | 'perigee')[];
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
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [storesRes, channelsRes, basRes] = await Promise.all([
        authFetch('/api/stores?derivedBa=1'),
        authFetch('/api/channels'),
        authFetch('/api/bas'),
      ]);
      if (storesRes.ok) setStores(await storesRes.json());
      if (channelsRes.ok) setChannels(await channelsRes.json());
      if (basRes.ok) setBas(await basRes.json());
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
            + (d.skipped ? `, ${d.skipped} skipped` : ''),
          type: 'success',
        });
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
    updated[realIdx] = {
      ...updated[realIdx],
      assignedBaEmail: email || '',
      assignedBaName: ba?.repName || '',
    };
    setStores(updated);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = stores.map(({ siteCode, storeName, channelId, area, perigeeSiteCode, assignedBaEmail, assignedBaName, addedFrom }) => ({
        siteCode: (siteCode || '').trim(), storeName, channelId, area: area || '',
        perigeeSiteCode: (perigeeSiteCode || '').trim(),
        assignedBaEmail: assignedBaEmail || '', assignedBaName: assignedBaName || '',
        addedFrom: addedFrom || [],
      }));
      const res = await authFetch('/api/stores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: payload }),
      });
      if (res.ok) {
        setDirty(false);
        setToast({ msg: 'Stores saved', type: 'success' });
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
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '2.5rem' }}>
                      <span className="stores-spinner" aria-hidden />
                      <span style={{ marginLeft: '0.6rem', verticalAlign: 'middle' }}>Loading stores…</span>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
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
                            <option key={b.email} value={b.email}>{b.repName}</option>
                          ))}
                        </select>
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
