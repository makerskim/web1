'use strict';
// Claude Code: limit percentages come from the same address Claude Code's own
// usage screen reads; token counts come from the logs Claude Code keeps on disk.
const path = require('path');
const { readJson, exists, findJsonl, eachJsonLine, FileCache, startOfToday, toMs, clampPct } = require('./util');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const HOUR = 3600;

const WINDOWS = [
  { key: 'five_hour', label: '5시간 한도', seconds: 5 * HOUR, primary: true },
  { key: 'seven_day', label: '주간 한도', seconds: 7 * 24 * HOUR },
  { key: 'seven_day_opus', label: '주간 한도 (Opus)', seconds: 7 * 24 * HOUR, minor: true },
  { key: 'seven_day_sonnet', label: '주간 한도 (Sonnet)', seconds: 7 * 24 * HOUR, minor: true },
];

const PLAN_NAMES = { max: 'Max', pro: 'Pro', team: 'Team', enterprise: 'Enterprise', free: 'Free' };

function claudeDirs(env, home) {
  if (env.CLAUDE_CONFIG_DIR) return env.CLAUDE_CONFIG_DIR.split(path.delimiter).filter(Boolean);
  return [path.join(home, '.claude'), path.join(home, '.config', 'claude')];
}

function parseUsage(json) {
  const windows = [];
  for (const w of WINDOWS) {
    const v = json && json[w.key];
    if (!v || typeof v !== 'object') continue;
    const used = clampPct(v.utilization);
    if (used == null) continue;
    windows.push({
      key: w.key,
      label: w.label,
      usedPercent: used,
      resetsAt: toMs(v.resets_at),
      windowSeconds: w.seconds,
      primary: !!w.primary,
      minor: !!w.minor,
    });
  }
  return windows;
}

function createClaudeSource({ env = process.env, home, fetch }) {
  const cache = new FileCache();
  const seen = new Map(); // de-duplicates replies logged twice (resumed sessions)

  async function findDir() {
    for (const d of claudeDirs(env, home)) if (await exists(d)) return d;
    return null;
  }

  async function limits(dir, now) {
    const cred = await readJson(path.join(dir, '.credentials.json'));
    const oauth = cred && cred.claudeAiOauth;
    if (!oauth || !oauth.accessToken) {
      return { status: 'not_logged_in' };
    }
    const plan = PLAN_NAMES[String(oauth.subscriptionType || '').toLowerCase()] || null;
    if (oauth.expiresAt && Number(oauth.expiresAt) < now) {
      return { status: 'expired', plan };
    }
    let res;
    try {
      res = await fetch(USAGE_URL, {
        headers: {
          Authorization: `Bearer ${oauth.accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          Accept: 'application/json',
          'User-Agent': 'ai-usage-monitor',
        },
      });
    } catch {
      return { status: 'offline', plan };
    }
    if (res.status === 401 || res.status === 403) return { status: 'expired', plan };
    if (res.status === 429) return { status: 'busy', plan };
    if (!res.ok) return { status: 'error', plan, message: `응답 코드 ${res.status}` };
    const json = await res.json().catch(() => null);
    const windows = parseUsage(json);
    if (!windows.length) return { status: 'error', plan, message: '한도 정보가 비어 있어요' };
    return { status: 'ok', plan, windows };
  }

  async function stats(dir, now) {
    const today = startOfToday(now);
    const files = await findJsonl(path.join(dir, 'projects'), today);
    cache.prune(files);
    let tokens = 0;
    let replies = 0;
    for (const f of files) {
      const rows = await cache.get(f, async (p) => {
        const out = [];
        await eachJsonLine(p, (o) => {
          const u = o && o.type === 'assistant' && o.message && o.message.usage;
          if (!u) return;
          const t = toMs(o.timestamp);
          if (t == null) return;
          const id = (o.message.id || '') + ':' + (o.requestId || '');
          out.push({
            id,
            t,
            n:
              (u.input_tokens || 0) +
              (u.output_tokens || 0) +
              (u.cache_creation_input_tokens || 0) +
              (u.cache_read_input_tokens || 0),
          });
        });
        return out;
      });
      for (const r of rows) {
        if (r.t < today) continue;
        if (r.id !== ':' && seen.get(r.id) === now) continue;
        if (r.id !== ':') seen.set(r.id, now);
        tokens += r.n;
        replies += 1;
      }
    }
    if (seen.size > 50000) seen.clear();
    return { todayTokens: tokens, todayReplies: replies };
  }

  return {
    id: 'claude',
    name: 'Claude Code',
    async read(now = Date.now()) {
      const dir = await findDir();
      if (!dir) return { status: 'not_installed', windows: [] };
      const [l, s] = await Promise.all([limits(dir, now), stats(dir, now).catch(() => null)]);
      return { windows: [], ...l, source: 'live', stats: s };
    },
  };
}

module.exports = { createClaudeSource, parseUsage };
