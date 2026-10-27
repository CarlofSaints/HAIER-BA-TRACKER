import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { readJson, writeJson } from '@/lib/blob';
import { isAllowedPerigeeEndpoint } from '@/lib/perigeeFetch';

export const dynamic = 'force-dynamic';

interface PerigeeConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  lastPolledAt: string | null;
  requestBody: string; // Full JSON body template for Perigee API
}

const BLOB_KEY = 'config/perigee-api.json';
const DEFAULT: PerigeeConfig = { apiKey: '', endpoint: '', enabled: false, lastPolledAt: null, requestBody: '' };

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

    // The stored token is sent as a Bearer header to this endpoint, so: Field Goose only, and
    // moving it elsewhere needs the token typed again (it can never follow to a new host on its own).
    if (typeof body.endpoint === 'string' && body.endpoint.trim() && !isAllowedPerigeeEndpoint(body.endpoint.trim())) {
      return NextResponse.json({ error: 'The endpoint must be an https www.fieldgoose.com address.' }, { status: 400 });
    }
    const endpointChanged = body.endpoint !== undefined && body.endpoint !== current.endpoint;
    if (endpointChanged && current.apiKey && !body.apiKey) {
      return NextResponse.json({ error: 'You changed the endpoint, so enter the Bearer token again too.' }, { status: 400 });
    }

    const updated: PerigeeConfig = {
      apiKey: body.apiKey !== undefined ? body.apiKey : current.apiKey,
      endpoint: body.endpoint !== undefined ? body.endpoint : current.endpoint,
      enabled: body.enabled !== undefined ? body.enabled : current.enabled,
      lastPolledAt: current.lastPolledAt,
      requestBody: body.requestBody !== undefined ? body.requestBody : (current.requestBody || ''),
    };

    await writeJson(BLOB_KEY, updated);
    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Perigee config error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
