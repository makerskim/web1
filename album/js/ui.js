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
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${title || '창'}">
        <div class="sheet-top">
          <span class="sheet-grip" data-close></span>
          ${title ? html`<h2>${title}</h2>` : ''}
          <button class="icon-btn sheet-x" data-close aria-label="닫기">${icon('close', { size: 22 })}</button>
        </div>
        <div class="sheet-body">${body}</div>
      </div>`,
  });
}

// 메뉴 창. quick: 위쪽 동그란 버튼들 [{label, icon, value}], items: 아래 목록 [{label, icon, danger, value}]
export function menu(items, { title = '', quick = [] } = {}) {
  const all = [...quick, ...items];
  return new Promise((resolve) => {
    sheet({
      title,
      onClose: (v) => resolve(v),
      body: html`
        ${quick.length ? html`<div class="quick-actions">${quick.map((it, i) => html`
          <button class="qa" data-i="${i}"><span class="qa-ic">${icon(it.icon, { size: 24 })}</span><span>${it.label}</span></button>`)}</div>` : ''}
        ${items.length ? html`<div class="menu-list">${items.map((it, i) => html`
          <button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${quick.length + i}">
            ${it.icon ? icon(it.icon, { size: 22 }) : ''}<span>${it.label}</span>
          </button>`)}</div>` : ''}`,
      mount: (el, ctl) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) ctl.close(all[+b.dataset.i].value);
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

// 짧은 알림 메시지 (화면 위쪽). opts: 숫자(ms) 또는 { ms, action: '되돌리기', onAction }
let toastTimer;
export function toast(msg, opts = {}) {
  if (typeof opts === 'number') opts = { ms: opts };
  const { action, onAction } = opts;
  const ms = Math.max(4000, opts.ms || (action ? 6000 : String(msg).length * 90));
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.innerHTML = String(html`<span class="toast-msg">${msg}</span>${action ? html`<button class="toast-act">${action}</button>` : ''}`);
  const hide = () => t.classList.remove('show');
  t.onclick = (e) => {
    if (e.target.closest('.toast-act')) onAction?.();
    hide();
  };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, ms);
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

// 글자 복사 (안 되면 옛날 방식으로)
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
