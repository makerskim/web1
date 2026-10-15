// "나는 아기의 ○○" — 직접 쓰거나 눌러서 고르는 이름, 얼굴 그림 또는 내 사진

import { html } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';

export const ROLES = [
  ['엄마', '👩'], ['아빠', '👨'], ['할머니', '👵'], ['할아버지', '👴'],
  ['외할머니', '👵'], ['외할아버지', '👴'], ['이모', '👩‍🦰'], ['고모', '👱‍♀️'],
  ['삼촌', '🧑'], ['외삼촌', '🧔'], ['언니·누나', '👧'], ['형·오빠', '👦'],
];

export const AVATARS = [
  '👩', '👨', '👵', '👴', '👩‍🦰', '👱‍♀️', '🧑', '🧔', '👩‍🦳', '👨‍🦳', '👧', '👦', '🧒', '👶', '👩‍🍼', '🧑‍🍼',
  '🐻', '🐰', '🐶', '🐱', '🐥', '🦊', '🐼', '🐨', '🐹', '🐯', '🦁', '🐷', '🐸', '🐧', '🦄', '🐳',
  '🌸', '🌷', '🌻', '🌼', '🍀', '🌈', '⭐', '🌙', '☁️', '🎀', '🍓', '🍑', '🧁', '🍩', '🎈', '💝',
];

// 사진을 가운데 정사각형으로 잘라 작게 (얼굴 사진용)
export async function squarePhoto(file, size = 320) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.'));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// collapse: 얼굴 고르기를 접어 두기 (이름만 정해도 들어갈 수 있게)
export function whoPicker({ name = '', avatar = '', collapse = false } = {}) {
  const photoPath = avatar?.startsWith('img:') ? avatar.slice(4) : '';
  const faces = html`
    <div class="avatar-grid">
      <button type="button" class="av av-photo ${photoPath ? 'on' : ''}" data-pick-photo aria-label="내 사진으로">
        ${photoPath ? html`<img data-path="${photoPath}" alt="">` : html`${icon('camera', { size: 22 })}<small>내 사진</small>`}
      </button>
      ${AVATARS.map((a) => html`<button type="button" class="av ${!photoPath && a === avatar ? 'on' : ''}" data-pick-av="${a}" aria-label="${a}">${a}</button>`)}
    </div>
    <input type="file" accept="image/*" class="visually-hidden" data-who="file" aria-hidden="true" tabindex="-1">`;
  return html`
    <div class="who-pick">
      <label class="role-input">
        <span>나는 아기의</span>
        <input data-who="name" maxlength="20" value="${name}" placeholder="예: 엄마, 큰이모" autocomplete="off" enterkeyhint="done">
      </label>
      <div class="role-chips">
        ${ROLES.map(([r, a]) => html`<button type="button" class="chip outline role ${r.split('·')[0] === name ? 'on' : ''}" data-role="${r}" data-av="${a}">${r}</button>`)}
      </div>
      <p class="field-error" role="alert" data-who="error" hidden>아기와 어떤 사이인지 적어 주세요</p>
      ${collapse
    ? html`<details class="who-more"><summary>프로필 사진·얼굴 고르기 <small>(선택)</small></summary>${faces}</details>`
    : html`<div class="field"><span>프로필</span>${faces}</div>`}
    </div>`;
}

// 고른 값 꺼내기: { displayName, avatar, photo(Blob|null) }
export function bindWho(root, { name = '', avatar = '' } = {}) {
  const st = { name, avatar: avatar && !avatar.startsWith('img:') ? avatar : '🙂', photo: null, keepPhoto: !!avatar?.startsWith('img:'), avTouched: false };
  const input = root.querySelector('[data-who=name]');
  const file = root.querySelector('[data-who=file]');
  const photoBtn = root.querySelector('[data-pick-photo]');
  const markAv = () => {
    const usePhoto = !!st.photo || st.keepPhoto;
    root.querySelectorAll('[data-pick-av]').forEach((b) => b.classList.toggle('on', !usePhoto && b.dataset.pickAv === st.avatar));
    photoBtn?.classList.toggle('on', usePhoto);
  };
  const syncRoles = () => root.querySelectorAll('[data-role]').forEach((b) => b.classList.toggle('on', b.dataset.role.split('·')[0] === input.value.trim()));
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-role]');
    if (r) {
      st.name = r.dataset.role.split('·')[0];
      input.value = st.name;
      if (!st.avTouched && !st.photo && !st.keepPhoto) st.avatar = r.dataset.av;
      syncRoles();
      markAv();
      const err = root.querySelector('[data-who=error]');
      if (err) err.hidden = true;
      root.querySelector('form [type=submit]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const a = e.target.closest('[data-pick-av]');
    if (a) { st.avatar = a.dataset.pickAv; st.photo = null; st.keepPhoto = false; st.avTouched = true; markAv(); }
    if (e.target.closest('[data-pick-photo]')) file?.click();
  });
  file?.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      st.photo = await squarePhoto(f);
      st.keepPhoto = false;
      st.avTouched = true;
      photoBtn.innerHTML = '';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(st.photo);
      img.alt = '';
      photoBtn.appendChild(img);
      markAv();
    } catch (err) {
      toast(err.message);
    }
  });
  input.addEventListener('input', () => { st.name = input.value; syncRoles(); });
  return () => ({ displayName: input.value.trim(), avatar: st.keepPhoto ? avatar : st.avatar, photo: st.photo });
}

// 프로필 사진 올리고 내 얼굴로 쓰기
export async function saveAvatarPhoto(app, blob) {
  await app.api.setAvatarPhoto(app.fam.id, blob, app.me.avatar);
  await app.refreshMembers();
}
