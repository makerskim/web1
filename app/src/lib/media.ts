// 휴대폰에 저장하기 · 다른 앱으로 보내기
import { confirm, progress, toast, copyText } from '../components/ui';
import { fetchFile, photoBlob } from './storage';
import { isIOS, isKakaoInApp } from './device';
import { ymd } from './dates';
import type { PhotoMeta } from './types';

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

/** 내려받는 파일 이름에 쓸 것: 올린 사람 · 앨범 이름 */
export interface SaveName { who: string; album: string }

// 파일 이름: '아빠_씩씩이&튼튼이네앨범_20261020' (내려받은 날, 여러 장이면 _1, _2 …)
// 글자 단위로 잘라요 (이모지가 반으로 잘리지 않게), 보이지 않는 글자도 빼요
const clean = (v: string) => Array.from(v.replace(/[\\/:*?"<>|\u0000-\u001f\uFFFD]/g, '').replace(/\p{Cf}/gu, '').replace(/\s+/g, '')).slice(0, 30).join('');
function fileName(n: SaveName | undefined, i: number, count: number, blob: Blob) {
  const day = ymd(new Date()).replace(/-/g, '');
  const stem = [clean(n?.who || ''), clean(n?.album || ''), day].filter(Boolean).join('_') + (count > 1 ? `_${i + 1}` : '');
  const ext = MIME_EXT[blob.type] || 'jpg';
  return { name: `${stem}.${ext}`, type: MIME_EXT[blob.type] ? blob.type : 'image/jpeg' };
}

function download(file: File) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// 크롬은 한 번 누를 때 파일 하나만 받게 해서, 여러 장이면 한 장씩 눌러 저장해요
async function downloadEach(files: File[]) {
  download(files[0]);
  for (let i = 1; i < files.length; i++) {
    const ok = await confirm({ title: `${files.length}장 중 ${i}장 저장했어요`, message: '다음 사진도 저장할까요?', ok: `다음 사진 저장 (${i + 1}/${files.length})`, cancel: '그만' });
    if (!ok) return false;
    download(files[i]);
  }
  return true;
}

function kakaoBlocked() {
  if (!isKakaoInApp() || isIOS()) return false;
  confirm({ title: '카카오톡 안에서는 저장할 수 없어요', message: '휴대폰 브라우저(크롬·삼성 인터넷)로 열어서 저장해 주세요.', ok: '브라우저로 열기' })
    .then((ok) => { if (ok) location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`; });
  return true;
}

export async function savePhotos(albumId: string, photos: PhotoMeta[], naming?: SaveName, original = false) {
  if (kakaoBlocked()) return;
  const prog = photos.length > 1 || original ? progress(original ? '원본을 받는 중' : '사진을 받는 중') : null;
  let cleaned = 0;
  let noOrig = 0;
  try {
    const files: File[] = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      let blob: Blob | null = null;
      if (original && p.orig) {
        try {
          blob = await fetchFile(albumId, p.orig);
        } catch (e) {
          if (!(e as { notFound?: boolean }).notFound) throw e;
          cleaned++;
        }
      } else if (original) noOrig++;
      if (!blob) blob = await photoBlob(albumId, p.path);
      const { name, type } = fileName(naming, i, photos.length, blob);
      files.push(new File([blob], name, { type }));
      prog?.set((i + 1) / photos.length);
    }
    prog?.close();
    const notes = [cleaned && `${cleaned}장은 원본이 정리되어`, noOrig && `${noOrig}장은 원본이 없어`].filter(Boolean);
    const done = () => toast(notes.length ? `저장했어요 · ${notes.join(', ')} 일반 화질로 저장했어요` : original ? '원본 화질로 저장했어요' : '사진을 저장했어요');
    if (isIOS() && navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        return done();
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if ((e as Error).name === 'NotAllowedError') {
          // 받는 데 시간이 걸리면 아이폰이 공유 창을 막아요 → 한 번 더 눌러서
          if (await confirm({ title: '사진이 준비됐어요', message: '‘이미지 저장’을 누르면 사진 앱에 저장돼요.', ok: '저장하기' })) {
            try { await navigator.share({ files }); done(); } catch { /* 취소 */ }
          }
          return;
        }
      }
    }
    if (await downloadEach(files)) done();
  } catch {
    prog?.close();
    toast('사진을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
}

// 내려받기는 언제나 원본으로 (원본이 없는 사진만 그 사진을 일반 화질로 받고 알려 줘요)
export async function saveWithChoice(albumId: string, photos: PhotoMeta[], naming?: SaveName) {
  return savePhotos(albumId, photos, naming, photos.some((p) => p.orig));
}

export async function sharePhotos(albumId: string, photos: PhotoMeta[], text: string, naming?: SaveName) {
  if (kakaoBlocked()) return;
  let files: File[] | null = null;
  try {
    const blobs = await Promise.all(photos.map((p) => photoBlob(albumId, p.path)));
    files = blobs.map((b, i) => { const f = fileName(naming, i, blobs.length, b); return new File([b], f.name, { type: f.type }); });
    if (navigator.canShare?.({ files })) { await navigator.share({ files, text }); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    if ((e as Error).name === 'NotAllowedError' && files) {
      if (await confirm({ title: '사진이 준비됐어요', ok: '보내기' })) navigator.share({ files, text }).catch(() => {});
      return;
    }
  }
  if (await copyText(text)) toast('글을 복사했어요. 사진은 [저장]으로 내려받아 보내 주세요.');
}
