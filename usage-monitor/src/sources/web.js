'use strict';
// Usage read from the Claude and ChatGPT websites, using the login made in this
// program's own sign-in window. `request(url, headers)` runs inside that logged-in
// browser session and resolves to { status, json }.
const { parseUsage } = require('./claude');
const { parseLive } = require('./codex');

const CLAUDE_ORIGIN = 'https://claude.ai';
const CHATGPT_ORIGIN = 'https://chatgpt.com';

function claudePlan(org) {
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
function pickOrg(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((o) => (o.capabilities || []).includes('chat')) || list[0];
}

function statusFor(code) {
  if (code === 0) return 'offline';
  if (code === 401 || code === 403) return 'not_logged_in';
  if (code === 429) return 'busy';
  return 'error';
}

async function readClaudeWeb(request) {
  const orgs = await request(`${CLAUDE_ORIGIN}/api/organizations`);
  if (orgs.status !== 200) return { status: statusFor(orgs.status), message: orgs.status ? `응답 코드 ${orgs.status}` : undefined };
  const org = pickOrg(orgs.json);
  if (!org || !org.uuid) return { status: 'not_logged_in' };
  const usage = await request(`${CLAUDE_ORIGIN}/api/organizations/${encodeURIComponent(org.uuid)}/usage`);
  if (usage.status !== 200) return { status: statusFor(usage.status), plan: claudePlan(org), message: `응답 코드 ${usage.status}` };
  const windows = parseUsage(usage.json);
  if (!windows.length) return { status: 'error', plan: claudePlan(org), message: '한도 정보가 비어 있어요' };
  return { status: 'ok', plan: claudePlan(org), windows };
}

const CHATGPT_PLANS = { plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu', free: 'Free', go: 'Go' };

async function readChatgptWeb(request, now = Date.now()) {
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
  const windows = parseLive(u.json, now);
  if (!windows.length) return { status: 'error', plan, message: '한도 정보가 비어 있어요' };
  return { status: 'ok', plan, windows };
}

module.exports = { readClaudeWeb, readChatgptWeb, pickOrg, claudePlan, CLAUDE_ORIGIN, CHATGPT_ORIGIN };
