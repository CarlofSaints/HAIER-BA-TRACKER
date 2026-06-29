import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadProducts } from '@/lib/productData';
import { DiamondRow } from '@/lib/diamondData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

/** Derive a DISPO month key ("MM-YYYY") from a YYYY-MM-DD date string. */
function monthKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = String(iso).match(/(\d{4})-(\d{1,2})/);
  if (!m) return null;
  return `${m[2].padStart(2, '0')}-${m[1]}`;
}

const EXTRACT_TOOL = {
  name: 'emit_sales_report',
  description: 'Return the structured contents of a Diamond Corner "Sales Analysis By Item in Dept" PDF.',
  input_schema: {
    type: 'object',
    properties: {
      storeName: { type: 'string', description: 'Store/branch name from the report header, e.g. "DIAMOND CORNER WOODMEAD". May be truncated in the PDF — return what is visible.' },
      dept: { type: 'string', description: 'Department, e.g. "HAIER". Empty string if absent.' },
      dateFrom: { type: 'string', description: 'Period start date as YYYY-MM-DD. Empty string if absent.' },
      dateTo: { type: 'string', description: 'Period end date as YYYY-MM-DD. Empty string if absent.' },
      rows: {
        type: 'array',
        description: 'One entry per product line item. Do NOT include the totals row.',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Item Code exactly as printed (may wrap across lines — join into one token, no spaces).' },
            description: { type: 'string', description: 'Item Description exactly as printed.' },
            qty: { type: 'number', description: 'Qty column (units sold). Integer.' },
            soh: { type: 'number', description: 'SOH column (stock on hand). May be negative.' },
            value: { type: 'number', description: 'Value column (Rand). Strip thousands separators.' },
          },
          required: ['code', 'description', 'qty', 'soh', 'value'],
        },
      },
    },
    required: ['storeName', 'rows'],
  },
} as const;

export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OCR is not configured — ANTHROPIC_API_KEY is missing on the server.' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!file.name.match(/\.pdf$/i)) {
      return NextResponse.json({ error: 'Please upload a PDF file' }, { status: 400 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

    const aiRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'emit_sales_report' },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extract every product line item from this Diamond Corner sales report into the emit_sales_report tool. Read the header for the store name, department and date range. Each line has Code, Description, Qty, SOH and Value. Item codes can wrap onto multiple lines in the PDF — reassemble them into a single code with no internal spaces. Exclude the bottom totals row. Return numbers as plain numbers (no currency symbols or thousands separators).' },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => '');
      console.error('Anthropic OCR error:', aiRes.status, detail);
      return NextResponse.json({ error: `OCR failed (${aiRes.status}). Please try again.` }, { status: 502 });
    }

    const ai = await aiRes.json();
    const toolUse = (ai.content || []).find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse?.input) {
      return NextResponse.json({ error: 'OCR returned no structured data. Please try again.' }, { status: 502 });
    }

    const extracted = toolUse.input as {
      storeName?: string; dept?: string; dateFrom?: string; dateTo?: string;
      rows?: { code: string; description: string; qty: number; soh: number; value: number }[];
    };

    const rawRows = Array.isArray(extracted.rows) ? extracted.rows : [];

    // Resolve each row's articleDesc via the product master's diamondCode mapping.
    const products = await loadProducts();
    const byDiamondCode = new Map<string, string>(); // diamondCode(norm) -> articleDesc
    for (const p of products) {
      if (p.diamondCode && p.diamondCode.trim()) {
        byDiamondCode.set(p.diamondCode.trim().toUpperCase(), p.articleDesc);
      }
    }

    const rows: DiamondRow[] = rawRows
      .map(r => {
        const code = String(r.code || '').trim();
        const description = String(r.description || '').trim();
        const qty = Number(r.qty) || 0;
        const soh = Number(r.soh) || 0;
        const value = Number(r.value) || 0;
        const mappedArticle = code ? byDiamondCode.get(code.toUpperCase()) : undefined;
        return {
          code,
          description,
          qty,
          soh,
          value,
          mapped: !!mappedArticle,
          articleDesc: mappedArticle || description,
        };
      })
      .filter(r => r.code || r.description);

    const month = monthKeyFromIso(extracted.dateTo) || monthKeyFromIso(extracted.dateFrom);

    return NextResponse.json({
      ok: true,
      storeName: extracted.storeName || '',
      dept: extracted.dept || '',
      dateFrom: extracted.dateFrom || '',
      dateTo: extracted.dateTo || '',
      month,
      rows,
      fileName: file.name,
    }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Diamond extract error:', err);
    return NextResponse.json({
      error: 'Failed to read PDF',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
