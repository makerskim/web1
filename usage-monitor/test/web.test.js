'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { readClaudeWeb, readChatgptWeb, pickOrg } = require('../src/sources/web');
const { createProvider } = require('../src/providers');

const NOW = Date.now();
function router(routes) {
  const calls = [];
  const request = async (url, headers) => {
    calls.push({ url, headers });
    for (const [k, v] of Object.entries(routes)) if (url.endsWith(k)) return typeof v === 'function' ? v(headers) : v;
    return { status: 404, json: null };
  };
  return { request, calls };
}

test('claude.ai: organisation then usage', async () => {
  const { request, calls } = router({
    '/api/organizations': { status: 200, json: [{ uuid: 'api-org', capabilities: ['api'] }, { uuid: 'org-1', capabilities: ['chat', 'claude_max'] }] },
    '/api/organizations/org-1/usage': {
      status: 200,
      json: { five_hour: { utilization: 31, resets_at: new Date(NOW + 3600e3).toISOString() }, seven_day: { utilization: 7, resets_at: null } },
    },
  });
  const r = await readClaudeWeb(request);
  assert.equal(r.status, 'ok');
  assert.equal(r.plan, 'Max');
  assert.deepEqual(r.windows.map((w) => w.usedPercent), [31, 7]);
  assert.equal(calls.length, 2);
});

test('claude.ai: signed out', async () => {
  const { request } = router({ '/api/organizations': { status: 403, json: { error: 'x' } } });
  assert.equal((await readClaudeWeb(request)).status, 'not_logged_in');
  const off = router({ '/api/organizations': { status: 0 } });
  assert.equal((await readClaudeWeb(off.request)).status, 'offline');
});

test('chatgpt.com: session token then usage', async () => {
  const { request, calls } = router({
    '/api/auth/session': { status: 200, json: { accessToken: 'tok', account: { id: 'acc', planType: 'plus' } } },
    '/backend-api/wham/usage': {
      status: 200,
      json: { plan_type: 'pro', rate_limit: { primary_window: { used_percent: 55, limit_window_seconds: 18000, reset_after_seconds: 100 } } },
    },
  });
  const r = await readChatgptWeb(request, NOW);
  assert.equal(r.status, 'ok');
  assert.equal(r.plan, 'Pro');
  assert.equal(r.windows[0].usedPercent, 55);
  assert.equal(calls[1].headers.Authorization, 'Bearer tok');
  assert.equal(calls[1].headers['ChatGPT-Account-Id'], 'acc');
});

test('chatgpt.com: signed out session has no token', async () => {
  const { request } = router({ '/api/auth/session': { status: 200, json: {} } });
  assert.equal((await readChatgptWeb(request, NOW)).status, 'not_logged_in');
});

test('pickOrg prefers the chat organisation', () => {
  assert.equal(pickOrg([{ uuid: 'a' }, { uuid: 'b', capabilities: ['chat'] }]).uuid, 'b');
  assert.equal(pickOrg([]), null);
});

const W = [{ key: 'five_hour', usedPercent: 10, primary: true }];
const local = (r) => ({ read: async () => r, readStats: async () => ({ todayTokens: 5, todayReplies: 1 }) });

test('provider: website login wins, stats still from this computer', async () => {
  const p = createProvider({ id: 'claude', name: 'Claude', readWeb: async () => ({ status: 'ok', windows: W }), local: local({ status: 'ok', windows: [] }) });
  const r = await p.read(NOW);
  assert.equal(r.via, 'web');
  assert.equal(r.webLoggedIn, true);
  assert.equal(r.stats.todayTokens, 5);
});

test('provider: falls back to the app on this computer', async () => {
  const p = createProvider({ id: 'claude', name: 'Claude', readWeb: async () => ({ status: 'not_logged_in' }), local: local({ status: 'ok', windows: W }) });
  const r = await p.read(NOW);
  assert.equal(r.via, 'app');
  assert.equal(r.webLoggedIn, false);
});

test('provider: neither signed in asks for login', async () => {
  const p = createProvider({ id: 'claude', name: 'Claude', readWeb: async () => ({ status: 'not_logged_in' }), local: local({ status: 'not_installed', windows: [] }) });
  assert.equal((await p.read(NOW)).status, 'not_logged_in');
});

test('provider: website offline keeps its status when nothing else works', async () => {
  const p = createProvider({ id: 'claude', name: 'Claude', readWeb: async () => ({ status: 'offline' }), local: local({ status: 'not_installed', windows: [] }) });
  const r = await p.read(NOW);
  assert.equal(r.status, 'offline');
  assert.equal(r.webLoggedIn, false);
});
