// What the icon shows (tooltip and badge) and when to notify.
import { duration, ago, level } from './format.js';

const NOTE = {
  not_logged_in: '로그인 필요',
  expired: '로그인 필요',
  offline: '연결 안 됨',
  busy: '잠시 후 다시 확인',
  error: '읽지 못함',
};

/** Text shown when the mouse rests on the extension icon. */
export function tooltip(snapshot, now) {
  const lines = ['AI 사용량'];
  for (const p of snapshot.providers || []) {
    const wins = p.windows || [];
    if (!wins.length) {
      lines.push(`${p.name}: ${NOTE[p.status] || NOTE.error}`);
      continue;
    }
    const parts = wins.map((w) => {
      const left = w.resetsAt ? ` (${duration(w.resetsAt - now)} 뒤 초기화)` : '';
      return `${w.label} ${Math.round(w.usedPercent)}%${left}`;
    });
    const stale = p.stale ? ` · ${ago(p.fetchedAt, now)} 숫자` : '';
    lines.push(`${p.name}  ${parts.join('  ')}${stale}`);
  }
  if (snapshot.checkedAt) lines.push(`${ago(snapshot.checkedAt, now)} 확인 · 누르면 자세히 보기`);
  return lines.join('\n');
}

/** The number on the icon: the fullest 5-hour limit, coloured by level. */
export function badge(snapshot, thresholds) {
  let top = null;
  let needsLogin = false;
  for (const p of snapshot.providers || []) {
    const w = (p.windows || []).find((x) => x.primary);
    if (w) top = Math.max(top ?? 0, w.usedPercent);
    else if (p.status === 'not_logged_in' || p.status === 'expired') needsLogin = true;
  }
  if (top == null) return needsLogin ? { text: '!', color: '#7d8896' } : { text: '', color: '#7d8896' };
  const colors = { ok: '#1d7a69', warn: '#b7791f', danger: '#c0392b' };
  return { text: String(Math.round(top)), color: colors[level(top, thresholds)] };
}

/**
 * Decides which notifications to show. `state` is a plain object kept in
 * storage (the background worker restarts often), and is updated in place.
 *  kind 'limit' — passed a threshold (once per threshold per cycle)
 *  kind 'reset' — a limit that had passed the first threshold has refilled
 */
export function checkAlerts(snapshot, thresholds, state) {
  const out = [];
  const sorted = [...thresholds].sort((a, b) => a - b);
  for (const p of snapshot.providers || []) {
    if (p.stale) continue;
    for (const w of p.windows || []) {
      const id = `${p.id}:${w.key}`;
      const prev = state[id] || { resetsAt: null, top: 0, used: null };
      // A reset time that moves by more than a few minutes of jitter is a new cycle.
      const newCycle = prev.resetsAt != null && w.resetsAt != null && Math.abs(w.resetsAt - prev.resetsAt) > 30 * 60e3;
      let top = prev.top;
      if (prev.used != null && prev.used >= sorted[0] && w.usedPercent < sorted[0] && (newCycle || w.usedPercent <= prev.used - 30)) {
        out.push({ kind: 'reset', provider: p, window: w });
      }
      if (newCycle || w.usedPercent < sorted[0]) top = 0;
      const crossed = sorted.filter((t) => w.usedPercent >= t && t > top);
      if (crossed.length) {
        const t = crossed[crossed.length - 1];
        out.push({ kind: 'limit', provider: p, window: w, threshold: t });
        top = t;
      }
      state[id] = { resetsAt: w.resetsAt ?? prev.resetsAt, top, used: w.usedPercent };
    }
  }
  return out;
}
