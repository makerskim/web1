// 처음 화면: 새 앨범 만들기 / 초대 코드로 들어가기 / 이메일로 로그인

import { html, isStandalone, callName } from '../util.js';
import { icon, logo } from '../icons.js';
import { sheet, toast, progress } from '../ui.js';
import { whoPicker, bindWho, saveAvatarPhoto } from './who.js';
import { openInvite, openInstall, fmtCode } from './family.js';

const root = () => document.getElementById('app');

function page(content) {
  document.body.dataset.screen = 'onboard';
  root().innerHTML = String(html`<div class="onboard">${content}</div>`);
  window.scrollTo(0, 0);
  return root().firstElementChild;
}

const backBtn = (onCancel) => (onCancel
  ? html`<button class="icon-btn ob-back" data-ob="back" aria-label="뒤로">${icon('back', { size: 28 })}</button>` : '');

export function welcome(app) {
  const cloud = app.api.mode === 'cloud';
  const el = page(html`
    <div class="hero landing">
      <div class="logo-big">${logo()}</div>
      <h1 class="brand">Pastel Memories</h1>
      <p>우리 아기의 소중한 하루를<br>가족과 함께 모아요</p>
    </div>
    <div class="ob-actions">
      <button class="btn primary big block" data-ob="create">새 가족 앨범 만들기</button>
      ${cloud ? html`<button class="btn soft big block" data-ob="join">초대 코드로 들어가기</button>` : ''}
      ${cloud ? html`<button class="link-btn" data-ob="email">이메일로 로그인</button>` : ''}
    </div>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ob]');
    if (!b) return;
    const back = () => welcome(app);
    if (b.dataset.ob === 'create') create(app, { onCancel: back });
    if (b.dataset.ob === 'join') join(app, '', { onCancel: back });
    if (b.dataset.ob === 'email') emailLogin(app);
  });
}

export function create(app, { onCancel } = {}) {
  const el = page(html`
    ${backBtn(onCancel)}
    <h1 class="ob-title">새 가족 앨범 만들기</h1>
    <form class="ob-form" novalidate>
      <label class="field"><span>아기 이름 <small>(태명도 좋아요)</small></span>
        <input name="baby" maxlength="20" placeholder="예: 하준, 튼튼이" autocomplete="off" required></label>
      <label class="field"><span>생일 <small>(태어나기 전이면 출산 예정일)</small></span>
        <input name="bday" type="date"></label>
      <label class="field"><span>앨범 이름</span>
        <input name="album" maxlength="40" placeholder="예: 하준이네 앨범" autocomplete="off"></label>
      ${whoPicker({})}
      <button class="btn primary big block sticky" type="submit">앨범 만들기</button>
    </form>`);
  const form = el.querySelector('form');
  const get = bindWho(el, {});
  let nameTouched = false;
  form.album.addEventListener('input', () => { nameTouched = true; });
  form.baby.addEventListener('input', () => {
    if (!nameTouched) form.album.value = form.baby.value.trim() ? `${callName(form.baby.value.trim())}네 앨범` : '';
  });
  el.querySelector('[data-ob=back]')?.addEventListener('click', onCancel);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const who = get();
    const baby = form.baby.value.trim();
    const name = form.album.value.trim() || (baby ? `${callName(baby)}네 앨범` : '우리 가족 앨범');
    if (!who.displayName) return showError(el, '[data-who=error]', '아기와 어떤 사이인지 적어 주세요');
    const p = progress('앨범을 만들고 있어요…');
    try {
      const fam = await app.api.createFamily({ name, babyName: baby, babyBirthday: form.bday.value || null, ...who });
      app.user = app.api.user();
      await app.reloadFamilies();
      p.close();
      history.replaceState(null, '', location.pathname + '#/home');
      await app.enterFamily(app.families.find((f) => f.id === fam.id) || fam);
      if (who.photo) await saveAvatarPhoto(app, who.photo).catch((err) => toast(err.message));
      if (app.api.canInvite) openInvite(app, { welcome: true });
    } catch (err) {
      p.close();
      toast(err.message, 5000);
    }
  });
}

const cleanCode = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export async function join(app, code = '', { onCancel } = {}) {
  if (app.api.mode === 'local') {
    toast('체험 모드에서는 초대 코드를 쓸 수 없어요.');
    app.pendingInvite = null;
    return app.families.length ? app.enterFamily(app.fam || app.families[0]) : welcome(app);
  }
  code = cleanCode(code || '');
  const cancel = onCancel || (app.families.length ? () => { dropInvite(app); app.start(); } : () => { dropInvite(app); welcome(app); });
  const el = page(html`
    ${backBtn(cancel)}
    <div class="invite-card" data-j="card">
      <div class="logo-big">${logo()}</div>
      <h1 class="ob-title" data-j="title">가족 앨범 들어가기</h1>
      <p data-j="sub">가족에게 받은 초대 코드 8자리를 넣어 주세요.</p>
    </div>
    <form class="ob-form" novalidate>
      <label class="field" data-j="code-field"><span>초대 코드</span>
        <input name="code" class="code-input" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EF23" value="${fmtCode(code)}">
        <p class="field-error" role="alert" data-j="code-error" hidden>초대 코드 8자리를 넣어 주세요</p></label>
      ${whoPicker({ collapse: true })}
      <button class="btn primary big block sticky" type="submit">앨범 들어가기</button>
    </form>`);
  const form = el.querySelector('form');
  const get = bindWho(el, {});
  el.querySelector('[data-ob=back]')?.addEventListener('click', cancel);
  form.code.addEventListener('input', () => {
    const c = cleanCode(form.code.value);
    form.code.value = c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
    if (c.length === 8) preview(c);
  });

  async function preview(c) {
    try {
      const info = await app.api.inviteInfo(c);
      if (cleanCode(form.code.value) !== c) return;
      if (info) {
        el.querySelector('[data-j=title]').textContent = `${info.name}에 초대받았어요!`;
        el.querySelector('[data-j=sub]').textContent = info.babyName
          ? `${callName(info.babyName)} 사진을 함께 볼 수 있어요 👶` : '가족 사진을 함께 볼 수 있어요 👶';
        el.querySelector('[data-j=card]').classList.add('found');
        if (code) el.querySelector('[data-j=code-field]').hidden = true;
      } else {
        el.querySelector('[data-j=title]').textContent = '초대 코드를 확인해 주세요';
        el.querySelector('[data-j=sub]').textContent = '코드가 맞지 않거나 바뀌었어요. 가족에게 새 링크를 받아 주세요.';
        el.querySelector('[data-j=card]').classList.remove('found');
        el.querySelector('[data-j=code-field]').hidden = false;
      }
    } catch (err) {
      toast(err.message, 5000);
    }
  }
  if (code.length === 8) preview(code);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = cleanCode(form.code.value);
    const who = get();
    if (c.length !== 8) {
      el.querySelector('[data-j=code-field]').hidden = false;
      return showError(el, '[data-j=code-error]', '초대 코드 8자리를 넣어 주세요');
    }
    if (!who.displayName) return showError(el, '[data-who=error]', '아기와 어떤 사이인지 적어 주세요');
    const p = progress('앨범에 들어가는 중…');
    try {
      const fam = await app.api.joinFamily({ code: c, ...who });
      app.user = app.api.user();
      dropInvite(app);
      await app.reloadFamilies();
      p.close();
      history.replaceState(null, '', location.pathname + '#/home');
      // 할머니·할아버지는 처음부터 큰 글씨로
      if (/^(외)?할(머니|아버지)$/.test(who.displayName)) app.setPref('textSize', 'large');
      await app.enterFamily(app.families.find((f) => f.id === fam.id) || fam);
      if (who.photo) await saveAvatarPhoto(app, who.photo).catch((err) => toast(err.message));
      toast(`환영해요, ${who.displayName}! 🎉`);
      if (!isStandalone()) setTimeout(() => suggestInstall(app), 600);
    } catch (err) {
      p.close();
      toast(err.message, 5000);
    }
  });
}

function showError(root, sel, msg) {
  const e = root.querySelector(sel);
  if (!e) return toast(msg);
  e.textContent = msg;
  e.hidden = false;
  e.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function dropInvite(app) {
  app.pendingInvite = null;
  if (location.search.includes('invite=')) history.replaceState(history.state, '', location.pathname + location.hash);
}

function suggestInstall(app) {
  sheet({
    title: '앱처럼 쓰시겠어요?',
    body: html`
      <p class="lead">홈 화면에 앱 아이콘을 만들어 두면 다음부터 <b>아이콘만 누르면</b> 바로 손주 사진을 볼 수 있어요.</p>
      <button class="btn primary big block" data-i="yes">${icon('phone')} 홈 화면에 설치하기</button>
      <button class="btn ghost big block" data-close>다음에 할게요</button>`,
    mount: (el, ctl) => el.querySelector('[data-i=yes]').addEventListener('click', () => {
      ctl.close();
      setTimeout(() => openInstall(app), 250);
    }),
  });
}

export function emailLogin(app) {
  sheet({
    title: '이메일로 로그인',
    body: html`
      <p class="lead">예전에 ‘계정 지키기’에서 연결한 이메일을 넣어 주세요.</p>
      <div data-step="1">
        <label class="field"><span>이메일</span><input type="email" data-e="email" autocomplete="email" placeholder="example@gmail.com"></label>
        <button class="btn primary big block" data-e="send">인증번호 받기</button>
      </div>
      <div data-step="2" hidden>
        <p class="note">메일로 온 <b>6자리 숫자</b>를 입력해 주세요. (메일 속 링크를 눌러도 돼요)</p>
        <label class="field"><span>인증번호</span><input inputmode="numeric" maxlength="10" data-e="code" class="code-input" placeholder="123456"></label>
        <button class="btn primary big block" data-e="verify">로그인</button>
      </div>`,
    mount: (el, ctl) => {
      let email = '';
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-e]');
        if (!b) return;
        try {
          if (b.dataset.e === 'send') {
            email = el.querySelector('[data-e=email]').value.trim();
            if (!/^\S+@\S+\.\S+$/.test(email)) return toast('이메일 주소를 확인해 주세요.');
            b.disabled = true;
            await app.api.sendLoginCode(email);
            el.querySelector('[data-step="1"]').hidden = true;
            el.querySelector('[data-step="2"]').hidden = false;
          } else {
            await app.api.verifyLoginCode(email, el.querySelector('[data-e=code]').value.replace(/\D/g, ''));
            app.user = app.api.user();
            ctl.close();
            await app.reloadFamilies();
            toast('다시 오신 걸 환영해요! 🎉');
            app.start();
          }
        } catch (err) {
          b.disabled = false;
          toast(err.message, 5000);
        }
      });
    },
  });
}
