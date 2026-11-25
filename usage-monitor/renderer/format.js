/* Formatting helpers shared by the screen and the tests. */
(function (root) {
  'use strict';

  function tokens(n) {
    if (n == null) return '–';
    if (n < 10000) return n.toLocaleString('ko-KR');
    if (n < 1e8) {
      const v = n / 1e4;
      return `${v < 100 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v).toLocaleString('ko-KR')}만`;
    }
    const v = n / 1e8;
    return `${v < 100 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v).toLocaleString('ko-KR')}억`;
  }

  function duration(ms) {
    if (ms == null) return '';
    if (ms <= 0) return '곧';
    const m = Math.floor(ms / 60000);
    if (m < 1) return '1분 안';
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const mm = m % 60;
    if (d > 0) return h ? `${d}일 ${h}시간` : `${d}일`;
    if (h > 0) return mm ? `${h}시간 ${mm}분` : `${h}시간`;
    return `${mm}분`;
  }

  function clock(t, now) {
    if (t == null) return '';
    const d = new Date(t);
    const n = new Date(now);
    const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
    const sameDay = d.toDateString() === n.toDateString();
    if (sameDay) return time;
    const tomorrow = new Date(n);
    tomorrow.setDate(n.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return `내일 ${time}`;
    return `${d.toLocaleDateString('ko-KR', { weekday: 'short' })}요일 ${time}`;
  }

  function ago(t, now) {
    if (t == null) return '';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 45) return '방금';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}분 전`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.round(h / 24)}일 전`;
  }

  function level(pct, thresholds) {
    if (pct == null) return 'idle';
    if (pct >= thresholds[1]) return 'danger';
    if (pct >= thresholds[0]) return 'warn';
    return 'ok';
  }

  const api = { tokens, duration, clock, ago, level };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.fmt = api;
})(typeof window !== 'undefined' ? window : globalThis);
