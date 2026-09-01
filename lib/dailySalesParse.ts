import type { DailySalesRecord, DailySalesLine } from './dailySalesData';

/*
  Parser for the Perigee "Daily Sales" form export.

  Deliberately NOT positional. The export carries the product question group
  repeated across columns ("Product sold", "QTY sold:", "Unit price:", then the
  same three again for a second product, and so on), and how many repeats appear
  depends on the busiest submission in the file — so a file with one product per
  submission has 3 product columns and a busier one has 9 or 12. Fixed column
  indices would silently drop every product after the first.

  So: find the header row, then walk the headers left to right pairing each
  "Product sold" with the "QTY" and "Unit price" that follow it before the next
  "Product sold". Everything else is matched by name, not position.
*/

export interface ParseIssue {
  row: number;      // 1-based row number in the sheet
  reason: string;
}

export interface ParseResult {
  records: DailySalesRecord[];
  /** Column headers as found in the sheet. */
  headers: string[];
  /** How many product triplets the header row carried. */
  productSets: number;
  /** Rows read past the header. */
  dataRows: number;
  /** Product sets that produced a line. */
  lineCount: number;
  /** Rows that produced no record, with why. Capped so a bad file can't blow up. */
  issues: ParseIssue[];
  headerRowIndex: number;
}

/** Lowercase, strip a trailing colon and collapse whitespace (incl. nbsp). */
export function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/ /g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[:：]+$/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const PRODUCT_HEADERS = new Set(['product sold', 'product', 'products sold']);
const QTY_HEADERS = new Set(['qty sold', 'quantity sold', 'qty', 'quantity', 'qty sold?']);
const PRICE_HEADERS = new Set(['unit price', 'unitprice', 'price', 'unit price r', 'selling price']);

/** Field aliases for the non-repeating columns. */
const FIELD_ALIASES: Record<string, string> = {
  'id': 'submissionId',
  'submission id': 'submissionId',
  'email': 'email',
  'representative id': 'email',
  'rep email': 'email',
  'first name': 'firstName',
  'firstname': 'firstName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'surname': 'lastName',
  'rep name': 'repName',
  'representative name': 'repName',
  'date': 'date',
  'time': 'time',
  'visit uuid': 'visitUUID',
  'visit id': 'visitUUID',
  'channel': 'channel',
  'store': 'store',
  'store name': 'store',
  'place': 'store',
  'store code': 'storeCode',
  'place id': 'storeCode',
  'province': 'province',
};

/**
 * Tolerant number parse. Handles plain numbers, "R 10 433,91", "10,433.91",
 * "1 234" and blank. Returns null when there is no number to read.
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/ /g, ' ').trim();
  if (!s) return null;
  s = s.replace(/^[Rr]\s*/, '').replace(/[\s']/g, '');
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal point.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Comma only: a lone group of exactly 3 digits after it is a thousands
    // separator ("1,234"); anything else is a decimal comma ("10,5").
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) s = `${parts[0]}.${parts[1]}`;
    else s = s.replace(/,/g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Excel serial date → YYYY-MM-DD (1900 epoch, with the Lotus leap-year quirk). */
function serialToDate(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Normalise a submission date to YYYY-MM-DD. The export writes DD/MM/YYYY
 * (South African locale — "31/08/2026"), which is what this assumes; a value
 * whose first part is > 12 confirms it, and a month > 12 is rejected rather
 * than silently swapped.
 */
export function normDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 60000) return serialToDate(v);

  const s = String(v ?? '').trim();
  if (!s) return '';

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${dmy[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 60000) return serialToDate(asNum);

  return '';
}

/** "17:03", a Date, or an Excel time fraction → "HH:MM". */
function normTime(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}

function cell(row: unknown[], idx: number | undefined): unknown {
  if (idx === undefined || idx < 0) return null;
  return row[idx] ?? null;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/ /g, ' ').trim();
}

/** Locate the header row: the first row naming both a date and a product column. */
function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const norm = (rows[i] || []).map(normHeader);
    const hasProduct = norm.some(h => PRODUCT_HEADERS.has(h));
    const hasWho = norm.some(h => h === 'email' || h === 'id');
    const hasDate = norm.some(h => h === 'date');
    if (hasProduct && hasDate && hasWho) return i;
  }
  // Fall back to the first row that names a product column at all.
  for (let i = 0; i < limit; i++) {
    if ((rows[i] || []).map(normHeader).some(h => PRODUCT_HEADERS.has(h))) return i;
  }
  return -1;
}

/**
 * Pair each "Product sold" column with the QTY and Unit price that follow it,
 * stopping at the next "Product sold" so a missing price can't steal the next
 * set's column.
 */
export function findProductSets(header: unknown[]): { product: number; qty: number; price: number }[] {
  const norm = header.map(normHeader);
  const productCols: number[] = [];
  for (let c = 0; c < norm.length; c++) {
    if (PRODUCT_HEADERS.has(norm[c])) productCols.push(c);
  }

  const sets: { product: number; qty: number; price: number }[] = [];
  for (let i = 0; i < productCols.length; i++) {
    const start = productCols[i];
    const end = i + 1 < productCols.length ? productCols[i + 1] : norm.length;
    let qty = -1;
    let price = -1;
    for (let c = start + 1; c < end; c++) {
      if (qty < 0 && QTY_HEADERS.has(norm[c])) qty = c;
      else if (price < 0 && PRICE_HEADERS.has(norm[c])) price = c;
    }
    sets.push({ product: start, qty, price });
  }
  return sets;
}

const MAX_ISSUES = 50;

/**
 * Parse the sheet (as an array of raw rows) into Daily Sales records.
 */
export function parseDailySales(rows: unknown[][]): ParseResult {
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) {
    return {
      records: [], headers: [], productSets: 0, dataRows: 0, lineCount: 0,
      issues: [{ row: 0, reason: 'No header row found naming a "Product sold" column' }],
      headerRowIndex: -1,
    };
  }

  const header = rows[headerRowIndex] || [];
  const headers = header.map(h => str(h));
  const norm = header.map(normHeader);

  // Non-repeating fields, by name.
  const fieldCol: Record<string, number> = {};
  for (let c = 0; c < norm.length; c++) {
    const field = FIELD_ALIASES[norm[c]];
    if (field && fieldCol[field] === undefined) fieldCol[field] = c;
  }

  const sets = findProductSets(header);

  const records: DailySalesRecord[] = [];
  const issues: ParseIssue[] = [];
  let dataRows = 0;
  let lineCount = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;
    dataRows++;

    const email = str(cell(row, fieldCol.email)).toLowerCase();
    const firstName = str(cell(row, fieldCol.firstName));
    const lastName = str(cell(row, fieldCol.lastName));
    const repName = str(cell(row, fieldCol.repName)) || [firstName, lastName].filter(Boolean).join(' ');
    const date = normDate(cell(row, fieldCol.date));

    if (!email && !repName) {
      if (issues.length < MAX_ISSUES) issues.push({ row: r + 1, reason: 'No email or rep name' });
      continue;
    }
    if (!date) {
      if (issues.length < MAX_ISSUES) {
        issues.push({ row: r + 1, reason: `Unreadable date ${JSON.stringify(str(cell(row, fieldCol.date)))}` });
      }
      continue;
    }

    const lines: DailySalesLine[] = [];
    for (const set of sets) {
      const product = str(cell(row, set.product));
      if (!product) continue;
      const qty = toNumber(cell(row, set.qty));
      const unitPrice = toNumber(cell(row, set.price));
      if (qty === null && unitPrice === null) {
        if (issues.length < MAX_ISSUES) {
          issues.push({ row: r + 1, reason: `Product "${product.slice(0, 40)}" has no qty or unit price` });
        }
        continue;
      }
      const q = qty ?? 0;
      const p = unitPrice ?? 0;
      lines.push({ product, qty: q, unitPrice: p, value: q * p });
    }

    lineCount += lines.length;

    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    const totalValue = lines.reduce((s, l) => s + l.value, 0);

    records.push({
      submissionId: str(cell(row, fieldCol.submissionId)),
      email,
      repName,
      date,
      time: normTime(cell(row, fieldCol.time)),
      visitUUID: str(cell(row, fieldCol.visitUUID)),
      channel: str(cell(row, fieldCol.channel)),
      store: str(cell(row, fieldCol.store)),
      storeCode: str(cell(row, fieldCol.storeCode)),
      province: str(cell(row, fieldCol.province)),
      lines,
      totalQty,
      totalValue,
    });
  }

  return {
    records,
    headers,
    productSets: sets.length,
    dataRows,
    lineCount,
    issues,
    headerRowIndex,
  };
}
