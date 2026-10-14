// 사진 보여주기(필요할 때만 불러오기)와 휴대폰에 저장하기

import { isIOS, ymd } from './util.js';
import { toast } from './ui.js';

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

export async function savePhotos(photos, takenAt) {
  const name = (i) => `ssukssuk_${ymd(takenAt || new Date()).replace(/-/g, '')}_${i + 1}.jpg`;
  try {
    const blobs = await Promise.all(photos.map((p) => api.photoBlob(p.path)));
    const files = blobs.map((b, i) => new File([b], name(i), { type: 'image/jpeg' }));
    // 아이폰: 공유 창의 '이미지 저장'으로 사진 앱에 저장
    if (isIOS() && navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    files.forEach((f, i) => setTimeout(() => download(f), i * 400));
    toast(isIOS() ? '사진을 저장했어요.' : '휴대폰에 저장했어요. (갤러리 > 다운로드 폴더)');
  } catch (e) {
    toast('사진을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
