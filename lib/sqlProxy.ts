/* ──────────────────────────────────────────────────────────────
   SQL Proxy Client — calls the Railway-hosted aria-sql-proxy.

   Haier never connects to SQL directly. It calls the shared Railway
   proxy over HTTPS; the proxy holds the DB credentials and the static,
   firewall-whitelisted IP. SAMS data lives on the "penny" server
   (129.232.128.2 = the proxy's pool2).

   Env:
     SQL_PROXY_URL     — the proxy's base URL (no trailing slash, no /query)
     SQL_PROXY_API_KEY — shared secret sent as the x-api-key header
   Both are the SAME values the ARIA Score Card Portal uses.
   ────────────────────────────────────────────────────────────── */

/**
 * Normalize the configured proxy base URL: tolerate a bare domain (add https://)
 * and strip any trailing slash, so `${PROXY_URL}/query` is always a valid
 * absolute URL regardless of how the env var was entered.
 */
function normalizeBase(raw: string): string {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

const PROXY_URL = normalizeBase(process.env.SQL_PROXY_URL || '');
const PROXY_KEY = (process.env.SQL_PROXY_API_KEY || '').trim();

export const HAIER_CLIENT = 'HAIER ELECTRONICS';

export interface ProxyResponse<T = Record<string, unknown>> {
  data: T[];
  count: number;
}

/** True when the proxy env vars are present (so the UI can show a helpful hint). */
export function isSqlProxyConfigured(): boolean {
  return Boolean(PROXY_URL && PROXY_KEY);
}

/**
 * Run a named query on the proxy (POST /query). The proxy does NOT accept raw
 * SQL — `query` must be a name registered in aria-sql-proxy's registry.
 */
export async function sqlQuery<T = Record<string, unknown>>(
  query: string,
  params: Record<string, unknown> = {},
): Promise<ProxyResponse<T>> {
  if (!PROXY_URL || !PROXY_KEY) {
    throw new Error('SQL_PROXY_URL or SQL_PROXY_API_KEY not configured');
  }

  const res = await fetch(`${PROXY_URL}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': PROXY_KEY,
    },
    body: JSON.stringify({ query, params }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SQL proxy error (${res.status}): ${body}`);
  }

  return res.json() as Promise<ProxyResponse<T>>;
}

// ── SAMS fact rows ───────────────────────────────────────────────────────────
// GetDataForPowerBI_SAMS returns one row per site × article × date. This is the
// lowest grain — every Haier measure (units by month/week/quarter/YTD, value,
// SOH) is derived from it. Columns confirmed from a live run:
//   SITE_ID     e.g. "GAME-G016"          (channel-prefixed store code)
//   ARTICLE_ID  e.g. "GAME-850044569-EA"  (channel-prefixed article code)
//   DATE        e.g. "2026-05-24"
//   VALUE       Rand sales value for that day
//   UNITS       units sold that day
//   SOH         stock on hand snapshot
export interface SamsFactRow {
  SITE_ID: string;
  ARTICLE_ID: string;
  DATE: string;
  VALUE: number;
  UNITS: number;
  SOH: number;
}

/** Pull the full SAMS fact set for a client (default HAIER ELECTRONICS). */
export function getSamsData(client: string = HAIER_CLIENT) {
  return sqlQuery<SamsFactRow>('haier_sams', { client });
}

/** Diagnostic: SAMS SP output columns without running the heavy pull. */
export function getSamsColumns(client: string = HAIER_CLIENT) {
  return sqlQuery<{
    column_ordinal: number;
    name: string;
    system_type_name: string;
    is_nullable: boolean;
  }>('haier_sams_columns', { client });
}

// ── Dimensions (code → friendly name) ────────────────────────────────────────
// These SPs already exist in the proxy registry (used by ARIA). Row shapes are
// loosely typed until we probe HAIER's actual columns, then we'll tighten them.
export function getClientStores(client: string = HAIER_CLIENT) {
  return sqlQuery<Record<string, unknown>>('client_stores', { client });
}

export function getClientProducts(client: string = HAIER_CLIENT) {
  return sqlQuery<Record<string, unknown>>('client_products', { client });
}
