// "아기와 어떤 사이인가요?" — 눌러서 고르는 이름·얼굴 선택

import { html } from '../util.js';

export const ROLES = [
  ['엄마', '👩'], ['아빠', '👨'], ['할머니', '👵'], ['할아버지', '👴'],
  ['외할머니', '👵'], ['외할아버지', '👴'], ['이모', '👩‍🦰'], ['고모', '👱‍♀️'],
  ['삼촌', '🧑'], ['외삼촌', '🧔'], ['누나·언니', '👧'], ['형·오빠', '👦'],
];

export const AVATARS = ['👩', '👨', '👵', '👴', '👩‍🦰', '👱‍♀️', '🧑', '🧔', '👩‍🦳', '👨‍🦳', '👧', '👦',
  '🧒', '👶', '🐻', '🐰', '🐶', '🐱', '🐥', '🦊', '🐼', '🌸', '🌻', '⭐'];

export function whoPicker({ name = '', avatar = '' } = {}) {
  return html`
    <div class="who-pick">
      <div class="role-grid">
        ${ROLES.map(([r, a]) => html`
          <button type="button" class="role ${r === name ? 'on' : ''}" data-role="${r}" data-av="${a}"><span>${a}</span>${r}</button>`)}
      </div>
      <label class="field"><span>가족에게 보이는 이름</span>
        <input data-who="name" maxlength="20" value="${name}" placeholder="예: 할머니, 지민이 엄마" autocomplete="off"></label>
      <div class="field"><span>얼굴 그림</span>
        <div class="avatar-grid">
          ${AVATARS.map((a) => html`<button type="button" class="av ${a === avatar ? 'on' : ''}" data-pick-av="${a}" aria-label="${a}">${a}</button>`)}
        </div>
      </div>
    </div>`;
}

// 고른 값 꺼내기
export function bindWho(root, { name = '', avatar = '' } = {}) {
  const st = { name, avatar: avatar || '🙂' };
  const input = root.querySelector('[data-who=name]');
  const markAv = () => root.querySelectorAll('[data-pick-av]').forEach((b) => b.classList.toggle('on', b.dataset.pickAv === st.avatar));
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-role]');
    if (r) {
      st.name = r.dataset.role.split('·')[0];
      st.avatar = r.dataset.av;
      input.value = st.name;
      root.querySelectorAll('[data-role]').forEach((b) => b.classList.toggle('on', b === r));
      markAv();
    }
    const a = e.target.closest('[data-pick-av]');
    if (a) { st.avatar = a.dataset.pickAv; markAv(); }
  });
  input.addEventListener('input', () => {
    st.name = input.value;
    root.querySelectorAll('[data-role]').forEach((b) => b.classList.toggle('on', b.dataset.role.split('·')[0] === input.value.trim()));
  });
  return () => ({ displayName: input.value.trim(), avatar: st.avatar });
}
