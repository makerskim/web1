'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const readline = require('readline');

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Every *.jsonl file under dir changed after `since` (ms). */
async function findJsonl(dir, since) {
  const out = [];
  async function walk(d, depth) {
    if (depth > 6) return;
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try {
          const st = await fsp.stat(p);
          if (st.mtimeMs >= since) out.push({ path: p, mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          /* file vanished */
        }
      }
    }
  }
  await walk(dir, 0);
  return out;
}

/** Calls onLine(obj) for each JSON line; bad lines are skipped. */
async function eachJsonLine(file, onLine) {
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line || line[0] !== '{') continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      onLine(obj);
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

/**
 * Re-reads a file only when its size or mtime changed.
 * parse(file) returns whatever should be cached for that file.
 */
class FileCache {
  constructor() {
    this.map = new Map();
  }
  async get(f, parse) {
    const hit = this.map.get(f.path);
    if (hit && hit.mtimeMs === f.mtimeMs && hit.size === f.size) return hit.value;
    const value = await parse(f.path);
    this.map.set(f.path, { mtimeMs: f.mtimeMs, size: f.size, value });
    return value;
  }
  prune(keep) {
    const set = new Set(keep.map((f) => f.path));
    for (const k of this.map.keys()) if (!set.has(k)) this.map.delete(k);
  }
}

function startOfToday(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Accepts ISO strings, unix seconds or unix ms. */
function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const n = Number(v);
  if (!Number.isNaN(n)) return toMs(n);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

module.exports = { readJson, exists, findJsonl, eachJsonLine, FileCache, startOfToday, toMs, clampPct };
