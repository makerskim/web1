// 휴대폰에 저장하기 · 다른 앱으로 보내기
import { confirm, menu, progress, toast, copyText } from '../components/ui';
import { fetchFile, photoBlob } from './storage';
import { isIOS, isKakaoInApp } from './device';
import { ymd } from './dates';
import type { PhotoMeta } from './types';

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

// 원본 이름은 살리되 확장자는 항상 사진 형식으로
function originalName(p: PhotoMeta, blob: Blob, fallback: string) {
  const ext = MIME_EXT[blob.type] || 'jpg';
  const stem = String(p.origName || '').replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N} _()-]/gu, '').trim().slice(0, 60);
  return { name: `${stem || fallback}.${ext}`, type: MIME_EXT[blob.type] ? blob.type : 'image/jpeg' };
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

export async function savePhotos(albumId: string, photos: PhotoMeta[], takenAt: string, original = false) {
  if (kakaoBlocked()) return;
  const day = ymd(takenAt).replace(/-/g, '');
  const prog = photos.length > 1 || original ? progress(original ? '원본을 받는 중' : '사진을 받는 중') : null;
  let cleaned = 0;
  let noOrig = 0;
  try {
    const files: File[] = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      let blob: Blob | null = null;
      let name = `pastel_${day}_${i + 1}.jpg`;
      let type = 'image/jpeg';
      if (original && p.orig) {
        try {
          blob = await fetchFile(albumId, p.orig);
          ({ name, type } = originalName(p, blob, `pastel_${day}_${i + 1}_original`));
        } catch (e) {
          if (!(e as { notFound?: boolean }).notFound) throw e;
          cleaned++;
        }
      } else if (original) noOrig++;
      if (!blob) blob = await photoBlob(albumId, p.path);
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

// 원본이 있으면 원본으로, 꾸민 사진이면 둘 중 고르기
export async function saveWithChoice(albumId: string, photos: PhotoMeta[], takenAt: string) {
  if (!photos.some((p) => p.orig)) return savePhotos(albumId, photos, takenAt);
  if (!photos.some((p) => p.orig && p.dec)) return savePhotos(albumId, photos, takenAt, true);
  const v = await menu([
    { label: '원본 사진', value: 'orig', icon: 'image' },
    { label: '꾸민 사진', value: 'dec', icon: 'sparkles' },
  ], '어떤 사진을 저장할까요?');
  if (v) await savePhotos(albumId, photos, takenAt, v === 'orig');
}

export async function sharePhotos(albumId: string, photos: PhotoMeta[], text: string) {
  if (kakaoBlocked()) return;
  let files: File[] | null = null;
  try {
    const blobs = await Promise.all(photos.map((p) => photoBlob(albumId, p.path)));
    files = blobs.map((b, i) => new File([b], `pastel_${i + 1}.jpg`, { type: 'image/jpeg' }));
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
