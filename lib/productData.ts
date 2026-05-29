import { readJson, writeJson } from './blob';

export interface ProductMaster {
  articleDesc: string;
  productCode: string;
  category: string;
  industry: string;
  status: string;
}

const BLOB_KEY = 'admin/products.json';

export async function loadProducts(): Promise<ProductMaster[]> {
  return readJson<ProductMaster[]>(BLOB_KEY, []);
}

export async function saveProducts(products: ProductMaster[]): Promise<void> {
  await writeJson(BLOB_KEY, products);
}
