// Runs in the background: every minute it reads both sites' limits, puts the
// numbers on the icon (badge + tooltip), and shows notifications.
import { PROVIDERS, USAGE_PAGES } from './src/usage.js';
import { tooltip, badge, checkAlerts } from './src/logic.js';

const DEFAULTS = { intervalMin: 1, notify: true, notifyReset: true, thresholds: [80, 95] };
const ALARM = 'refresh';

async function load() {
  const s = await chrome.storage.local.get(['settings', 'lastGood', 'backoff', 'alertState', 'snapshot']);
  return {
    settings: { ...DEFAULTS, ...(s.settings || {}) },
    lastGood: s.lastGood || {},
    backoff: s.backoff || {},
    alertState: s.alertState || {},
    snapshot: s.snapshot || { providers: [], checkedAt: null },
  };
}

// Requests run with this browser's own login (cookies) for claude.ai and chatgpt.com.
async function request(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    let json = null;
    try {
      json = await r.json();
    } catch {
      /* not JSON (for example a sign-in page) */
    }
    return { status: r.status, json };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function readOne(p, now, force, st) {
  const prev = st.lastGood[p.id];
  const wait = st.backoff[p.id];
  if (!force && wait && now < wait.until) {
    return prev ? { ...prev, stale: true, liveStatus: 'busy' } : { status: 'busy', windows: [] };
  }
  let r;
  try {
    r = await p.read(request, now);
  } catch (e) {
    r = { status: 'error', message: String((e && e.message) || e) };
  }
  if (r.status === 'busy') {
    // Asked too often: wait 2 minutes, then 4, 8, up to 10.
    const step = Math.min(10 * 60e3, wait ? wait.step * 2 : 2 * 60e3);
    st.backoff[p.id] = { until: now + step, step };
  } else {
    delete st.backoff[p.id];
  }
  if (r.status === 'ok') {
    st.lastGood[p.id] = { ...r, fetchedAt: now };
    return { ...r, fetchedAt: now };
  }
  if (r.status === 'not_logged_in') delete st.lastGood[p.id];
  // Keep showing the last numbers we had, and say why they are not fresh.
  if (prev && ['offline', 'busy', 'error'].includes(r.status)) return { ...prev, stale: true, liveStatus: r.status };
  return { windows: [], ...r };
}

async function paintIcon(snapshot, settings) {
  const now = Date.now();
  await chrome.action.setTitle({ title: tooltip(snapshot, now) });
  const b = badge(snapshot, settings.thresholds);
  await chrome.action.setBadgeText({ text: b.text });
  await chrome.action.setBadgeBackgroundColor({ color: b.color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
}

function notify(a) {
  const w = a.window;
  const name = a.provider.name;
  const id = `${a.provider.id}:${a.kind}:${Date.now()}`;
  const opts =
    a.kind === 'reset'
      ? { title: `${name} ${w.label} 한도가 다시 채워졌어요`, message: `지금 ${Math.round(w.usedPercent)}% 사용 중이에요.` }
      : {
          title: `${name} ${w.label} 한도 ${Math.round(w.usedPercent)}% 사용`,
          message: w.usedPercent >= 100 ? '한도를 다 썼어요.' : `알림 기준 ${a.threshold}%를 넘었어요.`,
        };
  chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon128.png', priority: a.kind === 'limit' ? 2 : 0, ...opts });
}

let running = null;
async function refresh(force = false) {
  if (running) return running;
  running = (async () => {
    const st = await load();
    const now = Date.now();
    const providers = await Promise.all(
      PROVIDERS.map(async (p) => ({ id: p.id, name: p.name, ...(await readOne(p, now, force, st)) }))
    );
    const snapshot = { checkedAt: now, providers };
    const alerts = checkAlerts(snapshot, st.settings.thresholds, st.alertState);
    if (st.settings.notify) {
      for (const a of alerts) if (a.kind === 'limit' || st.settings.notifyReset) notify(a);
    }
    await chrome.storage.local.set({ snapshot, lastGood: st.lastGood, backoff: st.backoff, alertState: st.alertState });
    await paintIcon(snapshot, st.settings);
    return snapshot;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function ensureAlarm() {
  const { settings } = await load();
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { periodInMinutes: settings.intervalMin, delayInMinutes: settings.intervalMin });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarm();
  refresh(true);
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  refresh(true);
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refresh(false);
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'refresh') {
    refresh(true).then(reply);
    return true;
  }
  if (msg && msg.type === 'settings') {
    (async () => {
      const { settings } = await load();
      const next = { ...settings, ...msg.patch };
      await chrome.storage.local.set({ settings: next });
      if ('intervalMin' in msg.patch) await ensureAlarm();
      const { snapshot } = await load();
      await paintIcon(snapshot, next);
      reply(next);
    })();
    return true;
  }
  return false;
});

// Clicking a notification opens that site's usage page.
chrome.notifications.onClicked.addListener((id) => {
  const provider = id.split(':')[0];
  if (USAGE_PAGES[provider]) chrome.tabs.create({ url: USAGE_PAGES[provider] });
  chrome.notifications.clear(id);
});
