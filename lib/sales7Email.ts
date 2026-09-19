import { readJson, writeJson } from './blob';
import { sendEmail } from './email';
import { logActivity } from './activityLog';
import { buildRolling7Report, loadRollingDaily, Rolling7Report } from './rollingSales';
import { aggregateRolling7, rolling7SheetAoa, dayLabel, ROLLING7_MODES } from './rolling7View';

/*
  DAILY "SALES: LAST 7 DAYS" EMAIL.

  Sent when the data moves on, not on a clock. SAMS lands a new day at no fixed
  time (it runs about two days behind), so a clock-based send would either go
  out with yesterday's numbers again or skip a day. Instead the hourly SAMS cron
  asks: is the latest day in the daily data newer than the last day we emailed?
  If yes, send and remember that day. If no, do nothing. So each day of data is
  emailed exactly once, whenever it arrives.

  Config + send state live in config/sales-7-days-email.json, edited on the
  Sync Schedule page.
*/

export interface Sales7EmailConfig {
  enabled: boolean;
  to: string[];
  cc: string[];
  /** Latest data day ("YYYY-MM-DD") already emailed to the recipients. */
  lastSentDataDate: string;
  lastSentAt: string;
  lastSentTo: string[];
  lastError: string;
  lastErrorAt: string;
}

const KEY = 'config/sales-7-days-email.json';

export const DEFAULT_SALES7_EMAIL: Sales7EmailConfig = {
  enabled: false,
  to: ['bradley.young@haier.com'],
  cc: [],
  lastSentDataDate: '',
  lastSentAt: '',
  lastSentTo: [],
  lastError: '',
  lastErrorAt: '',
};

const APP_URL = 'https://haier-ba-measurement.vercel.app';

export async function loadSales7EmailConfig(): Promise<Sales7EmailConfig> {
  const c = await readJson<Partial<Sales7EmailConfig>>(KEY, {});
  return { ...DEFAULT_SALES7_EMAIL, ...c };
}

export async function saveSales7EmailConfig(c: Sales7EmailConfig): Promise<void> {
  await writeJson(KEY, c);
}

export const isEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);

/** "a@x.com, b@y.com; c@z.com" or an array → clean, de-duplicated list. */
export function parseEmailList(v: unknown): string[] {
  const parts = Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[,;\s]+/);
  return [...new Set(parts.map(s => s.trim().toLowerCase()).filter(Boolean))];
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rand = (n: number) =>
  'R ' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function workbook(report: Rolling7Report): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  for (const { mode, label } of ROLLING7_MODES) {
    const view = aggregateRolling7(report.rows, mode, report.days.length).sort((a, b) => b.value - a.value);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rolling7SheetAoa(view, mode, report.days)), label);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function emailBody(report: Rolling7Report): { subject: string; html: string } {
  const first = report.days[0];
  const last = report.days[report.days.length - 1];
  const year = last.slice(0, 4);
  const units = report.rows.reduce((s, r) => s + r.units, 0);
  const value = report.rows.reduce((s, r) => s + r.value, 0);
  const stores = new Set(report.rows.filter(r => r.units > 0).map(r => r.store)).size;

  const byChannel = new Map<string, { units: number; value: number }>();
  for (const r of report.rows) {
    const c = byChannel.get(r.channel || 'Unassigned') || { units: 0, value: 0 };
    c.units += r.units;
    c.value += r.value;
    byChannel.set(r.channel || 'Unassigned', c);
  }
  const channelRows = [...byChannel.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, c]) =>
      `<tr><td style="padding:4px 12px 4px 0">${esc(name)}</td><td style="padding:4px 12px;text-align:right">${c.units.toLocaleString('en-ZA')}</td><td style="padding:4px 0 4px 12px;text-align:right">${rand(c.value)}</td></tr>`)
    .join('');

  const subject = `Haier daily sales: 7 days to ${dayLabel(last)} ${year}`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;max-width:620px">
  <p>Attached is the Haier daily sales report for the 7 days from <b>${dayLabel(first)}</b> to <b>${dayLabel(last)} ${year}</b>.</p>
  <table style="border-collapse:collapse;margin:12px 0">
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Units sold</td><td style="padding:4px 0"><b>${units.toLocaleString('en-ZA')}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Value (ex VAT)</td><td style="padding:4px 0"><b>${rand(value)}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Stores with sales</td><td style="padding:4px 0"><b>${stores}</b></td></tr>
  </table>
  <table style="border-collapse:collapse;margin:12px 0;font-size:13px">
    <tr style="color:#6b7280"><th style="text-align:left;padding:4px 12px 4px 0">Channel</th><th style="text-align:right;padding:4px 12px">Units</th><th style="text-align:right;padding:4px 0 4px 12px">Value (ex VAT)</th></tr>
    ${channelRows}
  </table>
  <p>The workbook has three sheets: By Store, By SKU, and By SKU and Store. Store sheets include the BA for each store, and the most recent day is the first day column.</p>
  <p>It covers the channels Haier loads daily. Channels reported monthly are not included.</p>
  <p>You can also view and filter this report online: <a href="${APP_URL}/sales-7-days">Sales: Last 7 Days</a>.</p>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px">Sent automatically by Haier BA Measurement when a new day of sales data arrives.</p>
</div>`;
  return { subject, html };
}

async function deliver(report: Rolling7Report, to: string[], cc: string[]): Promise<void> {
  const { subject, html } = emailBody(report);
  const last = report.days[report.days.length - 1];
  const res = await sendEmail({
    to,
    cc: cc.length ? cc : undefined,
    subject,
    html,
    attachments: [{ filename: `Haier_Sales_Last_7_Days_to_${last}.xlsx`, content: workbook(report) }],
  });
  // Resend reports failure in the result, it does not throw.
  const err = (res as { error?: { message?: string } | null }).error;
  if (err) throw new Error(err.message || 'Resend rejected the email');
}

export type Sales7CheckResult =
  | { action: 'sent'; dataDate: string; to: string[] }
  | { action: 'skipped'; reason: string; dataDate?: string }
  | { action: 'failed'; error: string; dataDate: string };

/*
  The hourly check. Sends only when the latest data day is newer than the last
  one emailed. The day is claimed BEFORE sending so an overlapping run can't
  send it twice, and released again if the send fails so the next hour retries.
*/
export async function runSales7EmailCheck(trigger: string): Promise<Sales7CheckResult> {
  const cfg = await loadSales7EmailConfig();
  if (!cfg.enabled) return { action: 'skipped', reason: 'Email is switched off.' };
  if (cfg.to.length === 0) return { action: 'skipped', reason: 'No recipients.' };

  // Cheap look at the latest day first; the full report also scans every visit.
  const { days } = await loadRollingDaily();
  const latest = days[days.length - 1];
  if (!latest) return { action: 'skipped', reason: 'No daily SAMS data yet.' };
  if (latest <= cfg.lastSentDataDate) {
    return { action: 'skipped', reason: `Already sent for data up to ${cfg.lastSentDataDate}.`, dataDate: latest };
  }

  const report = await buildRolling7Report();

  const previous = cfg.lastSentDataDate;
  await saveSales7EmailConfig({ ...cfg, lastSentDataDate: report.days[report.days.length - 1] });
  return sendAndRecord(report, cfg, trigger, previous);
}

/** Admin "send to the recipients now": sends the current report and records it as sent. */
export async function sendSales7Now(trigger: string): Promise<Sales7CheckResult> {
  const cfg = await loadSales7EmailConfig();
  if (cfg.to.length === 0) return { action: 'skipped', reason: 'No recipients.' };
  const report = await buildRolling7Report();
  if (!report.days.length) return { action: 'skipped', reason: 'No daily SAMS data yet.' };
  const previous = cfg.lastSentDataDate;
  await saveSales7EmailConfig({ ...cfg, lastSentDataDate: report.days[report.days.length - 1] });
  return sendAndRecord(report, cfg, trigger, previous);
}

/** Admin "send a test to me": touches no send state. */
export async function sendSales7Test(to: string): Promise<Sales7CheckResult> {
  const report = await buildRolling7Report();
  const latest = report.days[report.days.length - 1];
  if (!latest) return { action: 'skipped', reason: 'No daily SAMS data yet.' };
  try {
    await deliver(report, [to], []);
    return { action: 'sent', dataDate: latest, to: [to] };
  } catch (e) {
    return { action: 'failed', error: e instanceof Error ? e.message : String(e), dataDate: latest };
  }
}

async function sendAndRecord(
  report: Rolling7Report,
  cfg: Sales7EmailConfig,
  trigger: string,
  previousDataDate: string,
): Promise<Sales7CheckResult> {
  const latest = report.days[report.days.length - 1];
  try {
    await deliver(report, cfg.to, cfg.cc);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await saveSales7EmailConfig({
      ...cfg,
      lastSentDataDate: previousDataDate,
      lastError: error,
      lastErrorAt: new Date().toISOString(),
    });
    await logActivity('email_sales_7_days', trigger, trigger, KEY,
      `Sales: Last 7 Days email FAILED for data up to ${latest}: ${error}`, { dataDate: latest }).catch(() => {});
    return { action: 'failed', error, dataDate: latest };
  }

  await saveSales7EmailConfig({
    ...cfg,
    lastSentDataDate: latest,
    lastSentAt: new Date().toISOString(),
    lastSentTo: [...cfg.to, ...cfg.cc],
    lastError: '',
    lastErrorAt: '',
  });
  await logActivity('email_sales_7_days', trigger, trigger, KEY,
    `Sales: Last 7 Days emailed to ${[...cfg.to, ...cfg.cc].join(', ')} for data up to ${latest}.`,
    { dataDate: latest, to: cfg.to, cc: cfg.cc }).catch(() => {});
  return { action: 'sent', dataDate: latest, to: cfg.to };
}
