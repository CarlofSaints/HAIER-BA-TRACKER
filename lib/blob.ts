import { put, del, list, getDownloadUrl } from '@vercel/blob';

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find(b => b.pathname === key);
    if (!match) return fallback;

    const url = getDownloadUrl(match.url);
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const text = await res.text();
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(key: string, data: T): Promise<void> {
  await put(key, JSON.stringify(data, null, 2), {
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find(b => b.pathname === key);
    if (match) {
      await del(match.url);
    }
  } catch {
    // ignore — key may not exist
  }
}
