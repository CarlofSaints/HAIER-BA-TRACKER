'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface ProductMaster {
  articleDesc: string;
  productCode: string;
  category: string;
  industry: string;
  status: string;
}

export default function ProductsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await authFetch('/api/products');
      if (res.ok) setProducts(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.articleDesc.toLowerCase().includes(q) ||
      (p.productCode || '').toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.industry.toLowerCase().includes(q)
    );
  }, [products, search]);

  function handleFieldChange(filteredIdx: number, field: 'productCode' | 'category' | 'industry' | 'status', value: string) {
    const product = filtered[filteredIdx];
    const realIdx = products.findIndex(p => p.articleDesc === product.articleDesc);
    if (realIdx === -1) return;
    const updated = [...products];
    updated[realIdx] = { ...updated[realIdx], [field]: value };
    setProducts(updated);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });
      if (res.ok) {
        setDirty(false);
        setToast({ msg: 'Products saved', type: 'success' });
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

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await authFetch('/api/products', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setToast({ msg: `Synced: ${data.added} new product${data.added !== 1 ? 's' : ''} added (${data.total} total)`, type: 'success' });
        await loadData();
        setDirty(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ msg: data.error || 'Sync failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Sync failed', type: 'error' });
    } finally {
      setSyncing(false);
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Products
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Manage product metadata. Products are auto-populated from DISPO uploads.
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 200, maxWidth: 300 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Sync from DISPO'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
          {dirty && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Unsaved changes</span>}
          <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 'auto' }}>
            {filtered.length} of {products.length} products
          </span>
        </div>

        {products.length === 0 && (
          <div style={{ padding: '0.6rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: '0.8rem', color: '#1e40af', marginBottom: '1rem' }}>
            No products yet. Click &quot;Sync from DISPO&quot; to populate from uploaded DISPO data.
          </div>
        )}

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', flex: 1 }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Article Description</th>
                  <th style={{ width: 130 }}>Product Code</th>
                  <th style={{ width: 160 }}>Category</th>
                  <th style={{ width: 160 }}>Industry</th>
                  <th style={{ width: 140 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                      {products.length === 0 ? 'No products yet — sync from DISPO to populate' : 'No matches'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((product, i) => (
                    <tr key={product.articleDesc}>
                      <td style={{ fontSize: '0.8rem' }}>{product.articleDesc}</td>
                      <td>
                        <input
                          className="input"
                          value={product.productCode || ''}
                          onChange={e => handleFieldChange(i, 'productCode', e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={product.category}
                          onChange={e => handleFieldChange(i, 'category', e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={product.industry}
                          onChange={e => handleFieldChange(i, 'industry', e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={product.status}
                          onChange={e => handleFieldChange(i, 'status', e.target.value)}
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        >
                          <option value="">—</option>
                          <option value="Active">Active</option>
                          <option value="Discontinued">Discontinued</option>
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
