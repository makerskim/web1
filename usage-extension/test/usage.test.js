import test from 'node:test';
import assert from 'node:assert';
import { readClaude, readChatgpt, pickOrg, parseChatgptUsage } from '../src/usage.js';

const NOW = Date.now();
function router(routes) {
  const calls = [];
  const request = async (url, headers) => {
    calls.push({ url, headers });
    for (const [k, v] of Object.entries(routes)) if (url.endsWith(k)) return v;
    return { status: 404, json: null };
  };
  return { request, calls };
}

test('claude.ai: organisation then usage', async () => {
  const { request, calls } = router({
    '/api/organizations': { status: 200, json: [{ uuid: 'api-org', capabilities: ['api'] }, { uuid: 'org-1', capabilities: ['chat', 'claude_max'] }] },
    '/api/organizations/org-1/usage': {
      status: 200,
      json: { five_hour: { utilization: 31, resets_at: new Date(NOW + 3600e3).toISOString() }, seven_day: { utilization: 7, resets_at: null }, seven_day_opus: { utilization: 2 } },
    },
  });
  const r = await readClaude(request);
  assert.equal(r.status, 'ok');
  assert.equal(r.plan, 'Max');
  assert.deepEqual(r.windows.map((w) => [w.label, w.usedPercent, w.primary]), [['5시간', 31, true], ['주간', 7, false]]);
  assert.equal(calls.length, 2);
});

test('claude.ai: signed out and offline', async () => {
  assert.equal((await readClaude(router({ '/api/organizations': { status: 403 } }).request)).status, 'not_logged_in');
  assert.equal((await readClaude(router({ '/api/organizations': { status: 0 } }).request)).status, 'offline');
  assert.equal((await readClaude(router({ '/api/organizations': { status: 429 } }).request)).status, 'busy');
});

test('chatgpt.com: session token then usage', async () => {
  const { request, calls } = router({
    '/api/auth/session': { status: 200, json: { accessToken: 'tok', account: { id: 'acc', planType: 'plus' } } },
    '/backend-api/wham/usage': {
      status: 200,
      json: {
        plan_type: 'pro',
        rate_limit: {
          primary_window: { used_percent: 55, limit_window_seconds: 18000, reset_after_seconds: 100 },
          secondary_window: { used_percent: 9, limit_window_seconds: 604800, reset_at: Math.floor(NOW / 1000) + 86400 },
        },
      },
    },
  });
  const r = await readChatgpt(request, NOW);
  assert.equal(r.status, 'ok');
  assert.equal(r.plan, 'Pro');
  assert.deepEqual(r.windows.map((w) => [w.label, w.usedPercent, w.primary]), [['5시간', 55, true], ['주간', 9, false]]);
  assert.equal(r.windows[0].resetsAt, NOW + 100e3);
  assert.equal(calls[1].headers.Authorization, 'Bearer tok');
  assert.equal(calls[1].headers['ChatGPT-Account-Id'], 'acc');
});

test('chatgpt.com: signed out session has no token', async () => {
  assert.equal((await readChatgpt(router({ '/api/auth/session': { status: 200, json: {} } }).request, NOW)).status, 'not_logged_in');
});

test('chatgpt: weekly-only plans still get a leading window', () => {
  const w = parseChatgptUsage({ rate_limit: { primary_window: null, secondary_window: { used_percent: 40, limit_window_seconds: 604800 } } }, NOW);
  assert.equal(w.length, 1);
  assert.equal(w[0].primary, true);
  assert.equal(w[0].label, '주간');
});

test('pickOrg prefers the chat organisation', () => {
  assert.equal(pickOrg([{ uuid: 'a' }, { uuid: 'b', capabilities: ['chat'] }]).uuid, 'b');
  assert.equal(pickOrg([]), null);
});
