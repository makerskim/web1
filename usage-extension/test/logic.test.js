import test from 'node:test';
import assert from 'node:assert';
import { tooltip, badge, checkAlerts } from '../src/logic.js';
import { duration, level } from '../src/format.js';

const H = 3600e3;
const now = Date.parse('2026-11-25T12:00:00+09:00');
const snap = {
  checkedAt: now - 20e3,
  providers: [
    { id: 'claude', name: 'Claude', status: 'ok', windows: [
      { key: 'five_hour', label: '5시간', usedPercent: 63.4, resetsAt: now + 2 * H + 11 * 60e3, windowSeconds: 18000, primary: true },
      { key: 'seven_day', label: '주간', usedPercent: 41, resetsAt: now + 52 * H, windowSeconds: 604800 },
    ] },
    { id: 'chatgpt', name: 'ChatGPT', status: 'not_logged_in', windows: [] },
  ],
};

test('tooltip lists each limit and what is missing', () => {
  const t = tooltip(snap, now);
  assert.match(t, /^AI 사용량\n/);
  assert.match(t, /Claude {2}5시간 63% \(2시간 11분 뒤 초기화\) {2}주간 41% \(2일 4시간 뒤 초기화\)/);
  assert.match(t, /ChatGPT: 로그인 필요/);
  assert.match(t, /방금 확인/);
});

test('badge shows the fullest 5-hour limit, coloured by level', () => {
  assert.deepEqual(badge(snap, [80, 95]), { text: '63', color: '#1d7a69' });
  const hot = { providers: [{ windows: [{ usedPercent: 96, primary: true }] }, { windows: [{ usedPercent: 82, primary: true }] }] };
  assert.deepEqual(badge(hot, [80, 95]), { text: '96', color: '#c0392b' });
  assert.equal(badge({ providers: [{ status: 'not_logged_in', windows: [] }] }, [80, 95]).text, '!');
  assert.equal(badge({ providers: [] }, [80, 95]).text, '');
});

const one = (used, resetsAt, extra = {}) => ({ providers: [{ id: 'claude', name: 'Claude', ...extra, windows: [{ key: 'five_hour', label: '5시간', usedPercent: used, resetsAt, windowSeconds: 18000 }] }] });
const kinds = (r) => r.map((x) => (x.kind === 'limit' ? x.threshold : x.kind));

test('alerts: each threshold once per cycle, again in a new cycle', () => {
  const st = {};
  assert.deepEqual(kinds(checkAlerts(one(50, now + H), [80, 95], st)), []);
  assert.deepEqual(kinds(checkAlerts(one(82, now + H), [80, 95], st)), [80]);
  assert.deepEqual(kinds(checkAlerts(one(85, now + H), [80, 95], st)), []);
  assert.deepEqual(kinds(checkAlerts(one(97, now + H), [80, 95], st)), [95]);
  assert.deepEqual(kinds(checkAlerts(one(97, now + H + 20e3), [80, 95], st)), [], 'jitter is the same cycle');
  assert.deepEqual(kinds(checkAlerts(one(97, now + 6 * H), [80, 95], st)), [95], 'new cycle while still high');
});

test('alerts: refill is announced once after a limit was high', () => {
  const st = {};
  assert.deepEqual(kinds(checkAlerts(one(3, now + H), [80, 95], st)), []);
  assert.deepEqual(kinds(checkAlerts(one(90, now + H), [80, 95], st)), [80]);
  assert.deepEqual(kinds(checkAlerts(one(0, now + 6 * H), [80, 95], st)), ['reset']);
  assert.deepEqual(kinds(checkAlerts(one(1, now + 6 * H), [80, 95], st)), []);
});

test('alerts: old numbers shown while offline never notify', () => {
  const st = {};
  assert.deepEqual(kinds(checkAlerts(one(99, now + H, { stale: true }), [80, 95], st)), []);
});

test('alert state survives a round trip through storage', () => {
  const st = {};
  checkAlerts(one(90, now + H), [80, 95], st);
  const again = JSON.parse(JSON.stringify(st));
  assert.deepEqual(kinds(checkAlerts(one(91, now + H), [80, 95], again)), []);
});

test('format', () => {
  assert.equal(duration(2 * H + 13 * 60e3), '2시간 13분');
  assert.equal(duration(3 * 24 * H + 4 * H), '3일 4시간');
  assert.equal(level(80, [80, 95]), 'warn');
});
