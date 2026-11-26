(function () {
  'use strict';
  const api = window.usage;
  const fmt = window.fmt;
  const $ = (id) => document.getElementById(id);

  let snap = { providers: [], checkedAt: null };
  let settings = { thresholds: [80, 95] };

  const SITE = { claude: 'Claude', chatgpt: 'ChatGPT' };
  const SHORT = { '5시간 한도': '5시간', '주간 한도': '주간' };

  const NOTES = {
    offline: '인터넷에 연결되지 않았어요. 연결되면 다시 확인해요.',
    busy: '확인 요청이 많아 잠시 쉬는 중이에요.',
    error: '한도를 읽지 못했어요. 곧 다시 시도해요.',
    expired: '로그인이 풀렸어요. 다시 로그인해 주세요.',
  };

  function noteFor(p) {
    if (p.status === 'ok' && !p.stale && p.source !== 'log') return null;
    const now = Date.now();
    const site = SITE[p.id] || p.name;
    if (p.source === 'log') return { text: `Codex 마지막 기록 기준 (${fmt.ago(p.loggedAt, now)})`, login: !p.webLoggedIn };
    if (p.stale) return { text: `${NOTES[p.liveStatus] || NOTES.error} (${fmt.ago(p.fetchedAt, now)} 숫자)` };
    if (p.status === 'not_logged_in') return { text: `${site}에 로그인하면 한도가 보여요.`, login: true };
    if (p.status === 'expired') return { text: NOTES.expired, login: true };
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
    return `${fmt.duration(t - now)} 뒤 초기화 · ${fmt.clock(t, now)}`;
  }

  function windowRow(w, now) {
    const lvl = fmt.level(w.usedPercent, settings.thresholds);
    const row = el('div', `win lvl-${lvl}`);
    row.append(el('span', 'win-label', SHORT[w.label] || w.label));

    const meter = el('div', 'meter');
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    meter.setAttribute('aria-valuenow', String(Math.round(w.usedPercent)));
    meter.setAttribute('aria-label', `${w.label} 사용량`);
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
    list.replaceChildren();
    const tpl = $('provider-tpl');
    for (const p of snap.providers) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.provider = p.id;
      const name = node.querySelector('.name-link');
      name.textContent = SITE[p.id] || p.name;
      name.title = `${SITE[p.id] || p.name} 사용량 페이지 열기`;
      name.addEventListener('click', () => api.openUsagePage(p.id));
      const plan = node.querySelector('.p-plan');
      if (p.plan) plan.textContent = p.plan;
      else plan.remove();

      const note = noteFor(p);
      if (note) {
        const n = node.querySelector('.p-note');
        n.hidden = false;
        n.textContent = note.text;
        if (note.login) {
          const b = el('button', 'btn btn-primary', `${SITE[p.id] || p.name} 로그인`);
          b.type = 'button';
          b.addEventListener('click', () => api.login(p.id));
          const wrap = el('span', 'note-action');
          wrap.append(b);
          n.append(wrap);
        }
      }

      // Only the main limits: 5-hour and weekly (per-model weekly limits left out).
      const wins = node.querySelector('.p-windows');
      for (const w of (p.windows || []).filter((x) => !x.minor)) wins.append(windowRow(w, now));
      list.append(node);
    }
    $('checked').textContent = snap.checkedAt
      ? `${new Date(snap.checkedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 확인`
      : '';
    fit();
  }

  // Tell the window how tall the content is, so the panel fits it exactly.
  function fit() {
    requestAnimationFrame(() => api.setHeight && api.setHeight(Math.ceil($('panel').getBoundingClientRect().height)));
  }

  // Countdowns move every second without asking again.
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('.reset[data-resets-at]').forEach((e) => {
      e.textContent = resetText(Number(e.dataset.resetsAt), now);
    });
  }, 1000);

  async function doRefresh() {
    const b = $('refresh');
    b.disabled = true;
    try {
      snap = await api.refresh();
      render();
    } finally {
      b.disabled = false;
    }
  }

  // "Keep on top" pin in the top row
  function showPin() {
    const b = $('pin');
    const on = !!settings.alwaysOnTop;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? '맨 위 고정 켜짐 (누르면 끄기)' : '맨 위 고정 꺼짐 (누르면 켜기)';
  }

  // Settings
  function renderAccounts() {
    const box = $('accounts');
    box.replaceChildren();
    for (const id of ['claude', 'chatgpt']) {
      const p = snap.providers.find((x) => x.id === id) || {};
      const row = el('div', 'row');
      row.style.setProperty('--brand', `var(--${id})`);
      const text = el('span');
      text.append(el('span', 'row-title', `${SITE[id]} 계정`));
      const state = p.webLoggedIn
        ? '로그인되어 있어요'
        : p.via === 'app'
          ? `이 컴퓨터의 ${id === 'claude' ? 'Claude Code' : 'Codex'} 로그인 사용 중`
          : '로그인되어 있지 않아요';
      text.append(el('span', 'row-help', state));
      const b = el('button', p.webLoggedIn ? 'btn' : 'btn btn-primary', p.webLoggedIn ? '로그아웃' : '로그인');
      b.type = 'button';
      b.addEventListener('click', async () => {
        if (p.webLoggedIn) {
          snap = await api.logout(id);
          render();
          renderAccounts();
        } else {
          api.login(id);
        }
      });
      row.append(text, b);
      box.append(row);
    }
  }

  function fillSettings() {
    $('s-dock').value = settings.dock || 'top-right';
    $('s-top').checked = settings.alwaysOnTop;
    $('s-interval').value = String(settings.intervalSec);
    $('s-notify').checked = settings.notify;
    $('s-reset').checked = settings.notifyReset;
    $('s-opacity').value = String(settings.opacity ?? 1);
    $('shortcut').textContent = settings.shortcutOk === false
      ? '단축키 Ctrl + Alt + U 는 다른 프로그램이 쓰고 있어서 사용할 수 없어요.'
      : '단축키: Ctrl + Alt + U 를 누르면 창을 보이거나 숨겨요.';
    $('s-warn').value = settings.thresholds[0];
    $('s-danger').value = settings.thresholds[1];
    $('s-login').checked = settings.openAtLogin;
    $('s-close').value = settings.closeAction;
    $('version').textContent = settings.version ? `버전 ${settings.version}` : '';
    renderAccounts();
  }

  async function save(patch) {
    settings = await api.setSettings(patch);
    fillSettings();
    showPin();
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
    fit();
  }

  $('refresh').addEventListener('click', doRefresh);
  $('pin').addEventListener('click', () => save({ alwaysOnTop: !settings.alwaysOnTop }));
  $('open-settings').addEventListener('click', () => showSettings($('settings').hidden));
  $('close-settings').addEventListener('click', () => showSettings(false));
  $('close').addEventListener('click', () => api.close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('settings').hidden) showSettings(false);
  });
  $('s-dock').addEventListener('change', (e) => save({ dock: e.target.value }));
  $('s-top').addEventListener('change', (e) => save({ alwaysOnTop: e.target.checked }));
  $('s-interval').addEventListener('change', (e) => save({ intervalSec: Number(e.target.value) }));
  $('s-notify').addEventListener('change', (e) => save({ notify: e.target.checked }));
  $('s-reset').addEventListener('change', (e) => save({ notifyReset: e.target.checked }));
  $('s-opacity').addEventListener('change', (e) => save({ opacity: Number(e.target.value) }));
  $('s-login').addEventListener('change', (e) => save({ openAtLogin: e.target.checked }));
  $('s-close').addEventListener('change', (e) => save({ closeAction: e.target.value }));
  const th = () => save({ thresholds: [Number($('s-warn').value), Number($('s-danger').value)] });
  $('s-warn').addEventListener('change', th);
  $('s-danger').addEventListener('change', th);

  api.onUpdate((s) => {
    snap = s;
    render();
    if (!$('settings').hidden) renderAccounts();
  });

  (async function init() {
    settings = await api.getSettings();
    showPin();
    snap = await api.get();
    if (snap.checkedAt) render();
    else fit();
  })();
})();
