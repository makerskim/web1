// 올릴 사진·동영상 준비: 고를 때는 열리는지·크기만 확인하고, 올릴 때 한 장씩 줄여서 만들어요
// (사진을 미리 다 풀어 두지 않아서 여러 장이어도 휴대폰 메모리가 넉넉해요)
// 동영상은 파일을 그대로 올리고, 첫 장면을 사진으로 만들어 미리보기에 써요
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
  /** 동영상이면 길이(초) */
  video?: { dur: number };
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

export const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|3gp)$/i.test(f.name || '');

// 동영상 요소가 준비될 때까지 (못 열면 null)
function waitFor(v: HTMLVideoElement, ev: string, ms: number) {
  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => { clearTimeout(t); v.removeEventListener(ev, yes); v.removeEventListener('error', no); resolve(ok); };
    const yes = () => done(true);
    const no = () => done(false);
    const t = setTimeout(() => done(false), ms);
    v.addEventListener(ev, yes);
    v.addEventListener('error', no);
  });
}
function videoEl(url: string) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  v.src = url;
  return v;
}
const dropVideo = (v: HTMLVideoElement) => { v.removeAttribute('src'); v.load(); };

async function loadVideo(file: File): Promise<PickedPhoto> {
  const url = URL.createObjectURL(file);
  const v = videoEl(url);
  // 이 브라우저가 못 여는 형식(예: 일부 아이폰 동영상)이어도 올릴 수 있어요 → 크기·길이만 모를 뿐
  const ok = await waitFor(v, 'loadedmetadata', 10000);
  const w = ok ? v.videoWidth : 0, h = ok ? v.videoHeight : 0;
  const dur = ok && Number.isFinite(v.duration) ? v.duration : 0;
  dropVideo(v);
  return { id: uuid(), file, url, w: w || 1080, h: h || 1920, takenAt: new Date(file.lastModified || Date.now()), video: { dur } };
}

/** 고른 사진 확인: 열리는지, 크기, 찍은 날 (동영상은 크기·길이) */
export async function loadPhoto(file: File): Promise<PickedPhoto> {
  if (isVideoFile(file)) return loadVideo(file);
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

// 동영상 첫 장면 (1초쯤, 짧으면 가운데). 못 그리면 null
async function videoFrame(p: PickedPhoto): Promise<HTMLCanvasElement | null> {
  const v = videoEl(p.url);
  try {
    if (!(await waitFor(v, 'loadeddata', 10000)) || !v.videoWidth) return null;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    v.currentTime = Math.min(1, dur / 2 || 0.1);
    await waitFor(v, 'seeked', 6000);
    return drawScaled(v, v.videoWidth, v.videoHeight, OUT_MAX);
  } catch {
    return null;
  } finally {
    dropVideo(v);
  }
}
// 장면을 못 그리는 동영상: 파스텔 바탕에 ▶
function videoPlaceholder(w: number, h: number) {
  const k = Math.min(1, OUT_MAX / Math.max(w, h));
  const c = makeCanvas(w * k, h * k);
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, '#ffe3ea');
  g.addColorStop(1, '#ece4fb');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  const r = Math.min(c.width, c.height) * 0.12;
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.beginPath(); x.arc(c.width / 2, c.height / 2, r, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#d4688b';
  x.beginPath();
  x.moveTo(c.width / 2 - r * 0.32, c.height / 2 - r * 0.45);
  x.lineTo(c.width / 2 + r * 0.5, c.height / 2);
  x.lineTo(c.width / 2 - r * 0.32, c.height / 2 + r * 0.45);
  x.closePath(); x.fill();
  return c;
}

/** 올릴 사진 만들기: 본 사진(긴 변 1440px), 작은 사진(400px), 아주 작은 자리표시 (동영상은 첫 장면으로) */
export async function exportPhoto(p: PickedPhoto): Promise<ExportedPhoto> {
  let main: HTMLCanvasElement;
  if (p.video) {
    main = (await videoFrame(p)) || videoPlaceholder(p.w, p.h);
  } else {
    const img = await loadImg(p.url).catch(() => { throw new Error(isHeif(p.file) ? HEIF_MSG : BAD_MSG); });
    try { await img.decode?.(); } catch { /* onload로 충분해요 */ }
    main = drawScaled(img, img.naturalWidth, img.naturalHeight, OUT_MAX);
    img.src = '';
  }
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
