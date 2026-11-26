'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pace, worstLevel, Alerts } = require('../src/logic');
const fmt = require('../renderer/format');
const { sanitize } = require('../src/settings');

const H = 3600e3;
const now = Date.parse('2026-11-25T12:00:00+09:00');
const w5 = (used, leftH) => ({ key: 'five_hour', usedPercent: used, resetsAt: now + leftH * H, windowSeconds: 5 * 3600 });

test('pace: burning faster than time runs out early', () => {
  const p = pace(w5(60, 4), now); // 1h gone, 60% used
  assert.equal(p.kind, 'short');
  assert.ok(Math.abs(p.hitAt - (now + 40 * 60e3)) < 1000);
});

test('pace: slower than time lasts', () => {
  assert.equal(pace(w5(20, 2), now).kind, 'fine');
});

test('pace: too early, already out, no reset time', () => {
  assert.equal(pace(w5(1, 4.9), now).kind, 'early');
  assert.equal(pace(w5(100, 2), now).kind, 'out');
  assert.equal(pace({ usedPercent: 10, resetsAt: null, windowSeconds: 1 }, now), null);
});

test('alerts fire once per threshold and again after reset', () => {
  const a = new Alerts();
  const snap = (used, leftH) => ({ providers: [{ id: 'claude', windows: [w5(used, leftH)] }] });
  assert.deepEqual(a.check(snap(50, 3), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), []);
  assert.deepEqual(a.check(snap(82, 3), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), [80]);
  assert.deepEqual(a.check(snap(85, 3), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), []);
  assert.deepEqual(a.check(snap(97, 3), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), [95]);
  assert.deepEqual(a.check(snap(3, 5), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), []);
  assert.deepEqual(a.check(snap(99, 1), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), [95]);
});

test('alerts fire again in a new cycle even if usage is already high', () => {
  const a = new Alerts();
  const snap = (used, resetsAt) => ({ providers: [{ id: 'claude', windows: [{ key: 'five_hour', usedPercent: used, resetsAt, windowSeconds: 18000 }] }] });
  assert.deepEqual(a.check(snap(97, now + 1 * H), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), [95]);
  assert.deepEqual(a.check(snap(97, now + 1 * H + 20e3), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), [], 'small jitter is the same cycle');
  assert.deepEqual(a.check(snap(97, now + 6 * H), [80, 95]).filter((x) => x.kind === "limit").map((x) => x.threshold), [95]);
});

test('a refill is announced once after a limit was high', () => {
  const a = new Alerts();
  const snap = (used, resetsAt) => ({ providers: [{ id: 'claude', windows: [{ key: 'five_hour', usedPercent: used, resetsAt, windowSeconds: 18000 }] }] });
  const kinds = (r) => r.map((x) => x.kind);
  assert.deepEqual(kinds(a.check(snap(50, now + 1 * H), [80, 95])), []);
  assert.deepEqual(kinds(a.check(snap(3, now + 5 * H), [80, 95])), [], 'no refill notice when it was never high');
  assert.deepEqual(kinds(a.check(snap(90, now + 5 * H), [80, 95])), ['limit']);
  assert.deepEqual(kinds(a.check(snap(0, now + 10 * H), [80, 95])), ['reset']);
  assert.deepEqual(kinds(a.check(snap(1, now + 10 * H), [80, 95])), []);
});

test('worst level', () => {
  const s = { providers: [{ windows: [{ usedPercent: 10 }, { usedPercent: 85 }] }, { windows: [] }] };
  assert.equal(worstLevel(s, [80, 95]), 'warn');
  assert.equal(worstLevel({ providers: [] }, [80, 95]), 'idle');
});

test('format', () => {
  assert.equal(fmt.tokens(9876), '9,876');
  assert.equal(fmt.tokens(123456), '12.3만');
  assert.equal(fmt.tokens(12345678), '1,235만');
  assert.equal(fmt.tokens(250000000), '2.5억');
  assert.equal(fmt.duration(2 * H + 13 * 60e3), '2시간 13분');
  assert.equal(fmt.duration(3 * 24 * H + 4 * H), '3일 4시간');
  assert.equal(fmt.duration(30e3), '1분 안');
});

test('settings: old "close to tray off" becomes quit, default is minimize', () => {
  assert.equal(sanitize({ closeToTray: false }).closeAction, 'quit');
  assert.equal(sanitize({}).closeAction, 'minimize');
  assert.equal(sanitize({ closeAction: 'nope' }).closeAction, 'minimize');
  assert.equal('closeToTray' in sanitize({ closeToTray: true }), false);
});

test('settings are kept in range', () => {
  assert.deepEqual(sanitize({ thresholds: [99, 50], intervalSec: 7 }).thresholds, [99, 100]);
  assert.equal(sanitize({ intervalSec: 7 }).intervalSec, 60);
});
