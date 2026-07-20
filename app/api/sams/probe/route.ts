import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import {
  getSamsColumns,
  getClientStores,
  getClientProducts,
  isSqlProxyConfigured,
} from '@/lib/sqlProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/*
  Read-only discovery endpoint for the SAMS migration. Returns:
    - SAMS output columns (via describe-first-result-set — does NOT run the
      heavy fact pull)
    - client_stores  columns + a few sample rows (the store dimension)
    - client_products columns + a few sample rows (the product dimension)
  Used once to confirm how SITE_ID / ARTICLE_ID map to friendly names and to
  lock the transform. Admin+ only. No writes, no auto-calc.
  TODO: delete once the SAMS transform is finalized.
*/

interface ProbeSection {
  ok: boolean;
  ms: number;
  count?: number;
  columns?: string[];
  sample?: unknown[];
  error?: string;
}

async function probe<T>(fn: () => Promise<{ data: T[] }>): Promise<ProbeSection> {
  const start = Date.now();
  try {
    const r = await fn();
    const first = r.data[0] as Record<string, unknown> | undefined;
    return {
      ok: true,
      ms: Date.now() - start,
      count: r.data.length,
      columns: first ? Object.keys(first) : [],
      sample: r.data.slice(0, 5),
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isSqlProxyConfigured()) {
    return NextResponse.json(
      { error: 'SQL proxy not configured — set SQL_PROXY_URL and SQL_PROXY_API_KEY.' },
      { status: 400, headers: noCacheHeaders() },
    );
  }

  const [samsColumns, stores, products] = await Promise.all([
    probe(() => getSamsColumns()),
    probe(() => getClientStores()),
    probe(() => getClientProducts()),
  ]);

  return NextResponse.json(
    { client: 'HAIER ELECTRONICS', samsColumns, stores, products },
    { headers: noCacheHeaders() },
  );
}
