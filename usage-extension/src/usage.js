// Reads the limit percentages that claude.ai's and chatgpt.com's own usage pages show,
// using the login already in this browser. `request(url, headers)` resolves to
// { status, json }, with status 0 when the site can't be reached.

const HOUR = 3600;
const DAY = 24 * HOUR;

export const CLAUDE_ORIGIN = 'https://claude.ai';
export const CHATGPT_ORIGIN = 'https://chatgpt.com';
export const USAGE_PAGES = {
  claude: 'https://claude.ai/settings/usage',
  chatgpt: 'https://chatgpt.com/codex/settings/usage',
};
export const LOGIN_PAGES = { claude: 'https://claude.ai/login', chatgpt: 'https://chatgpt.com/auth/login' };

/** Accepts ISO strings, unix seconds or unix ms. */
export function toMs(v) {
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

function statusFor(code) {
  if (code === 0) return 'offline';
  if (code === 401 || code === 403) return 'not_logged_in';
  if (code === 429) return 'busy';
  return 'error';
}

// ---------- Claude ----------

const CLAUDE_WINDOWS = [
  { key: 'five_hour', label: '5시간', seconds: 5 * HOUR, primary: true },
  { key: 'seven_day', label: '주간', seconds: 7 * DAY },
];

export function parseClaudeUsage(json) {
  const out = [];
  for (const w of CLAUDE_WINDOWS) {
    const v = json && json[w.key];
    if (!v || typeof v !== 'object') continue;
    const used = clampPct(v.utilization);
    if (used == null) continue;
    out.push({ key: w.key, label: w.label, usedPercent: used, resetsAt: toMs(v.resets_at), windowSeconds: w.seconds, primary: !!w.primary });
  }
  return out;
}

export function claudePlan(org) {
  const caps = (org && org.capabilities) || [];
  if (caps.includes('claude_max')) return 'Max';
  if (caps.includes('claude_pro')) return 'Pro';
  if (caps.includes('raven')) return 'Team';
  const tier = String((org && org.rate_limit_tier) || '').toLowerCase();
  if (tier.includes('max')) return 'Max';
  if (tier.includes('pro')) return 'Pro';
  return null;
}

/** Picks the personal chat organisation when there are several. */
export function pickOrg(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((o) => (o.capabilities || []).includes('chat')) || list[0];
}

export async function readClaude(request) {
  const orgs = await request(`${CLAUDE_ORIGIN}/api/organizations`);
  if (orgs.status !== 200) return { status: statusFor(orgs.status), message: orgs.status ? `응답 코드 ${orgs.status}` : undefined };
  const org = pickOrg(orgs.json);
  if (!org || !org.uuid) return { status: 'not_logged_in' };
  const plan = claudePlan(org);
  const usage = await request(`${CLAUDE_ORIGIN}/api/organizations/${encodeURIComponent(org.uuid)}/usage`);
  if (usage.status !== 200) return { status: statusFor(usage.status), plan, message: `응답 코드 ${usage.status}` };
  const windows = parseClaudeUsage(usage.json);
  if (!windows.length) return { status: 'error', plan, message: '한도 정보가 비어 있어요' };
  return { status: 'ok', plan, windows };
}

// ---------- ChatGPT (Codex limits) ----------

const CHATGPT_PLANS = { plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu', free: 'Free', go: 'Go' };

function chatgptWindow(key, v, fallbackSeconds, now) {
  if (!v || typeof v !== 'object') return null;
  const used = clampPct(v.used_percent);
  if (used == null) return null;
  const seconds = Number(v.limit_window_seconds) || fallbackSeconds;
  let resetsAt = toMs(v.reset_at);
  if (resetsAt == null && v.reset_after_seconds != null) resetsAt = now + Number(v.reset_after_seconds) * 1000;
  return { key, label: seconds >= 6 * DAY ? '주간' : `${Math.round(seconds / HOUR)}시간`, usedPercent: used, resetsAt, windowSeconds: seconds, primary: false };
}

export function parseChatgptUsage(json, now = Date.now()) {
  const rl = json && json.rate_limit;
  if (!rl) return [];
  const list = [chatgptWindow('primary', rl.primary_window, 5 * HOUR, now), chatgptWindow('secondary', rl.secondary_window, 7 * DAY, now)].filter(Boolean);
  // The shortest window runs out first, so it leads.
  list.sort((a, b) => a.windowSeconds - b.windowSeconds);
  if (list.length) list[0].primary = true;
  return list;
}

export async function readChatgpt(request, now = Date.now()) {
  const s = await request(`${CHATGPT_ORIGIN}/api/auth/session`);
  if (s.status !== 200) return { status: statusFor(s.status) };
  const token = s.json && s.json.accessToken;
  if (!token) return { status: 'not_logged_in' };
  const headers = { Authorization: `Bearer ${token}` };
  const accountId = s.json.account && s.json.account.id;
  if (accountId) headers['ChatGPT-Account-Id'] = accountId;
  const u = await request(`${CHATGPT_ORIGIN}/backend-api/wham/usage`, headers);
  const planKey = String((u.json && u.json.plan_type) || (s.json.account && s.json.account.planType) || '').toLowerCase();
  const plan = CHATGPT_PLANS[planKey] || null;
  if (u.status !== 200) return { status: statusFor(u.status), plan, message: `응답 코드 ${u.status}` };
  const windows = parseChatgptUsage(u.json, now);
  if (!windows.length) return { status: 'error', plan, message: '한도 정보가 비어 있어요' };
  return { status: 'ok', plan, windows };
}

export const PROVIDERS = [
  { id: 'claude', name: 'Claude', read: (request) => readClaude(request) },
  { id: 'chatgpt', name: 'ChatGPT', read: (request, now) => readChatgpt(request, now) },
];
