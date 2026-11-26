// The small window that opens when the extension icon is clicked.
import { duration, clock, ago, level } from './src/format.js';
import { USAGE_PAGES, LOGIN_PAGES } from './src/usage.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { intervalMin: 1, notify: true, notifyReset: true, thresholds: [80, 95] };
const SITE = { claude: 'claude.ai', chatgpt: 'chatgpt.com' };

let snap = { providers: [], checkedAt: null };
let settings = { ...DEFAULTS };

const NOTES = {
  offline: '사이트에 연결하지 못했어요. 곧 다시 확인해요.',
  busy: '확인 요청이 많아 잠시 쉬는 중이에요.',
  error: '한도를 읽지 못했어요. 곧 다시 시도해요.',
};

function noteFor(p) {
  const now = Date.now();
  if (p.status === 'ok' && !p.stale) return null;
  if (p.stale) return { text: `${NOTES[p.liveStatus] || NOTES.error} (${ago(p.fetchedAt, now)} 숫자)` };
  if (p.status === 'not_logged_in' || p.status === 'expired') {
    return { text: `이 크롬에서 ${SITE[p.id]}에 로그인하면 한도가 보여요.`, login: true };
  }
  if (p.status === 'error' && p.message) return { text: `한도를 읽지 못했어요 (${p.message}).` };
  return { text: NOTES[p.status] || NOTES.error };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function resetText(t, now) {
  return `${duration(t - now)} 뒤 초기화 · ${clock(t, now)}`;
}

function windowRow(w, now) {
  const row = el('div', `win lvl-${level(w.usedPercent, settings.thresholds)}`);
  row.append(el('span', 'win-label', w.label));

  const meter = el('div', 'meter');
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', String(Math.round(w.usedPercent)));
  meter.setAttribute('aria-label', `${w.label} 한도 사용량`);
  const fill = el('span', 'fill');
  fill.style.width = `${w.usedPercent}%`;
  meter.append(fill);
  if (w.resetsAt && w.windowSeconds) {
    const elapsed = 1 - (w.resetsAt - now) / (w.windowSeconds * 1000);
    if (elapsed > 0 && elapsed < 1) {
      const tick = el('span', 'now-tick');
      tick.style.left = `${elapsed * 100}%`;
      tick.title = '한도 기간 중 지금까지 지난 시간';
      meter.append(tick);
    }
  }
  row.append(meter);

  const pct = el('span', 'win-pct');
  pct.append(document.createTextNode(String(Math.round(w.usedPercent))), el('span', 'pct-sign', '%'));
  row.append(pct);

  const reset = el('span', 'reset');
  if (w.resetsAt) {
    reset.dataset.resetsAt = String(w.resetsAt);
    reset.textContent = resetText(w.resetsAt, now);
  } else {
    reset.textContent = w.usedPercent > 0 ? '초기화 시간 정보 없음' : '아직 쓰지 않았어요';
  }
  row.append(reset);
  return row;
}

function render() {
  const now = Date.now();
  const list = $('list');
  if (!snap.providers.length) return;
  list.replaceChildren();
  for (const p of snap.providers) {
    const node = $('provider-tpl').content.firstElementChild.cloneNode(true);
    node.dataset.provider = p.id;
    const name = node.querySelector('.name-link');
    name.textContent = p.name;
    name.title = `${p.name} 사용량 페이지 열기`;
    name.addEventListener('click', () => chrome.tabs.create({ url: USAGE_PAGES[p.id] }));
    const plan = node.querySelector('.p-plan');
    if (p.plan) plan.textContent = p.plan;
    else plan.remove();

    const note = noteFor(p);
    if (note) {
      const n = node.querySelector('.p-note');
      n.hidden = false;
      n.textContent = note.text;
      if (note.login) {
        const b = el('button', 'btn btn-primary', `${SITE[p.id]} 열어서 로그인`);
        b.type = 'button';
        b.addEventListener('click', () => chrome.tabs.create({ url: LOGIN_PAGES[p.id] }));
        const wrap = el('span', 'note-action');
        wrap.append(b);
        n.append(wrap);
      }
    }
    const wins = node.querySelector('.p-windows');
    for (const w of p.windows || []) wins.append(windowRow(w, now));
    list.append(node);
  }
  $('checked').textContent = snap.checkedAt ? `${ago(snap.checkedAt, now)} 확인` : '';
}

// Countdowns move every second.
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('.reset[data-resets-at]').forEach((e) => {
    e.textContent = resetText(Number(e.dataset.resetsAt), now);
  });
  if (snap.checkedAt) $('checked').textContent = `${ago(snap.checkedAt, now)} 확인`;
}, 1000);

async function doRefresh() {
  const b = $('refresh');
  b.disabled = true;
  try {
    const s = await chrome.runtime.sendMessage({ type: 'refresh' });
    if (s) {
      snap = s;
      render();
    }
  } finally {
    b.disabled = false;
  }
}

function fillSettings() {
  $('s-interval').value = String(settings.intervalMin);
  $('s-notify').checked = settings.notify;
  $('s-reset').checked = settings.notifyReset;
  $('s-warn').value = settings.thresholds[0];
  $('s-danger').value = settings.thresholds[1];
  $('version').textContent = `버전 ${chrome.runtime.getManifest().version}`;
}

function cleanThresholds(a, b) {
  a = Math.max(10, Math.min(99, Math.round(Number(a) || 80)));
  b = Math.max(a + 1, Math.min(100, Math.round(Number(b) || 95)));
  return [a, b];
}

async function save(patch) {
  settings = (await chrome.runtime.sendMessage({ type: 'settings', patch })) || { ...settings, ...patch };
  fillSettings();
  render();
}

function showSettings(on) {
  $('settings').hidden = !on;
  $('list').hidden = on;
  if (on) {
    fillSettings();
    $('close-settings').focus();
  } else {
    $('open-settings').focus();
  }
}

$('refresh').addEventListener('click', doRefresh);
$('open-settings').addEventListener('click', () => showSettings($('settings').hidden));
$('close-settings').addEventListener('click', () => showSettings(false));
$('s-interval').addEventListener('change', (e) => save({ intervalMin: Number(e.target.value) }));
$('s-notify').addEventListener('change', (e) => save({ notify: e.target.checked }));
$('s-reset').addEventListener('change', (e) => save({ notifyReset: e.target.checked }));
const th = () => save({ thresholds: cleanThresholds($('s-warn').value, $('s-danger').value) });
$('s-warn').addEventListener('change', th);
$('s-danger').addEventListener('change', th);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.snapshot && changes.snapshot.newValue) {
    snap = changes.snapshot.newValue;
    render();
  }
});

(async function init() {
  const s = await chrome.storage.local.get(['snapshot', 'settings']);
  settings = { ...DEFAULTS, ...(s.settings || {}) };
  if (s.snapshot && s.snapshot.providers && s.snapshot.providers.length) {
    snap = s.snapshot;
    render();
  }
  // Numbers older than a minute: ask for fresh ones right away.
  if (!snap.checkedAt || Date.now() - snap.checkedAt > 60e3) doRefresh();
})();
