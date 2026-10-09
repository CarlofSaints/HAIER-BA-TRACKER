'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import FilterSelect from '@/components/FilterSelect';
import type { Role } from '@/lib/userData';

/* ── Types ── */

type FormRow = Record<string, string | number | null>;

interface FormDataResponse {
  month: string;
  headers: string[];
  imageColumns: string[];
  rows: FormRow[];
}

type FormKey = 'display' | 'red-flags' | 'training';

/**
 * Forms whose uploads keep Perigee photos. Roles follow the sidebar: clients see the
 * Display Maintenance page but not Red Flags or Training.
 */
const FORMS: { key: FormKey; label: string; roles: Role[] }[] = [
  { key: 'display', label: 'Display Maintenance', roles: ['super_admin', 'admin', 'client'] },
  { key: 'red-flags', label: 'Red Flags', roles: ['super_admin', 'admin'] },
  { key: 'training', label: 'Training', roles: ['super_admin', 'admin'] },
];

interface Photo {
  src: string;
  question: string;
  ba: string;
  store: string;
  date: string;
}

/* ── Column detection (Perigee export headers, any case) ── */

const FIRST_NAME = new Set(['first name', 'firstname', 'name']);
const LAST_NAME = new Set(['last name', 'lastname', 'surname']);
const REP_NAME = new Set(['rep name', 'representative name']);
const STORE = new Set(['store', 'store name', 'place']);
const CHANNEL = new Set(['channel', 'cpf.channel']);
const PROVINCE = new Set(['province']);

/** Shown in the fixed columns or not useful in the grid. */
const HIDDEN = new Set([
  'id', 'email', 'representative id', 'rep email', 'customer', 'store code', 'place id',
  'visit uuid', 'visit id', 'visitid', 'tag', 'sync date', 'sync time',
  ...FIRST_NAME, ...LAST_NAME, ...REP_NAME, ...STORE, ...CHANNEL, ...PROVINCE,
  'date', 'check in date', 'check-in date',
]);

const norm = (h: string) => h.toLowerCase().trim();
// Every matching header, because uploads in one month can name the same field differently
// (one export says "Store", another "Place"); each row reads whichever it has.
const findCols = (headers: string[], names: Set<string>) => headers.filter(h => names.has(norm(h)));

function buildColumns(headers: string[]) {
  return {
    first: findCols(headers, FIRST_NAME),
    last: findCols(headers, LAST_NAME),
    rep: findCols(headers, REP_NAME),
    store: findCols(headers, STORE),
    channel: findCols(headers, CHANNEL),
    province: findCols(headers, PROVINCE),
    visible: headers.filter(h => !h.startsWith('_') && !HIDDEN.has(norm(h))),
  };
}
type Cols = ReturnType<typeof buildColumns>;

/** First non-empty value among the candidate headers. */
function cell(row: FormRow, cols: string[]): string {
  for (const c of cols) {
    const v = String(row[c] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function baName(row: FormRow, c: Cols): string {
  const merged = [cell(row, c.first), cell(row, c.last)].filter(Boolean).join(' ');
  return merged || cell(row, c.rep);
}

/* ── Helpers ── */

const PERIGEE_PREFIX = 'https://live.perigeeportal.co.za';

function isImageUrl(val: unknown): val is string {
  return typeof val === 'string' && val.startsWith('https://');
}

function resolveImageUrl(url: string): string {
  return url.startsWith(PERIGEE_PREFIX) ? `/api/image?url=${encodeURIComponent(url)}` : url;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Last 18 months, newest first. */
function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 18; i++) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function monthEnd(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const unique = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const toOptions = (arr: string[]) => arr.map(v => ({ value: v, label: v }));

/* ── Lightbox (arrows step through every photo in the filtered rows) ── */

function Lightbox({ photos, index, onIndex, onClose }: {
  photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const photo = photos[index];
  const prev = useCallback(() => onIndex((index - 1 + photos.length) % photos.length), [index, photos.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % photos.length), [index, photos.length, onIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault(); // don't scroll the grid behind
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  if (!photo) return null;
  const arrow: React.CSSProperties = {
    position: 'fixed', top: '50%', transform: 'translateY(-50%)', zIndex: 1001,
    background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '1.75rem',
    width: 48, height: 64, borderRadius: 8, cursor: 'pointer',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out',
      }}
      onClick={onClose}
    >
      {photos.length > 1 && (
        <>
          <button aria-label="Previous photo" style={{ ...arrow, left: 16 }} onClick={e => { e.stopPropagation(); prev(); }}>&#8249;</button>
          <button aria-label="Next photo" style={{ ...arrow, right: 16 }} onClick={e => { e.stopPropagation(); next(); }}>&#8250;</button>
        </>
      )}
      <div style={{ position: 'relative', maxWidth: '85vw', maxHeight: '90vh', cursor: 'default' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'rgba(255,255,255,0.85)', fontSize: '0.8rem', marginBottom: 8 }}>
          <span>
            <strong style={{ color: 'white' }}>{photo.question}</strong>
            {' · '}{photo.ba || 'Unknown BA'}{' · '}{photo.store || 'Unknown store'}{photo.date ? ` · ${formatDate(photo.date)}` : ''}
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>
            {index + 1} of {photos.length}
            <button onClick={onClose} style={{ marginLeft: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '0.8rem' }}>
              Close (Esc)
            </button>
          </span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.src}
          src={photo.src}
          alt={photo.question}
          style={{ maxHeight: '80vh', maxWidth: '100%', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'block', margin: '0 auto' }}
        />
      </div>
    </div>
  );
}

/* ── Page ── */

const STICKY = { num: 40, ba: 160, store: 180 };

export default function FormPhotosPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin', 'client']);

  const forms = useMemo(() => FORMS.filter(f => session && f.roles.includes(session.role)), [session]);
  const [form, setForm] = useState<FormKey>('display');
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<FormDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [selChannels, setSelChannels] = useState<string[]>([]);
  const [selBas, setSelBas] = useState<string[]>([]);
  const [selStores, setSelStores] = useState<string[]>([]);
  const [selProvinces, setSelProvinces] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [photosOnly, setPhotosOnly] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await authFetch(`/api/${form}/form-data?month=${month}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setData(null);
          setLoadError(json?.error || `Could not load the ${form} forms (${res.status}).`);
        } else {
          setData(json);
        }
      } catch {
        if (!cancelled) { setData(null); setLoadError('Could not load the forms. Check your connection and try again.'); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session, form, month]);

  const cols = useMemo(() => (data ? buildColumns(data.headers) : null), [data]);
  const imageCols = useMemo(() => new Set(data?.imageColumns ?? []), [data]);

  // Rows carry the derived fields the filters and fixed columns read. Overlapping
  // exports (1-15 Oct, then 1-31 Oct) load the same row twice, so identical rows are
  // dropped. Rows that differ (several products flagged on one visit) all stay.
  const rows = useMemo(() => {
    if (!data || !cols) return [];
    const seen = new Set<string>();
    const unique = data.rows.filter(row => {
      const key = JSON.stringify(Object.keys(row).filter(k => !k.startsWith('_')).sort().map(k => [k, row[k]]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.map(row => ({
      row,
      ba: baName(row, cols),
      store: cell(row, cols.store),
      channel: cell(row, cols.channel),
      province: cell(row, cols.province),
      date: typeof row['_normalizedDate'] === 'string' ? row['_normalizedDate'] : '',
      hasPhoto: data.imageColumns.some(c => isImageUrl(row[c])),
    }));
  }, [data, cols]);

  // A date input emits partial years while typing ("0002-10-01"), so only a complete date
  // filters; a From after To is read the other way round rather than emptying the grid.
  const dateRange = useMemo(() => {
    const ok = (d: string) => /^(19|20)\d{2}-\d{2}-\d{2}$/.test(d) ? d : '';
    const from = ok(fromDate), to = ok(toDate);
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }, [fromDate, toDate]);

  // Each filter's options narrow to the rows the OTHER filters leave.
  const passes = useCallback((r: (typeof rows)[number], skip?: 'channel' | 'ba' | 'store' | 'province') =>
    (skip === 'channel' || selChannels.length === 0 || selChannels.includes(r.channel)) &&
    (skip === 'ba' || selBas.length === 0 || selBas.includes(r.ba)) &&
    (skip === 'store' || selStores.length === 0 || selStores.includes(r.store)) &&
    (skip === 'province' || selProvinces.length === 0 || selProvinces.includes(r.province)) &&
    (!dateRange.from || r.date >= dateRange.from) &&
    (!dateRange.to || r.date <= dateRange.to) &&
    (!photosOnly || r.hasPhoto),
  [selChannels, selBas, selStores, selProvinces, dateRange, photosOnly]);

  // A ticked value stays in its list even when no row has it any more (after a month
  // or date change), so it can still be seen and unticked.
  const channelOptions = useMemo(() => unique([...rows.filter(r => passes(r, 'channel')).map(r => r.channel), ...selChannels]), [rows, passes, selChannels]);
  const baOptions = useMemo(() => unique([...rows.filter(r => passes(r, 'ba')).map(r => r.ba), ...selBas]), [rows, passes, selBas]);
  const storeOptions = useMemo(() => unique([...rows.filter(r => passes(r, 'store')).map(r => r.store), ...selStores]), [rows, passes, selStores]);
  const provinceOptions = useMemo(() => unique([...rows.filter(r => passes(r, 'province')).map(r => r.province), ...selProvinces]), [rows, passes, selProvinces]);

  // Photos whose image failed to load drop out of the grid, the count and the lightbox.
  const [brokenSrcs, setBrokenSrcs] = useState<Set<string>>(new Set());
  const markBroken = useCallback((src: string) => setBrokenSrcs(prev => (prev.has(src) ? prev : new Set(prev).add(src))), []);

  const filtered = useMemo(
    () => rows.filter(r => passes(r)).sort((a, b) => b.date.localeCompare(a.date) || a.ba.localeCompare(b.ba)),
    [rows, passes],
  );

  // Grid columns in form order; photo columns kept even if a header never made the list.
  const gridCols = useMemo(() => {
    if (!cols || !data) return [];
    const out = [...cols.visible];
    for (const ic of data.imageColumns) if (!out.includes(ic)) out.push(ic);
    return out;
  }, [cols, data]);

  // Every photo in grid order, so the lightbox can step through them.
  const { photos, photoIndex } = useMemo(() => {
    const photos: Photo[] = [];
    const photoIndex = new Map<string, number>();
    filtered.forEach((r, ri) => {
      for (const h of gridCols) {
        const v = r.row[h];
        if (imageCols.has(h) && isImageUrl(v)) {
          const src = resolveImageUrl(v);
          if (brokenSrcs.has(src)) continue;
          photoIndex.set(`${ri}|${h}`, photos.length);
          photos.push({ src, question: h, ba: r.ba, store: r.store, date: r.date });
        }
      }
    });
    return { photos, photoIndex };
  }, [filtered, gridCols, imageCols, brokenSrcs]);

  function clearFilters() {
    setSelChannels([]); setSelBas([]); setSelStores([]); setSelProvinces([]);
    setFromDate(''); setToDate(''); setPhotosOnly(true);
  }
  const hasFilters = selChannels.length + selBas.length + selStores.length + selProvinces.length > 0 || !!fromDate || !!toDate || !photosOnly;

  function changeForm(v: string) {
    setForm(v as FormKey);
    clearFilters();
    setLightboxIndex(null);
  }
  function changeMonth(v: string) {
    setMonth(v);
    setFromDate(''); setToDate('');
    setLightboxIndex(null);
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  const label: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 };
  const th: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', textAlign: 'left', fontSize: '0.72rem',
    fontWeight: 600, color: '#374151', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
  };
  const stickyCell = (left: number, width: number, bg: string): React.CSSProperties => ({
    position: 'sticky', left, zIndex: 1, background: bg, minWidth: width, maxWidth: width, width,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>Form Photos</h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Photos from the forms BAs submit in Perigee. Click a photo to enlarge it; use the arrow keys to move through them.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={label}>Form</label>
            <FilterSelect value={form} onChange={changeForm} options={forms.map(f => ({ value: f.key, label: f.label }))} style={{ minWidth: 180 }} />
          </div>
          <div>
            <label style={label}>Month</label>
            <FilterSelect value={month} onChange={changeMonth} options={monthOptions()} style={{ minWidth: 130 }} />
          </div>
          <div>
            <label style={label}>From</label>
            <input className="input" type="date" value={fromDate} min={`${month}-01`} max={toDate || monthEnd(month)} onChange={e => setFromDate(e.target.value)} style={{ width: 150 }} />
          </div>
          <div>
            <label style={label}>To</label>
            <input className="input" type="date" value={toDate} min={fromDate || `${month}-01`} max={monthEnd(month)} onChange={e => setToDate(e.target.value)} style={{ width: 150 }} />
          </div>
          <div>
            <label style={label}>Channel</label>
            <FilterSelect multiple value={selChannels} onChange={setSelChannels} allLabel="All Channels" options={toOptions(channelOptions)} style={{ minWidth: 150 }} />
          </div>
          <div>
            <label style={label}>Province</label>
            <FilterSelect multiple value={selProvinces} onChange={setSelProvinces} allLabel="All Provinces" options={toOptions(provinceOptions)} style={{ minWidth: 140 }} />
          </div>
          <div>
            <label style={label}>BA</label>
            <FilterSelect multiple value={selBas} onChange={setSelBas} allLabel="All BAs" searchPlaceholder="Search BAs..." options={toOptions(baOptions)} style={{ minWidth: 170 }} />
          </div>
          <div>
            <label style={label}>Store</label>
            <FilterSelect multiple value={selStores} onChange={setSelStores} allLabel="All Stores" searchPlaceholder="Search stores..." options={toOptions(storeOptions)} style={{ minWidth: 180 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#374151', paddingBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={photosOnly} onChange={e => setPhotosOnly(e.target.checked)} />
            Only forms with photos
          </label>
          {hasFilters && (
            <button className="btn btn-outline" onClick={clearFilters} style={{ fontSize: '0.8rem' }}>Clear Filters</button>
          )}
        </div>

        {!loading && data && (
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
            <span><strong style={{ color: '#111827' }}>{filtered.length}</strong> forms</span>
            <span><strong style={{ color: '#111827' }}>{photos.length}</strong> photos</span>
            <span><strong style={{ color: '#111827' }}>{new Set(filtered.map(r => r.ba).filter(Boolean)).size}</strong> BAs</span>
            <span><strong style={{ color: '#111827' }}>{new Set(filtered.map(r => r.store).filter(Boolean)).size}</strong> stores</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading forms...</div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#991b1b' }}>{loadError}</div>
        ) : !data || data.rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            No {forms.find(f => f.key === form)?.label} forms uploaded for this month.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>No forms match these filters.</div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...stickyCell(0, STICKY.num, '#f9fafb'), zIndex: 3 }}>#</th>
                  <th style={{ ...th, ...stickyCell(STICKY.num, STICKY.ba, '#f9fafb'), zIndex: 3 }}>BA</th>
                  <th style={{ ...th, ...stickyCell(STICKY.num + STICKY.ba, STICKY.store, '#f9fafb'), zIndex: 3, borderRight: '1px solid #e5e7eb' }}>Store</th>
                  <th style={th}>Date</th>
                  <th style={th}>Channel</th>
                  <th style={th}>Province</th>
                  {gridCols.map(h => <th key={h} style={{ ...th, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, ri) => {
                  const bg = ri % 2 ? '#fafafa' : 'white';
                  const td: React.CSSProperties = { fontSize: '0.8rem', padding: '6px 10px', borderBottom: '1px solid #f3f4f6', background: bg };
                  return (
                    <tr key={ri}>
                      <td style={{ ...td, ...stickyCell(0, STICKY.num, bg), color: '#9ca3af' }}>{ri + 1}</td>
                      <td style={{ ...td, ...stickyCell(STICKY.num, STICKY.ba, bg) }} title={r.ba}>{r.ba || '—'}</td>
                      <td style={{ ...td, ...stickyCell(STICKY.num + STICKY.ba, STICKY.store, bg), borderRight: '1px solid #e5e7eb' }} title={r.store}>{r.store || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.date ? formatDate(r.date) : '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.channel || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.province || '—'}</td>
                      {gridCols.map(h => {
                        const v = r.row[h];
                        if (imageCols.has(h)) {
                          const pi = photoIndex.get(`${ri}|${h}`);
                          return (
                            <td key={h} style={{ ...td, padding: '4px 8px' }}>
                              {pi !== undefined ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={photos[pi].src}
                                  alt={h}
                                  title={`${h}: click to enlarge`}
                                  loading="lazy"
                                  onClick={() => setLightboxIndex(pi)}
                                  style={{ height: 56, width: 72, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'zoom-in', display: 'block' }}
                                  onError={() => markBroken(photos[pi].src)}
                                />
                              ) : <span style={{ color: '#d1d5db' }}>—</span>}
                            </td>
                          );
                        }
                        const text = v === null || v === undefined ? '' : String(v);
                        return (
                          <td key={h} style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={text}>
                            {text || <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Footer />
      </main>

      {lightboxIndex !== null && photos.length > 0 && (
        <Lightbox photos={photos} index={Math.min(lightboxIndex, photos.length - 1)} onIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}
