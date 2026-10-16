// 사진 필터 (모든 휴대폰에서 똑같이 보이도록 직접 색을 계산합니다)

export interface Filter {
  id: string;
  name?: string;
  fade?: number;
  sat?: number;
  bright?: number;
  contrast?: number;
  warm?: number;
  tint?: [number, number, number];
  gray?: number;
  sepia?: number;
  vignette?: number;
}

export const FILTERS: Filter[] = [
  { id: 'none', name: '원본' },
  { id: 'pastel', name: '파스텔', fade: 0.1, sat: 0.84, bright: 1.05, contrast: 0.92, tint: [8, 2, 10] },
  { id: 'peach', name: '피치', warm: 10, tint: [10, 2, -2], fade: 0.06, bright: 1.03, sat: 0.95 },
  { id: 'lavender', name: '라벤더', tint: [6, -3, 14], sat: 0.88, fade: 0.06, bright: 1.02 },
  { id: 'mint', name: '민트', tint: [-6, 8, 4], sat: 0.9, fade: 0.06, bright: 1.03 },
  { id: 'milk', name: '우유빛', bright: 1.08, contrast: 0.86, fade: 0.1, sat: 0.9 },
  { id: 'soft', name: '뽀샤시', bright: 1.07, contrast: 0.9, sat: 0.92, fade: 0.05, tint: [6, 2, 4] },
  { id: 'warm', name: '따뜻하게', warm: 16, sat: 1.06, contrast: 1.02 },
  { id: 'vivid', name: '화사하게', sat: 1.28, contrast: 1.08, bright: 1.03 },
  { id: 'cool', name: '시원하게', warm: -14, bright: 1.03, sat: 1.02 },
  { id: 'cream', name: '크림', fade: 0.09, warm: 9, sat: 0.86, contrast: 0.92, bright: 1.02 },
  { id: 'pink', name: '분홍빛', tint: [14, -2, 6], bright: 1.04, sat: 0.96 },
  { id: 'mono', name: '흑백', gray: 1, contrast: 1.1 },
  { id: 'film', name: '추억', sepia: 0.42, fade: 0.07, contrast: 0.95, vignette: 0.35 },
];

export const filterById = (id: string): Filter => FILTERS.find((f) => f.id === id) || FILTERS[0];

// 필터 강도 (0~1): 모든 값을 '원본' 쪽으로 섞어요
export function scaleFilter(f: Filter, t: number): Filter {
  if (t >= 1 || f.id === 'none') return f;
  const one = (v?: number) => (v === undefined ? undefined : 1 + (v - 1) * t);
  const lin = (v?: number) => (v === undefined ? undefined : v * t);
  return {
    ...f, contrast: one(f.contrast), bright: one(f.bright), sat: one(f.sat),
    fade: lin(f.fade), warm: lin(f.warm), gray: lin(f.gray), sepia: lin(f.sepia), vignette: lin(f.vignette),
    tint: f.tint && (f.tint.map((x) => x * t) as [number, number, number]),
  };
}

// 조정: 밝기·대비·채도·따뜻함·빛바램·비네트 (-50 ~ 50, 0이 원래대로)
export type AdjustId = 'bright' | 'contrast' | 'sat' | 'warm' | 'fade' | 'vignette';
export const ADJUSTS: { id: AdjustId; name: string }[] = [
  { id: 'bright', name: '밝기' }, { id: 'contrast', name: '대비' }, { id: 'sat', name: '채도' },
  { id: 'warm', name: '따뜻함' }, { id: 'fade', name: '빛바램' }, { id: 'vignette', name: '비네트' },
];
/** 픽셀 색을 바꾸는 조정 (비네트는 그 위에 따로 그려요) */
const PIXEL_ADJUSTS: AdjustId[] = ['bright', 'contrast', 'sat', 'warm', 'fade'];
export const hasAdjust = (a?: Record<string, number> | null): boolean => !!a && ADJUSTS.some((x) => a[x.id]);
export const hasPixelAdjust = (a?: Record<string, number> | null): boolean => !!a && PIXEL_ADJUSTS.some((x) => a[x]);
export const adjustKey = (a?: Record<string, number> | null): string => PIXEL_ADJUSTS.map((x) => (a?.[x] || 0) | 0).join(',');
export function adjustFilter(a: Record<string, number>): Filter {
  return {
    id: 'adjust', bright: 1 + (a.bright || 0) / 250, contrast: 1 + (a.contrast || 0) / 200,
    sat: 1 + (a.sat || 0) / 100, warm: (a.warm || 0) / 2.5, fade: (a.fade || 0) / 250,
  };
}
/** 비네트 세기: 양수는 가장자리를 어둡게, 음수는 하얗게 */
export const adjustVignette = (a?: Record<string, number> | null): number => (a?.vignette || 0) / 75;

// 밝기·대비·색 바꾸기를 미리 계산해 둔 표(LUT)
function luts(f: Filter): Uint8ClampedArray[] {
  const out = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const c = f.contrast ?? 1;
  const b = f.bright ?? 1;
  const fade = f.fade ?? 0;
  const warm = f.warm ?? 0;
  const tint = f.tint || [0, 0, 0];
  const shift = [warm * 0.8 + tint[0], tint[1] + warm * 0.15, -warm + tint[2]];
  for (let ch = 0; ch < 3; ch++) {
    for (let v = 0; v < 256; v++) {
      let x = (v - 128) * c + 128;
      x *= b;
      x += shift[ch];
      // 빛바램: 양수는 어두운 곳을 밝게 띄우고, 음수는 더 진하게
      x = fade >= 0 ? x * (1 - fade) + 255 * fade : (x + 255 * fade) / (1 + fade);
      out[ch][v] = x;
    }
  }
  return out;
}

// ImageData를 그 자리에서 바꿉니다
export function applyFilter(img: ImageData, f: Filter | null): ImageData {
  if (!f || f.id === 'none') return img;
  const d = img.data;
  const [lr, lg, lb] = luts(f);
  const sat = f.sat ?? 1;
  const gray = f.gray ?? 0;
  const sepia = f.sepia ?? 0;
  const cross = sat !== 1 || gray || sepia;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (cross) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (sat !== 1) { r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
      if (gray) { r += (l - r) * gray; g += (l - g) * gray; b += (l - b) * gray; }
      if (sepia) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r += (sr - r) * sepia; g += (sg - g) * sepia; b += (sb - b) * sepia;
      }
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    d[i] = lr[r | 0]; d[i + 1] = lg[g | 0]; d[i + 2] = lb[b | 0];
  }
  return img;
}

// 가장자리를 살짝 어둡게 (음수면 하얗게 — 몽글몽글한 느낌)
export function drawVignette(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number) {
  if (!amount) return;
  const a = Math.min(1, Math.abs(amount));
  const rgb = amount > 0 ? '0,0,0' : '255,255,255';
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},${a})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
