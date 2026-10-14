// 사진 보여주기(필요할 때만 불러오기)와 휴대폰에 저장하기

import { isIOS, ymd } from './util.js';
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

// 사진 저장. original: true 이면 올린 사람이 찍은 그대로의 원본 파일
export async function savePhotos(photos, takenAt, { original = false } = {}) {
  const day = ymd(takenAt || new Date()).replace(/-/g, '');
  const prog = photos.length > 1 || original ? progress(original ? '원본 사진을 받는 중…' : '사진을 받는 중…') : null;
  let fellBack = 0;
  try {
    const files = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      let blob = null;
      let name = `ssukssuk_${day}_${i + 1}.jpg`;
      if (original && p.orig) {
        try {
          blob = await api.originalBlob(p.orig);
          const ext = MIME_EXT[blob.type] || (p.orig.split('.').pop() || 'jpg');
          name = /\.[a-z0-9]{2,5}$/i.test(p.origName || '') ? p.origName : `ssukssuk_${day}_${i + 1}_원본.${ext}`;
        } catch {
          blob = null; // 원본이 정리됐으면 일반 화질로
        }
      }
      if (!blob) {
        if (original) fellBack++;
        blob = await api.photoBlob(p.path);
      }
      files.push(new File([blob], name, { type: blob.type || 'image/jpeg' }));
      prog?.set((i + 1) / photos.length);
    }
    prog?.close();
    const done = () => toast(fellBack
      ? `저장했어요. (${fellBack}장은 원본이 정리되어 일반 화질로 저장했어요)`
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
    files.forEach((f, i) => setTimeout(() => download(f), i * 400));
    done();
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
        if (e.name !== 'AbortError') { files.forEach(download); ctl.close(); }
      }
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
  try {
    const blobs = await Promise.all(photos.map((p) => api.photoBlob(p.path)));
    const files = blobs.map((b, i) => new File([b], `ssukssuk_${i + 1}.jpg`, { type: 'image/jpeg' }));
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
