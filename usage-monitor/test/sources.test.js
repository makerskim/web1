'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClaudeSource } = require('../src/sources/claude');
const { createCodexSource } = require('../src/sources/codex');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'usage-home-'));
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}
function res(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const NOW = Date.now();

test('claude: not installed', async () => {
  const s = createClaudeSource({ home: tmpHome(), env: {}, fetch: async () => res(200, {}) });
  assert.equal((await s.read(NOW)).status, 'not_installed');
});

test('claude: reads limits and today tokens', async () => {
  const home = tmpHome();
  write(path.join(home, '.claude/.credentials.json'), {
    claudeAiOauth: { accessToken: 'tok', expiresAt: NOW + 3600e3, subscriptionType: 'max' },
  });
  const reply = (id, t) =>
    JSON.stringify({ type: 'assistant', timestamp: new Date(t).toISOString(), requestId: 'r' + id, message: { id, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } } });
  write(path.join(home, '.claude/projects/p/a.jsonl'), [reply('m1', NOW - 1000), reply('m1', NOW - 1000), reply('m2', NOW - 2000), '{bad', ''].join('\n'));
  let sent;
  const s = createClaudeSource({
    home,
    env: {},
    fetch: async (url, opts) => {
      sent = { url, opts };
      return res(200, {
        five_hour: { utilization: 42, resets_at: new Date(NOW + 3600e3).toISOString() },
        seven_day: { utilization: 18.5, resets_at: new Date(NOW + 86400e3).toISOString() },
        seven_day_opus: null,
      });
    },
  });
  const r = await s.read(NOW);
  assert.equal(r.status, 'ok');
  assert.equal(r.plan, 'Max');
  assert.equal(sent.opts.headers.Authorization, 'Bearer tok');
  assert.deepEqual(r.windows.map((w) => [w.key, w.usedPercent, w.primary]), [['five_hour', 42, true], ['seven_day', 18.5, false]]);
  assert.equal(r.stats.todayReplies, 2, 'duplicate reply counted once');
  assert.equal(r.stats.todayTokens, 230);
});

test('claude: expired token is not sent', async () => {
  const home = tmpHome();
  write(path.join(home, '.claude/.credentials.json'), { claudeAiOauth: { accessToken: 't', expiresAt: NOW - 1 } });
  let called = false;
  const s = createClaudeSource({ home, env: {}, fetch: async () => ((called = true), res(200, {})) });
  assert.equal((await s.read(NOW)).status, 'expired');
  assert.equal(called, false);
});

test('claude: offline and busy', async () => {
  const home = tmpHome();
  write(path.join(home, '.claude/.credentials.json'), { claudeAiOauth: { accessToken: 't' } });
  const off = createClaudeSource({ home, env: {}, fetch: async () => { throw new Error('net'); } });
  assert.equal((await off.read(NOW)).status, 'offline');
  const busy = createClaudeSource({ home, env: {}, fetch: async () => res(429, {}) });
  assert.equal((await busy.read(NOW)).status, 'busy');
});

test('codex: live limits', async () => {
  const home = tmpHome();
  write(path.join(home, '.codex/auth.json'), { tokens: { access_token: 'a', account_id: 'acc' } });
  let headers;
  const s = createCodexSource({
    home,
    env: {},
    fetch: async (_u, o) => {
      headers = o.headers;
      return res(200, {
        plan_type: 'plus',
        rate_limit: {
          primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_after_seconds: 600, reset_at: Math.floor(NOW / 1000) + 600 },
          secondary_window: { used_percent: 30, limit_window_seconds: 604800, reset_at: Math.floor(NOW / 1000) + 86400 },
        },
      });
    },
  });
  const r = await s.read(NOW);
  assert.equal(r.status, 'ok');
  assert.equal(r.source, 'live');
  assert.equal(r.plan, 'Plus');
  assert.equal(headers['ChatGPT-Account-Id'], 'acc');
  assert.deepEqual(r.windows.map((w) => [w.label, w.usedPercent, w.primary]), [['5시간 한도', 12, true], ['주간 한도', 30, false]]);
});

test('codex: falls back to the newest log line when live fails', async () => {
  const home = tmpHome();
  write(path.join(home, '.codex/auth.json'), { tokens: { access_token: 'a' } });
  const line = (t, pct, extra = {}) =>
    JSON.stringify({
      timestamp: new Date(t).toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { total_tokens: 1000 } },
        rate_limits: {
          primary: { used_percent: pct, window_minutes: 300, resets_in_seconds: 3600, ...extra },
          secondary: { used_percent: 5, window_minutes: 10080, resets_in_seconds: 86400 * 3 },
        },
      },
    });
  write(path.join(home, '.codex/sessions/2026/11/25/rollout-a.jsonl'), [line(NOW - 600e3, 20), line(NOW - 60e3, 25)].join('\n'));
  const s = createCodexSource({ home, env: {}, fetch: async () => res(403, {}) });
  const r = await s.read(NOW);
  assert.equal(r.status, 'ok');
  assert.equal(r.source, 'log');
  assert.equal(r.liveStatus, 'expired');
  assert.equal(r.windows[0].usedPercent, 25);
  assert.ok(Math.abs(r.windows[0].resetsAt - (NOW - 60e3 + 3600e3)) < 1000);
  assert.equal(r.stats.todayTokens, 2000);
});

test('codex: log window that already reset reads as empty', async () => {
  const home = tmpHome();
  write(path.join(home, '.codex/auth.json'), {});
  write(
    path.join(home, '.codex/sessions/x/rollout.jsonl'),
    JSON.stringify({
      timestamp: new Date(NOW - 7200e3).toISOString(),
      payload: { type: 'token_count', rate_limits: { primary: { used_percent: 90, window_minutes: 300, resets_at: Math.floor((NOW - 60e3) / 1000) } } },
    })
  );
  const s = createCodexSource({ home, env: {}, fetch: async () => res(200, {}) });
  const r = await s.read(NOW);
  assert.equal(r.source, 'log');
  assert.equal(r.liveStatus, 'not_logged_in');
  assert.equal(r.windows[0].usedPercent, 0);
});

test('codex: api key only', async () => {
  const home = tmpHome();
  write(path.join(home, '.codex/auth.json'), { OPENAI_API_KEY: 'sk-x' });
  const s = createCodexSource({ home, env: {}, fetch: async () => res(200, {}) });
  assert.equal((await s.read(NOW)).status, 'api_key_only');
});
