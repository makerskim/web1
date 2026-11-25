'use strict';

/**
 * Will the current pace use up the window before it resets?
 *  kind: 'out'   — already at 100%
 *        'short' — at this pace it runs out at hitAt, before the reset
 *        'fine'  — at this pace it lasts until the reset
 *        'early' — too early in the window to tell
 */
function pace(w, now) {
  if (!w || w.resetsAt == null || !w.windowSeconds) return null;
  if (w.usedPercent >= 100) return { kind: 'out' };
  const total = w.windowSeconds * 1000;
  const elapsed = total - (w.resetsAt - now);
  if (elapsed <= 0 || elapsed / total < 0.05 || w.usedPercent < 2) return { kind: 'early', elapsedFraction: Math.max(0, elapsed / total) };
  const rate = w.usedPercent / elapsed; // percent per ms
  const hitAt = now + (100 - w.usedPercent) / rate;
  return {
    kind: hitAt < w.resetsAt ? 'short' : 'fine',
    hitAt: Math.round(hitAt),
    elapsedFraction: Math.min(1, elapsed / total),
  };
}

function level(pct, thresholds) {
  const [warn, danger] = thresholds;
  if (pct == null) return 'idle';
  if (pct >= danger) return 'danger';
  if (pct >= warn) return 'warn';
  return 'ok';
}

/** Highest level across every window shown, used for the tray icon. */
function worstLevel(snapshot, thresholds) {
  const order = ['idle', 'ok', 'warn', 'danger'];
  let worst = 'idle';
  for (const p of snapshot.providers) {
    for (const w of p.windows || []) {
      const l = level(w.usedPercent, thresholds);
      if (order.indexOf(l) > order.indexOf(worst)) worst = l;
    }
  }
  return worst;
}

/**
 * Remembers which thresholds have already been announced for each window,
 * so each one is announced once per window cycle.
 */
class Alerts {
  constructor() {
    this.fired = new Map();
  }
  check(snapshot, thresholds) {
    const out = [];
    const sorted = [...thresholds].sort((a, b) => a - b);
    for (const p of snapshot.providers) {
      for (const w of p.windows || []) {
        const id = `${p.id}:${w.key}`;
        const prev = this.fired.get(id) || { cycle: null, top: 0 };
        // A new cycle starts when the reset time moves on, or usage falls back below the first threshold.
        const cycle = w.resetsAt ? Math.round(w.resetsAt / 3600000) : null;
        let top = prev.top;
        if ((prev.cycle != null && cycle != null && cycle !== prev.cycle && w.usedPercent < sorted[0]) || w.usedPercent < sorted[0]) top = 0;
        const crossed = sorted.filter((t) => w.usedPercent >= t && t > top);
        if (crossed.length) {
          const t = crossed[crossed.length - 1];
          out.push({ provider: p, window: w, threshold: t });
          top = t;
        }
        this.fired.set(id, { cycle: cycle ?? prev.cycle, top });
      }
    }
    return out;
  }
}

module.exports = { pace, level, worstLevel, Alerts };
