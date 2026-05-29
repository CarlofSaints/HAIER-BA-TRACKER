import { NextRequest, NextResponse } from 'next/server';
import { requireRole, noCacheHeaders } from '@/lib/auth';
import { loadProducts, saveProducts, ProductMaster } from '@/lib/productData';
import { loadDispoData } from '@/lib/dispoData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const products = await loadProducts();
  return NextResponse.json(products, { headers: noCacheHeaders() });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { products } = await req.json() as { products: ProductMaster[] };
  if (!Array.isArray(products)) {
    return NextResponse.json({ error: 'products array required' }, { status: 400 });
  }

  await saveProducts(products);
  return NextResponse.json({ ok: true, count: products.length }, { headers: noCacheHeaders() });
}

/** Sync from DISPO — merge new articleDesc values into the products list */
export async function POST(req: NextRequest) {
  const user = await requireRole(req, ['super_admin', 'admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [existing, dispo] = await Promise.all([loadProducts(), loadDispoData()]);

  // Build set of existing articleDesc keys (case-insensitive for matching)
  const existingKeys = new Set(existing.map(p => p.articleDesc.toLowerCase().trim()));

  // Collect all unique articleDesc values from DISPO data
  const allDescs = new Set<string>();

  // From sales
  for (const month of Object.values(dispo.sales)) {
    for (const storeProducts of Object.values(month)) {
      for (const desc of Object.keys(storeProducts)) {
        allDescs.add(desc);
      }
    }
  }

  // From stock
  for (const storeProducts of Object.values(dispo.stock)) {
    for (const desc of Object.keys(storeProducts)) {
      allDescs.add(desc);
    }
  }

  // From prices
  for (const desc of Object.keys(dispo.prices)) {
    allDescs.add(desc);
  }

  // Add new products that don't already exist
  let added = 0;
  const merged = [...existing];
  for (const desc of allDescs) {
    if (!existingKeys.has(desc.toLowerCase().trim())) {
      merged.push({ articleDesc: desc, productCode: '', category: '', industry: '', status: '' });
      added++;
    }
  }

  // Sort alphabetically by articleDesc
  merged.sort((a, b) => a.articleDesc.localeCompare(b.articleDesc));

  await saveProducts(merged);
  return NextResponse.json({ ok: true, total: merged.length, added }, { headers: noCacheHeaders() });
}
