import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { readJson, writeJson } from '@/lib/blob';

export const dynamic = 'force-dynamic';

interface PerigeeConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  lastPolledAt: string | null;
}

const BLOB_KEY = 'config/perigee-api.json';
const DEFAULT: PerigeeConfig = { apiKey: '', endpoint: '', enabled: false, lastPolledAt: null };

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await readJson<PerigeeConfig>(BLOB_KEY, DEFAULT);
  // Mask API key for GET
  return NextResponse.json(
    { ...config, apiKey: config.apiKey ? '••••' + config.apiKey.slice(-4) : '' },
    { headers: noCacheHeaders() }
  );
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const current = await readJson<PerigeeConfig>(BLOB_KEY, DEFAULT);

    const updated: PerigeeConfig = {
      apiKey: body.apiKey !== undefined ? body.apiKey : current.apiKey,
      endpoint: body.endpoint !== undefined ? body.endpoint : current.endpoint,
      enabled: body.enabled !== undefined ? body.enabled : current.enabled,
      lastPolledAt: current.lastPolledAt,
    };

    await writeJson(BLOB_KEY, updated);
    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Perigee config error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
