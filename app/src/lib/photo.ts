// 올릴 사진 준비: 고를 때는 열리는지·크기만 확인하고, 올릴 때 한 장씩 줄여서 만들어요
// (사진을 미리 다 풀어 두지 않아서 여러 장이어도 휴대폰 메모리가 넉넉해요)
import { readPhotoDate } from './dates';
import { uuid } from './uuid';

const OUT_MAX = 1440;   // 올리는 사진 최대 크기 (확대해도 선명하게, 저장공간은 아끼면서)
const THUMB_MAX = 400;  // 모아보기용 작은 사진
const PH_MAX = 24;      // 불러오는 동안 보이는 흐린 자리표시

export interface PickedPhoto {
  id: string;
  /** 고른 원본 파일 (그대로 함께 올려요) */
  file: File;
  /** 미리보기 주소 (닫을 때 releasePhoto로 비워요) */
  url: string;
  w: number;
  h: number;
  takenAt: Date;
}

export interface ExportedPhoto { blob: Blob; thumb: Blob; w: number; h: number; ph: string }

const HEIF_MSG = '이 사진은 고효율(HEIF) 형식이라 이 브라우저에서 열 수 없어요. 카메라 설정에서 ‘고효율 사진’을 끄거나, 사파리·삼성 인터넷에서 올려 주세요.';
const BAD_MSG = '이 사진은 열 수 없어요. (지원하지 않는 형식이에요)';

const isHeif = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');

// 브라우저가 사진 방향(EXIF)을 맞춰서 열어 줘요
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(BAD_MSG));
    i.src = url;
  });
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// 다 쓴 캔버스는 크기를 0으로 (아이폰은 캔버스 메모리를 늦게 돌려줘요)
function free(...cs: HTMLCanvasElement[]) {
  for (const c of cs) { c.width = 0; c.height = 0; }
}

function drawScaled(src: CanvasImageSource, sw: number, sh: number, max: number) {
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = makeCanvas(sw * k, sh * k);
  const x = c.getContext('2d');
  if (!x) throw new Error('사진을 만들지 못했어요. 사진 수를 줄여 다시 해 보세요.');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((resolve, reject) => c.toBlob(
  (b) => (b ? resolve(b) : reject(new Error('사진을 만들지 못했어요. 사진 수를 줄여 다시 해 보세요.'))), 'image/jpeg', q,
));

/** 고른 사진 확인: 열리는지, 크기, 찍은 날 */
export async function loadPhoto(file: File): Promise<PickedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url).catch((e: Error) => {
      // 갤럭시의 '고효율 사진(HEIF)'은 크롬에서 열리지 않아요 → 무엇을 하면 되는지 알려 주기
      throw isHeif(file) ? new Error(HEIF_MSG) : e;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    img.src = '';
    if (!w || !h) throw new Error(BAD_MSG);
    return { id: uuid(), file, url, w, h, takenAt: await readPhotoDate(file) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** 올릴 사진 만들기: 본 사진(긴 변 1440px), 작은 사진(400px), 아주 작은 자리표시 */
export async function exportPhoto(p: PickedPhoto): Promise<ExportedPhoto> {
  const img = await loadImg(p.url).catch(() => { throw new Error(isHeif(p.file) ? HEIF_MSG : BAD_MSG); });
  try { await img.decode?.(); } catch { /* onload로 충분해요 */ }
  const main = drawScaled(img, img.naturalWidth, img.naturalHeight, OUT_MAX);
  img.src = '';
  let small: HTMLCanvasElement | null = null;
  let tiny: HTMLCanvasElement | null = null;
  try {
    const blob = await toBlob(main, 0.84);
    small = drawScaled(main, main.width, main.height, THUMB_MAX);
    const thumb = await toBlob(small, 0.78);
    tiny = drawScaled(small, small.width, small.height, PH_MAX);
    const ph = tiny.toDataURL('image/jpeg', 0.6);
    return { blob, thumb, w: main.width, h: main.height, ph };
  } finally {
    free(main, ...[small, tiny].filter((c): c is HTMLCanvasElement => !!c));
  }
}

/** 미리보기 주소 비우기 */
export function releasePhoto(p: PickedPhoto) {
  URL.revokeObjectURL(p.url);
}
