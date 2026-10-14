// 사진 보여주기(필요할 때만 불러오기)와 휴대폰에 저장하기

import { isIOS, isKakaoInApp, ymd } from './util.js';
import { toast, progress, sheet, menu, copyText } from './ui.js';
import { html } from './util.js';
import { icon } from './icons.js';

let api;
export function setMediaApi(a) { api = a; }

// 아주 작은 미리보기 그림(흐릿한 자리표시)이 안전한 형식인지 확인
export function safePh(ph) {
  return typeof ph === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(ph) ? ph : '';
}

const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { io.unobserve(e.target); load(e.target); }
    }
  }, { rootMargin: '600px 0px' })
  : null;

async function load(img) {
  const path = img.dataset.path;
  if (!path || img.dataset.loaded) return;
  img.dataset.loaded = '1';
  try {
    img.src = await api.photoURL(path);
    img.addEventListener('load', () => img.classList.add('ready'), { once: true });
  } catch {
    img.dataset.loaded = '';
    img.closest('.ph-box')?.classList.add('broken');
  }
}

// root 안의 <img data-path> 들을 화면에 가까워지면 불러오기
export function observeImages(root) {
  for (const img of root.querySelectorAll('img[data-path]:not([data-loaded])')) {
    io ? io.observe(img) : load(img);
  }
}

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([t, e]) => [e, t]));

// 원본 파일 이름: 올린 사람의 파일 이름(확장자 뺀 부분)은 살리고, 확장자는 항상 사진 형식으로
// (가족 누구든 이름을 '손주.apk' 같은 것으로 바꿔 놓아도 사진 파일로만 저장돼요)
function originalName(p, blob, fallback) {
  const ext = MIME_EXT[blob.type] || (EXT_MIME[(p.orig.split('.').pop() || '').toLowerCase()] && p.orig.split('.').pop().toLowerCase()) || 'jpg';
  const stem = String(p.origName || '').replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N} _()-]/gu, '').trim().slice(0, 60);
  return { name: `${stem || fallback}.${ext}`, type: MIME_EXT[blob.type] ? blob.type : EXT_MIME[ext] };
}

// 카카오톡 안의 브라우저는 사진 저장·보내기를 못 해요 → 휴대폰 브라우저로 열도록 안내 (성공했다고 속이지 않기)
function kakaoBlocked(what) {
  if (!isKakaoInApp()) return false;
  const code = window.ssukApp?.fam?.inviteCode;
  const url = `${location.origin}${location.pathname}${code ? `?invite=${code}` : ''}`;
  sheet({
    title: `카카오톡 안에서는 ${what}할 수 없어요`,
    body: html`
      <p class="lead">아래 버튼을 누르면 휴대폰 브라우저(크롬·사파리·삼성 인터넷)로 앨범이 열려요.
        거기서 한 번 더 들어온 뒤 ${what}해 주세요.</p>
      <button class="btn primary big block" data-ext>${icon('send')} 브라우저로 열기</button>
      <button class="btn ghost big block" data-close>닫기</button>`,
    mount: (el) => el.querySelector('[data-ext]').addEventListener('click', () => {
      location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    }),
  });
  return true;
}

// 사진 저장. original: true 이면 올린 사람이 찍은 그대로의 원본 파일
export async function savePhotos(photos, takenAt, { original = false } = {}) {
  if (kakaoBlocked('저장')) return;
  const day = ymd(takenAt || new Date()).replace(/-/g, '');
  const prog = photos.length > 1 || original ? progress(original ? '원본 사진을 받는 중…' : '사진을 받는 중…') : null;
  let cleaned = 0; // 관리자가 원본을 정리해서 없는 사진
  let noOrig = 0; // 처음부터 원본 없이 올린 사진
  try {
    const files = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      let blob = null;
      let name = `ssukssuk_${day}_${i + 1}.jpg`;
      let type = 'image/jpeg';
      if (original && p.orig) {
        try {
          blob = await api.originalBlob(p.orig);
          ({ name, type } = originalName(p, blob, `ssukssuk_${day}_${i + 1}_원본`));
        } catch (e) {
          if (!e.notFound) throw e; // 인터넷 문제면 일반 화질로 바꾸지 말고 다시 하게
          blob = null;
          cleaned++;
        }
      } else if (original) {
        noOrig++;
      }
      if (!blob) blob = await api.photoBlob(p.path);
      files.push(new File([blob], name, { type }));
      prog?.set((i + 1) / photos.length);
    }
    prog?.close();
    const notes = [cleaned && `${cleaned}장은 원본이 정리되어`, noOrig && `${noOrig}장은 원본 없이 올린 사진이라`].filter(Boolean);
    const done = () => toast(notes.length
      ? `저장했어요. (${notes.join(', ')} 일반 화질로 저장했어요)`
      : original ? '원본 화질로 저장했어요 👍' : isIOS() ? '사진을 저장했어요.' : '휴대폰에 저장했어요. (갤러리 > 다운로드 폴더)', 3500);
    // 아이폰: 공유 창의 '이미지 저장'으로 사진 앱에 저장 (원본의 찍은 날짜도 그대로)
    if (isIOS() && navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        return done();
      } catch (e) {
        if (e.name === 'AbortError') return;
        // 원본을 받느라 시간이 걸리면 아이폰이 공유 창을 막아요 → 한 번 더 눌러서 저장
        if (e.name === 'NotAllowedError') return readyToShare(files, done);
      }
    }
    downloadEach(files, done);
  } catch (e) {
    prog?.close();
    toast('사진을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
}

function readyToShare(files, done) {
  sheet({
    title: '사진이 준비됐어요',
    body: html`
      <p class="lead">아래 버튼을 누르고 <b>‘이미지 저장’</b>을 고르면 사진 앱에 저장돼요.</p>
      <button class="btn primary big block" data-share>${icon('download')} 사진 저장하기</button>`,
    mount: (el, ctl) => el.querySelector('[data-share]').addEventListener('click', async () => {
      try {
        await navigator.share({ files });
        ctl.close();
        done();
      } catch (e) {
        if (e.name !== 'AbortError') { ctl.close(); downloadEach(files, done); }
      }
    }),
  });
}

// 안드로이드·컴퓨터: 크롬은 버튼 한 번에 파일 하나만 받게 해요 (여러 개면 '차단'될 수 있어요)
// → 첫 장은 바로, 나머지는 [다음 사진 저장] 버튼을 누를 때마다 한 장씩
function downloadEach(files, done) {
  download(files[0]);
  if (files.length === 1) { done(); return; }
  let next = 1;
  const label = () => `다음 사진 저장 (${next + 1}/${files.length})`;
  const said = () => `${files.length}장 중 ${next}장을 저장했어요. 버튼을 눌러 다음 사진도 저장해 주세요.`;
  sheet({
    title: '사진 저장',
    body: html`
      <p class="lead" data-said>${said()}</p>
      <button class="btn primary big block" data-next>${icon('download')} <span>${label()}</span></button>
      <button class="btn ghost big block" data-close>그만 저장하기</button>`,
    mount: (el, ctl) => el.querySelector('[data-next]').addEventListener('click', () => {
      download(files[next++]);
      if (next >= files.length) { ctl.close(); done(); return; }
      el.querySelector('[data-next] span').textContent = label();
      el.querySelector('[data-said]').textContent = said();
    }),
  });
}

// 저장 버튼: 원본이 있으면 원본으로. 꾸민 사진이면 둘 중 고르기
export async function saveWithChoice(photos, takenAt) {
  if (!photos.some((p) => p.orig)) return savePhotos(photos, takenAt);
  if (!photos.some((p) => p.orig && p.dec)) return savePhotos(photos, takenAt, { original: true });
  const v = await menu([
    { label: '원본 사진 (꾸미기 전 · 가장 선명)', icon: 'image', value: 'orig' },
    { label: '꾸민 사진 (스티커·테두리 포함)', icon: 'sparkles', value: 'dec' },
  ], { title: '어떤 사진을 저장할까요?' });
  if (v) await savePhotos(photos, takenAt, { original: v === 'orig' });
}

// 카카오톡 등 다른 앱으로 사진 보내기
export async function sharePhotos(photos, text) {
  if (kakaoBlocked('보내기')) return;
  let files = null;
  try {
    const blobs = await Promise.all(photos.map((p) => api.photoBlob(p.path)));
    files = blobs.map((b, i) => new File([b], `ssukssuk_${i + 1}.jpg`, { type: 'image/jpeg' }));
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, text });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    // 사진을 받느라 시간이 걸리면 휴대폰이 공유 창을 막아요 → 준비된 뒤 한 번 더 누르게
    if (e.name === 'NotAllowedError' && files) {
      sheet({
        title: '사진이 준비됐어요',
        body: html`
          <p class="lead">아래 버튼을 누르고 카카오톡 같은 보낼 곳을 골라 주세요.</p>
          <button class="btn primary big block" data-share>${icon('send')} 사진 보내기</button>`,
        mount: (el, ctl) => el.querySelector('[data-share]').addEventListener('click', () => {
          navigator.share({ files, text }).then(() => ctl.close(), (err) => { if (err.name !== 'AbortError') toast('보내지 못했어요. [저장]으로 내려받아 보내 주세요.'); });
        }),
      });
      return;
    }
  }
  if (await copyText(text)) toast('글을 복사했어요. 사진은 [저장]으로 내려받아 보내 주세요.');
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
