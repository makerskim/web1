// 사진 꾸미기 편집기
// 화면에 보이는 그대로(필터·스티커·글씨·테두리) 한 장의 사진으로 만들어 올립니다.

import { html, uuid, babyAge, fmtDateDots, toDate, readPhotoDate } from './util.js';
import { icon } from './icons.js';
import { openOverlay, confirmBox, toast } from './ui.js';
import { FILTERS, filterById, applyFilter, drawVignette } from './filters.js';
import {
  STICKER_SETS, LABELS, TEXT_FONTS, TEXT_COLORS, FRAMES, EMOJI_FONT, fontById, frameById, loadFont,
} from './decor.js';

const MAX_SRC = 2048;   // 편집용 원본 최대 크기
const OUT_MAX = 1600;   // 올리는 사진 최대 크기
const ASPECTS = [
  { id: 'orig', name: '원본' },
  { id: '1:1', name: '정사각형', r: 1 },
  { id: '4:5', name: '세로 4:5', r: 0.8 },
  { id: '16:9', name: '가로 16:9', r: 16 / 9 },
];
const LABEL_FONT = 'Jua, "Pretendard Variable", sans-serif';
const CAPTION_FONT = 'Gaegu, "Pretendard Variable", sans-serif';

// ---------- 사진 불러오기 ----------
function loadImg(url) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('이 사진은 열 수 없어요. (지원하지 않는 형식이에요)'));
    i.src = url;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
    const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    return {
      src: c, takenAt: await readPhotoDate(file),
      filter: 'none', rot: 0, aspect: 'orig', cx: 0.5, cy: 0.5,
      frame: 'none', frameText: null, stamp: false, items: [],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- 배치 계산 ----------
function rotated(ps) {
  if (!ps.rot) return ps.src;
  if (ps._rot?.rot === ps.rot) return ps._rot.c;
  const s = ps.src;
  const swap = ps.rot % 180 !== 0;
  const c = makeCanvas(swap ? s.height : s.width, swap ? s.width : s.height);
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2);
  x.rotate((ps.rot * Math.PI) / 180);
  x.drawImage(s, -s.width / 2, -s.height / 2);
  ps._rot = { rot: ps.rot, c };
  return c;
}

export function layout(ps, maxSide) {
  const r = rotated(ps);
  const rw = r.width;
  const rh = r.height;
  const a = ASPECTS.find((x) => x.id === ps.aspect)?.r || rw / rh;
  let sw = rw;
  let sh = rh;
  if (rw / rh > a) sw = rh * a; else sh = rw / a;
  const [pS, pT, pB] = frameById(ps.frame).pad;
  const uw = 1 + 2 * pS;
  const uh = sh / sw + pT + pB;
  const unit = Math.min(maxSide / Math.max(uw, uh), sw);
  return {
    r, rw, rh, sw, sh, unit,
    sx: (rw - sw) * ps.cx, sy: (rh - sh) * ps.cy,
    pw: unit, ph: (unit * sh) / sw, px: unit * pS, py: unit * pT,
    W: Math.round(unit * uw), H: Math.round(unit * uh),
    canPan: rw - sw > 2 || rh - sh > 2,
  };
}

function filtered(ps, L, cache) {
  const f = filterById(ps.filter);
  const k = L.pw / L.sw;
  const w = Math.max(1, Math.round(L.rw * k));
  const h = Math.max(1, Math.round(L.rh * k));
  const key = `${ps.rot}|${f.id}|${w}x${h}`;
  if (cache && ps._flt?.key === key) return ps._flt;
  const c = makeCanvas(w, h);
  const x = c.getContext('2d', { willReadFrequently: f.id !== 'none' });
  x.imageSmoothingQuality = 'high';
  x.drawImage(L.r, 0, 0, w, h);
  if (f.id !== 'none') {
    const d = x.getImageData(0, 0, w, h);
    applyFilter(d, f);
    x.putImageData(d, 0, 0);
  }
  const out = { key, c, k: w / L.rw };
  if (cache) ps._flt = out;
  return out;
}

// ---------- 그리기 ----------
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const luma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const isLight = (hex) => luma(hex) > 170;

export function labelText(text, ps, baby) {
  return text
    .replace('{age}', (baby && babyAge(baby, ps.takenAt, { short: true })) || '오늘의 기록')
    .replace('{date}', fmtDateDots(ps.takenAt));
}

export function captionText(ps, baby) {
  if (ps.frameText !== null && ps.frameText !== undefined) return ps.frameText;
  const age = baby ? babyAge(baby, ps.takenAt, { short: true }) : '';
  return `${fmtDateDots(ps.takenAt)}${age ? `  ·  ${age}` : ''}`;
}

function drawPattern(ctx, fr, L) {
  const m = Math.min(L.px, L.py, L.H - L.py - L.ph);
  const size = m * 0.55;
  const step = size * 1.7;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fr.emoji ? `${size}px ${EMOJI_FONT}` : `700 ${size}px "Pretendard Variable", sans-serif`;
  ctx.fillStyle = fr.glyphColor || '#fff';
  const ch = fr.emoji || fr.glyph;
  const put = (x, y, i) => {
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

function drawFilm(ctx, L) {
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

function drawCaption(ctx, ps, L, baby) {
  const text = captionText(ps, baby);
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

function drawStamp(ctx, ps, L) {
  const d = toDate(ps.takenAt) || new Date();
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

function drawItem(ctx, it, L, ps, baby, selected) {
  ctx.save();
  ctx.translate(L.px + it.x * L.pw, L.py + it.y * L.ph);
  ctx.rotate(it.rot || 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let w;
  let h;
  if (it.kind === 'emoji') {
    const size = L.pw * 0.16 * it.scale;
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.fillText(it.text, 0, size * 0.05);
    w = Math.max(ctx.measureText(it.text).width, size * 0.8);
    h = size * 1.05;
  } else if (it.kind === 'label') {
    const text = labelText(it.text, ps, baby);
    const size = L.pw * 0.058 * it.scale;
    ctx.font = `400 ${size}px ${LABEL_FONT}`;
    w = ctx.measureText(text).width + size * 1.4;
    h = size * 1.9;
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = size * 0.4;
    ctx.shadowOffsetY = size * 0.08;
    ctx.fillStyle = it.bg;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = it.fg;
    ctx.fillText(text, 0, size * 0.07);
  } else {
    const f = fontById(it.font);
    const size = L.pw * 0.075 * it.scale * f.k;
    ctx.font = `${f.weight} ${size}px ${f.family}`;
    const lines = it.text.split('\n');
    const lh = size * 1.15;
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), size);
    w = tw + (it.box ? size * 1.1 : size * 0.4);
    h = lh * lines.length + (it.box ? size * 0.7 : size * 0.2);
    let color = it.color;
    if (it.box) {
      ctx.fillStyle = it.color;
      rr(ctx, -w / 2, -h / 2, w, h, size * 0.4);
      ctx.fill();
      color = isLight(it.color) ? '#222222' : '#FFFFFF';
    } else {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = luma(it.color) > 200 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.95)';
      lines.forEach((l, i) => ctx.strokeText(l, 0, (i - (lines.length - 1) / 2) * lh + size * 0.05));
    }
    ctx.fillStyle = color;
    lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh + size * 0.05));
  }
  it.bw = w / L.pw;
  it.bh = h / L.pw;
  if (selected) {
    const pad = L.pw * 0.015;
    ctx.lineWidth = Math.max(2, L.pw * 0.005);
    ctx.setLineDash([L.pw * 0.02, L.pw * 0.012]);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
    ctx.lineDashOffset = L.pw * 0.016;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
  }
  ctx.restore();
}

export function render(ctx, ps, L, { baby = null, selected = null, cache = true } = {}) {
  const fr = frameById(ps.frame);
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
  const F = filtered(ps, L, cache);
  ctx.drawImage(F.c, L.sx * F.k, L.sy * F.k, L.sw * F.k, L.sh * F.k, L.px, L.py, L.pw, L.ph);
  drawVignette(ctx, L.px, L.py, L.pw, L.ph, filterById(ps.filter).vignette);
  if (fr.film) drawFilm(ctx, L);
  if (fr.caption) drawCaption(ctx, ps, L, baby);
  if (ps.stamp) drawStamp(ctx, ps, L);
  for (const it of ps.items) drawItem(ctx, it, L, ps, baby, it.id === selected);
  ctx.restore();
}

async function ensureFonts(ps, baby) {
  const jobs = [];
  for (const it of ps.items) {
    if (it.kind === 'label') jobs.push(loadFont('400 40px Jua', labelText(it.text, ps, baby)));
    if (it.kind === 'text') {
      const f = fontById(it.font);
      jobs.push(loadFont(`${f.weight} 40px ${f.family}`, it.text));
    }
  }
  if (frameById(ps.frame).caption) jobs.push(loadFont('700 40px Gaegu', captionText(ps, baby)));
  await Promise.all(jobs);
}

const toBlob = (c, q) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 만들지 못했어요. 사진 수를 줄여 다시 해 보세요.'))), 'image/jpeg', q));

function scaled(src, max) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = makeCanvas(src.width * k, src.height * k);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// 올릴 사진 만들기: 본 사진, 작은 사진(모아보기용), 아주 작은 자리표시
export async function exportPhoto(ps, baby) {
  await ensureFonts(ps, baby);
  const L = layout(ps, OUT_MAX);
  const c = makeCanvas(L.W, L.H);
  render(c.getContext('2d'), ps, L, { baby, cache: false });
  const blob = await toBlob(c, 0.86);
  const thumb = await toBlob(scaled(c, 480), 0.8);
  const ph = scaled(c, 24).toDataURL('image/jpeg', 0.6);
  return { blob, thumb, w: L.W, h: L.H, ph };
}

// ---------- 편집 화면 ----------
export function openEditor(photos, { baby, onNext, onCancel }) {
  let cur = 0;
  let ps = photos[0];
  let tool = 'filter';
  let selected = null;
  let L = null;
  let stickerSet = STICKER_SETS[0].id;
  let textStyle = { font: 'round', color: '#FFFFFF', box: false };
  let draft = ''; // 아직 넣지 않은 글씨
  let dirty = false;

  const ctl = openOverlay({
    cls: 'editor-wrap',
    backdrop: false,
    onClose: (v) => { if (v !== 'next') onCancel?.(); },
    content: html`
      <div class="editor">
        <header class="ed-top">
          <button class="ed-txtbtn" data-ed="cancel">취소</button>
          <h2>사진 꾸미기 ${photos.length > 1 ? html`<small class="ed-count">1/${photos.length}</small>` : ''}</h2>
          <button class="btn primary sm" data-ed="next">다음 ${icon('right', { size: 18 })}</button>
        </header>
        <div class="ed-stage"><canvas class="ed-canvas" aria-label="꾸미는 사진"></canvas></div>
        <div class="ed-sel" hidden>
          <button data-sel="smaller">${icon('minus', { size: 22 })}<span>작게</span></button>
          <button data-sel="bigger">${icon('plus', { size: 22 })}<span>크게</span></button>
          <button data-sel="rotate">${icon('rotate', { size: 22 })}<span>돌리기</span></button>
          <button data-sel="edit">${icon('edit', { size: 22 })}<span>글씨 고치기</span></button>
          <button data-sel="delete" class="danger">${icon('trash', { size: 22 })}<span>지우기</span></button>
        </div>
        ${photos.length > 1 ? html`<div class="ed-thumbs">${photos.map((_, i) => html`<button data-pick="${i}" class="${i === 0 ? 'on' : ''}" aria-label="${i + 1}번째 사진"><canvas></canvas></button>`)}</div>` : ''}
        <div class="ed-panel"></div>
        <nav class="ed-tools">
          <button data-tool="filter" class="on">${icon('sparkles')}<span>필터</span></button>
          <button data-tool="sticker">${icon('smile')}<span>스티커</span></button>
          <button data-tool="text">${icon('text')}<span>글씨</span></button>
          <button data-tool="frame">${icon('frame')}<span>테두리</span></button>
          <button data-tool="crop">${icon('crop')}<span>자르기</span></button>
        </nav>
      </div>`,
  });
  const el = ctl.el;
  const stage = el.querySelector('.ed-stage');
  const canvas = el.querySelector('.ed-canvas');
  const ctx = canvas.getContext('2d');
  const panel = el.querySelector('.ed-panel');
  const selBar = el.querySelector('.ed-sel');

  const selItem = () => ps.items.find((i) => i.id === selected);

  let raf = 0;
  const draw = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (L) render(ctx, ps, L, { baby, selected });
    });
  };

  let maxSide = 1000;
  const fit = () => {
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const A = (() => { const l = layout(ps, 1000); return l.W / l.H; })();
    let w = box.width - 20;
    let h = w / A;
    if (h > box.height - 20) { h = box.height - 20; w = h * A; }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    maxSide = Math.min(1400, Math.round(Math.max(w, h) * Math.min(2, devicePixelRatio || 1)));
    L = layout(ps, maxSide);
    canvas.width = L.W;
    canvas.height = L.H;
    draw();
  };
  const relayout = () => { L = layout(ps, maxSide); if (canvas.width !== L.W || canvas.height !== L.H) fit(); else draw(); };
  new ResizeObserver(fit).observe(stage);

  // 여러 장일 때 아래 작은 그림
  const drawThumb = (i) => {
    const c = el.querySelector(`[data-pick="${i}"] canvas`);
    if (!c) return;
    const l = layout(photos[i], 140);
    c.width = l.W; c.height = l.H;
    render(c.getContext('2d'), photos[i], l, { baby, cache: false });
  };
  let thumbTimer;
  const touch = () => {
    dirty = true;
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => drawThumb(cur), 400);
  };
  photos.forEach((_, i) => setTimeout(() => drawThumb(i), 50 * i));

  const updateSel = () => {
    const it = selItem();
    selBar.hidden = !it;
    if (it) selBar.querySelector('[data-sel=edit]').hidden = it.kind !== 'text';
    if (tool === 'text') drawPanel();
  };

  const addItem = (it) => {
    it.id = uuid();
    it.x = 0.5 + (Math.random() - 0.5) * 0.16;
    it.y = 0.5 + (Math.random() - 0.5) * 0.16;
    it.scale = it.scale || 1;
    it.rot = 0;
    ps.items.push(it);
    selected = it.id;
    updateSel();
    touch();
    draw();
    const after = () => draw();
    if (it.kind === 'label') loadFont('400 40px Jua', labelText(it.text, ps, baby)).then(after);
    if (it.kind === 'text') { const f = fontById(it.font); loadFont(`${f.weight} 40px ${f.family}`, it.text).then(after); }
  };

  // ----- 도구 패널 -----
  function drawPanel() {
    panel.scrollTop = 0;
    if (tool === 'filter') {
      panel.innerHTML = String(html`
        <div class="ed-row">${FILTERS.map((f) => html`
          <button class="ed-opt ${ps.filter === f.id ? 'on' : ''}" data-filter="${f.id}"><canvas data-fthumb="${f.id}"></canvas><span>${f.name}</span></button>`)}
        </div>
        ${photos.length > 1 ? html`<button class="link-btn sm" data-all="filter">이 필터를 모든 사진에 쓰기</button>` : ''}`);
      requestAnimationFrame(filterThumbs);
    } else if (tool === 'sticker') {
      const set = STICKER_SETS.find((s) => s.id === stickerSet);
      panel.innerHTML = String(html`
        <div class="ed-row chips">${STICKER_SETS.map((s) => html`<button class="chip ${s.id === stickerSet ? 'on' : ''}" data-set="${s.id}">${s.name}</button>`)}
          <button class="chip ${stickerSet === 'label' ? 'on' : ''}" data-set="label">🏷️ 글자</button></div>
        ${stickerSet === 'label'
          ? html`<div class="ed-labels">${LABELS.map((l, i) => html`<button class="label-sticker" style="background:${l.bg};color:${l.fg}" data-label="${i}">${labelText(l.text, ps, baby)}</button>`)}</div>`
          : html`<div class="ed-emojis">${set.items.map((e) => html`<button data-emoji="${e}" aria-label="${e}">${e}</button>`)}</div>`}`);
    } else if (tool === 'text') {
      const it = selItem();
      const t = it?.kind === 'text' ? it : null;
      const st = t || textStyle;
      panel.innerHTML = String(html`
        <div class="ed-text">
          <div class="ed-text-row">
            <textarea rows="1" maxlength="80" placeholder="여기에 글씨를 쓰세요" data-txt="input">${t ? t.text : draft}</textarea>
            ${t ? html`<button class="btn soft sm" data-txt="done">완료</button>` : html`<button class="btn primary sm" data-txt="add">넣기</button>`}
          </div>
          <div class="ed-row chips">${TEXT_FONTS.map((f) => html`<button class="chip ${st.font === f.id ? 'on' : ''}" data-font="${f.id}" style="font-family:${f.family};font-weight:${f.weight}">${f.name}</button>`)}</div>
          <div class="ed-row colors">
            ${TEXT_COLORS.map((c) => html`<button class="color ${st.color === c ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="색 ${c}"></button>`)}
            <button class="chip ${st.box ? 'on' : ''}" data-box>배경 상자</button>
          </div>
        </div>`);
      const ta = panel.querySelector('textarea');
      if (!t) ta.addEventListener('input', () => { draft = ta.value; });
      if (t) {
        ta.addEventListener('input', () => {
          t.text = ta.value || ' ';
          const f = fontById(t.font);
          loadFont(`${f.weight} 40px ${f.family}`, t.text).then(draw);
          touch();
          draw();
        });
      }
    } else if (tool === 'frame') {
      const fr = frameById(ps.frame);
      panel.innerHTML = String(html`
        <div class="ed-row">${FRAMES.map((f) => html`
          <button class="ed-opt ${ps.frame === f.id ? 'on' : ''}" data-frame="${f.id}">
            <i class="frame-sw" style="${f.gradient ? `background:linear-gradient(135deg,${f.gradient.join(',')})` : `background:${f.bg || 'transparent'}`}" data-f="${f.id}">${f.emoji || f.glyph || ''}</i><span>${f.name}</span></button>`)}
        </div>
        ${fr.caption ? html`<label class="field compact"><span>폴라로이드 아래 글씨</span><input data-caption maxlength="40" value="${captionText(ps, baby)}"></label>` : ''}
        <div class="ed-row">
          <button class="chip ${ps.stamp ? 'on' : ''}" data-stamp>📅 날짜 도장 ${ps.stamp ? '켜짐' : '넣기'}</button>
          ${photos.length > 1 ? html`<button class="link-btn sm" data-all="frame">이 테두리를 모든 사진에 쓰기</button>` : ''}
        </div>`);
      panel.querySelector('[data-caption]')?.addEventListener('input', (e) => {
        ps.frameText = e.target.value;
        loadFont('700 40px Gaegu', ps.frameText).then(draw);
        touch();
        draw();
      });
    } else if (tool === 'crop') {
      panel.innerHTML = String(html`
        <div class="ed-row">
          ${ASPECTS.map((a) => html`<button class="chip ${ps.aspect === a.id ? 'on' : ''}" data-aspect="${a.id}">${a.name}</button>`)}
          <button class="chip" data-rotate>${icon('rotate', { size: 18 })} 돌리기</button>
        </div>
        <p class="hint">${L?.canPan ? '👆 사진을 손가락으로 끌어서 보일 부분을 맞추세요.' : '비율을 고르면 사진을 끌어서 위치를 맞출 수 있어요.'}</p>`);
    }
  }

  function filterThumbs() {
    const base = layout({ ...ps, items: [], frame: 'none', aspect: '1:1', cx: 0.5, cy: 0.5 }, 96);
    for (const c of panel.querySelectorAll('[data-fthumb]')) {
      const tmp = { ...ps, filter: c.dataset.fthumb, frame: 'none', aspect: '1:1', cx: 0.5, cy: 0.5, items: [], stamp: false, _flt: null };
      c.width = base.W; c.height = base.H;
      render(c.getContext('2d'), tmp, layout(tmp, 96), { cache: false });
    }
  }

  const switchPhoto = (i) => {
    cur = i;
    ps = photos[i];
    selected = null;
    el.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('on', +b.dataset.pick === i));
    const cnt = el.querySelector('.ed-count');
    if (cnt) cnt.textContent = `${i + 1}/${photos.length}`;
    updateSel();
    drawPanel();
    fit();
  };

  // ----- 버튼 -----
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.ed === 'cancel') {
      if (!dirty || await confirmBox({ message: '꾸민 내용이 사라져요. 그만할까요?', ok: '그만하기', cancel: '계속 꾸미기' })) ctl.close();
      return;
    }
    if (d.ed === 'next') {
      selected = null;
      updateSel();
      draw();
      onNext?.();
      return;
    }
    if (d.tool) {
      tool = d.tool;
      el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b === t));
      drawPanel();
      return;
    }
    if (d.pick !== undefined) return switchPhoto(+d.pick);
    if (d.filter) { ps.filter = d.filter; touch(); drawPanel(); draw(); return; }
    if (d.all === 'filter') { photos.forEach((p) => { p.filter = ps.filter; }); photos.forEach((_, i) => drawThumb(i)); toast('모든 사진에 같은 필터를 썼어요.'); return; }
    if (d.all === 'frame') { photos.forEach((p) => { p.frame = ps.frame; p.stamp = ps.stamp; }); photos.forEach((_, i) => drawThumb(i)); toast('모든 사진에 같은 테두리를 썼어요.'); return; }
    if (d.set) { stickerSet = d.set; drawPanel(); return; }
    if (d.emoji) { addItem({ kind: 'emoji', text: d.emoji }); return; }
    if (d.label !== undefined) { const l = LABELS[+d.label]; addItem({ kind: 'label', text: l.text, bg: l.bg, fg: l.fg }); return; }
    if (d.txt === 'add') {
      const v = panel.querySelector('textarea').value.trim();
      if (!v) { toast('먼저 글씨를 써 주세요.'); panel.querySelector('textarea').focus(); return; }
      addItem({ kind: 'text', text: v, ...textStyle });
      draft = '';
      return;
    }
    if (d.txt === 'done') { selected = null; updateSel(); draw(); return; }
    if (d.font || d.color || d.box !== undefined) {
      const it = selItem();
      const target = it?.kind === 'text' ? it : textStyle;
      if (d.font) target.font = d.font;
      if (d.color) target.color = d.color;
      if (d.box !== undefined) target.box = !target.box;
      if (it?.kind === 'text') {
        const f = fontById(it.font);
        loadFont(`${f.weight} 40px ${f.family}`, it.text).then(draw);
        touch();
      }
      drawPanel();
      draw();
      return;
    }
    if (d.frame) { ps.frame = d.frame; touch(); drawPanel(); fit(); if (frameById(d.frame).caption) loadFont('700 40px Gaegu', captionText(ps, baby)).then(draw); return; }
    if (d.stamp !== undefined) { ps.stamp = !ps.stamp; touch(); drawPanel(); draw(); return; }
    if (d.aspect) { ps.aspect = d.aspect; ps.cx = 0.5; ps.cy = 0.5; touch(); fit(); drawPanel(); return; }
    if (d.rotate !== undefined) { ps.rot = (ps.rot + 90) % 360; ps._flt = null; ps.cx = 0.5; ps.cy = 0.5; touch(); fit(); drawPanel(); return; }
    if (d.sel) {
      const it = selItem();
      if (!it) return;
      if (d.sel === 'smaller') it.scale = Math.max(0.25, it.scale / 1.2);
      if (d.sel === 'bigger') it.scale = Math.min(6, it.scale * 1.2);
      if (d.sel === 'rotate') it.rot = (it.rot || 0) + Math.PI / 12;
      if (d.sel === 'delete') { ps.items = ps.items.filter((x) => x !== it); selected = null; updateSel(); }
      if (d.sel === 'edit') {
        tool = 'text';
        el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'text'));
        drawPanel();
        panel.querySelector('textarea')?.focus();
      }
      touch();
      draw();
    }
  });

  // ----- 손가락으로 움직이기 -----
  const pts = new Map();
  let drag = null;
  let pinch = null;

  const toPhoto = (x, y) => {
    const r = canvas.getBoundingClientRect();
    const cx = (x - r.left) * (canvas.width / r.width);
    const cy = (y - r.top) * (canvas.height / r.height);
    return { nx: (cx - L.px) / L.pw, ny: (cy - L.py) / L.ph };
  };

  const hit = (nx, ny) => {
    for (let i = ps.items.length - 1; i >= 0; i--) {
      const it = ps.items[i];
      const dx = nx - it.x;
      const dy = (ny - it.y) * (L.ph / L.pw);
      const c = Math.cos(-(it.rot || 0));
      const s = Math.sin(-(it.rot || 0));
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) <= (it.bw || 0.1) / 2 + 0.03 && Math.abs(ly) <= (it.bh || 0.1) / 2 + 0.03) return it;
    }
    return null;
  };

  const pinchInfo = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!L) return;
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const it = selItem();
      if (it) {
        const p = pinchInfo();
        pinch = { it, d0: p.d, a0: p.ang, s0: it.scale, r0: it.rot || 0 };
        drag = null;
      }
      return;
    }
    const p = toPhoto(e.clientX, e.clientY);
    const it = hit(p.nx, p.ny);
    if (it) {
      const was = selected === it.id;
      selected = it.id;
      ps.items = [...ps.items.filter((x) => x !== it), it]; // 맨 앞으로
      drag = { mode: 'item', it, ox: it.x - p.nx, oy: it.y - p.ny, x: e.clientX, y: e.clientY, moved: false, was };
      updateSel();
    } else if (tool === 'crop' && L.canPan) {
      drag = { mode: 'pan', x: e.clientX, y: e.clientY, cx: ps.cx, cy: ps.cy };
    } else {
      selected = null;
      drag = null;
      updateSel();
    }
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const p = pinchInfo();
      pinch.it.scale = Math.max(0.25, Math.min(6, pinch.s0 * (p.d / pinch.d0)));
      pinch.it.rot = pinch.r0 + (p.ang - pinch.a0);
      touch();
      draw();
      return;
    }
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
    if (drag.mode === 'item') {
      const p = toPhoto(e.clientX, e.clientY);
      drag.it.x = Math.max(-0.05, Math.min(1.05, p.nx + drag.ox));
      drag.it.y = Math.max(-0.05, Math.min(1.05, p.ny + drag.oy));
    } else {
      const r = canvas.getBoundingClientRect();
      const toSrc = (canvas.width / r.width) * (L.sw / L.pw);
      const fx = L.rw - L.sw;
      const fy = L.rh - L.sh;
      if (fx > 1) ps.cx = Math.max(0, Math.min(1, drag.cx - ((e.clientX - drag.x) * toSrc) / fx));
      if (fy > 1) ps.cy = Math.max(0, Math.min(1, drag.cy - ((e.clientY - drag.y) * toSrc) / fy));
      relayout();
    }
    touch();
    draw();
  });

  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag?.mode === 'item' && !drag.moved && drag.was && drag.it.kind === 'text' && tool !== 'text') {
      tool = 'text';
      el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'text'));
      drawPanel();
    }
    if (!pts.size) drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  drawPanel();
  requestAnimationFrame(fit);
  return ctl;
}
