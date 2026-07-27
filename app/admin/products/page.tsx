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
  diamondCode?: string;
}

type SortKey = keyof ProductMaster;
type SortDir = 'asc' | 'desc';

const BLANK_PRODUCT: ProductMaster = {
  articleDesc: '', productCode: '', diamondCode: '', category: '', industry: '', status: '',
};

export default function ProductsPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [search, setSearch] = useState('');
  const [diamondFilter, setDiamondFilter] = useState<'all' | 'has' | 'unlinked'>('all');
  const [sortKey, setSortKey] = useState<SortKey | ''>('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState<ProductMaster>(BLANK_PRODUCT);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
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
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      // Diamond filter
      const hasDiamond = !!(p.diamondCode && p.diamondCode.trim());
      const hasMakro = !!(p.productCode && p.productCode.trim());
      if (diamondFilter === 'has' && !hasDiamond) return false;
      if (diamondFilter === 'unlinked' && !(hasDiamond && !hasMakro)) return false;
      // Search filter
      if (!q) return true;
      return (
        p.articleDesc.toLowerCase().includes(q) ||
        (p.productCode || '').toLowerCase().includes(q) ||
        (p.diamondCode || '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.industry.toLowerCase().includes(q)
      );
    });
  }, [products, search, diamondFilter]);

  /** Filtered rows with the active column sort applied. Blanks always sort last. */
  const rows = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] || '').trim();
      const bv = (b[sortKey] || '').trim();
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function renderSortHeader(label: string, field: SortKey, width?: number) {
    const active = sortKey === field;
    return (
      <th
        onClick={() => toggleSort(field)}
        title={`Sort by ${label}`}
        style={{ width, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      >
        {label}
        <span style={{ marginLeft: 4, fontSize: '0.7rem', color: active ? '#0054A6' : '#d1d5db' }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '▴▾'}
        </span>
      </th>
    );
  }

  const diamondCount = useMemo(
    () => products.filter(p => p.diamondCode && p.diamondCode.trim()).length,
    [products],
  );
  const unlinkedCount = useMemo(
    () => products.filter(p => p.diamondCode?.trim() && !p.productCode?.trim()).length,
    [products],
  );

  // Existing values offered as suggestions on the Add SKU form so new products
  // reuse the same category/industry spellings the BA Work report groups on.
  const categoryOptions = useMemo(
    () => [...new Set(products.map(p => p.category?.trim()).filter(Boolean))].sort() as string[],
    [products],
  );
  const industryOptions = useMemo(
    () => [...new Set(products.map(p => p.industry?.trim()).filter(Boolean))].sort() as string[],
    [products],
  );

  function handleFieldChange(articleDesc: string, field: 'productCode' | 'category' | 'industry' | 'status' | 'diamondCode', value: string) {
    const realIdx = products.findIndex(p => p.articleDesc === articleDesc);
    if (realIdx === -1) return;
    const updated = [...products];
    updated[realIdx] = { ...updated[realIdx], [field]: value };
    setProducts(updated);
    setDirty(true);
  }

  function openAdd() {
    setNewProduct(BLANK_PRODUCT);
    setAddError('');
    setShowAdd(true);
  }

  /**
   * Adds the new SKU and persists the whole list in one PUT — this also saves any
   * pending inline grid edits, so the new row lands in the grid without the user
   * losing (or having to separately save) what they were already editing.
   */
  async function handleAddProduct() {
    const desc = newProduct.articleDesc.trim();
    if (!desc) {
      setAddError('Article Description is required');
      return;
    }
    if (products.some(p => p.articleDesc.toLowerCase().trim() === desc.toLowerCase())) {
      setAddError('A product with that Article Description already exists');
      return;
    }

    const product: ProductMaster = {
      articleDesc: desc,
      productCode: newProduct.productCode.trim(),
      diamondCode: (newProduct.diamondCode || '').trim(),
      category: newProduct.category.trim(),
      industry: newProduct.industry.trim(),
      status: newProduct.status,
    };
    const merged = [...products, product].sort((a, b) => a.articleDesc.localeCompare(b.articleDesc));

    setAdding(true);
    setAddError('');
    try {
      const res = await authFetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: merged }),
      });
      if (res.ok) {
        setProducts(merged);
        setDirty(false);
        setShowAdd(false);
        setNewProduct(BLANK_PRODUCT);
        setToast({ msg: `SKU "${desc}" added`, type: 'success' });
      } else {
        const data = await res.json().catch(() => ({}));
        setAddError(data.error || 'Failed to add SKU');
      }
    } catch {
      setAddError('Failed to add SKU');
    } finally {
      setAdding(false);
    }
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
          <select
            className="select"
            value={diamondFilter}
            onChange={e => setDiamondFilter(e.target.value as 'all' | 'has' | 'unlinked')}
            title="Filter by Diamond Corner mapping"
            style={{ minWidth: 220 }}
          >
            <option value="all">All products</option>
            <option value="has">Has Diamond code ({diamondCount})</option>
            <option value="unlinked">Diamond-only — no Makro code ({unlinkedCount})</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={openAdd}
          >
            + Add SKU
          </button>
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
            No products yet. Click &quot;Sync from DISPO&quot; to populate from uploaded DISPO data, or &quot;+ Add SKU&quot; to enter one manually.
          </div>
        )}

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', flex: 1 }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {renderSortHeader('Article Description', 'articleDesc')}
                  {renderSortHeader('Product Code', 'productCode', 130)}
                  {renderSortHeader('Diamond Corner Code', 'diamondCode', 150)}
                  {renderSortHeader('Category', 'category', 160)}
                  {renderSortHeader('Industry', 'industry', 160)}
                  {renderSortHeader('Status', 'status', 140)}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                      {products.length === 0 ? 'No products yet — sync from DISPO to populate' : 'No matches'}
                    </td>
                  </tr>
                ) : (
                  rows.map(product => (
                    <tr key={product.articleDesc}>
                      <td style={{ fontSize: '0.8rem' }}>{product.articleDesc}</td>
                      <td>
                        <input
                          className="input"
                          value={product.productCode || ''}
                          onChange={e => handleFieldChange(product.articleDesc, 'productCode', e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={product.diamondCode || ''}
                          onChange={e => handleFieldChange(product.articleDesc, 'diamondCode', e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={product.category}
                          onChange={e => handleFieldChange(product.articleDesc, 'category', e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={product.industry}
                          onChange={e => handleFieldChange(product.articleDesc, 'industry', e.target.value)}
                          placeholder="—"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={product.status}
                          onChange={e => handleFieldChange(product.articleDesc, 'status', e.target.value)}
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

      {/* Add SKU modal — one field per grid column */}
      {showAdd && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => !adding && setShowAdd(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 14, padding: '1.75rem', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.35rem' }}>Add SKU</h2>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 1.25rem' }}>
              Article Description is the unique product key — it must match the description used in DISPO/SAMS data for sales to link up.
            </p>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>
                  Article Description <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  className="input"
                  autoFocus
                  value={newProduct.articleDesc}
                  onChange={e => setNewProduct(p => ({ ...p, articleDesc: e.target.value }))}
                  placeholder="e.g. HAIER 520L SIDE BY SIDE FRIDGE"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Product Code</label>
                <input
                  className="input"
                  value={newProduct.productCode}
                  onChange={e => setNewProduct(p => ({ ...p, productCode: e.target.value }))}
                  placeholder="—"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Diamond Corner Code</label>
                <input
                  className="input"
                  value={newProduct.diamondCode || ''}
                  onChange={e => setNewProduct(p => ({ ...p, diamondCode: e.target.value }))}
                  placeholder="—"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Category</label>
                <input
                  className="input"
                  list="product-categories"
                  value={newProduct.category}
                  onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}
                  placeholder="—"
                  style={{ width: '100%' }}
                />
                <datalist id="product-categories">
                  {categoryOptions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Industry</label>
                <input
                  className="input"
                  list="product-industries"
                  value={newProduct.industry}
                  onChange={e => setNewProduct(p => ({ ...p, industry: e.target.value }))}
                  placeholder="—"
                  style={{ width: '100%' }}
                />
                <datalist id="product-industries">
                  {industryOptions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Status</label>
                <select
                  className="select"
                  value={newProduct.status}
                  onChange={e => setNewProduct(p => ({ ...p, status: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  <option value="">—</option>
                  <option value="Active">Active</option>
                  <option value="Discontinued">Discontinued</option>
                </select>
              </div>
            </div>

            {addError && (
              <div style={{ marginTop: '0.9rem', padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.78rem', color: '#b91c1c' }}>
                {addError}
              </div>
            )}
            {dirty && (
              <div style={{ marginTop: '0.9rem', fontSize: '0.72rem', color: '#6b7280' }}>
                Note: your unsaved grid edits will be saved along with this SKU.
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => setShowAdd(false)}
                disabled={adding}
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 500,
                  border: '1px solid #d1d5db', borderRadius: 8, background: 'white',
                  color: '#374151', cursor: adding ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddProduct}
                disabled={adding || !newProduct.articleDesc.trim()}
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                  border: 'none', borderRadius: 8, background: '#0054A6', color: 'white',
                  cursor: adding || !newProduct.articleDesc.trim() ? 'not-allowed' : 'pointer',
                  opacity: adding || !newProduct.articleDesc.trim() ? 0.5 : 1,
                }}
              >
                {adding ? 'Adding...' : 'Add SKU'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
