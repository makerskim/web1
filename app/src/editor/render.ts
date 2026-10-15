// 사진 꾸미기: 배치 계산, 그리기, 내보내기
// 화면에 보이는 그대로(필터·스티커·글씨·테두리) 한 장의 사진으로 만들어 올립니다.
import { babyAge, fmtDots, readPhotoDate } from '../lib/dates';
import { filterById, applyFilter, drawVignette, scaleFilter, hasAdjust, adjustFilter } from './filters';
import { EMOJI_FONT, fontById, frameById, loadFont, type Frame } from './decor';

const MAX_SRC = 2048;   // 편집용 원본 최대 크기
const OUT_MAX = 1440;   // 올리는 사진 최대 크기 (인스타그램은 1080px — 무료 저장공간을 아끼면서 확대해도 선명하게)

export const ASPECTS: { id: string; name: string; r?: number }[] = [
  { id: 'orig', name: '원본' },
  { id: '1:1', name: '정사각형', r: 1 },
  { id: '4:5', name: '세로 4:5', r: 0.8 },
  { id: '16:9', name: '가로 16:9', r: 16 / 9 },
];
const LABEL_FONT = '"Gowun Dodum", "Pretendard Variable", sans-serif';
const CAPTION_FONT = '"Gowun Batang", "Pretendard Variable", serif';

// ---------- 타입 ----------
interface ItemBase {
  id: string;
  /** 사진 안 위치 (0~1) */
  x: number;
  y: number;
  scale: number;
  /** 라디안 */
  rot: number;
  /** 마지막으로 그린 크기 (사진 폭 기준 비율, 손가락 판정용) */
  bw?: number;
  bh?: number;
}
export interface EmojiItem extends ItemBase { kind: 'emoji'; text: string }
export interface LabelItem extends ItemBase { kind: 'label'; text: string; bg: string; fg: string }
export interface TextItem extends ItemBase { kind: 'text'; text: string; font: string; color: string; box: boolean }
export type Item = EmojiItem | LabelItem | TextItem;

interface RotCache { rot: number; c: HTMLCanvasElement }
interface FilterCache { key: string; c: HTMLCanvasElement; k: number }

export interface EditPhoto {
  file: File;
  src: HTMLCanvasElement;
  takenAt: Date;
  filter: string;
  strength?: number;
  adj?: Record<string, number>;
  rot: number;
  aspect: string;
  cx: number;
  cy: number;
  frame: string;
  frameText: string | null;
  stamp: boolean;
  items: Item[];
  _flt?: unknown;
  _rot?: unknown;
}

export interface Layout {
  r: HTMLCanvasElement;
  rw: number; rh: number;
  /** 잘라 쓰는 원본 영역 */
  sx: number; sy: number; sw: number; sh: number;
  unit: number;
  /** 캔버스 안 사진 자리 */
  px: number; py: number; pw: number; ph: number;
  W: number; H: number;
  canPan: boolean;
}

export interface RenderOpts { baby?: string | null; selected?: string | null; cache?: boolean }

// ---------- 사진 불러오기 ----------
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('이 사진은 열 수 없어요. (지원하지 않는 형식이에요)'));
    i.src = url;
  });
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const ctx2d = (c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings) => c.getContext('2d', opts) as CanvasRenderingContext2D;

const isHeif = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');

export async function loadPhoto(file: File): Promise<EditPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url).catch((e: Error) => {
      // 갤럭시의 '고효율 사진(HEIF)'은 크롬에서 열리지 않아요 → 무엇을 하면 되는지 알려 주기
      if (isHeif(file)) {
        throw new Error('이 사진은 고효율(HEIF) 형식이라 이 브라우저에서 열 수 없어요. 카메라 설정에서 ‘고효율 사진’을 끄거나, 사파리·삼성 인터넷에서 올려 주세요.');
      }
      throw e;
    });
    const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
    const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
    const x = ctx2d(c);
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    return {
      file, // 원본 파일 (원본 화질로 올리기용)
      src: c, takenAt: await readPhotoDate(file),
      filter: 'none', rot: 0, aspect: 'orig', cx: 0.5, cy: 0.5,
      frame: 'none', frameText: null, stamp: false, items: [],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- 배치 계산 ----------
function rotated(p: EditPhoto): HTMLCanvasElement {
  if (!p.rot) return p.src;
  const cached = p._rot as RotCache | undefined;
  if (cached?.rot === p.rot) return cached.c;
  const s = p.src;
  const swap = p.rot % 180 !== 0;
  const c = makeCanvas(swap ? s.height : s.width, swap ? s.width : s.height);
  const x = ctx2d(c);
  x.translate(c.width / 2, c.height / 2);
  x.rotate((p.rot * Math.PI) / 180);
  x.drawImage(s, -s.width / 2, -s.height / 2);
  p._rot = { rot: p.rot, c } satisfies RotCache;
  return c;
}

export function layout(p: EditPhoto, maxSide: number): Layout {
  const r = rotated(p);
  const rw = r.width;
  const rh = r.height;
  const a = ASPECTS.find((x) => x.id === p.aspect)?.r || rw / rh;
  let sw = rw;
  let sh = rh;
  if (rw / rh > a) sw = rh * a; else sh = rw / a;
  const [pS, pT, pB] = frameById(p.frame).pad;
  const uw = 1 + 2 * pS;
  const uh = sh / sw + pT + pB;
  const unit = Math.min(maxSide / Math.max(uw, uh), sw);
  return {
    r, rw, rh, sw, sh, unit,
    sx: (rw - sw) * p.cx, sy: (rh - sh) * p.cy,
    pw: unit, ph: (unit * sh) / sw, px: unit * pS, py: unit * pT,
    W: Math.round(unit * uw), H: Math.round(unit * uh),
    canPan: rw - sw > 2 || rh - sh > 2,
  };
}

const strengthOf = (p: EditPhoto) => (p.strength ?? 100) / 100;

function filtered(p: EditPhoto, L: Layout, cache: boolean): FilterCache {
  const f = filterById(p.filter);
  const t = strengthOf(p);
  const a = p.adj || {};
  const adj = hasAdjust(a);
  const k = L.pw / L.sw;
  const w = Math.max(1, Math.round(L.rw * k));
  const h = Math.max(1, Math.round(L.rh * k));
  const key = `${p.rot}|${f.id}|${t}|${a.bright | 0},${a.contrast | 0},${a.sat | 0},${a.warm | 0}|${w}x${h}`;
  const prev = p._flt as FilterCache | null | undefined;
  if (cache && prev?.key === key) return prev;
  const c = makeCanvas(w, h);
  const busy = f.id !== 'none' || adj;
  const x = ctx2d(c, { willReadFrequently: busy });
  x.imageSmoothingQuality = 'high';
  x.drawImage(L.r, 0, 0, w, h);
  if (busy) {
    const d = x.getImageData(0, 0, w, h);
    if (f.id !== 'none' && t > 0) applyFilter(d, scaleFilter(f, t));
    if (adj) applyFilter(d, adjustFilter(a));
    x.putImageData(d, 0, 0);
  }
  const out: FilterCache = { key, c, k: w / L.rw };
  if (cache) p._flt = out;
  return out;
}

// ---------- 그리기 ----------
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const luma = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const isLight = (hex: string) => luma(hex) > 170;

export function labelText(text: string, p: EditPhoto, baby: string | null | undefined): string {
  return text
    .replace('{age}', (baby && babyAge(baby, p.takenAt, { short: true })) || '오늘의 기록')
    .replace('{date}', fmtDots(p.takenAt));
}

export function captionText(p: EditPhoto, baby: string | null | undefined): string {
  if (p.frameText !== null && p.frameText !== undefined) return p.frameText;
  const age = baby ? babyAge(baby, p.takenAt, { short: true }) : '';
  return `${fmtDots(p.takenAt)}${age ? `  ·  ${age}` : ''}`;
}

function drawPattern(ctx: CanvasRenderingContext2D, fr: Frame, L: Layout) {
  const m = Math.min(L.px, L.py, L.H - L.py - L.ph);
  const size = m * 0.55;
  const step = size * 1.7;
  const ch = fr.emoji || fr.glyph || '';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fr.emoji ? `${size}px ${EMOJI_FONT}` : `700 ${size}px "Pretendard Variable", sans-serif`;
  ctx.fillStyle = fr.glyphColor || '#fff';
  const put = (x: number, y: number, i: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((i % 3) - 1) * 0.25);
    ctx.globalAlpha = fr.emoji ? 1 : 0.85;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  };
  let i = 0;
  const nx = Math.max(2, Math.floor(L.W / step));
  for (let k = 0; k <= nx; k++) {
    const x = (L.W / nx) * k;
    put(x, L.py / 2, i++);
    put(x, L.H - (L.H - L.py - L.ph) / 2, i++);
  }
  const ny = Math.max(2, Math.floor(L.ph / step));
  for (let k = 1; k < ny; k++) {
    const y = L.py + (L.ph / ny) * k;
    put(L.px / 2, y, i++);
    put(L.W - L.px / 2, y, i++);
  }
  ctx.restore();
}

function drawFilm(ctx: CanvasRenderingContext2D, L: Layout) {
  const band = L.py;
  const hw = L.unit * 0.04;
  const hh = band * 0.32;
  const step = L.unit * 0.085;
  ctx.save();
  ctx.fillStyle = '#E9E4DA';
  for (let x = step / 2; x < L.W; x += step) {
    rr(ctx, x - hw / 2, band / 2 - hh / 2, hw, hh, hw * 0.25); ctx.fill();
    rr(ctx, x - hw / 2, L.H - band / 2 - hh / 2, hw, hh, hw * 0.25); ctx.fill();
  }
  ctx.fillStyle = '#F5A623';
  ctx.font = `700 ${band * 0.16}px "Courier New", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('SSUKSSUK 200', L.px, band * 0.86);
  ctx.textAlign = 'right';
  ctx.fillText('▶ 12', L.W - L.px, L.H - band * 0.86);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, p: EditPhoto, L: Layout, baby: string | null | undefined) {
  const text = captionText(p, baby);
  if (!text) return;
  const bottom = L.H - L.py - L.ph;
  let size = L.unit * 0.075;
  ctx.save();
  ctx.font = `700 ${size}px ${CAPTION_FONT}`;
  const tw = ctx.measureText(text).width;
  if (tw > L.pw * 0.94) { size *= (L.pw * 0.94) / tw; ctx.font = `700 ${size}px ${CAPTION_FONT}`; }
  ctx.fillStyle = '#5A4E44';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, L.W / 2, L.py + L.ph + bottom * 0.48);
  ctx.restore();
}

// 필름 카메라처럼 오른쪽 아래 주황색 날짜
function drawStamp(ctx: CanvasRenderingContext2D, p: EditPhoto, L: Layout) {
  const d = p.takenAt instanceof Date && !isNaN(+p.takenAt) ? p.takenAt : new Date();
  const t = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}`;
  const size = L.pw * 0.058;
  ctx.save();
  ctx.font = `700 ${size}px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(255,110,0,0.8)';
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = '#FFB347';
  ctx.fillText(t, L.px + L.pw - L.pw * 0.045, L.py + L.ph - L.pw * 0.035);
  ctx.restore();
}

/** 그린 뒤 [폭, 높이] (px) */
function drawEmoji(ctx: CanvasRenderingContext2D, it: EmojiItem, L: Layout): [number, number] {
  const size = L.pw * 0.16 * it.scale;
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.fillText(it.text, 0, size * 0.05);
  return [Math.max(ctx.measureText(it.text).width, size * 0.8), size * 1.05];
}

function drawLabel(ctx: CanvasRenderingContext2D, it: LabelItem, L: Layout, p: EditPhoto, baby: string | null | undefined): [number, number] {
  const text = labelText(it.text, p, baby);
  const size = L.pw * 0.058 * it.scale;
  ctx.font = `400 ${size}px ${LABEL_FONT}`;
  const w = ctx.measureText(text).width + size * 1.4;
  const h = size * 1.9;
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = size * 0.4;
  ctx.shadowOffsetY = size * 0.08;
  ctx.fillStyle = it.bg;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = it.fg;
  ctx.fillText(text, 0, size * 0.07);
  return [w, h];
}

function drawText(ctx: CanvasRenderingContext2D, it: TextItem, L: Layout): [number, number] {
  const f = fontById(it.font);
  const size = L.pw * 0.075 * it.scale * f.k;
  ctx.font = `${f.weight} ${size}px ${f.family}`;
  const lines = it.text.split('\n');
  const lh = size * 1.15;
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), size);
  const w = tw + (it.box ? size * 1.1 : size * 0.4);
  const h = lh * lines.length + (it.box ? size * 0.7 : size * 0.2);
  const lineY = (i: number) => (i - (lines.length - 1) / 2) * lh + size * 0.05;
  let color = it.color;
  if (it.box) {
    ctx.fillStyle = it.color;
    rr(ctx, -w / 2, -h / 2, w, h, size * 0.4);
    ctx.fill();
    color = isLight(it.color) ? '#222222' : '#FFFFFF';
  } else {
    // 어떤 사진 위에서도 읽히도록 테두리
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = luma(it.color) > 200 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.95)';
    lines.forEach((l, i) => ctx.strokeText(l, 0, lineY(i)));
  }
  ctx.fillStyle = color;
  lines.forEach((l, i) => ctx.fillText(l, 0, lineY(i)));
  return [w, h];
}

function drawSelection(ctx: CanvasRenderingContext2D, L: Layout, w: number, h: number) {
  const pad = L.pw * 0.015;
  ctx.lineWidth = Math.max(2, L.pw * 0.005);
  ctx.setLineDash([L.pw * 0.02, L.pw * 0.012]);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
  ctx.lineDashOffset = L.pw * 0.016;
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
}

function drawItem(ctx: CanvasRenderingContext2D, it: Item, L: Layout, p: EditPhoto, baby: string | null | undefined, selected: boolean) {
  ctx.save();
  ctx.translate(L.px + it.x * L.pw, L.py + it.y * L.ph);
  ctx.rotate(it.rot || 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const [w, h] = it.kind === 'emoji' ? drawEmoji(ctx, it, L)
    : it.kind === 'label' ? drawLabel(ctx, it, L, p, baby)
      : drawText(ctx, it, L);
  it.bw = w / L.pw;
  it.bh = h / L.pw;
  if (selected) drawSelection(ctx, L, w, h);
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, p: EditPhoto, L: Layout, { baby = null, selected = null, cache = true }: RenderOpts = {}) {
  const fr = frameById(p.frame);
  ctx.save();
  ctx.clearRect(0, 0, L.W, L.H);
  if (fr.gradient) {
    const g = ctx.createLinearGradient(0, 0, L.W, L.H);
    fr.gradient.forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);
  } else if (fr.bg) {
    ctx.fillStyle = fr.bg;
    ctx.fillRect(0, 0, L.W, L.H);
  }
  if (fr.glyph || fr.emoji) drawPattern(ctx, fr, L);
  const F = filtered(p, L, cache);
  ctx.drawImage(F.c, L.sx * F.k, L.sy * F.k, L.sw * F.k, L.sh * F.k, L.px, L.py, L.pw, L.ph);
  drawVignette(ctx, L.px, L.py, L.pw, L.ph, (filterById(p.filter).vignette || 0) * strengthOf(p));
  if (fr.film) drawFilm(ctx, L);
  if (fr.caption) drawCaption(ctx, p, L, baby);
  if (p.stamp) drawStamp(ctx, p, L);
  for (const it of p.items) drawItem(ctx, it, L, p, baby, it.id === selected);
  ctx.restore();
}

/** 사진에 쓰인 웹 글씨체를 미리 받아 둡니다 (안 그러면 기본 글씨체로 그려져요) */
export async function ensureFonts(p: EditPhoto, baby: string | null): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const it of p.items) {
    if (it.kind === 'label') jobs.push(loadFont('400 40px "Gowun Dodum"', labelText(it.text, p, baby)));
    if (it.kind === 'text') {
      const f = fontById(it.font);
      jobs.push(loadFont(`${f.weight} 40px ${f.family}`, it.text));
    }
  }
  if (frameById(p.frame).caption) jobs.push(loadFont('700 40px "Gowun Batang"', captionText(p, baby)));
  await Promise.all(jobs);
}

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((resolve, reject) => c.toBlob(
  (b) => (b ? resolve(b) : reject(new Error('사진을 만들지 못했어요. 사진 수를 줄여 다시 해 보세요.'))), 'image/jpeg', q,
));

function scaled(src: HTMLCanvasElement, max: number) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = makeCanvas(src.width * k, src.height * k);
  const x = ctx2d(c);
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** 필터·스티커·테두리·자르기 등을 하나라도 했는지 */
export function isDecorated(p: EditPhoto): boolean {
  return p.filter !== 'none' || hasAdjust(p.adj) || p.frame !== 'none' || p.items.length > 0
    || p.stamp || p.rot !== 0 || p.aspect !== 'orig';
}

/** 꾸민 모습 그대로 작게 그립니다 (긴 변이 size px) */
export function drawPreview(canvas: HTMLCanvasElement, p: EditPhoto, size: number, babyBirthday: string | null): void {
  const l = layout(p, size);
  canvas.width = l.W;
  canvas.height = l.H;
  render(ctx2d(canvas), p, l, { baby: babyBirthday, cache: false });
}

/** drawPreview를 새 캔버스에 */
export function makeThumb(p: EditPhoto, size: number, babyBirthday: string | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  drawPreview(c, p, size, babyBirthday);
  return c;
}

/** 올릴 사진 만들기: 본 사진, 작은 사진(모아보기용), 아주 작은 자리표시 */
export async function exportPhoto(p: EditPhoto, babyBirthday: string | null): Promise<{ blob: Blob; thumb: Blob; w: number; h: number; ph: string; dec: boolean }> {
  await ensureFonts(p, babyBirthday);
  const L = layout(p, OUT_MAX);
  const c = makeCanvas(L.W, L.H);
  render(ctx2d(c), p, L, { baby: babyBirthday, cache: false });
  const blob = await toBlob(c, 0.84);
  const thumb = await toBlob(scaled(c, 400), 0.78);
  const ph = scaled(c, 24).toDataURL('image/jpeg', 0.6);
  return { blob, thumb, w: L.W, h: L.H, ph, dec: isDecorated(p) };
}
