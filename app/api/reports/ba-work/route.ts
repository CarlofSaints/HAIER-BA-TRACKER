import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { loadChannels, Channel } from '@/lib/channelData';
import { loadStores, StoreMaster } from '@/lib/storeData';
import { loadProducts, ProductMaster } from '@/lib/productData';
import { loadDispoData, calcSalesValue, DispoSalesData, DispoUploadMeta } from '@/lib/dispoData';
import { loadVisitIndex, loadVisitData, Visit } from '@/lib/visitData';
import { loadDisplayIndex, loadDisplayData, DisplayRecord } from '@/lib/displayData';
import { loadWeekMapping, getWeekNumber, type WeekMappingYear } from '@/lib/weekMapping';
import { readJson } from '@/lib/blob';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* ── Helpers ── */

const MONTH_KEYS = [
  { label: 'Mar', mm: '03' },
  { label: 'Apr', mm: '04' },
  { label: 'May', mm: '05' },
  { label: 'Jun', mm: '06' },
  { label: 'Jul', mm: '07' },
  { label: 'Aug', mm: '08' },
  { label: 'Sep', mm: '09' },
  { label: 'Oct', mm: '10' },
  { label: 'Nov', mm: '11' },
  { label: 'Dec', mm: '12' },
];

function dispoMonthKey(mm: string, year: number): string {
  return `${mm}-${year}`;
}

/**
 * Build BA map keyed by MULTIPLE keys per store so we can match across
 * Perigee visit names and DISPO/Massmart names.
 * Keys: visit storeName, visit storeCode, AND store master storeName (all lowercase).
 */
function buildBaMap(visits: Visit[], stores: StoreMaster[]): Record<string, string> {
  // Also build storeCode → storeName bridge from store master
  const codeToName: Record<string, string> = {};
  for (const s of stores) {
    if (s.siteCode) codeToName[s.siteCode.toLowerCase().trim()] = s.storeName.toLowerCase().trim();
  }

  // Sort by date desc so we keep the most recent BA per store
  const sorted = [...visits].sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''));
  const map: Record<string, string> = {};

  for (const v of sorted) {
    if (!v.repName) continue;

    // Key by visit storeName
    const nameKey = (v.storeName || '').toLowerCase().trim();
    if (nameKey && !map[nameKey]) map[nameKey] = v.repName;

    // Key by visit storeCode
    const codeKey = (v.storeCode || '').toLowerCase().trim();
    if (codeKey && !map[codeKey]) map[codeKey] = v.repName;

    // Key by store master storeName that matches this storeCode
    // (bridges Perigee code → DISPO store name)
    if (codeKey && codeToName[codeKey] && !map[codeToName[codeKey]]) {
      map[codeToName[codeKey]] = v.repName;
    }
  }
  return map;
}

/**
 * Build display set keyed by multiple keys (same bridging logic as BA map).
 */
function buildDisplaySet(records: DisplayRecord[], stores: StoreMaster[]): Set<string> {
  const codeToName: Record<string, string> = {};
  for (const s of stores) {
    if (s.siteCode) codeToName[s.siteCode.toLowerCase().trim()] = s.storeName.toLowerCase().trim();
  }

  const set = new Set<string>();
  for (const r of records) {
    const nameKey = (r.store || '').toLowerCase().trim();
    if (nameKey) set.add(nameKey);

    const codeKey = (r.storeCode || '').toLowerCase().trim();
    if (codeKey) set.add(codeKey);

    // Bridge: Perigee storeCode → DISPO storeName
    if (codeKey && codeToName[codeKey]) set.add(codeToName[codeKey]);
  }
  return set;
}

/** Build channel lookup: channelId → { mainName, subName } */
function buildChannelLookup(channels: Channel[]): Record<string, { mainName: string; subName: string }> {
  const map: Record<string, { mainName: string; subName: string }> = {};
  const byId = Object.fromEntries(channels.map(c => [c.id, c]));

  for (const ch of channels) {
    if (ch.parentId) {
      // This is a sub-channel
      const parent = byId[ch.parentId];
      map[ch.id] = { mainName: parent?.name || '', subName: ch.name };
    } else {
      // This is a main channel (stores may be directly assigned to it)
      map[ch.id] = { mainName: ch.name, subName: '' };
    }
  }
  return map;
}

/** Build store lookup: storeName (lowercase) → store + channel info */
function buildStoreLookup(
  stores: StoreMaster[],
  channelLookup: Record<string, { mainName: string; subName: string }>
): Record<string, { area: string; mainChannel: string; subChannel: string }> {
  const map: Record<string, { area: string; mainChannel: string; subChannel: string }> = {};
  for (const s of stores) {
    const key = s.storeName.toLowerCase().trim();
    const ch = channelLookup[s.channelId] || { mainName: '', subName: '' };
    map[key] = { area: s.area || '', mainChannel: ch.mainName, subChannel: ch.subName };
  }
  return map;
}

/** Raw row shape from dispo/raw/{id}.json */
interface RawRow {
  articleDesc: string;
  siteName: string;
  siteCode: string;
  sales: Record<string, number>;
  ytd: number;
  soh: number;
  soo: number;
  inclSP: number;
  promSP: number;
}

/**
 * Compute weekly unit deltas by diffing consecutive raw DISPO uploads.
 * Each upload's sales are MTD per month. The delta between consecutive uploads
 * gives the units sold in that period. We assign each delta to the week of the
 * later upload.
 */
async function buildWeeklyData(
  dispo: DispoSalesData,
  yearConfig: WeekMappingYear | undefined,
  year: number
): Promise<{ weekNums: number[]; data: Record<string, Record<string, Record<number, number>>> }> {
  // data[storeName][articleDesc][weekNum] = units sold that week
  const data: Record<string, Record<string, Record<number, number>>> = {};
  const weekNumsSet = new Set<number>();

  // Need at least 2 uploads and a week mapping to compute deltas
  if (!yearConfig || dispo.uploads.length < 2) {
    // Still include week column headers up to current week if mapping exists
    if (yearConfig) {
      const cw = getWeekNumber(new Date(), yearConfig);
      if (cw) for (let w = 1; w <= cw; w++) weekNumsSet.add(w);
    }
    return { weekNums: Array.from(weekNumsSet).sort((a, b) => a - b), data };
  }

  // Sort uploads chronologically
  const sorted = [...dispo.uploads].sort(
    (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
  );

  // Load all raw files
  interface RawFile { rows: RawRow[]; monthMap: Record<string, string> }
  const rawFiles: { meta: DispoUploadMeta; raw: RawFile }[] = [];
  for (const meta of sorted) {
    const raw = await readJson<RawFile>(`dispo/raw/${meta.id}.json`, { rows: [], monthMap: {} });
    if (raw.rows.length > 0) rawFiles.push({ meta, raw });
  }

  if (rawFiles.length < 2) {
    const cw = getWeekNumber(new Date(), yearConfig);
    if (cw) for (let w = 1; w <= cw; w++) weekNumsSet.add(w);
    return { weekNums: Array.from(weekNumsSet).sort((a, b) => a - b), data };
  }

  // For each consecutive pair, compute delta and assign to a week
  for (let i = 1; i < rawFiles.length; i++) {
    const prevRows = rawFiles[i - 1].raw.rows;
    const currRows = rawFiles[i].raw.rows;
    const uploadDate = new Date(rawFiles[i].meta.uploadedAt);

    const weekNum = getWeekNumber(uploadDate, yearConfig);
    if (!weekNum) continue;
    weekNumsSet.add(weekNum);

    // Build per store|product → total units (across all months for this year) for each snapshot
    const prevMap: Record<string, number> = {};
    for (const row of prevRows) {
      let total = 0;
      for (const [mk, units] of Object.entries(row.sales)) {
        const parts = mk.split('-');
        if (parts.length === 2 && parseInt(parts[1]) === year) total += units;
      }
      const key = `${row.siteName}\t${row.articleDesc}`;
      prevMap[key] = (prevMap[key] || 0) + total;
    }

    const currMap: Record<string, number> = {};
    for (const row of currRows) {
      let total = 0;
      for (const [mk, units] of Object.entries(row.sales)) {
        const parts = mk.split('-');
        if (parts.length === 2 && parseInt(parts[1]) === year) total += units;
      }
      const key = `${row.siteName}\t${row.articleDesc}`;
      currMap[key] = (currMap[key] || 0) + total;
    }

    // Compute positive deltas
    for (const key of Object.keys(currMap)) {
      const delta = (currMap[key] || 0) - (prevMap[key] || 0);
      if (delta <= 0) continue;

      const [storeName, articleDesc] = key.split('\t');
      if (!data[storeName]) data[storeName] = {};
      if (!data[storeName][articleDesc]) data[storeName][articleDesc] = {};
      data[storeName][articleDesc][weekNum] = (data[storeName][articleDesc][weekNum] || 0) + delta;
    }
  }

  // Ensure we have column headers up to the current week
  const cw = getWeekNumber(new Date(), yearConfig);
  if (cw) {
    for (let w = 1; w <= cw; w++) weekNumsSet.add(w);
  }

  return { weekNums: Array.from(weekNumsSet).sort((a, b) => a - b), data };
}

/* ── Main handler ── */

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = new Date().getFullYear();

  // Load all data in parallel
  const [channels, stores, products, dispo, visitIndex, displayIndex, weekConfig] = await Promise.all([
    loadChannels(),
    loadStores(),
    loadProducts(),
    loadDispoData(),
    loadVisitIndex(),
    loadDisplayIndex(),
    loadWeekMapping(),
  ]);

  // Load all visits
  const allVisits: Visit[] = [];
  for (const meta of visitIndex) {
    const v = await loadVisitData(meta.id);
    allVisits.push(...v);
  }

  // Load all display records
  const allDisplay: DisplayRecord[] = [];
  for (const meta of displayIndex) {
    const d = await loadDisplayData(meta.id);
    allDisplay.push(...d);
  }

  // Build lookups
  const channelLookup = buildChannelLookup(channels);
  const storeLookup = buildStoreLookup(stores, channelLookup);
  const baMap = buildBaMap(allVisits, stores);
  const displaySet = buildDisplaySet(allDisplay, stores);

  // articleDesc (lowercase) → ProductMaster for industry lookup
  const productLookup = new Map<string, ProductMaster>();
  for (const p of products) {
    productLookup.set(p.articleDesc.toLowerCase().trim(), p);
  }

  // storeName (lowercase) → siteCode (lowercase) for fallback BA/display lookups
  const nameToCode: Record<string, string> = {};
  for (const s of stores) {
    if (s.siteCode && s.storeName) {
      nameToCode[s.storeName.toLowerCase().trim()] = s.siteCode.toLowerCase().trim();
    }
  }

  // Week mapping + weekly deltas from raw DISPO uploads
  const yearConfig = weekConfig.years.find(y => y.year === year);
  const { weekNums, data: weeklyLookup } = await buildWeeklyData(dispo, yearConfig, year);

  // Collect all unique (storeName, articleDesc) pairs from DISPO
  const storeProductPairs: { storeName: string; articleDesc: string }[] = [];
  const seen = new Set<string>();

  // From sales data (all months)
  for (const month of Object.keys(dispo.sales)) {
    for (const storeName of Object.keys(dispo.sales[month])) {
      for (const articleDesc of Object.keys(dispo.sales[month][storeName])) {
        const key = `${storeName.toLowerCase()}|${articleDesc.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          storeProductPairs.push({ storeName, articleDesc });
        }
      }
    }
  }

  // Also from stock data (may have products not in sales)
  for (const storeName of Object.keys(dispo.stock)) {
    for (const articleDesc of Object.keys(dispo.stock[storeName])) {
      const key = `${storeName.toLowerCase()}|${articleDesc.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        storeProductPairs.push({ storeName, articleDesc });
      }
    }
  }

  // Sort by store name then product
  storeProductPairs.sort((a, b) => a.storeName.localeCompare(b.storeName) || a.articleDesc.localeCompare(b.articleDesc));

  /* ── Build column structure ── */

  // Fixed columns (0-11)
  const fixedHeaders = [
    '序号\nNO.',
    '渠道\nchannel',
    '小渠道\nsmall channel',
    '区域\narea',
    'Store',
    'BA',
    '进驻产业\nindustry',
    '进驻型号\nmodel',
    '模特位\nDisplay',
    '端头\nEnd position',
    'sale in qty',
    '合计\ntotal',
  ];

  // Monthly columns
  const monthHeaders = MONTH_KEYS.map(m => m.label);

  // Weekly columns
  const weekHeaders = weekNums.map(w => `W${w}`);

  // Spacer
  const spacerHeader = [''];

  // End columns
  const endHeaders = [
    '是否出样\nFlooring',
    '产品价格准确\nAccurate price',
    '产品物料\nProduct POSM',
    '营销物料\nMarketing POSM',
    '客户可售库存\nSOH',
  ];

  const totalCols = fixedHeaders.length + monthHeaders.length + weekHeaders.length + spacerHeader.length + endHeaders.length;

  // Column index ranges
  const monthStart = fixedHeaders.length;
  const monthEnd = monthStart + monthHeaders.length - 1;
  const weekStart = monthEnd + 1;
  const weekEnd = weekStart + weekHeaders.length - 1;
  const spacerIdx = weekEnd + 1;
  const endStart = spacerIdx + 1;

  /* ── Build worksheet data ── */

  const wsData: (string | number | null)[][] = [];

  // Row 0 (Excel row 1): blank
  wsData.push(new Array(totalCols).fill(null));

  // Row 1 (Excel row 2): title
  const row2 = new Array(totalCols).fill(null);
  row2[0] = 'BA basic data form';
  wsData.push(row2);

  // Row 2 (Excel row 3): section headers
  const row3 = new Array(totalCols).fill(null);
  if (monthStart < totalCols) row3[monthStart - 1] = '销售数据';  // before monthly, on "total" col
  if (endStart < totalCols) row3[endStart] = '门店展示display';
  if (endStart + 4 < totalCols) row3[endStart + 4] = 'store Inventory';
  wsData.push(row3);

  // Row 3 (Excel row 4): sub-section headers
  const row4 = new Array(totalCols).fill(null);
  if (monthHeaders.length > 0) row4[monthStart] = 'monthly';
  if (weekHeaders.length > 0) row4[weekStart] = 'weekly';
  // End columns get their bilingual headers in row 4 (merged with row 5)
  if (endStart < totalCols) row4[endStart] = '是否出样\nFlooring';
  if (endStart + 1 < totalCols) row4[endStart + 1] = '产品价格准确\nAccurate price';
  if (endStart + 2 < totalCols) row4[endStart + 2] = '产品物料\nProduct POSM';
  if (endStart + 3 < totalCols) row4[endStart + 3] = '营销物料\nMarketing POSM';
  if (endStart + 4 < totalCols) row4[endStart + 4] = '客户可售库存\nSOH';
  wsData.push(row4);

  // Row 4 (Excel row 5): column headers
  const row5 = [
    ...fixedHeaders,
    ...monthHeaders,
    ...weekHeaders,
    ...spacerHeader,
    // End column headers are in row 4 (merged), leave blank here
    ...new Array(endHeaders.length).fill(null),
  ];
  wsData.push(row5);

  // Data rows (Excel row 6+)
  let rowNum = 1;
  for (const { storeName, articleDesc } of storeProductPairs) {
    const storeKey = storeName.toLowerCase().trim();
    const codeKey = nameToCode[storeKey] || '';
    const storeInfo = storeLookup[storeKey] || { area: '', mainChannel: '', subChannel: '' };
    // Try BA by DISPO store name, then by site code
    const ba = baMap[storeKey] || (codeKey && baMap[codeKey]) || '';
    const hasDisplay = (displaySet.has(storeKey) || (codeKey && displaySet.has(codeKey))) ? 'Y' : '';

    // Monthly sales (units) for this store/product
    const monthlyUnits: number[] = MONTH_KEYS.map(m => {
      const mk = dispoMonthKey(m.mm, year);
      return dispo.sales[mk]?.[storeName]?.[articleDesc] || 0;
    });

    // Total sale in qty = sum of monthly units
    const totalUnits = monthlyUnits.reduce((a, b) => a + b, 0);

    // Total value = units * price
    const prices = dispo.prices[articleDesc];
    const totalValue = calcSalesValue(totalUnits, prices);

    // Monthly values (Rand) per month
    const monthlyValues: number[] = MONTH_KEYS.map(m => {
      const mk = dispoMonthKey(m.mm, year);
      const units = dispo.sales[mk]?.[storeName]?.[articleDesc] || 0;
      return calcSalesValue(units, prices);
    });

    // Weekly data from raw DISPO upload diffs
    const storeWeekly = weeklyLookup[storeName]?.[articleDesc] || {};
    const weeklyData: (number | string)[] = weekNums.map(w => storeWeekly[w] || '');

    // SOH
    const soh = dispo.stock[storeName]?.[articleDesc]?.soh ?? '';

    // RRP (Accurate price) — use inclSP if available
    const rrp = prices?.inclSP || '';

    const row: (string | number | null)[] = [
      rowNum,
      storeInfo.mainChannel,
      storeInfo.subChannel,
      storeInfo.area,
      storeName,
      ba,
      productLookup.get(articleDesc.toLowerCase().trim())?.industry || '',
      articleDesc,
      hasDisplay,
      '', // end position — blank
      totalUnits || '',
      totalValue || '',
      ...monthlyValues.map(v => v || ''),
      ...weeklyData,
      null, // spacer
      '', // flooring — blank
      rrp, // accurate price
      '', // product POSM — blank
      '', // marketing POSM — blank
      soh,
    ];

    wsData.push(row);
    rowNum++;
  }

  /* ── Build workbook ── */

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  const colWidths: XLSX.ColInfo[] = [];
  colWidths[0] = { wch: 5 };   // NO
  colWidths[1] = { wch: 14 };  // channel
  colWidths[2] = { wch: 14 };  // sub-channel
  colWidths[3] = { wch: 12 };  // area
  colWidths[4] = { wch: 28 };  // Store
  colWidths[5] = { wch: 14 };  // BA
  colWidths[6] = { wch: 10 };  // industry
  colWidths[7] = { wch: 28 };  // model
  colWidths[8] = { wch: 8 };   // Display
  colWidths[9] = { wch: 10 };  // End position
  colWidths[10] = { wch: 11 }; // sale in qty
  colWidths[11] = { wch: 14 }; // total
  // Monthly columns
  for (let i = monthStart; i <= monthEnd; i++) colWidths[i] = { wch: 12 };
  // Weekly columns
  for (let i = weekStart; i <= weekEnd; i++) colWidths[i] = { wch: 8 };
  // Spacer
  colWidths[spacerIdx] = { wch: 2 };
  // End columns
  for (let i = endStart; i < endStart + 5; i++) colWidths[i] = { wch: 14 };

  ws['!cols'] = colWidths;

  // Merged cells
  const merges: XLSX.Range[] = [];

  // Row 3 (idx 2): "销售数据" spans from col K (sale in qty, 10) through last weekly col
  if (weekEnd >= 10) {
    merges.push({ s: { r: 2, c: 10 }, e: { r: 2, c: weekEnd } });
  } else if (monthEnd >= 10) {
    merges.push({ s: { r: 2, c: 10 }, e: { r: 2, c: monthEnd } });
  }

  // Row 3: "门店展示display" spans endStart to endStart+3
  if (endStart + 3 < totalCols) {
    merges.push({ s: { r: 2, c: endStart }, e: { r: 2, c: endStart + 3 } });
  }

  // Row 4 (idx 3): "monthly" spans month columns
  if (monthHeaders.length > 1) {
    merges.push({ s: { r: 3, c: monthStart }, e: { r: 3, c: monthEnd } });
  }

  // Row 4: "weekly" spans week columns
  if (weekHeaders.length > 1) {
    merges.push({ s: { r: 3, c: weekStart }, e: { r: 3, c: weekEnd } });
  }

  // End columns: merge rows 4-5 for each (idx 3-4)
  for (let i = 0; i < 5; i++) {
    const col = endStart + i;
    if (col < totalCols) {
      merges.push({ s: { r: 3, c: col }, e: { r: 4, c: col } });
    }
  }

  ws['!merges'] = merges;

  XLSX.utils.book_append_sheet(wb, ws, 'store data');

  /* ── Sheet 2: Sales and Stock levels (pivot) ── */

  const pivotData: (string | number | null)[][] = [];
  pivotData.push(['Row Labels', `Sum of ${String(new Date().getMonth() + 1).padStart(2, '0')}-${year}`, 'Sum of SOH']);

  // Group by product, then stores under each
  const productStores: Record<string, { storeName: string; units: number; soh: number }[]> = {};
  const currentMonthKey = dispoMonthKey(String(new Date().getMonth() + 1).padStart(2, '0'), year);

  for (const { storeName, articleDesc } of storeProductPairs) {
    if (!productStores[articleDesc]) productStores[articleDesc] = [];
    const units = dispo.sales[currentMonthKey]?.[storeName]?.[articleDesc] || 0;
    const soh = dispo.stock[storeName]?.[articleDesc]?.soh || 0;
    productStores[articleDesc].push({ storeName, units, soh });
  }

  let grandUnits = 0;
  let grandSoh = 0;

  for (const product of Object.keys(productStores).sort()) {
    const storeRows = productStores[product];
    const prodUnits = storeRows.reduce((s, r) => s + r.units, 0);
    const prodSoh = storeRows.reduce((s, r) => s + r.soh, 0);
    grandUnits += prodUnits;
    grandSoh += prodSoh;

    // Product header row
    pivotData.push([product, prodUnits, prodSoh]);

    // Store rows
    for (const sr of storeRows.sort((a, b) => a.storeName.localeCompare(b.storeName))) {
      pivotData.push([`  ${sr.storeName}`, sr.units, sr.soh]);
    }
  }

  pivotData.push(['Grand Total', grandUnits, grandSoh]);

  const ws2 = XLSX.utils.aoa_to_sheet(pivotData);
  ws2['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Sales and Stock levels');

  /* ── Generate buffer ── */

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const fileName = `HSA-BA_WORK_${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
