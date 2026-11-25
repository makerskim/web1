'use strict';
// Codex (ChatGPT): limit percentages come from the address the Codex app itself
// reads; when that can't be reached, from the last limit Codex wrote to its logs.
const path = require('path');
const { readJson, exists, findJsonl, eachJsonLine, FileCache, startOfToday, toMs, clampPct } = require('./util');

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const DAY = 24 * 3600;

const PLAN_NAMES = { plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu', free: 'Free' };

function labelFor(seconds, fallback) {
  if (!seconds) return fallback;
  if (seconds <= 6 * 3600) return `${Math.round(seconds / 3600)}시간 한도`;
  if (seconds >= 6 * DAY) return '주간 한도';
  return `${Math.round(seconds / 3600)}시간 한도`;
}

function windowFrom(key, v, fallbackSeconds, at) {
  if (!v || typeof v !== 'object') return null;
  const used = clampPct(v.used_percent);
  if (used == null) return null;
  const seconds =
    Number(v.limit_window_seconds) || (Number(v.window_minutes) ? Number(v.window_minutes) * 60 : 0) || fallbackSeconds;
  let resetsAt = toMs(v.reset_at ?? v.resets_at);
  const after = v.reset_after_seconds ?? v.resets_in_seconds;
  if (resetsAt == null && after != null) resetsAt = at + Number(after) * 1000;
  return {
    key,
    label: labelFor(seconds, key === 'primary' ? '5시간 한도' : '주간 한도'),
    usedPercent: used,
    resetsAt,
    windowSeconds: seconds,
    primary: false,
  };
}

function finish(windows) {
  const list = windows.filter(Boolean);
  if (list.length) {
    // The shortest window is the one that runs out first, so it leads.
    list.sort((a, b) => a.windowSeconds - b.windowSeconds);
    list[0].primary = true;
  }
  return list;
}

function parseLive(json, now) {
  const rl = json && json.rate_limit;
  if (!rl) return [];
  return finish([windowFrom('primary', rl.primary_window, 5 * 3600, now), windowFrom('secondary', rl.secondary_window, 7 * DAY, now)]);
}

function parseLogLimits(rateLimits, at, now) {
  if (!rateLimits) return [];
  const list = finish([
    windowFrom('primary', rateLimits.primary, 5 * 3600, at),
    windowFrom('secondary', rateLimits.secondary, 7 * DAY, at),
  ]);
  // A window that has reset since the log line was written is empty again.
  for (const w of list) {
    if (w.resetsAt != null && w.resetsAt <= now) {
      w.usedPercent = 0;
      w.resetsAt = null;
    }
  }
  return list;
}

function createCodexSource({ env = process.env, home, fetch }) {
  const cache = new FileCache();
  const dir = env.CODEX_HOME || path.join(home, '.codex');

  async function live(now) {
    const auth = await readJson(path.join(dir, 'auth.json'));
    const tokens = auth && auth.tokens;
    if (!tokens || !tokens.access_token) {
      return { status: auth && auth.OPENAI_API_KEY ? 'api_key_only' : 'not_logged_in' };
    }
    const headers = {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json',
      'User-Agent': 'ai-usage-monitor',
    };
    if (tokens.account_id) headers['ChatGPT-Account-Id'] = tokens.account_id;
    let res;
    try {
      res = await fetch(USAGE_URL, { headers });
    } catch {
      return { status: 'offline' };
    }
    if (res.status === 401 || res.status === 403) return { status: 'expired' };
    if (res.status === 429) return { status: 'busy' };
    if (!res.ok) return { status: 'error', message: `응답 코드 ${res.status}` };
    const json = await res.json().catch(() => null);
    const windows = parseLive(json, now);
    if (!windows.length) return { status: 'error', message: '한도 정보가 비어 있어요' };
    const plan = PLAN_NAMES[String((json && json.plan_type) || '').toLowerCase()] || null;
    return { status: 'ok', plan, windows };
  }

  async function logs(now) {
    const today = startOfToday(now);
    // Limits: look back a week for the newest line that carried them.
    const files = await findJsonl(path.join(dir, 'sessions'), now - 8 * DAY * 1000);
    cache.prune(files);
    let latest = null;
    let tokens = 0;
    let turns = 0;
    for (const f of files) {
      const v = await cache.get(f, async (p) => {
        const out = { limits: null, rows: [] };
        await eachJsonLine(p, (o) => {
          const pl = o && o.payload;
          if (!pl || pl.type !== 'token_count') return;
          const t = toMs(o.timestamp);
          if (t == null) return;
          if (pl.rate_limits && (!out.limits || t >= out.limits.t)) out.limits = { t, rl: pl.rate_limits };
          const last = pl.info && pl.info.last_token_usage;
          if (last) out.rows.push({ t, n: last.total_tokens || (last.input_tokens || 0) + (last.output_tokens || 0) });
        });
        return out;
      });
      if (v.limits && (!latest || v.limits.t > latest.t)) latest = v.limits;
      for (const r of v.rows) {
        if (r.t >= today) {
          tokens += r.n;
          turns += 1;
        }
      }
    }
    return {
      windows: latest ? parseLogLimits(latest.rl, latest.t, now) : [],
      loggedAt: latest ? latest.t : null,
      stats: { todayTokens: tokens, todayReplies: turns },
    };
  }

  return {
    id: 'codex',
    name: 'Codex',
    async read(now = Date.now()) {
      if (!(await exists(dir))) return { status: 'not_installed', windows: [] };
      const [l, g] = await Promise.all([live(now), logs(now).catch(() => null)]);
      const stats = g ? g.stats : null;
      if (l.status === 'ok') return { ...l, source: 'live', stats };
      if (g && g.windows.length) {
        // Couldn't ask live; show what Codex last wrote down, and say how old it is.
        return { status: 'ok', plan: l.plan || null, windows: g.windows, source: 'log', loggedAt: g.loggedAt, liveStatus: l.status, stats };
      }
      return { windows: [], ...l, stats };
    },
  };
}

module.exports = { createCodexSource, parseLive, parseLogLimits };
