// 화면 위에 뜨는 것들: 아래에서 올라오는 창, 확인 창, 알림 메시지, 진행 표시
// 휴대폰의 '뒤로 가기' 버튼을 누르면 맨 위 창이 닫히도록 브라우저 기록과 연결합니다.

import { html } from './util.js';
import { icon } from './icons.js';

const stack = [];
let ignorePop = false;

window.addEventListener('popstate', () => {
  if (ignorePop) return;
  const depth = history.state?.ov || 0;
  while (stack.length > depth) removeEntry(stack.pop());
});

function removeEntry(entry) {
  entry.el.classList.add('closing');
  entry.onClose?.(entry.result);
  setTimeout(() => entry.el.remove(), 180);
}

// 창 열기. 반환값 .close(결과)로 닫기
export function openOverlay({ cls = '', content = '', onClose, mount, backdrop = true } = {}) {
  const el = document.createElement('div');
  el.className = `overlay ${cls}`;
  el.innerHTML = String(content);
  document.body.appendChild(el);
  const entry = { el, onClose, result: undefined };
  stack.push(entry);
  history.pushState({ ov: stack.length, keep: history.state?.keep }, '');
  const ctl = {
    el,
    close(result) {
      entry.result = result;
      const i = stack.indexOf(entry);
      if (i < 0) return;
      if (i === stack.length - 1) history.back();
      else { stack.splice(i, 1); removeEntry(entry); }
    },
    get open() { return stack.includes(entry); },
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || (backdrop && e.target === el)) ctl.close();
  });
  mount?.(el, ctl);
  requestAnimationFrame(() => el.classList.add('shown'));
  return ctl;
}

// 열린 창을 모두 닫고 (페이지 이동 전에)
export function closeAllOverlays() {
  return new Promise((resolve) => {
    const n = stack.length;
    if (!n) return resolve();
    while (stack.length) removeEntry(stack.pop());
    ignorePop = true;
    const done = () => { ignorePop = false; window.removeEventListener('popstate', done); resolve(); };
    window.addEventListener('popstate', done);
    history.go(-n);
    setTimeout(() => { if (ignorePop) done(); }, 600);
  });
}

export const overlayOpen = () => stack.length > 0;

// 아래에서 올라오는 창
export function sheet({ title = '', body = '', cls = '', mount, onClose }) {
  return openOverlay({
    cls: `sheet-wrap ${cls}`,
    onClose,
    mount,
    content: html`
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="sheet-grip" data-close></div>
        ${title ? html`<div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="닫기">${icon('close')}</button></div>` : ''}
        <div class="sheet-body">${body}</div>
      </div>`,
  });
}

// 메뉴 목록 창: [{label, icon, danger, value}] → 고른 value
export function menu(items, { title = '' } = {}) {
  return new Promise((resolve) => {
    sheet({
      title,
      onClose: (v) => resolve(v),
      body: html`<div class="menu-list">${items.map((it, i) => html`
        <button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}">
          ${it.icon ? icon(it.icon) : ''}<span>${it.label}</span>
        </button>`)}
        <button class="menu-item cancel" data-close>취소</button></div>`,
      mount: (el, ctl) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) ctl.close(items[+b.dataset.i].value);
      }),
    });
  });
}

// 확인 창 → true / false
export function confirmBox({ title = '', message = '', ok = '확인', cancel = '취소', danger = false }) {
  return new Promise((resolve) => {
    openOverlay({
      cls: 'dialog-wrap',
      onClose: (v) => resolve(!!v),
      content: html`
        <div class="dialog" role="alertdialog" aria-modal="true">
          ${title ? html`<h2>${title}</h2>` : ''}
          ${message ? html`<p>${message}</p>` : ''}
          <div class="dialog-btns">
            ${cancel ? html`<button class="btn ghost" data-close>${cancel}</button>` : ''}
            <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button>
          </div>
        </div>`,
      mount: (el, ctl) => el.querySelector('[data-ok]').addEventListener('click', () => ctl.close(true)),
    });
  });
}

export const alertBox = (message, title = '') => confirmBox({ title, message, cancel: '' });

// 짧은 알림 메시지
let toastTimer;
export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// 올리는 중… 같은 진행 표시 (뒤로 가기로 닫히지 않음)
export function progress(text) {
  const el = document.createElement('div');
  el.className = 'progress-wrap';
  el.innerHTML = String(html`<div class="progress-box"><div class="spinner"></div><p class="progress-text">${text}</p><div class="bar"><i></i></div></div>`);
  document.body.appendChild(el);
  return {
    set(frac, t) {
      el.querySelector('.bar i').style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
      if (t) el.querySelector('.progress-text').textContent = t;
    },
    close() { el.remove(); },
  };
}
