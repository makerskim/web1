// 가족: 초대하기, 가족 목록, 내 정보, 글자 크기, 앱 설치, 앨범 관리

import { html, fmtDate, babyAge, isIOS, isAndroid, isStandalone } from '../util.js';
import { icon } from '../icons.js';
import { sheet, menu, confirmBox, alertBox, toast, progress, closeAllOverlays } from '../ui.js';
import { clearCache, cacheCount } from '../photo-cache.js';
import { whoPicker, bindWho } from './who.js';
import * as Onboarding from './onboarding.js';

export const fmtCode = (c) => (c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c || '');
export const inviteLink = (code) => `${location.origin}${location.pathname}?invite=${code}`;

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

// ---------- 가족 초대 ----------
export function openInvite(app, { welcome = false } = {}) {
  if (!app.api.canInvite) {
    return alertBox('체험 모드에서는 가족을 초대할 수 없어요.\n설명서(README)를 따라 무료 클라우드를 연결하면 가족과 함께 볼 수 있어요.', '체험 모드');
  }
  const code = app.fam.inviteCode;
  const link = inviteLink(code);
  const baby = app.fam.babyName;
  const msg = `👶 ${baby ? `${baby} ` : ''}사진 보러 오세요!\n'${app.fam.name}'에 초대합니다.\n아래 링크를 누르면 바로 들어올 수 있어요.\n\n${link}`;
  sheet({
    title: welcome ? '앨범이 만들어졌어요 🎉' : '가족 초대하기',
    body: html`
      <p class="lead">${welcome ? '이제 가족을 초대해 보세요! ' : ''}카카오톡이나 문자로 <b>초대 링크</b>를 보내면, 링크를 누르는 것만으로 바로 들어올 수 있어요.</p>
      <button class="btn primary big block" data-inv="share">${icon('send')} 초대 링크 보내기</button>
      <button class="btn soft big block" data-inv="copy">${icon('copy')} 링크 복사하기</button>
      <div class="code-box">
        <span>초대 코드</span>
        <strong>${fmtCode(code)}</strong>
        <small>링크가 안 열리면 앱의 ‘초대 코드로 들어가기’에 이 코드를 입력하면 돼요.</small>
      </div>`,
    mount: (el) => el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-inv]');
      if (!b) return;
      if (b.dataset.inv === 'share' && navigator.share) {
        try { await navigator.share({ text: msg }); return; } catch (err) { if (err.name === 'AbortError') return; }
      }
      toast((await copyText(b.dataset.inv === 'share' ? msg : link))
        ? '복사했어요. 카카오톡 대화창에 붙여넣기 해 주세요.' : '복사하지 못했어요. 코드를 직접 알려 주세요.');
    }),
  });
}

// ---------- 앨범 바꾸기 ----------
export function openAlbumSwitcher(app) {
  sheet({
    title: '앨범',
    body: html`
      <div class="menu-list">
        ${app.families.map((f) => html`
          <button class="menu-item ${f.id === app.fam.id ? 'on' : ''}" data-fam="${f.id}">
            <span class="logo-sm">🌱</span><span>${f.name}${f.myRole === 'owner' ? html` <small class="tag">관리자</small>` : ''}</span>
            ${f.id === app.fam.id ? icon('check', { cls: 'tick' }) : ''}
          </button>`)}
        <button class="menu-item" data-alb="create">${icon('plusSquare')}<span>새 앨범 만들기</span></button>
        ${app.api.canInvite ? html`<button class="menu-item" data-alb="join">${icon('link')}<span>초대 코드로 다른 앨범 들어가기</span></button>` : ''}
      </div>`,
    mount: (el, ctl) => el.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-fam]');
      if (f) {
        const fam = app.families.find((x) => x.id === f.dataset.fam);
        await closeAllOverlays();
        if (fam && fam.id !== app.fam.id) { app.enterFamily(fam); location.hash = '#/home'; }
        return;
      }
      const a = e.target.closest('[data-alb]');
      if (!a) return;
      await closeAllOverlays();
      const back = () => app.enterFamily(app.fam);
      if (a.dataset.alb === 'create') Onboarding.create(app, { onCancel: back });
      else Onboarding.join(app, '', { onCancel: back });
    }),
  });
}

// ---------- 내 이름·얼굴 ----------
function openProfile(app) {
  const init = { name: app.me.displayName, avatar: app.me.avatar };
  sheet({
    title: '내 이름·얼굴 바꾸기',
    body: html`${whoPicker(init)}<button class="btn primary big block" data-save>저장하기</button>`,
    mount: (el, ctl) => {
      const get = bindWho(el, init);
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = get();
        if (!v.displayName) return toast('이름을 적어 주세요.');
        try {
          await app.api.updateMe(app.fam.id, v);
          await app.reloadMembers();
          await app.reloadFamilies().catch(() => {});
          toast('바꿨어요.');
          app.go('#/family'); // 창을 닫고 화면 새로 그리기
        } catch (err) { toast(err.message); }
      });
    },
  });
}

// ---------- 앨범 정보 (관리자) ----------
function openAlbumEdit(app) {
  const f = app.fam;
  sheet({
    title: '아기 정보·앨범 이름',
    body: html`
      <label class="field"><span>아기 이름 (태명도 좋아요)</span><input data-a="baby" maxlength="20" value="${f.babyName}"></label>
      <label class="field"><span>생일 (태어나기 전이면 출산 예정일)</span><input type="date" data-a="bday" value="${f.babyBirthday || ''}"></label>
      <label class="field"><span>앨범 이름</span><input data-a="name" maxlength="40" value="${f.name}"></label>
      <button class="btn primary big block" data-save>저장하기</button>`,
    mount: (el, ctl) => el.querySelector('[data-save]').addEventListener('click', async () => {
      const name = el.querySelector('[data-a=name]').value.trim();
      if (!name) return toast('앨범 이름을 적어 주세요.');
      try {
        const upd = await app.api.updateFamily(f.id, {
          name, babyName: el.querySelector('[data-a=baby]').value.trim(), babyBirthday: el.querySelector('[data-a=bday]').value || null,
        });
        Object.assign(app.fam, { name: upd.name, babyName: upd.babyName, babyBirthday: upd.babyBirthday });
        await app.reloadFamilies().catch(() => {});
        toast('저장했어요.');
        app.go('#/family'); // 창을 닫고 화면 새로 그리기
      } catch (err) { toast(err.message); }
    }),
  });
}

// ---------- 홈 화면에 설치 ----------
export async function openInstall(app) {
  if (isStandalone()) return alertBox('이미 앱으로 설치해서 쓰고 계세요 👍');
  if (app.installPrompt) {
    app.installPrompt.prompt();
    const r = await app.installPrompt.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') { app.installPrompt = null; toast('설치했어요! 홈 화면의 🌱 아이콘으로 열어 보세요.'); }
    return;
  }
  const code = app.fam?.inviteCode;
  const iosNote = app.api.canInvite && code
    ? html`<p class="note">📌 아이폰은 설치한 앱을 처음 열 때 <b>초대 코드 ${fmtCode(code)}</b>를 한 번 더 입력해야 할 수 있어요. 미리 적어 두세요.</p>` : '';
  sheet({
    title: '홈 화면에 앱 설치하기',
    body: isIOS()
      ? html`
        <p class="lead">설치하면 앱처럼 아이콘을 눌러 바로 열 수 있어요. (무료)</p>
        <ol class="steps">
          <li><b>사파리(Safari)</b>로 이 화면을 열어 주세요.</li>
          <li>화면 아래쪽 <span class="kbd">${icon('share', { size: 18 })} 공유</span> 버튼을 눌러요.</li>
          <li>목록을 올려서 <span class="kbd">${icon('plusSquare', { size: 18 })} 홈 화면에 추가</span>를 눌러요.</li>
          <li>오른쪽 위 <span class="kbd">추가</span>를 누르면 끝!</li>
        </ol>${iosNote}`
      : html`
        <p class="lead">설치하면 앱처럼 아이콘을 눌러 바로 열 수 있어요. (무료)</p>
        <ol class="steps">
          <li><b>크롬(Chrome)</b>이나 <b>삼성 인터넷</b>으로 이 화면을 열어 주세요.</li>
          <li>오른쪽 위(또는 아래) <span class="kbd">⋮</span> 또는 <span class="kbd">≡</span> 메뉴를 눌러요.</li>
          <li><span class="kbd">홈 화면에 추가</span> 또는 <span class="kbd">앱 설치</span>를 눌러요.</li>
        </ol>
        ${isAndroid() ? '' : html`<p class="note">컴퓨터에서는 주소창 오른쪽의 설치 아이콘을 눌러도 돼요.</p>`}`,
  });
}

// ---------- 이메일 연결 (기기를 바꿔도 다시 들어오기) ----------
function openEmailLink(app) {
  const u = app.api.user();
  if (u?.email && !u.isAnonymous) {
    return alertBox(`${u.email} 이메일이 연결되어 있어요.\n\n휴대폰을 바꾸면 첫 화면의 ‘이메일로 로그인’으로 다시 들어올 수 있어요.`, '계정이 안전해요 🛡️');
  }
  sheet({
    title: '계정 지키기',
    body: html`
      <p class="lead">휴대폰을 바꾸거나 앱을 지워도 다시 들어올 수 있도록 <b>이메일을 연결</b>해 두세요. 특히 <b>앨범을 만든 분</b>께 꼭 권해 드려요.</p>
      <div data-step="1">
        <label class="field"><span>이메일</span><input type="email" data-e="email" autocomplete="email" placeholder="example@gmail.com"></label>
        <button class="btn primary big block" data-e="send">인증 메일 보내기</button>
      </div>
      <div data-step="2" hidden>
        <p class="note">메일함에서 <b>6자리 숫자</b>를 확인해 입력해 주세요. (메일 속 링크를 눌러도 돼요)</p>
        <label class="field"><span>인증번호</span><input inputmode="numeric" maxlength="10" data-e="code" class="code-input" placeholder="123456"></label>
        <button class="btn primary big block" data-e="verify">확인</button>
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
            await app.api.linkEmail(email);
            el.querySelector('[data-step="1"]').hidden = true;
            el.querySelector('[data-step="2"]').hidden = false;
          }
          if (b.dataset.e === 'verify') {
            const code = el.querySelector('[data-e=code]').value.replace(/\D/g, '');
            await app.api.verifyLinkEmail(email, code);
            app.user = app.api.user();
            toast('이메일을 연결했어요. 이제 계정이 안전해요 🛡️');
            app.go('#/family'); // 창을 닫고 화면 새로 그리기
          }
        } catch (err) {
          b.disabled = false;
          toast(err.message);
        }
      });
    },
  });
}

// ---------- 가족 한 명 관리 (관리자) ----------
async function memberMenu(app, m) {
  const items = [
    m.role === 'owner'
      ? { label: '관리자에서 빼기', icon: 'crown', value: 'member' }
      : { label: '관리자로 지정', icon: 'crown', value: 'owner' },
    { label: '앨범에서 내보내기', icon: 'logout', value: 'remove', danger: true },
  ];
  const v = await menu(items, { title: m.displayName });
  try {
    if (v === 'owner' || v === 'member') {
      await app.api.setRole(app.fam.id, m.userId, v);
      toast(v === 'owner' ? '관리자로 지정했어요.' : '관리자에서 뺐어요.');
    }
    if (v === 'remove') {
      if (!(await confirmBox({ title: `${m.displayName}님을 내보낼까요?`, message: '다시 들어오려면 초대 링크가 필요해요.', ok: '내보내기', danger: true }))) return;
      await app.api.removeMember(app.fam.id, m.userId);
      toast('내보냈어요.');
    }
    if (v) { await app.reloadMembers(); app.go('#/family'); }
  } catch (err) { toast(err.message); }
}

// ---------- 화면 ----------
export async function render(app, view) {
  app.setTop(html`<h1 class="top-title">우리 가족</h1>`);
  document.getElementById('topbar').onclick = null;
  const f = app.fam;
  const u = app.api.user();
  const cloud = app.api.mode === 'cloud';
  const owners = app.members.filter((m) => m.role === 'owner').length;
  const sizes = [['normal', '보통'], ['large', '크게'], ['xlarge', '아주 크게']];

  view.innerHTML = String(html`
    <div class="family-page">
      <section class="baby-card">
        <div class="baby-avatar">👶</div>
        <div class="baby-info">
          <h2>${f.babyName || f.name}</h2>
          ${f.babyBirthday ? html`<p>${fmtDate(f.babyBirthday, false)} 출생</p><p class="age">${babyAge(f.babyBirthday)}</p>`
            : html`<p>${app.isOwner ? '아기 생일을 넣으면 사진마다 ‘생후 며칠’이 표시돼요.' : f.name}</p>`}
        </div>
      </section>

      ${app.api.canInvite
        ? html`<button class="btn primary big block" data-f="invite">${icon('users')} 가족 초대하기</button>`
        : html`<div class="notice">🧪 <b>체험 모드</b>예요. 사진이 이 기기에만 저장되고 가족과 공유되지 않아요. 설명서(README)를 따라 무료 클라우드를 연결하면 가족 모두 함께 볼 수 있어요.</div>`}

      <section class="card">
        <h3>우리 가족 <span>${app.members.length}명</span></h3>
        <ul class="member-list">
          ${app.members.map((m) => html`
            <li>
              <span class="avatar">${m.avatar}</span>
              <span class="m-name">${m.displayName}
                ${m.userId === app.user.id ? html`<small class="tag me">나</small>` : ''}
                ${m.role === 'owner' ? html`<small class="tag">관리자</small>` : ''}</span>
              ${app.isOwner && m.userId !== app.user.id ? html`<button class="icon-btn" data-member="${m.userId}" aria-label="${m.displayName} 관리">${icon('more')}</button>` : ''}
            </li>`)}
        </ul>
      </section>

      <section class="card">
        <h3>나</h3>
        <button class="row" data-f="profile"><span class="avatar sm">${app.me.avatar}</span><span>이름·얼굴 바꾸기 <small>${app.me.displayName}</small></span>${icon('right')}</button>
        ${cloud ? html`<button class="row" data-f="email">${icon('shield')}<span>계정 지키기 <small>${u?.email && !u.isAnonymous ? `${u.email} 연결됨` : '이메일 연결하기 (권장)'}</small></span>${icon('right')}</button>` : ''}
      </section>

      <section class="card">
        <h3>보기 설정</h3>
        <div class="row static"><span>글자 크기</span></div>
        <div class="seg" role="radiogroup" aria-label="글자 크기">
          ${sizes.map(([k, label]) => html`<button role="radio" aria-checked="${app.prefs.textSize === k}" class="${app.prefs.textSize === k ? 'on' : ''}" data-size="${k}">${label}</button>`)}
        </div>
        <button class="row" data-f="install">${icon('phone')}<span>홈 화면에 앱 설치하기 <small>앱처럼 아이콘으로 열기</small></span>${icon('right')}</button>
      </section>

      ${app.isOwner ? html`
        <section class="card">
          <h3>앨범 관리 <small class="tag">관리자</small></h3>
          <button class="row" data-f="album">${icon('edit')}<span>아기 정보·앨범 이름 바꾸기</span>${icon('right')}</button>
          ${cloud ? html`<button class="row" data-f="reset">${icon('rotate')}<span>초대 코드 새로 만들기 <small>예전 링크는 못 쓰게 돼요</small></span>${icon('right')}</button>` : ''}
          <button class="row danger" data-f="delete">${icon('trash')}<span>앨범 지우기</span></button>
        </section>` : ''}

      <section class="card">
        <h3>기타</h3>
        <button class="row" data-f="albums">${icon('album')}<span>다른 앨범 보기·새로 만들기</span>${icon('right')}</button>
        ${cloud ? html`<button class="row" data-f="cache">${icon('image')}<span>휴대폰에 보관된 사진 정리 <small data-cache-count>…</small></span>${icon('right')}</button>` : ''}
        ${!app.isOwner || owners > 1 ? html`<button class="row danger" data-f="leave">${icon('logout')}<span>이 앨범에서 나가기</span></button>` : ''}
        ${cloud && u?.email && !u.isAnonymous ? html`<button class="row" data-f="logout">${icon('logout')}<span>로그아웃</span></button>` : ''}
      </section>

      <p class="app-foot">🌱 쑥쑥 앨범 · ${cloud ? '가족 공유 모드' : '체험 모드 (이 기기에만 저장)'}</p>
    </div>`);

  if (cloud) cacheCount().then((n) => { const c = view.querySelector('[data-cache-count]'); if (c) c.textContent = `${n}개 보관 중`; });

  view.onclick = async (e) => {
    const s = e.target.closest('[data-size]');
    if (s) {
      app.setPref('textSize', s.dataset.size);
      view.querySelectorAll('[data-size]').forEach((b) => {
        b.classList.toggle('on', b === s);
        b.setAttribute('aria-checked', String(b === s));
      });
      return;
    }
    const mb = e.target.closest('[data-member]');
    if (mb) return memberMenu(app, app.members.find((m) => m.userId === mb.dataset.member));
    const b = e.target.closest('[data-f]');
    if (!b) return;
    const act = b.dataset.f;
    if (act === 'invite') openInvite(app);
    if (act === 'profile') openProfile(app);
    if (act === 'email') openEmailLink(app);
    if (act === 'install') openInstall(app);
    if (act === 'album') openAlbumEdit(app);
    if (act === 'albums') openAlbumSwitcher(app);
    if (act === 'reset') {
      if (!(await confirmBox({ title: '초대 코드를 새로 만들까요?', message: '지금까지 보낸 초대 링크로는 더 이상 들어올 수 없어요. (이미 들어온 가족은 그대로예요)', ok: '새로 만들기' }))) return;
      try {
        app.fam.inviteCode = await app.api.resetInvite(f.id);
        await app.reloadFamilies().catch(() => {});
        openInvite(app);
      } catch (err) { toast(err.message); }
    }
    if (act === 'cache') {
      if (!(await confirmBox({ title: '보관된 사진을 정리할까요?', message: '휴대폰 공간이 늘어나요. 사진은 클라우드에 그대로 있고, 다시 볼 때 새로 받아요.', ok: '정리하기' }))) return;
      await clearCache();
      toast('정리했어요.');
      app.go('#/family');
    }
    if (act === 'delete') {
      if (!(await confirmBox({ title: `‘${f.name}’을 지울까요?`, message: '모든 사진과 댓글이 가족 모두에게서 영원히 사라져요.', ok: '지우기', danger: true }))) return;
      if (!(await confirmBox({ title: '정말 지울까요?', message: '되돌릴 수 없어요. 필요한 사진은 먼저 휴대폰에 저장해 두세요.', ok: '영원히 지우기', danger: true }))) return;
      const p = progress('앨범을 지우는 중…');
      try {
        await app.api.deleteFamily(f);
        localStorage.removeItem(`ssuk-snap-${f.id}`);
        p.close();
        toast('앨범을 지웠어요.');
        app.restart();
      } catch (err) { p.close(); toast(err.message); }
    }
    if (act === 'leave') {
      if (!(await confirmBox({ title: '이 앨범에서 나갈까요?', message: '다시 들어오려면 초대 링크가 필요해요.', ok: '나가기', danger: true }))) return;
      try {
        await app.api.leaveFamily(f.id);
        localStorage.removeItem(`ssuk-snap-${f.id}`);
        app.restart();
      } catch (err) { toast(err.message); }
    }
    if (act === 'logout') {
      if (!(await confirmBox({ title: '로그아웃할까요?', message: '다시 들어오려면 ‘이메일로 로그인’을 해야 해요.', ok: '로그아웃' }))) return;
      await app.api.signOut();
      Object.keys(localStorage).filter((k) => k.startsWith('ssuk-snap-') || k === 'ssuk-families' || k === 'ssuk-fam').forEach((k) => localStorage.removeItem(k));
      await clearCache();
      location.replace(location.pathname);
    }
  };
}

