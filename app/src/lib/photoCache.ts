// 한 번 받은 사진은 휴대폰 안(IndexedDB)에 보관 → 다음부터 바로, 인터넷 없이도 보여요
import { KV } from './idb';

const kv = new KV('pm-photo-cache', 'blobs');
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

// 동시에 너무 많이 받지 않게
let active = 0;
const queue: Array<() => void> = [];
function limit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      active++;
      try { resolve(await fn()); } catch (e) { reject(e); }
      active--;
      queue.shift()?.();
    };
    if (active < 4) run(); else queue.push(run);
  });
}

export async function cachedURL(key: string, fetchBlob: () => Promise<Blob>) {
  const hit = urls.get(key);
  if (hit) return hit;
  const p0 = pending.get(key);
  if (p0) return p0;
  const p = (async () => {
    let blob: Blob | undefined;
    try { blob = await kv.get<Blob>(key); } catch { /* 저장소 사용 불가 */ }
    if (!blob) {
      blob = await limit(fetchBlob);
      kv.put(key, blob).catch(() => {});
    }
    const url = URL.createObjectURL(blob);
    urls.set(key, url);
    return url;
  })();
  pending.set(key, p);
  try { return await p; } finally { pending.delete(key); }
}

export async function cachedBlob(key: string, fetchBlob: () => Promise<Blob>) {
  try {
    const b = await kv.get<Blob>(key);
    if (b) return b;
  } catch { /* 무시 */ }
  const blob = await limit(fetchBlob);
  kv.put(key, blob).catch(() => {});
  return blob;
}

export const remember = (key: string, blob: Blob) => kv.put(key, blob).catch(() => {});

export async function forget(key: string) {
  const u = urls.get(key);
  if (u) URL.revokeObjectURL(u);
  urls.delete(key);
  await kv.del(key).catch(() => {});
}

export async function clearCache() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  await kv.clear().catch(() => {});
}

export const cacheCount = () => kv.count().catch(() => 0);
