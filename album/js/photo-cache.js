// 한 번 받은 사진은 휴대폰 안(IndexedDB)에 보관해서 다음부터는 바로, 인터넷 없이도 보여줍니다.

import { openDB } from './idb.js';

let dbp = null;
const db = () => (dbp ||= openDB('ssukssuk-photo-cache', 1, (d) => d.createObjectStore('blobs')));

const urls = new Map();      // key → objectURL (화면에 쓰는 주소)
const pending = new Map();   // key → Promise (같은 사진 중복 다운로드 방지)

// 동시에 너무 많이 받지 않도록 (느린 휴대폰 배려)
let active = 0;
const queue = [];
function limit(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      active++;
      try { resolve(await fn()); } catch (e) { reject(e); }
      active--;
      if (queue.length) queue.shift()();
    };
    active < 4 ? run() : queue.push(run);
  });
}

export async function cachedURL(key, fetchBlob) {
  if (urls.has(key)) return urls.get(key);
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    let blob = null;
    try { blob = await (await db()).get('blobs', key); } catch { /* 저장소 사용 불가 */ }
    if (!blob) {
      blob = await limit(fetchBlob);
      try { await (await db()).put('blobs', blob, key); } catch { /* 공간 부족 등 */ }
    }
    const url = URL.createObjectURL(blob);
    urls.set(key, url);
    return url;
  })();
  pending.set(key, p);
  try { return await p; } finally { pending.delete(key); }
}

export async function cachedBlob(key, fetchBlob) {
  try {
    const b = await (await db()).get('blobs', key);
    if (b) return b;
  } catch { /* 무시 */ }
  const blob = await limit(fetchBlob);
  try { await (await db()).put('blobs', blob, key); } catch { /* 무시 */ }
  return blob;
}

export async function remember(key, blob) {
  try { await (await db()).put('blobs', blob, key); } catch { /* 무시 */ }
}

export async function forget(key) {
  const u = urls.get(key);
  if (u) URL.revokeObjectURL(u);
  urls.delete(key);
  try { await (await db()).del('blobs', key); } catch { /* 무시 */ }
}

export async function clearCache() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  try { await (await db()).clear('blobs'); } catch { /* 무시 */ }
}

export async function cacheCount() {
  try { return await (await db()).count('blobs'); } catch { return 0; }
}
