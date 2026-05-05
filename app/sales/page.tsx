'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

interface DispoSalesData {
  sales: Record<string, Record<string, Record<string, number>>>;
  stock: Record<string, Record<string, { soh: number; soo: number }>>;
  prices: Record<string, { inclSP: number; promSP: number }>;
  ytd: Record<string, Record<string, number>>;
  uploads: { id: string; fileName: string; uploadedAt: string; rowCount: number }[];
}

interface StoreMasterEntry {
  siteCode: string;
  storeName: string;
  channelId: string;
  channelName?: string;
}

interface Channel {
  id: string;
  name: string;
}

type ViewMode = 'store' | 'product' | 'detail';
type SortDir = 'asc' | 'desc';

function calcValue(units: number, prices: { inclSP: number; promSP: number } | undefined): number {
  if (!prices) return 0;
  const price = prices.promSP > 0 ? prices.promSP : prices.inclSP;
  return units * price;
}

function formatCurrency(val: number): string {
  return 'R ' + val.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonthLabel(key: string): string {
  const [mm, yyyy] = key.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mm, 10) - 1]} ${yyyy}`;
}

export default function SalesPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<DispoSalesData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('store');
  const [monthFilter, setMonthFilter] = useState('all');

  // Stores & channels
  const [storeMaster, setStoreMaster] = useState<StoreMasterEntry[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  // Filters
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState('all');

  // Sort
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Column resize
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  // Export dropdown
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [dispoRes, storesRes, channelsRes] = await Promise.all([
        authFetch('/api/dispo'),
        authFetch('/api/stores'),
        authFetch('/api/channels'),
      ]);
      if (dispoRes.ok) setData(await dispoRes.json());
      if (storesRes.ok) setStoreMaster(await storesRes.json());
      if (channelsRes.ok) setChannels(await channelsRes.json());
    } catch { /* ignore */ }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  // Close export menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Column resize handlers
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizingRef.current) return;
      const delta = e.clientX - resizingRef.current.startX;
      const newW = Math.max(60, resizingRef.current.startW + delta);
      setColWidths(prev => ({ ...prev, [resizingRef.current!.col]: newW }));
    }
    function onMouseUp() {
      resizingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  function startResize(col: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest('th');
    const startW = colWidths[col] || th?.offsetWidth || 120;
    resizingRef.current = { col, startX: e.clientX, startW };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  // DC stores set
  const dcStoreNames = useMemo(() => {
    return new Set(storeMaster.filter(s => s.channelId === 'dc').map(s => s.storeName));
  }, [storeMaster]);

  // Channel lookup for stores
  const storeChannelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of storeMaster) map[s.storeName] = s.channelId;
    return map;
  }, [storeMaster]);

  // Available months from data
  const months = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.sales).sort((a, b) => {
      const [am, ay] = a.split('-').map(Number);
      const [bm, by] = b.split('-').map(Number);
      if (ay !== by) return by - ay;
      return bm - am;
    });
  }, [data]);

  // Available store names (non-DC)
  const availableStores = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const month of Object.values(data.sales)) {
      for (const store of Object.keys(month)) {
        if (!dcStoreNames.has(store)) set.add(store);
      }
    }
    return Array.from(set).sort();
  }, [data, dcStoreNames]);

  // Available product names
  const availableProducts = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const month of Object.values(data.sales)) {
      for (const products of Object.values(month)) {
        for (const article of Object.keys(products)) set.add(article);
      }
    }
    return Array.from(set).sort();
  }, [data]);

  // Filter helper: does a store pass the filter?
  function storePassesFilter(storeName: string): boolean {
    if (dcStoreNames.has(storeName)) return false;
    if (channelFilter !== 'all' && storeChannelMap[storeName] !== channelFilter) return false;
    if (storeFilter.length > 0 && !storeFilter.includes(storeName)) return false;
    return true;
  }

  // Store summary
  const storeSummary = useMemo(() => {
    if (!data) return [];
    const storeMap = new Map<string, { units: number; value: number; ytd: number; soh: number; soo: number }>();
    const monthsToUse = monthFilter === 'all' ? Object.keys(data.sales) : [monthFilter];

    for (const month of monthsToUse) {
      const monthData = data.sales[month];
      if (!monthData) continue;
      for (const [store, products] of Object.entries(monthData)) {
        if (!storePassesFilter(store)) continue;
        if (!storeMap.has(store)) storeMap.set(store, { units: 0, value: 0, ytd: 0, soh: 0, soo: 0 });
        const entry = storeMap.get(store)!;
        for (const [article, units] of Object.entries(products)) {
          if (productFilter.length > 0 && !productFilter.includes(article)) continue;
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
        }
      }
    }

    // Add stock + YTD data
    for (const [store, products] of Object.entries(data.stock)) {
      if (!storePassesFilter(store)) continue;
      if (!storeMap.has(store)) continue;
      const entry = storeMap.get(store)!;
      for (const [article, { soh, soo }] of Object.entries(products)) {
        if (productFilter.length > 0 && !productFilter.includes(article)) continue;
        entry.soh += soh;
        entry.soo += soo;
      }
    }
    if (data.ytd) {
      for (const [store, products] of Object.entries(data.ytd)) {
        if (!storePassesFilter(store)) continue;
        if (!storeMap.has(store)) continue;
        const entry = storeMap.get(store)!;
        for (const [article, units] of Object.entries(products)) {
          if (productFilter.length > 0 && !productFilter.includes(article)) continue;
          entry.ytd += units;
        }
      }
    }

    const arr = Array.from(storeMap.entries()).map(([store, d]) => ({ store, ...d }));
    return sortArray(arr, sortKey, sortDir, viewMode === 'store');
  }, [data, monthFilter, storeFilter, productFilter, channelFilter, dcStoreNames, sortKey, sortDir, viewMode]);

  // Product summary
  const productSummary = useMemo(() => {
    if (!data) return [];
    const prodMap = new Map<string, { units: number; value: number; ytd: number; soh: number; soo: number }>();
    const monthsToUse = monthFilter === 'all' ? Object.keys(data.sales) : [monthFilter];

    for (const month of monthsToUse) {
      const monthData = data.sales[month];
      if (!monthData) continue;
      for (const [store, products] of Object.entries(monthData)) {
        if (!storePassesFilter(store)) continue;
        for (const [article, units] of Object.entries(products)) {
          if (productFilter.length > 0 && !productFilter.includes(article)) continue;
          if (!prodMap.has(article)) prodMap.set(article, { units: 0, value: 0, ytd: 0, soh: 0, soo: 0 });
          const entry = prodMap.get(article)!;
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
        }
      }
    }

    for (const [store, products] of Object.entries(data.stock)) {
      if (!storePassesFilter(store)) continue;
      for (const [article, { soh, soo }] of Object.entries(products)) {
        if (productFilter.length > 0 && !productFilter.includes(article)) continue;
        if (!prodMap.has(article)) continue;
        const entry = prodMap.get(article)!;
        entry.soh += soh;
        entry.soo += soo;
      }
    }
    if (data.ytd) {
      for (const [store, products] of Object.entries(data.ytd)) {
        if (!storePassesFilter(store)) continue;
        for (const [article, units] of Object.entries(products)) {
          if (productFilter.length > 0 && !productFilter.includes(article)) continue;
          if (!prodMap.has(article)) continue;
          prodMap.get(article)!.ytd += units;
        }
      }
    }

    const arr = Array.from(prodMap.entries()).map(([article, d]) => ({ article, ...d }));
    return sortArray(arr, sortKey, sortDir, viewMode === 'product');
  }, [data, monthFilter, storeFilter, productFilter, channelFilter, dcStoreNames, sortKey, sortDir, viewMode]);

  // Detail table
  const detailRows = useMemo(() => {
    if (!data) return [];
    const monthsToUse = monthFilter === 'all' ? Object.keys(data.sales) : [monthFilter];
    const combos = new Map<string, { units: number; value: number; monthUnits: Record<string, number> }>();

    for (const month of monthsToUse) {
      const monthData = data.sales[month];
      if (!monthData) continue;
      for (const [store, products] of Object.entries(monthData)) {
        if (!storePassesFilter(store)) continue;
        for (const [article, units] of Object.entries(products)) {
          if (productFilter.length > 0 && !productFilter.includes(article)) continue;
          const key = `${store}|||${article}`;
          if (!combos.has(key)) combos.set(key, { units: 0, value: 0, monthUnits: {} });
          const entry = combos.get(key)!;
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
          entry.monthUnits[month] = (entry.monthUnits[month] || 0) + units;
        }
      }
    }

    const rows: { store: string; article: string; units: number; value: number; ytd: number; soh: number; soo: number; monthUnits: Record<string, number> }[] = [];
    for (const [key, d] of combos.entries()) {
      const [store, article] = key.split('|||');
      const stockEntry = data.stock[store]?.[article];
      const ytdVal = data.ytd?.[store]?.[article] || 0;
      rows.push({ store, article, units: d.units, value: d.value, ytd: ytdVal, soh: stockEntry?.soh || 0, soo: stockEntry?.soo || 0, monthUnits: d.monthUnits });
    }

    return sortArray(rows, sortKey, sortDir, viewMode === 'detail');
  }, [data, monthFilter, storeFilter, productFilter, channelFilter, dcStoreNames, sortKey, sortDir, viewMode]);

  // DC data (separate section)
  const dcRows = useMemo(() => {
    if (!data) return [];
    const rows: { store: string; article: string; soh: number; soo: number }[] = [];
    for (const [store, products] of Object.entries(data.stock)) {
      if (!dcStoreNames.has(store)) continue;
      for (const [article, { soh, soo }] of Object.entries(products)) {
        if (productFilter.length > 0 && !productFilter.includes(article)) continue;
        rows.push({ store, article, soh, soo });
      }
    }
    return rows.sort((a, b) => a.store.localeCompare(b.store) || a.article.localeCompare(b.article));
  }, [data, dcStoreNames, productFilter]);

  // Sort helper
  function sortArray<T>(arr: T[], key: string, dir: SortDir, active: boolean): T[] {
    if (!active || !key) return arr;
    return [...arr].sort((a, b) => {
      const av = (a as any)[key];
      const bv = (b as any)[key];
      if (typeof av === 'string') {
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return dir === 'asc' ? (av - bv) : (bv - av);
    });
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function clearFilters() {
    setStoreFilter([]);
    setProductFilter([]);
    setChannelFilter('all');
  }

  const hasFilters = storeFilter.length > 0 || productFilter.length > 0 || channelFilter !== 'all';

  // Export functions
  async function exportCurrentView() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    let wsData: unknown[][] = [];

    if (viewMode === 'store') {
      wsData = [['Store', 'Total Units', 'Total Value', 'YTD Sales', 'SOH', 'SOO']];
      for (const r of storeSummary) wsData.push([r.store, r.units, r.value, r.ytd, r.soh, r.soo]);
    } else if (viewMode === 'product') {
      wsData = [['Article', 'Total Units', 'Total Value', 'YTD Sales', 'SOH', 'SOO']];
      for (const r of productSummary) wsData.push([r.article, r.units, r.value, r.ytd, r.soh, r.soo]);
    } else {
      const monthCols = monthFilter === 'all' ? months : [monthFilter];
      wsData = [['Store', 'Article', ...monthCols.map(formatMonthLabel), 'Total Units', 'Total Value', 'YTD Sales', 'SOH', 'SOO']];
      for (const r of detailRows) {
        wsData.push([r.store, r.article, ...monthCols.map(m => r.monthUnits[m] || 0), r.units, r.value, r.ytd, r.soh, r.soo]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, viewMode === 'store' ? 'Store Summary' : viewMode === 'product' ? 'Product Summary' : 'Detail');
    XLSX.writeFile(wb, `dispo_${viewMode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExportMenuOpen(false);
  }

  async function exportAll() {
    if (!data) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Store Summary (unfiltered, non-DC)
    const storeData: unknown[][] = [['Store', 'Total Units', 'Total Value', 'YTD Sales', 'SOH', 'SOO']];
    const allMonths = Object.keys(data.sales);
    const storeAgg = new Map<string, { units: number; value: number; ytd: number; soh: number; soo: number }>();
    for (const month of allMonths) {
      for (const [store, products] of Object.entries(data.sales[month])) {
        if (dcStoreNames.has(store)) continue;
        if (!storeAgg.has(store)) storeAgg.set(store, { units: 0, value: 0, ytd: 0, soh: 0, soo: 0 });
        const entry = storeAgg.get(store)!;
        for (const [article, units] of Object.entries(products)) {
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
        }
      }
    }
    for (const [store, products] of Object.entries(data.stock)) {
      if (dcStoreNames.has(store)) continue;
      if (!storeAgg.has(store)) continue;
      const entry = storeAgg.get(store)!;
      for (const { soh, soo } of Object.values(products)) { entry.soh += soh; entry.soo += soo; }
    }
    if (data.ytd) {
      for (const [store, products] of Object.entries(data.ytd)) {
        if (dcStoreNames.has(store)) continue;
        if (!storeAgg.has(store)) continue;
        for (const units of Object.values(products)) storeAgg.get(store)!.ytd += units;
      }
    }
    for (const [store, d] of Array.from(storeAgg.entries()).sort((a, b) => b[1].value - a[1].value)) {
      storeData.push([store, d.units, d.value, d.ytd, d.soh, d.soo]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(storeData), 'Store Summary');

    // Product Summary (unfiltered, non-DC)
    const prodData: unknown[][] = [['Article', 'Total Units', 'Total Value', 'YTD Sales', 'SOH', 'SOO']];
    const prodAgg = new Map<string, { units: number; value: number; ytd: number; soh: number; soo: number }>();
    for (const month of allMonths) {
      for (const [store, products] of Object.entries(data.sales[month])) {
        if (dcStoreNames.has(store)) continue;
        for (const [article, units] of Object.entries(products)) {
          if (!prodAgg.has(article)) prodAgg.set(article, { units: 0, value: 0, ytd: 0, soh: 0, soo: 0 });
          const entry = prodAgg.get(article)!;
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
        }
      }
    }
    for (const [store, products] of Object.entries(data.stock)) {
      if (dcStoreNames.has(store)) continue;
      for (const [article, { soh, soo }] of Object.entries(products)) {
        if (prodAgg.has(article)) { prodAgg.get(article)!.soh += soh; prodAgg.get(article)!.soo += soo; }
      }
    }
    if (data.ytd) {
      for (const [store, products] of Object.entries(data.ytd)) {
        if (dcStoreNames.has(store)) continue;
        for (const [article, units] of Object.entries(products)) {
          if (prodAgg.has(article)) prodAgg.get(article)!.ytd += units;
        }
      }
    }
    for (const [article, d] of Array.from(prodAgg.entries()).sort((a, b) => b[1].value - a[1].value)) {
      prodData.push([article, d.units, d.value, d.ytd, d.soh, d.soo]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodData), 'Product Summary');

    // Detail (unfiltered, non-DC)
    const sortedMonths = months;
    const detData: unknown[][] = [['Store', 'Article', ...sortedMonths.map(formatMonthLabel), 'Total Units', 'Total Value', 'YTD Sales', 'SOH', 'SOO']];
    const detCombos = new Map<string, { units: number; value: number; monthUnits: Record<string, number> }>();
    for (const month of allMonths) {
      for (const [store, products] of Object.entries(data.sales[month])) {
        if (dcStoreNames.has(store)) continue;
        for (const [article, units] of Object.entries(products)) {
          const key = `${store}|||${article}`;
          if (!detCombos.has(key)) detCombos.set(key, { units: 0, value: 0, monthUnits: {} });
          const entry = detCombos.get(key)!;
          entry.units += units;
          entry.value += calcValue(units, data.prices[article]);
          entry.monthUnits[month] = (entry.monthUnits[month] || 0) + units;
        }
      }
    }
    for (const [key, d] of Array.from(detCombos.entries()).sort((a, b) => b[1].value - a[1].value)) {
      const [store, article] = key.split('|||');
      const ytdVal = data.ytd?.[store]?.[article] || 0;
      const stock = data.stock[store]?.[article];
      detData.push([store, article, ...sortedMonths.map(m => d.monthUnits[m] || 0), d.units, d.value, ytdVal, stock?.soh || 0, stock?.soo || 0]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detData), 'Detail');

    XLSX.writeFile(wb, `dispo_all_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExportMenuOpen(false);
  }

  // Render helpers
  function renderSortHeader(label: string, key: string, align: 'left' | 'right' = 'left') {
    const active = sortKey === key;
    const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const w = colWidths[key];
    return (
      <th
        key={key}
        onClick={() => toggleSort(key)}
        style={{ textAlign: align, cursor: 'pointer', userSelect: 'none', position: 'relative', width: w || undefined, minWidth: 60 }}
      >
        {label}{arrow}
        <span
          onMouseDown={e => startResize(key, e)}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize' }}
        />
      </th>
    );
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Sales & Stock
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          DISPO sales, stock on hand, and stock on order data
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>View</label>
            <select className="select" value={viewMode} onChange={e => { setViewMode(e.target.value as ViewMode); setSortKey(''); }} style={{ minWidth: 160 }}>
              <option value="store">Store Summary</option>
              <option value="product">Product Summary</option>
              <option value="detail">Detail (Store x Product)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Month</label>
            <select className="select" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="all">All Months</option>
              {months.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Channel</label>
            <select className="select" value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ minWidth: 140 }}>
              <option value="all">All Channels</option>
              {channels.filter(c => c.id !== 'dc').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Store</label>
            <select
              className="select"
              value={storeFilter.length === 0 ? '' : storeFilter[0]}
              onChange={e => setStoreFilter(e.target.value ? [e.target.value] : [])}
              style={{ minWidth: 160 }}
            >
              <option value="">All Stores</option>
              {availableStores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Product</label>
            <select
              className="select"
              value={productFilter.length === 0 ? '' : productFilter[0]}
              onChange={e => setProductFilter(e.target.value ? [e.target.value] : [])}
              style={{ minWidth: 160 }}
            >
              <option value="">All Products</option>
              {availableProducts.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {hasFilters && (
            <button className="btn btn-outline" onClick={clearFilters} style={{ fontSize: '0.8rem' }}>
              Clear Filters
            </button>
          )}

          {/* Export dropdown */}
          <div ref={exportRef} style={{ position: 'relative', marginLeft: 'auto' }}>
            <button className="btn btn-outline" onClick={() => setExportMenuOpen(prev => !prev)}>
              Export to Excel ▾
            </button>
            {exportMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white',
                border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 50, minWidth: 200, overflow: 'hidden',
              }}>
                <button
                  onClick={exportCurrentView}
                  style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', border: 'none', background: 'none', textAlign: 'left', fontSize: '0.85rem', cursor: 'pointer', color: '#374151' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Export Current View
                </button>
                <button
                  onClick={exportAll}
                  style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', border: 'none', background: 'none', textAlign: 'left', fontSize: '0.85rem', cursor: 'pointer', color: '#374151', borderTop: '1px solid #f3f4f6' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Export All (3 Sheets)
                </button>
              </div>
            )}
          </div>
        </div>

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading sales data...</div>
        ) : !data || Object.keys(data.sales).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No DISPO data uploaded yet. Upload files via Data Upload.
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Sales (units)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>
                  {storeSummary.reduce((s, r) => s + r.units, 0).toLocaleString()}
                </div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total Sales Value</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0054A6' }}>
                  {formatCurrency(storeSummary.reduce((s, r) => s + r.value, 0))}
                </div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total SOH</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>
                  {storeSummary.reduce((s, r) => s + r.soh, 0).toLocaleString()}
                </div>
              </div>
              <div className="kpi-card">
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Total SOO</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0054A6' }}>
                  {storeSummary.reduce((s, r) => s + r.soo, 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                  {viewMode === 'store' ? 'Store Summary' : viewMode === 'product' ? 'Product Summary' : 'Detail View'}
                  {' '}({viewMode === 'store' ? storeSummary.length : viewMode === 'product' ? productSummary.length : detailRows.length} rows)
                </h3>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                {viewMode === 'store' && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        {renderSortHeader('Store', 'store')}
                        {renderSortHeader('Units', 'units', 'right')}
                        {renderSortHeader('Value', 'value', 'right')}
                        {renderSortHeader('YTD Sales', 'ytd', 'right')}
                        {renderSortHeader('SOH', 'soh', 'right')}
                        {renderSortHeader('SOO', 'soo', 'right')}
                      </tr>
                    </thead>
                    <tbody>
                      {storeSummary.map((r, i) => (
                        <tr key={i}>
                          <td>{r.store}</td>
                          <td style={{ textAlign: 'right' }}>{r.units.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(r.value)}</td>
                          <td style={{ textAlign: 'right' }}>{r.ytd.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soh.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soo.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {viewMode === 'product' && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        {renderSortHeader('Article', 'article')}
                        {renderSortHeader('Units', 'units', 'right')}
                        {renderSortHeader('Value', 'value', 'right')}
                        {renderSortHeader('YTD Sales', 'ytd', 'right')}
                        {renderSortHeader('SOH', 'soh', 'right')}
                        {renderSortHeader('SOO', 'soo', 'right')}
                      </tr>
                    </thead>
                    <tbody>
                      {productSummary.map((r, i) => (
                        <tr key={i}>
                          <td>{r.article}</td>
                          <td style={{ textAlign: 'right' }}>{r.units.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(r.value)}</td>
                          <td style={{ textAlign: 'right' }}>{r.ytd.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soh.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soo.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {viewMode === 'detail' && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        {renderSortHeader('Store', 'store')}
                        {renderSortHeader('Article', 'article')}
                        {(monthFilter === 'all' ? months : [monthFilter]).map(m => (
                          <th key={m} style={{ textAlign: 'right' }}>{formatMonthLabel(m)}</th>
                        ))}
                        {renderSortHeader('Total Units', 'units', 'right')}
                        {renderSortHeader('Value', 'value', 'right')}
                        {renderSortHeader('YTD Sales', 'ytd', 'right')}
                        {renderSortHeader('SOH', 'soh', 'right')}
                        {renderSortHeader('SOO', 'soo', 'right')}
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.slice(0, 500).map((r, i) => (
                        <tr key={i}>
                          <td>{r.store}</td>
                          <td>{r.article}</td>
                          {(monthFilter === 'all' ? months : [monthFilter]).map(m => (
                            <td key={m} style={{ textAlign: 'right' }}>{(r.monthUnits[m] || 0).toLocaleString()}</td>
                          ))}
                          <td style={{ textAlign: 'right' }}>{r.units.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(r.value)}</td>
                          <td style={{ textAlign: 'right' }}>{r.ytd.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soh.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{r.soo.toLocaleString()}</td>
                        </tr>
                      ))}
                      {detailRows.length > 500 && (
                        <tr>
                          <td colSpan={99} style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>
                            Showing first 500 of {detailRows.length.toLocaleString()} rows. Use Excel export for full data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* DC Stores Section */}
            {dcRows.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                      Distribution Centres ({dcRows.length} rows)
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0' }}>
                      DC stock — no sales data (DCs do not sell to consumers)
                    </p>
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 400 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Store</th>
                          <th>Product</th>
                          <th style={{ textAlign: 'right' }}>SOH</th>
                          <th style={{ textAlign: 'right' }}>SOO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dcRows.map((r, i) => (
                          <tr key={i}>
                            <td>{r.store}</td>
                            <td>{r.article}</td>
                            <td style={{ textAlign: 'right' }}>{r.soh.toLocaleString()}</td>
                            <td style={{ textAlign: 'right' }}>{r.soo.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Warning */}
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.8rem', color: '#92400e' }}>
              Sales value is calculated (units x price) and not supplied directly from channel.
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />
        <Footer />
      </main>
    </div>
  );
}
