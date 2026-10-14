// 사진 필터 (모든 휴대폰에서 똑같이 보이도록 직접 색을 계산합니다)

export const FILTERS = [
  { id: 'none', name: '원본' },
  { id: 'soft', name: '뽀샤시', bright: 1.07, contrast: 0.9, sat: 0.92, fade: 0.05, tint: [6, 2, 4] },
  { id: 'warm', name: '따뜻하게', warm: 16, sat: 1.06, contrast: 1.02 },
  { id: 'vivid', name: '화사하게', sat: 1.28, contrast: 1.08, bright: 1.03 },
  { id: 'cool', name: '시원하게', warm: -14, bright: 1.03, sat: 1.02 },
  { id: 'cream', name: '크림', fade: 0.09, warm: 9, sat: 0.86, contrast: 0.92, bright: 1.02 },
  { id: 'pink', name: '분홍빛', tint: [14, -2, 6], bright: 1.04, sat: 0.96 },
  { id: 'mono', name: '흑백', gray: 1, contrast: 1.1 },
  { id: 'film', name: '추억', sepia: 0.42, fade: 0.07, contrast: 0.95, vignette: 0.35 },
];

export const filterById = (id) => FILTERS.find((f) => f.id === id) || FILTERS[0];

// 밝기·대비·색 바꾸기를 미리 계산해 둔 표(LUT)
function luts(f) {
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
      x = x * (1 - fade) + 255 * fade;
      out[ch][v] = x;
    }
  }
  return out;
}

// ImageData를 그 자리에서 바꿉니다
export function applyFilter(img, f) {
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

// 가장자리를 살짝 어둡게
export function drawVignette(ctx, x, y, w, h, amount) {
  if (!amount) return;
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
