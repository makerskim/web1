// 가족: 아기 프로필(인스타그램 프로필처럼) + 가족 목록. 설정은 [⚙ 설정] 창 안에.

import { html, fmtDate, babyAge, babyDay, babyMonths, isIOS, isAndroid, isStandalone, obj, subj, callName, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { sheet, menu, confirmBox, alertBox, toast, progress, closeAllOverlays, copyText } from '../ui.js';
import { clearCache, cacheCount } from '../photo-cache.js';
import { whoPicker, bindWho } from './who.js';
import * as Onboarding from './onboarding.js';
import * as Grid from './grid.js';
import { topBar, bindTop } from './feed.js';

export { copyText };
export const fmtCode = (c) => (c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c || '');
export const inviteLink = (code) => `${location.origin}${location.pathname}?invite=${code}`;
const fmtBytes = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)}GB` : `${Math.max(0.1, n / 1048576).toFixed(n < 10485760 ? 1 : 0)}MB`);

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
            ${icon('album', { size: 22 })}<span>${f.name}${f.myRole === 'owner' ? html` <small class="tag">관리자</small>` : ''}</span>
            ${f.id === app.fam.id ? icon('check', { cls: 'tick' }) : ''}
          </button>`)}
        <button class="menu-item" data-alb="create">${icon('plusSquare', { size: 22 })}<span>새 앨범 만들기</span></button>
        ${app.api.canInvite ? html`<button class="menu-item" data-alb="join">${icon('link', { size: 22 })}<span>초대 코드로 다른 앨범 들어가기</span></button>` : ''}
      </div>`,
    mount: (el) => el.addEventListener('click', async (e) => {
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

// ---------- 글자 크기 고르기 (가입 직후에도 보여 줘요) ----------
export function openTextSize(app, { onClose } = {}) {
  const sizes = [['normal', '보통', 17], ['large', '크게', 19.5], ['xlarge', '아주 크게', 22]];
  const baby = app.fam?.babyName || '아기';
  sheet({
    title: '글자 크기를 골라 주세요',
    onClose,
    body: html`
      <div class="size-pick">
        ${sizes.map(([k, label, px]) => html`
          <button class="size-opt ${app.prefs.textSize === k ? 'on' : ''}" data-size="${k}" aria-pressed="${app.prefs.textSize === k}">
            <span style="font-size:${px}px">${subj(callName(baby))} 웃어요 😊</span>
            <small>${label}</small>
          </button>`)}
      </div>
      <button class="btn primary big block" data-close>이대로 할게요</button>`,
    mount: (el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-size]');
      if (!b) return;
      app.setPref('textSize', b.dataset.size);
      el.querySelectorAll('[data-size]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
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

// ---------- 아기 정보 (관리자) ----------
function openAlbumEdit(app) {
  const f = app.fam;
  sheet({
    title: '아기 정보·앨범 이름',
    body: html`
      <label class="field"><span>아기 이름 (태명도 좋아요)</span><input data-a="baby" maxlength="20" value="${f.babyName}"></label>
      <label class="field"><span>생일 (태어나기 전이면 출산 예정일)</span><input type="date" data-a="bday" value="${f.babyBirthday || ''}"></label>
      <label class="field"><span>앨범 이름</span><input data-a="name" maxlength="40" value="${f.name}"></label>
      <button class="btn primary big block" data-save>저장하기</button>`,
    mount: (el) => el.querySelector('[data-save]').addEventListener('click', async () => {
      const name = el.querySelector('[data-a=name]').value.trim();
      if (!name) return toast('앨범 이름을 적어 주세요.');
      try {
        const upd = await app.api.updateFamily(f.id, {
          name, babyName: el.querySelector('[data-a=baby]').value.trim(), babyBirthday: el.querySelector('[data-a=bday]').value || null,
        });
        Object.assign(app.fam, { name: upd.name, babyName: upd.babyName, babyBirthday: upd.babyBirthday });
        await app.reloadFamilies().catch(() => {});
        toast('저장했어요.');
        app.go('#/family');
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
      <p class="lead">휴대폰을 바꾸거나 앱을 지워도 다시 들어올 수 있도록 <b>이메일을 연결</b>해 두세요. <b>앨범을 만든 분</b>께 꼭 권해 드려요.</p>
      <p class="note left">무료 Supabase는 <b>Supabase에 가입한 이메일</b>로만 인증 메일을 보낼 수 있어요. 다른 가족은 관리자로 지정해 두는 방법을 써 주세요.</p>
      <div data-step="1">
        <label class="field"><span>이메일</span><input type="email" data-e="email" autocomplete="email" placeholder="example@gmail.com"></label>
        <button class="btn primary big block" data-e="send">인증 메일 보내기</button>
      </div>
      <div data-step="2" hidden>
        <p class="note left">메일함에서 <b>6자리 숫자</b>를 확인해 입력해 주세요. (메일 속 링크를 눌러도 돼요)</p>
        <label class="field"><span>인증번호</span><input inputmode="numeric" maxlength="10" data-e="code" class="code-input" placeholder="123456"></label>
        <button class="btn primary big block" data-e="verify">확인</button>
      </div>`,
    mount: (el) => {
      let email = '';
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-e]');
        if (!b || b.tagName !== 'BUTTON') return;
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
            app.go('#/family');
          }
        } catch (err) {
          b.disabled = false;
          toast(err.message);
        }
      });
    },
  });
}

// ---------- 저장공간과 원본 정리 ----------
async function storageInfo(app) {
  try { return await app.api.storageUsage(); } catch { return null; }
}

function storageBar(info) {
  if (!info || !info.limit) return '';
  const pct = Math.min(100, Math.round((info.used / info.limit) * 100));
  return html`
    <div class="storage">
      <div class="storage-bar ${pct >= 80 ? 'warn' : ''}"><i style="width:${Math.max(2, pct)}%"></i></div>
      <p>${fmtBytes(info.used)} / ${fmtBytes(info.limit)} 사용 (${pct}%)${info.shared ? ' · 무료 저장공간' : ' · 이 휴대폰'}</p>
    </div>`;
}

async function openOriginalCleanup(app) {
  const p = progress('원본 사진을 세는 중…');
  let list = [];
  try {
    Grid.invalidate();
    list = await Grid.items(app);
  } catch (err) {
    p.close();
    return toast(err.message);
  }
  p.close();
  const now = Date.now();
  const options = [[3, '3개월'], [6, '6개월'], [12, '1년']].map(([m, label]) => {
    const before = new Date(now - m * 30.4 * 86400000).toISOString();
    const olds = list.filter((it) => it.orig && it.createdAt < before);
    return { m, label, count: olds.length, bytes: olds.reduce((n, it) => n + (it.origSize || 0), 0), paths: olds.map((it) => it.orig) };
  });

  const v = await menu(options.map((o) => ({
    label: `${o.label} 지난 사진의 원본 ${o.count}장${o.count ? ` (${fmtBytes(o.bytes)})` : ''}`,
    icon: 'trash',
    value: o.count ? o.m : null,
  })), { title: '오래된 원본 정리' });
  const o = options.find((x) => x.m === v);
  if (!o) return;
  const ok = await confirmBox({
    title: `원본 ${o.count}장을 지울까요?`,
    message: `${o.label} 지난 사진의 ‘원본 파일’만 지워져요. 앨범의 사진(꾸민 사진)은 그대로 남아요.\n필요한 원본은 먼저 [저장]으로 내려받아 두세요.`,
    ok: '원본 지우기',
    danger: true,
  });
  if (!ok) return;
  const pr = progress('원본을 정리하는 중…');
  try {
    await app.api.dropOriginals(app.fam.id, o.paths);
    Grid.invalidate();
    pr.close();
    toast(`원본 ${o.count}장을 정리했어요. (${fmtBytes(o.bytes)} 비움)`);
  } catch (err) {
    pr.close();
    toast(err.message);
  }
}

// ---------- 설정 창 ----------
async function openSettings(app) {
  const u = app.api.user();
  const cloud = app.api.mode === 'cloud';
  const owners = app.members.filter((m) => m.role === 'owner').length;
  const sizes = [['normal', '보통'], ['large', '크게'], ['xlarge', '아주 크게']];
  const row = (act, ic, label, sub = '', cls = '') => html`
    <button class="row ${cls}" data-f="${act}"><span class="row-ic">${ic}</span><span class="row-txt">${label}${sub ? html`<small>${sub}</small>` : ''}</span>${cls === 'danger' ? '' : icon('right', { size: 20 })}</button>`;
  sheet({
    title: '설정',
    cls: 'settings-sheet',
    body: html`
      <h3 class="group-h">나</h3>
      <div class="group">
        ${row('profile', html`<span class="avatar s36">${app.me.avatar}</span>`, '이름·얼굴 바꾸기', app.me.displayName)}
        ${cloud ? row('email', icon('shield', { size: 22 }), '계정 지키기', u?.email && !u.isAnonymous ? `${u.email} 연결됨` : '이메일 연결하기 (앨범 만든 분 권장)') : ''}
      </div>
      <h3 class="group-h">보기</h3>
      <div class="group">
        <div class="row static"><span class="row-ic">${icon('text', { size: 22 })}</span><span class="row-txt">글자 크기</span></div>
        <div class="seg" role="radiogroup" aria-label="글자 크기">
          ${sizes.map(([k, label]) => html`<button role="radio" aria-checked="${app.prefs.textSize === k}" class="${app.prefs.textSize === k ? 'on' : ''}" data-size="${k}">${label}</button>`)}
        </div>
        ${row('install', icon('phone', { size: 22 }), '홈 화면에 앱 설치하기', '앱처럼 아이콘으로 열기')}
      </div>
      <h3 class="group-h">저장공간</h3>
      <div class="group">
        <div class="row static col" data-storage><span class="row-txt">불러오는 중…</span></div>
        ${app.isOwner ? row('originals', icon('image', { size: 22 }), '오래된 원본 정리', '공간이 모자랄 때 · 꾸민 사진은 남아요') : ''}
        ${cloud ? row('cache', icon('download', { size: 22 }), '휴대폰에 보관된 사진 정리', '...') : ''}
      </div>
      ${app.isOwner ? html`
        <h3 class="group-h">앨범 관리 <small class="tag">관리자</small></h3>
        <div class="group">
          ${row('album', icon('edit', { size: 22 }), '아기 정보·앨범 이름 바꾸기')}
          ${cloud ? row('reset', icon('rotate', { size: 22 }), '초대 코드 새로 만들기', '예전 링크는 못 쓰게 돼요') : ''}
          ${row('delete', icon('trash', { size: 22 }), '앨범 지우기', '', 'danger')}
        </div>` : ''}
      <h3 class="group-h">기타</h3>
      <div class="group">
        ${row('albums', icon('album', { size: 22 }), '다른 앨범 보기·새로 만들기')}
        ${!app.isOwner || owners > 1 ? row('leave', icon('logout', { size: 22 }), '이 앨범에서 나가기', '', 'danger') : ''}
        ${cloud && u?.email && !u.isAnonymous ? row('logout', icon('logout', { size: 22 }), '로그아웃') : ''}
      </div>
      <p class="app-foot">🌱 쑥쑥 앨범 · ${cloud ? '가족 공유 모드' : '체험 모드 (이 기기에만 저장)'}</p>`,
    mount: (el) => {
      storageInfo(app).then((info) => {
        const s = el.querySelector('[data-storage]');
        if (s) s.innerHTML = info?.limit ? String(storageBar(info)) : '<span class="row-txt">이 기기에서는 사용량을 알 수 없어요</span>';
      });
      if (cloud) cacheCount().then((n) => { const c = el.querySelector('[data-f=cache] small'); if (c) c.textContent = `사진 ${n}개 보관 중 · 지워도 클라우드엔 그대로`; });
      el.addEventListener('click', async (e) => {
        const s = e.target.closest('[data-size]');
        if (s) {
          app.setPref('textSize', s.dataset.size);
          el.querySelectorAll('[data-size]').forEach((b) => { b.classList.toggle('on', b === s); b.setAttribute('aria-checked', String(b === s)); });
          return;
        }
        const b = e.target.closest('[data-f]');
        if (b) settingsAction(app, b.dataset.f);
      });
    },
  });
}

async function settingsAction(app, act) {
  const f = app.fam;
  if (act === 'profile') openProfile(app);
  if (act === 'email') openEmailLink(app);
  if (act === 'install') openInstall(app);
  if (act === 'album') openAlbumEdit(app);
  if (act === 'albums') openAlbumSwitcher(app);
  if (act === 'originals') openOriginalCleanup(app);
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
    if (!(await confirmBox({ title: `‘${f.name}’${obj(f.name).slice(f.name.length)} 지울까요?`, message: '모든 사진과 댓글이 가족 모두에게서 영원히 사라져요.', ok: '지우기', danger: true }))) return;
    if (!(await confirmBox({ title: '정말 지울까요?', message: '되돌릴 수 없어요. 필요한 사진은 먼저 휴대폰에 저장해 두세요.', ok: '영원히 지우기', danger: true }))) return;
    const p = progress('앨범을 지우는 중…');
    try {
      await app.api.deleteFamily(f);
      localStorage.removeItem(`ssuk-snap-${f.id}`);
      p.close();
      await closeAllOverlays();
      toast('앨범을 지웠어요.');
      app.restart();
    } catch (err) { p.close(); toast(err.message); }
  }
  if (act === 'leave') {
    if (!(await confirmBox({ title: '이 앨범에서 나갈까요?', message: '다시 들어오려면 초대 링크가 필요해요.', ok: '나가기', danger: true }))) return;
    try {
      await app.api.leaveFamily(f.id);
      localStorage.removeItem(`ssuk-snap-${f.id}`);
      await closeAllOverlays();
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
      if (!(await confirmBox({ title: `‘${m.displayName}’${obj(m.displayName).slice(m.displayName.length)} 앨범에서 내보낼까요?`, message: '다시 들어오려면 초대 링크가 필요해요.', ok: '내보내기', danger: true }))) return;
      await app.api.removeMember(app.fam.id, m.userId);
      toast('내보냈어요.');
    }
    if (v) { await app.reloadMembers(); app.go('#/family'); }
  } catch (err) { toast(err.message); }
}

// ---------- 화면: 아기 프로필 ----------
export async function render(app, view) {
  app.setTop(topBar(app, html`<button class="top-btn" data-top="settings">${icon('settings', { size: 22 })}<span>설정</span></button>`));
  bindTop(app, (e) => { if (e.target.closest('[data-top=settings]')) openSettings(app); });
  const f = app.fam;
  const b = f.babyBirthday;
  const day = b ? babyDay(b) : null;
  const months = b ? babyMonths(b) : null;
  const ageStat = day === null ? null : day < 1 ? { n: `D-${1 - day}`, l: '출산' } : { n: `${day}일`, l: '생후' };
  const bio = b ? `${fmtDate(b, false)} ${day < 1 ? '출산 예정' : '출생'}${day >= 1 ? ` · ${months < 24 ? `${months}개월` : babyAge(b)}` : ''}` : '';

  view.innerHTML = String(html`
    <div class="profile">
      <div class="pf-head">
        <div class="pf-avatar">👶</div>
        <div class="pf-stats">
          <button class="stat" data-f="grid"><b data-stat="photos">–</b><span>사진</span></button>
          <button class="stat" data-f="members"><b>${app.members.length}</b><span>가족</span></button>
          ${ageStat ? html`<div class="stat"><b>${ageStat.n}</b><span>${ageStat.l}</span></div>` : ''}
        </div>
      </div>
      <div class="pf-bio">
        <b>${f.babyName || f.name}</b>
        ${bio ? html`<p>${bio}</p>` : ''}
        ${!b && app.isOwner ? html`<button class="link-btn" data-f="album">아기 생일 넣기 <small>(사진마다 ‘생후 며칠’이 표시돼요)</small></button>` : ''}
      </div>
      <div class="pf-btns">
        <button class="btn ghost" data-f="invite">${icon('users', { size: 20 })} 가족 초대하기</button>
        <button class="btn ghost" data-f="textsize"><span class="aa">가</span> 글자 크기</button>
      </div>
      ${app.api.canInvite ? '' : html`<div class="notice">🧪 <b>체험 모드</b>예요. 사진이 이 기기에만 저장되고 가족과 공유되지 않아요. 설명서(README)를 따라 무료 클라우드를 연결하면 가족 모두 함께 볼 수 있어요.</div>`}
      <div class="storage-warn" data-storage-warn hidden></div>

      <h2 class="list-h" id="members">우리 가족 ${app.members.length}명</h2>
      <ul class="member-list">
        ${app.members.map((m) => html`
          <li>
            <span class="avatar s44">${m.avatar}</span>
            <span class="m-name">${m.displayName}
              ${m.userId === app.user.id ? html`<small class="tag">나</small>` : ''}
              ${m.role === 'owner' ? html`<small class="tag">${icon('crown', { size: 12 })} 관리자</small>` : ''}
              ${m.joinedAt ? html`<small class="m-sub">${timeAgo(m.joinedAt)} 들어옴</small>` : ''}</span>
            ${app.isOwner && m.userId !== app.user.id ? html`<button class="icon-btn" data-member="${m.userId}" aria-label="${m.displayName} 관리">${icon('more')}</button>` : ''}
          </li>`)}
      </ul>
    </div>`);
  window.scrollTo(0, 0);

  Grid.items(app).then((list) => {
    const s = view.querySelector('[data-stat=photos]');
    if (s) s.textContent = String(list.length);
  }).catch(() => {});

  // 관리자에게만: 저장공간이 80% 넘으면 알려 주기
  if (app.isOwner && app.api.mode === 'cloud') {
    storageInfo(app).then((info) => {
      const w = view.querySelector('[data-storage-warn]');
      if (!w || !info || info.used / info.limit < 0.8) return;
      w.hidden = false;
      w.innerHTML = String(html`<p><b>저장공간이 ${Math.round((info.used / info.limit) * 100)}% 찼어요.</b> [설정 → 오래된 원본 정리]로 공간을 비울 수 있어요.</p>${storageBar(info)}`);
    });
  }

  view.onclick = async (e) => {
    const mb = e.target.closest('[data-member]');
    if (mb) return memberMenu(app, app.members.find((m) => m.userId === mb.dataset.member));
    const b2 = e.target.closest('[data-f]');
    if (!b2) return;
    const act = b2.dataset.f;
    if (act === 'invite') openInvite(app);
    if (act === 'textsize') openTextSize(app);
    if (act === 'album') openAlbumEdit(app);
    if (act === 'grid') app.go('#/grid');
    if (act === 'members') document.getElementById('members')?.scrollIntoView({ behavior: 'smooth' });
  };
}
