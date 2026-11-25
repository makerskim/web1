(function () {
  'use strict';
  const api = window.usage;
  const fmt = window.fmt;
  const $ = (id) => document.getElementById(id);

  let snap = { providers: [], checkedAt: null };
  let settings = { thresholds: [80, 95] };

  const SITE = { claude: 'Claude', chatgpt: 'ChatGPT' };

  const NOTES = {
    offline: '인터넷에 연결되지 않아 확인하지 못했어요. 연결되면 자동으로 다시 확인해요.',
    busy: '확인 요청이 많아 잠시 쉬는 중이에요. 몇 분 뒤 자동으로 다시 확인해요.',
    error: '한도를 읽지 못했어요. 다음 확인 때 다시 시도해요.',
    expired: '로그인이 풀렸어요. 아래 버튼으로 다시 로그인해 주세요.',
  };

  function noteFor(p) {
    if (p.status === 'ok' && !p.stale && p.source !== 'log') return null;
    const now = Date.now();
    const site = SITE[p.id] || p.name;
    if (p.source === 'log') {
      return { text: `Codex가 이 컴퓨터에 마지막으로 기록한 숫자예요 (${fmt.ago(p.loggedAt, now)} 작업). ${site}에 로그인하면 실시간으로 보여요.`, tone: 'soft', login: !p.webLoggedIn };
    }
    if (p.stale) {
      const reason = NOTES[p.liveStatus] || NOTES.error;
      return { text: `${reason} 아래는 ${fmt.ago(p.fetchedAt, now)}에 받은 숫자예요.`, tone: 'soft' };
    }
    if (p.status === 'not_logged_in') {
      return { text: `${site} 계정에 로그인하면 사용량이 여기에 바로 보여요.`, tone: 'plain', login: true };
    }
    if (p.status === 'expired') return { text: NOTES.expired, tone: 'plain', login: true };
    let text = NOTES[p.status] || NOTES.error;
    if (p.status === 'error' && p.message) text = `한도를 읽지 못했어요 (${p.message}). 다음 확인 때 다시 시도해요.`;
    return { text, tone: 'plain' };
  }

  function paceText(w, now) {
    const p = w.pace;
    if (!p) return null;
    if (p.kind === 'out') return { text: '한도를 다 썼어요. 초기화될 때까지 기다려야 해요.', tone: 'danger' };
    if (p.kind === 'short') return { text: `이 속도면 ${fmt.clock(p.hitAt, now)}쯤 다 써요`, tone: 'warn' };
    if (p.kind === 'fine') return { text: '이 속도면 초기화 전까지 넉넉해요', tone: 'ok' };
    return null;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function windowRow(w, now) {
    const lvl = fmt.level(w.usedPercent, settings.thresholds);
    const row = el('div', `win ${w.primary ? 'is-primary' : ''} ${w.minor ? 'is-minor' : ''} lvl-${lvl}`);

    const top = el('div', 'win-top');
    top.append(el('span', 'win-label', w.label));
    const pct = el('span', 'win-pct');
    pct.append(document.createTextNode(String(Math.round(w.usedPercent))), el('span', 'pct-sign', '%'));
    top.append(pct);
    row.append(top);

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
        tick.title = '지금 시각 (한도 기간 중 지난 만큼)';
        meter.append(tick);
      }
    }
    row.append(meter);

    const sub = el('div', 'win-sub');
    if (w.resetsAt) {
      const left = el('span', 'reset');
      left.dataset.resetsAt = String(w.resetsAt);
      left.textContent = resetText(w.resetsAt, now);
      sub.append(left);
    } else {
      sub.append(el('span', 'reset', w.usedPercent > 0 ? '초기화 시간 정보 없음' : '아직 쓰지 않았어요'));
    }
    const pt = paceText(w, now);
    if (pt && !w.minor) sub.append(el('span', `pace tone-${pt.tone}`, pt.text));
    row.append(sub);
    return row;
  }

  function resetText(t, now) {
    return `${fmt.duration(t - now)} 뒤 초기화 (${fmt.clock(t, now)})`;
  }

  function render() {
    const now = Date.now();
    const list = $('list');
    list.replaceChildren();
    const tpl = $('provider-tpl');
    for (const p of snap.providers) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.provider = p.id;
      node.querySelector('.p-name').textContent = p.name;
      const plan = node.querySelector('.p-plan');
      if (p.plan) plan.textContent = p.plan;
      else plan.remove();
      const fresh = node.querySelector('.p-fresh');
      if (p.status === 'ok') {
        fresh.textContent = p.source === 'log' ? '기록 기준' : p.stale ? '지난 숫자' : '실시간';
        fresh.title = p.via === 'web' ? `${SITE[p.id]} 사이트 로그인으로 확인 중` : p.id === 'claude' ? '이 컴퓨터의 Claude Code 로그인으로 확인 중' : '이 컴퓨터의 Codex 로그인으로 확인 중';
        fresh.classList.add(p.source === 'log' || p.stale ? 'is-soft' : 'is-live');
      } else {
        fresh.remove();
      }

      const note = noteFor(p);
      if (note) {
        const n = node.querySelector('.p-note');
        n.hidden = false;
        n.classList.add(`tone-${note.tone}`);
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

      const wins = node.querySelector('.p-windows');
      for (const w of p.windows || []) wins.append(windowRow(w, now));

      if (p.stats && (p.stats.todayTokens || p.stats.todayReplies || (p.windows || []).length)) {
        const st = node.querySelector('.p-stats');
        st.hidden = false;
        st.querySelector('.s-tokens').textContent = fmt.tokens(p.stats.todayTokens);
        st.querySelector('.s-replies').textContent = `${(p.stats.todayReplies || 0).toLocaleString('ko-KR')}회`;
      }
      list.append(node);
    }
    if (snap.providers.some((p) => (p.windows || []).length)) {
      const legend = el('p', 'legend');
      const tick = el('span', 'legend-tick');
      tick.setAttribute('aria-hidden', 'true');
      legend.append(tick, '세로선은 한도 기간 중 지금까지 지난 시간이에요. 막대가 선보다 앞서 있으면 기간이 끝나기 전에 한도가 먼저 찰 수 있어요.');
      list.append(legend);
    }
    updateChecked(now);
  }

  function updateChecked(now) {
    $('checked').textContent = snap.checkedAt
      ? `마지막 확인 ${new Date(snap.checkedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
      : '아직 확인 전';
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
    b.textContent = '확인 중';
    try {
      snap = await api.refresh();
      render();
    } finally {
      b.disabled = false;
      b.textContent = '새로고침';
    }
  }

  // Settings sheet
  function fillSettings() {
    $('s-interval').value = String(settings.intervalSec);
    $('s-notify').checked = settings.notify;
    $('s-warn').value = settings.thresholds[0];
    $('s-danger').value = settings.thresholds[1];
    $('s-login').checked = settings.openAtLogin;
    $('s-top').checked = settings.alwaysOnTop;
    $('s-close').value = settings.closeAction;
    $('version').textContent = settings.version ? `버전 ${settings.version}` : '';
    renderAccounts();
  }

  function renderAccounts() {
    const box = $('accounts');
    box.replaceChildren();
    for (const id of ['claude', 'chatgpt']) {
      const p = snap.providers.find((x) => x.id === id) || {};
      const row = el('div', 'row');
      const text = el('span');
      text.append(el('span', 'row-title', `${SITE[id]} 계정`));
      const state = p.webLoggedIn
        ? '로그인되어 있어요'
        : p.via === 'app'
          ? `이 컴퓨터의 ${id === 'claude' ? 'Claude Code' : 'Codex'} 로그인을 쓰고 있어요`
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

  async function save(patch) {
    settings = await api.setSettings(patch);
    fillSettings();
    render();
  }

  function openSheet() {
    fillSettings();
    const s = $('sheet');
    s.hidden = false;
    requestAnimationFrame(() => s.classList.add('is-open'));
    $('close-settings').focus();
  }
  function closeSheet() {
    const s = $('sheet');
    s.classList.remove('is-open');
    setTimeout(() => (s.hidden = true), 180);
    $('open-settings').focus();
  }

  $('refresh').addEventListener('click', doRefresh);
  $('open-settings').addEventListener('click', openSheet);
  $('close-settings').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
  });
  $('s-interval').addEventListener('change', (e) => save({ intervalSec: Number(e.target.value) }));
  $('s-notify').addEventListener('change', (e) => save({ notify: e.target.checked }));
  $('s-login').addEventListener('change', (e) => save({ openAtLogin: e.target.checked }));
  $('s-top').addEventListener('change', (e) => save({ alwaysOnTop: e.target.checked }));
  $('s-close').addEventListener('change', (e) => save({ closeAction: e.target.value }));
  const th = () => save({ thresholds: [Number($('s-warn').value), Number($('s-danger').value)] });
  $('s-warn').addEventListener('change', th);
  $('s-danger').addEventListener('change', th);

  api.onUpdate((s) => {
    snap = s;
    render();
    if (!$('sheet').hidden) renderAccounts();
  });

  (async function init() {
    settings = await api.getSettings();
    document.documentElement.dataset.platform = settings.platform || '';
    snap = await api.get();
    if (snap.checkedAt) render();
  })();
})();
