import { get, put, del } from '@vercel/blob';

export async function readJson<T>(key: string, fallback: T, opts?: { useCache?: boolean }): Promise<T> {
  try {
    // useCache defaults to false (mutable blobs must read fresh). Pass useCache:true
    // for IMMUTABLE blobs (e.g. per-upload visit files that are never rewritten) to
    // avoid re-fetching them over the network on every load.
    const result = await get(key, { access: 'private', useCache: opts?.useCache ?? false });
    if (result && result.statusCode === 200) {
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(key: string, data: T): Promise<void> {
  await put(key, JSON.stringify(data, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    await del(key);
  } catch {
    // ignore - key may not exist
  }
}
