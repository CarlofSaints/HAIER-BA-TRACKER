import type { Rolling7Sheet, Rolling7ColKind } from './rolling7View';

/*
  Styled workbook for the Sales: Last 7 Days report, used by both the daily
  email (server) and the page's Export button (browser), so they match.
  ExcelJS rather than the SheetJS build used elsewhere: that build drops fills,
  fonts, alignment and frozen panes when it writes.
*/

const HEADER_FILL = 'FF1F2A44'; // dark navy
const HEADER_FONT = 'FFFFFFFF';
const TOTAL_FILL = 'FFE5E7EB';

const NUM_FMT: Record<Rolling7ColKind, string | undefined> = {
  text: undefined,
  int: '#,##0',
  rand: '"R "#,##0.00',
  pct: '0.0%',
};

/** Rough on-screen width of a value once formatted, in characters. */
function displayLength(v: string | number, kind: Rolling7ColKind): number {
  if (typeof v === 'string') return v.length;
  if (kind === 'rand') return v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length + 2;
  if (kind === 'pct') return (v * 100).toFixed(1).length + 1;
  return Math.round(v).toLocaleString('en-ZA').length;
}

export async function buildRolling7Workbook(sheets: Rolling7Sheet[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(sheet.columns.map(c => c.header));
    for (const r of sheet.rows) ws.addRow(r);
    const totalRow = ws.addRow(sheet.total);

    // Header: dark fill, light bold font, wrapped.
    const header = ws.getRow(1);
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.font = { bold: true, color: { argb: HEADER_FONT } };
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    });
    header.height = 32;

    totalRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
    });

    sheet.columns.forEach((col, i) => {
      const column = ws.getColumn(i + 1);
      const fmt = NUM_FMT[col.kind];
      if (fmt) column.numFmt = fmt;
      if (col.kind === 'int' || col.kind === 'pct') column.alignment = { horizontal: 'center' };
      if (col.kind === 'rand') column.alignment = { horizontal: 'right' };

      // Fit to contents. The header wraps, so it only needs its longest word.
      let width = Math.max(...col.header.split(/\s+/).map(w => w.length));
      for (const r of [...sheet.rows, sheet.total]) width = Math.max(width, displayLength(r[i] ?? '', col.kind));
      column.width = Math.min(Math.max(width + 2, 8), 60);
    });
    // Column-level alignment doesn't reach the header cells already styled above.
    header.eachCell(cell => {
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    });
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
