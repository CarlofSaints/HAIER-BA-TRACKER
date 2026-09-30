import { get, put, del, BlobNotFoundError } from '@vercel/blob';

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

/*
  readJson for read-modify-write paths. readJson turns ANY failure into the
  fallback, which is right for display but destructive before a write: a
  transient Blob error reads as "empty" and the write then wipes the real file.
  This returns the fallback only when the blob genuinely doesn't exist and
  throws on everything else, so the caller aborts instead of overwriting.
*/
export async function readJsonStrict<T>(key: string, fallback: T): Promise<T> {
  let result;
  try {
    result = await get(key, { access: 'private', useCache: false });
  } catch (err) {
    if (err instanceof BlobNotFoundError) return fallback;
    throw err;
  }
  if (!result) return fallback;
  if (result.statusCode !== 200) throw new Error(`Blob read ${key}: status ${result.statusCode}`);
  return JSON.parse(await new Response(result.stream).text()) as T;
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
