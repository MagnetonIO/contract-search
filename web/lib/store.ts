import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export class ConflictError extends Error {}
export const localDir = () => process.env.DASHBOARD_LOCAL_DIR || path.join(process.cwd(), '.local');
const locks = new Map<string, Promise<unknown>>();
const blobMode = () => Boolean(process.env.VERCEL) || process.env.DASHBOARD_STORAGE === 'blob';
const safeKey = (key: string) => {
  if (!/^[a-zA-Z0-9/_-]+\.[a-z0-9]+$/.test(key) || key.includes('..')) throw new Error('Invalid storage key');
  return key;
};

export async function readBytes(key: string): Promise<{ value: Buffer; version: string } | null> {
  safeKey(key);
  if (blobMode()) {
    // Compression changes the response ETag to a weak tag, which Blob rejects
    // for ifMatch writes. Read the identity representation to retain its version.
    const result = await get(key, { access: 'private', useCache: false, headers: { 'accept-encoding': 'identity' } });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) throw new Error('Storage read unavailable');
    return { value: Buffer.from(await new Response(result.stream).arrayBuffer()), version: result.blob.etag };
  }
  try {
    // Local state is read at runtime only; hosted deployments use the private Blob store.
    const value = await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ localDir(), key));
    return { value, version: createHash('sha256').update(value).digest('hex') };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeBytes(key: string, value: Buffer | string, contentType: string, expected?: string | null) {
  safeKey(key);
  if (blobMode()) {
    try {
      const result = await put(key, value, { access: 'private', addRandomSuffix: false,
        allowOverwrite: expected !== null, ifMatch: expected || undefined, cacheControlMaxAge: 60, contentType });
      return result.etag;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || (error as Error).name === 'BlobPathnameConflictError') throw new ConflictError('Another session updated this item. Refresh and try again.');
      throw error;
    }
  }
  const previous = locks.get(key) || Promise.resolve();
  const task = previous.catch(() => undefined).then(async () => {
    if (expected !== undefined && (await readBytes(key))?.version !== (expected ?? undefined)) throw new ConflictError('Another session updated this item. Refresh and try again.');
    const file = path.join(/* turbopackIgnore: true */ localDir(), key);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, value, { mode: 0o600 });
    await rename(temporary, file);
    return createHash('sha256').update(value).digest('hex');
  });
  locks.set(key, task);
  try { return await task; } finally { if (locks.get(key) === task) locks.delete(key); }
}

export async function readJson<T>(key: string, fallback: T) {
  const result = await readBytes(key);
  return { value: result ? JSON.parse(result.value.toString('utf8')) as T : fallback, version: result?.version || null };
}
export async function writeJson(key: string, value: unknown, expected?: string | null) {
  return writeBytes(key, JSON.stringify(value), 'application/json', expected);
}
