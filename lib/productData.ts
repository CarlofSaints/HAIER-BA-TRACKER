import { readJson, writeJson } from './blob';

export interface ProductMaster {
  articleDesc: string;
  productCode: string;
  category: string;
  industry: string;
  status: string;
  // Diamond Corner item code (from the Diamond Corner sales PDF). Lets the PDF
  // OCR upload map a Diamond Corner code back to this product's articleDesc so
  // its sales merge into the DISPO model under the same product key.
  diamondCode?: string;
}

const BLOB_KEY = 'admin/products.json';

export async function loadProducts(): Promise<ProductMaster[]> {
  return readJson<ProductMaster[]>(BLOB_KEY, []);
}

export async function saveProducts(products: ProductMaster[]): Promise<void> {
  await writeJson(BLOB_KEY, products);
}
