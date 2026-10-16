// 사진 꾸미기 편집 화면 — 인스타그램처럼 검은 바탕에 사진을 크게, 도구는 아래에서 올라오는 시트로 골라요.
// 사진(EditPhoto)을 그 자리에서 바꿔요. '다음'을 누르면 onNext, '취소'는 onCancel.
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon, type IconName } from '../components/Icon';
import { confirm, useBackClose } from '../components/ui';
import { STICKER_SETS, fontById, loadFont } from './decor';
import { hasAdjust } from './filters';
import { isDecorated, labelText, layout, render, type EditPhoto, type Item, type Layout, type TextItem } from './render';
import { AdjustSheet, CropSheet, FilterSheet, FrameSheet, StickerSheet, type NewItem, type SheetProps } from './panels';
import { TextEditor, type TextDraft } from './TextEditor';
import s from './editor.module.css';

type SheetId = 'filter' | 'adjust' | 'sticker' | 'frame' | 'crop';
type Tool = SheetId | 'text';
const TOOLS: { id: Tool; name: string; icon: IconName }[] = [
  { id: 'filter', name: '필터', icon: 'venn' },
  { id: 'adjust', name: '조정', icon: 'sliders' },
  { id: 'text', name: '글씨', icon: 'aa' },
  { id: 'sticker', name: '스티커', icon: 'smile' },
  { id: 'frame', name: '테두리', icon: 'frame' },
  { id: 'crop', name: '자르기', icon: 'crop' },
];
const SHEET_NAME: Record<SheetId, string> = { filter: '필터', adjust: '조정', sticker: '스티커', frame: '테두리', crop: '자르기' };

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
const PAD = 12;   // 사진 둘레 여백
const DOTS = 18;  // 여러 장일 때 사진 아래 점 자리
const EASE = [0.22, 1, 0.36, 1] as const;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// 시트를 열 때 찍어 두는 모습 ('취소'로 되돌리기)
interface Snap {
  filter: string; strength?: number; adj: Record<string, number>; rot: number; aspect: string; cx: number; cy: number;
  frame: string; frameText: string | null; stamp: boolean; items: Item[];
}
const snapOf = (p: EditPhoto): Snap => ({
  filter: p.filter, strength: p.strength, adj: { ...(p.adj || {}) }, rot: p.rot, aspect: p.aspect, cx: p.cx, cy: p.cy,
  frame: p.frame, frameText: p.frameText, stamp: p.stamp, items: p.items.map((i) => ({ ...i })),
});
const restore = (p: EditPhoto, sn: Snap) => {
  Object.assign(p, { ...sn, adj: { ...sn.adj }, items: sn.items.map((i) => ({ ...i })) });
};

interface Drag { mode: 'item' | 'pan' | 'swipe'; it?: Item; ox: number; oy: number; x: number; y: number; cx: number; cy: number; moved: boolean; was: boolean }
interface Pinch { it: Item; d0: number; a0: number; s0: number; r0: number }
/** 사진 자리 (시트가 없을 때 기준, 화면 px) */
interface Box { w: number; h: number; SW: number; ah: number }
type TextStyle = Omit<TextDraft, 'text' | 'scale'>;

export function Editor({ photos, babyBirthday: baby, onNext, onCancel }: {
  photos: EditPhoto[]; babyBirthday: string | null; onNext: () => void; onCancel: () => void;
}) {
  const [cur, setCur] = useState(0);
  const [sheet, setSheetState] = useState<SheetId | null>(null);
  const [text, setText] = useState<{ id: string | null; draft: TextDraft; unit: number; seq: number } | null>(null);
  const [selected, setSelectedState] = useState<string | null>(null);
  const [stickerSet, setStickerSet] = useState(STICKER_SETS[0].id);
  const [, bump] = useReducer((n: number) => n + 1, 0); // 사진 객체를 직접 바꾼 뒤 화면 갱신
  const reduce = !!useReducedMotion();

  const p = photos[cur];
  const multi = photos.length > 1;
  const editorRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  // 그리기·손가락 처리에 쓰는 값 (다시 렌더링하지 않아도 되는 것들)
  const [v] = useState(() => ({
    p, baby, L: null as Layout | null, box: null as Box | null, maxSide: 1000, raf: 0,
    sel: null as string | null, hidden: null as string | null, dirty: photos.some(isDecorated), openSeq: 0, textSeq: 0,
    sheet: null as SheetId | null, sheetH: 0, snap: [] as Snap[], snapDirty: false,
    style: { font: 'basic', color: '#FFFFFF', box: 'none', align: 'center' } as TextStyle,
    pts: new Map<number, { x: number; y: number }>(), drag: null as Drag | null, pinch: null as Pinch | null,
  }));
  v.p = p;
  v.baby = baby;

  // ----- 그리기 -----
  const paint = () => {
    const c = canvasRef.current;
    if (c && v.L) render(c.getContext('2d')!, v.p, v.L, { baby: v.baby, selected: v.sel, hidden: v.hidden });
  };
  const draw = () => {
    if (v.raf) return;
    v.raf = requestAnimationFrame(() => { v.raf = 0; paint(); });
  };

  // 사진 자리: 시트가 열리면 시트 위 남은 공간에 맞춰 부드럽게 줄어들어요 (가려지거나 잘리지 않게)
  const place = (animate: boolean) => {
    const el = photoRef.current;
    const stage = stageRef.current;
    const ed = editorRef.current;
    const b = v.box;
    if (!el || !stage || !ed || !b) return;
    let x = (b.SW - b.w) / 2;
    let y = PAD + (b.ah - b.h) / 2;
    let k = 1;
    if (v.sheetH > 0) {
      const room = ed.clientHeight - v.sheetH - stage.offsetTop - PAD * 2;
      const ah = Math.max(48, room);
      k = clamp(Math.min((b.SW - PAD * 2) / b.w, ah / b.h), 0.1, 1);
      x = (b.SW - b.w * k) / 2;
      y = PAD + (ah - b.h * k) / 2;
    }
    const t = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(4)})`;
    // 화살표는 사진 가운데 높이, 점은 사진 바로 아래
    pagerRef.current?.style.setProperty('--cy', `${Math.round(y + (b.h * k) / 2)}px`);
    pagerRef.current?.style.setProperty('--by', `${Math.round(y + b.h * k + 8)}px`);
    if (animate && !reduce) { el.style.transform = t; return; }
    el.style.transition = 'none';
    el.style.transform = t;
    void el.offsetWidth;
    el.style.transition = '';
  };

  // 화면 크기에 맞춰 사진(캔버스) 크기 정하기
  const fit = () => {
    const stage = stageRef.current;
    const c = canvasRef.current;
    const el = photoRef.current;
    if (!stage || !c || !el) return;
    const SW = stage.clientWidth;
    const SH = stage.clientHeight;
    if (SW < 20 || SH < 20) return;
    const l0 = layout(v.p, 1000);
    const A = l0.W / l0.H;
    const ah = SH - PAD - (multi ? DOTS + PAD : PAD);
    let w = SW - PAD * 2;
    let h = w / A;
    if (h > ah) { h = ah; w = h * A; }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    v.box = { w, h, SW, ah };
    v.maxSide = Math.min(1600, Math.round(Math.max(w, h) * Math.min(2.5, window.devicePixelRatio || 1)));
    v.L = layout(v.p, v.maxSide);
    const resized = c.width !== v.L.W || c.height !== v.L.H;
    if (resized) { c.width = v.L.W; c.height = v.L.H; }
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    place(false);
    if (resized) { cancelAnimationFrame(v.raf); v.raf = 0; paint(); } else draw();
  };

  const relayout = () => {
    v.L = layout(v.p, v.maxSide);
    const c = canvasRef.current;
    if (c && (c.width !== v.L.W || c.height !== v.L.H)) fit(); else draw();
  };

  const change = (how: 'draw' | 'fit' = 'draw') => {
    v.dirty = true;
    if (how === 'fit') fit(); else draw();
    bump();
  };

  const setSelected = (id: string | null) => {
    v.sel = id;
    setSelectedState(id);
    draw();
  };

  // 처음, 그리고 사진을 바꿀 때
  useLayoutEffect(fit, [cur]);

  // 화면 크기·방향·글자 크기가 바뀌면 다시 맞추기 (fit은 ref만 읽으므로 처음 것을 써도 돼요)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(stage);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(v.raf);
      v.raf = 0;
    };
  }, []);

  const selItem = p.items.find((i) => i.id === selected) || null;

  const addItem = (spec: NewItem, scale?: number) => {
    // 가운데에 놓되, 이미 있으면 조금 비켜서
    let x = 0.5;
    let y = 0.5;
    for (let k = 0; k < 6 && v.p.items.some((i) => Math.abs(i.x - x) < 0.02 && Math.abs(i.y - y) < 0.02); k++) { x += 0.05; y += 0.05; }
    const it = {
      ...spec, id: uid(), rot: 0, x, y,
      // 스티커는 사진 폭의 30% 정도로
      scale: scale ?? (spec.kind === 'emoji' ? 1.85 : spec.kind === 'label' ? 1.2 : 1),
    } as Item;
    v.p.items.push(it);
    setSelected(it.id);
    change();
    if (it.kind === 'label') loadFont('400 40px "Gowun Dodum"', labelText(it.text, v.p, baby)).then(draw);
    if (it.kind === 'text') { const f = fontById(it.font); loadFont(`${f.weight} 40px ${f.family}`, it.text).then(draw); }
  };

  const go = (d: number) => {
    const i = clamp(cur + d, 0, photos.length - 1);
    if (i === cur) return;
    v.sel = null;
    setSelectedState(null);
    setCur(i);
  };

  // ----- 시트 (한 번에 하나) -----
  const openSheet = (id: SheetId) => {
    v.snap = photos.map(snapOf);
    v.snapDirty = v.dirty;
    v.sel = null;
    setSelectedState(null);
    draw();
    v.sheet = id;
    v.openSeq++; // 닫히는 중인 시트를 다시 쓰지 않고 새로 열어요
    setSheetState(id);
  };
  const closeSheet = () => {
    if (!v.sheet) return;
    v.sheet = null;
    v.sheetH = 0;
    setSheetState(null);
    place(true);
  };
  // 취소: 시트를 연 뒤 바꾼 것을 모두 되돌려요
  const cancelSheet = () => {
    if (!v.sheet) return;
    photos.forEach((x, i) => { if (v.snap[i]) restore(x, v.snap[i]); });
    v.dirty = v.snapDirty;
    fit();
    closeSheet();
    bump();
  };
  const onSheetHeight = (id: SheetId, h: number) => {
    if (v.sheet !== id || Math.abs(v.sheetH - h) < 1) return;
    v.sheetH = h;
    place(true);
  };
  // 휴대폰 '뒤로'는 시트의 '취소'와 같아요 (편집 화면은 그대로)
  useBackClose(sheet !== null, cancelSheet);

  const addSticker = (spec: NewItem) => {
    closeSheet();
    addItem(spec);
  };

  // ----- 글씨 -----
  const openText = (it?: TextItem) => {
    const L = v.L;
    const b = v.box;
    const unit = L && b ? (b.w * L.pw) / L.W : 300;
    if (it) { v.hidden = it.id; draw(); }
    v.sel = null;
    setSelectedState(null);
    setText({
      id: it?.id ?? null, unit, seq: ++v.textSeq,
      draft: it
        ? { text: it.text, font: it.font, color: it.color, box: it.box, align: it.align || 'center', scale: it.scale }
        : { text: '', ...v.style, scale: 1 },
    });
  };
  const cancelText = () => {
    const id = v.hidden;
    v.hidden = null;
    setText(null);
    if (id) setSelected(id); else draw();
  };
  const doneText = (d: TextDraft) => {
    const editing = text?.id ?? null;
    v.hidden = null;
    setText(null);
    v.style = { font: d.font, color: d.color, box: d.box, align: d.align };
    if (!d.text.trim()) { if (editing) setSelected(editing); else draw(); return; } // 빈 글씨는 취소와 같아요
    if (editing) {
      const it = v.p.items.find((i) => i.id === editing);
      if (it?.kind === 'text') Object.assign(it, { text: d.text, font: d.font, color: d.color, box: d.box, align: d.align, scale: d.scale });
      setSelected(editing);
      change();
    } else {
      addItem({ kind: 'text', text: d.text, font: d.font, color: d.color, box: d.box, align: d.align }, d.scale);
    }
    const f = fontById(d.font);
    loadFont(`${f.weight} 40px ${f.family}`, d.text).then(draw);
  };
  useBackClose(text !== null, cancelText);

  // ----- 위 막대 -----
  const cancel = async () => {
    if (v.dirty && !(await confirm({ title: '편집을 그만할까요?', message: '꾸민 내용은 사라져요.', ok: '그만하기', cancel: '계속 편집', danger: true }))) return;
    onCancel();
  };
  const next = () => {
    v.sel = null;
    setSelectedState(null);
    paint();
    onNext();
  };

  // ----- 고른 스티커·글씨 -----
  const selAction = (a: 'smaller' | 'bigger' | 'rotate' | 'edit' | 'delete' | 'done') => {
    const it = selItem;
    if (!it) return;
    if (a === 'done') { setSelected(null); return; }
    if (a === 'edit') { if (it.kind === 'text') openText(it); return; }
    if (a === 'smaller') it.scale = Math.max(MIN_SCALE, it.scale / 1.2);
    if (a === 'bigger') it.scale = Math.min(MAX_SCALE, it.scale * 1.2);
    if (a === 'rotate') it.rot = (it.rot || 0) + Math.PI / 12;
    if (a === 'delete') { v.p.items = v.p.items.filter((x) => x !== it); setSelected(null); }
    change();
  };

  // ----- 손가락으로 움직이기 -----
  const toPhoto = (x: number, y: number) => {
    const c = canvasRef.current!;
    const L = v.L!;
    const r = c.getBoundingClientRect();
    const cx = (x - r.left) * (c.width / r.width);
    const cy = (y - r.top) * (c.height / r.height);
    return { nx: (cx - L.px) / L.pw, ny: (cy - L.py) / L.ph };
  };

  // 맨 위에 있는 것부터 (회전도 고려)
  const hit = (nx: number, ny: number): Item | null => {
    const L = v.L!;
    const items = v.p.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const dx = nx - it.x;
      const dy = (ny - it.y) * (L.ph / L.pw);
      const c = Math.cos(-(it.rot || 0));
      const sn = Math.sin(-(it.rot || 0));
      const lx = dx * c - dy * sn;
      const ly = dx * sn + dy * c;
      if (Math.abs(lx) <= (it.bw || 0.1) / 2 + 0.03 && Math.abs(ly) <= (it.bh || 0.1) / 2 + 0.03) return it;
    }
    return null;
  };

  const pinchInfo = () => {
    const [a, b] = [...v.pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  const onPointerDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!v.L || text) return;
    if (sheet && sheet !== 'crop') return; // 시트를 고르는 동안에는 사진을 건드리지 않아요
    e.currentTarget.setPointerCapture(e.pointerId);
    v.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const base = { x: e.clientX, y: e.clientY, moved: false, ox: 0, oy: 0, cx: v.p.cx, cy: v.p.cy, was: false };
    if (sheet === 'crop') {
      v.drag = v.L.canPan && v.pts.size === 1 ? { ...base, mode: 'pan' } : null;
      return;
    }
    if (v.pts.size === 2) {
      const it = v.p.items.find((i) => i.id === v.sel);
      if (it) {
        const pi = pinchInfo();
        v.pinch = { it, d0: pi.d, a0: pi.ang, s0: it.scale, r0: it.rot || 0 };
      }
      v.drag = null;
      return;
    }
    const pt = toPhoto(e.clientX, e.clientY);
    const it = hit(pt.nx, pt.ny);
    if (it) {
      const was = v.sel === it.id;
      v.p.items = [...v.p.items.filter((x) => x !== it), it]; // 맨 앞으로
      v.drag = { ...base, mode: 'item', it, ox: it.x - pt.nx, oy: it.y - pt.ny, was };
      setSelected(it.id);
    } else {
      v.drag = { ...base, mode: 'swipe' };
      if (v.sel) setSelected(null);
    }
  };

  const onPointerMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!v.pts.has(e.pointerId)) return;
    v.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { pinch, drag } = v;
    if (pinch && v.pts.size >= 2) {
      const pi = pinchInfo();
      pinch.it.scale = clamp(pinch.s0 * (pi.d / pinch.d0), MIN_SCALE, MAX_SCALE);
      pinch.it.rot = pinch.r0 + (pi.ang - pinch.a0);
      v.dirty = true;
      draw();
      return;
    }
    if (!drag || !v.L) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
    if (drag.mode === 'swipe') return;
    if (drag.mode === 'item' && drag.it) {
      const pt = toPhoto(e.clientX, e.clientY);
      drag.it.x = clamp(pt.nx + drag.ox, -0.05, 1.05);
      drag.it.y = clamp(pt.ny + drag.oy, -0.05, 1.05);
    } else {
      // 자르기: 손가락 이동을 원본 픽셀로 바꿔 보이는 부분을 옮겨요
      const L = v.L;
      const c = e.currentTarget;
      const toSrc = (c.width / c.getBoundingClientRect().width) * (L.sw / L.pw);
      const fx = L.rw - L.sw;
      const fy = L.rh - L.sh;
      if (fx > 1) v.p.cx = clamp(drag.cx - ((e.clientX - drag.x) * toSrc) / fx, 0, 1);
      if (fy > 1) v.p.cy = clamp(drag.cy - ((e.clientY - drag.y) * toSrc) / fy, 0, 1);
      relayout();
    }
    v.dirty = true;
    draw();
  };

  const onPointerUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!v.pts.has(e.pointerId)) return;
    v.pts.delete(e.pointerId);
    if (v.pts.size < 2) v.pinch = null;
    const d = v.drag;
    if (!v.pts.size) v.drag = null;
    if (!d || v.pts.size) return;
    // 이미 고른 글씨를 한 번 더 누르면 글씨 고치기
    if (d.mode === 'item' && !d.moved && d.was && d.it?.kind === 'text') { openText(d.it); return; }
    // 여러 장일 때 옆으로 밀어서 넘기기
    if (d.mode === 'swipe' && multi && e.type === 'pointerup') {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }
  };

  // ----- 시트 내용 -----
  const base: SheetProps = { p, photos, baby, change, redraw: draw, onCancel: cancelSheet, onDone: closeSheet };
  const sheetBody = (id: SheetId): ReactNode => {
    switch (id) {
      case 'filter': return <FilterSheet {...base} />;
      case 'adjust': return <AdjustSheet {...base} />;
      case 'sticker': return <StickerSheet {...base} set={stickerSet} onSet={setStickerSet} addItem={addSticker} />;
      case 'frame': return <FrameSheet {...base} />;
      case 'crop': return <CropSheet {...base} />;
    }
  };

  // 이미 쓴 도구에는 작은 점
  const used: Record<Tool, boolean> = {
    filter: p.filter !== 'none',
    adjust: hasAdjust(p.adj),
    text: p.items.some((i) => i.kind === 'text'),
    sticker: p.items.some((i) => i.kind !== 'text'),
    frame: p.frame !== 'none' || p.stamp,
    crop: p.aspect !== 'orig' || p.rot !== 0,
  };
  const L = v.L;
  const showSel = !!selItem && !sheet && !text;
  // 글씨를 쓰는 동안에는 편집 화면의 버튼을 모두 숨겨요 (글씨 화면 뒤로 비치지 않게)
  const toolsAway = !!sheet || showSel || !!text;

  return (
    <motion.div className={s.wrap} role="dialog" aria-modal="true" aria-label="사진 편집"
      initial={{ opacity: 0, y: reduce ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 24 }}
      transition={{ duration: reduce ? 0 : 0.32, ease: EASE }}>
      <div ref={editorRef} className={s.editor} data-editor>
        <header className={`${s.top} ${sheet ? s.topQuiet : ''} ${text ? s.topHidden : ''}`} data-editor-top>
          <button type="button" className={s.headBtn} onClick={cancel} inert={!!sheet} data-editor-cancel>취소</button>
          <h2 className={s.title}>편집{multi && <small>{cur + 1}/{photos.length}</small>}</h2>
          <button type="button" className={`${s.headBtn} ${s.headDone}`} onClick={next} inert={!!sheet} data-editor-next>다음</button>
        </header>

        <div ref={stageRef} className={s.stage}>
          <div ref={photoRef} className={s.photo}>
            <canvas ref={canvasRef} className={s.canvas} aria-label="꾸미는 사진" data-editor-canvas
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
            {sheet === 'crop' && L && (
              <div className={s.cropGuide} aria-hidden="true" style={{
                left: `${(L.px / L.W) * 100}%`, top: `${(L.py / L.H) * 100}%`, width: `${(L.pw / L.W) * 100}%`, height: `${(L.ph / L.H) * 100}%`,
              }} />
            )}
          </div>
          {multi && (
            <div ref={pagerRef} className={`${s.pager} ${sheet || text ? s.away : ''}`} inert={!!sheet || !!text}>
              <button type="button" className={`${s.arrow} ${s.arrowL}`} hidden={cur === 0} onClick={() => go(-1)} aria-label="이전 사진" data-photo-prev>
                <Icon name="back" size={26} stroke={2.4} />
              </button>
              <button type="button" className={`${s.arrow} ${s.arrowR}`} hidden={cur === photos.length - 1} onClick={() => go(1)} aria-label="다음 사진" data-photo-next>
                <Icon name="right" size={26} stroke={2.4} />
              </button>
              <div className={s.dots} aria-hidden="true">{photos.map((_, i) => <i key={i} className={i === cur ? s.on : ''} />)}</div>
            </div>
          )}
        </div>

        <nav className={`${s.tools} ${toolsAway ? s.away : ''}`} aria-label="편집 도구" inert={toolsAway} data-editor-tools>
          {TOOLS.map((t) => (
            <button key={t.id} type="button" data-tool={t.id} onClick={() => (t.id === 'text' ? openText() : openSheet(t.id))}>
              <span className={s.toolIcon}><Icon name={t.icon} size={26} stroke={1.7} />{used[t.id] && <i className={s.usedDot} />}</span>
              <span className={s.toolName}>{t.name}</span>
            </button>
          ))}
        </nav>

        <AnimatePresence>
          {showSel && selItem && (
            <motion.div key="sel" className={s.selBar} data-editor-sel
              initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 16 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}>
              <div className={s.selPill} role="toolbar" aria-label="고른 스티커·글씨">
                <SelBtn icon="minus" label="작게" onClick={() => selAction('smaller')} />
                <SelBtn icon="plus" label="크게" onClick={() => selAction('bigger')} />
                <SelBtn icon="rotate" label="돌리기" onClick={() => selAction('rotate')} />
                {selItem.kind === 'text' && <SelBtn icon="edit" label="고치기" onClick={() => selAction('edit')} />}
                <SelBtn icon="trash" label="지우기" danger onClick={() => selAction('delete')} />
                <SelBtn icon="check" label="완료" accent onClick={() => selAction('done')} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sheet && (
            <SheetFrame key={`${sheet}-${v.openSeq}`} id={sheet} reduce={reduce} onHeight={onSheetHeight}>
              {sheetBody(sheet)}
            </SheetFrame>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {text && <TextEditor key={`text-${text.seq}`} initial={text.draft} unit={text.unit} onCancel={cancelText} onDone={doneText} />}
      </AnimatePresence>
    </motion.div>
  );
}

// 자판이 올라오면 그만큼 (시트 안 글씨 칸이 가려지지 않게)
function useKeyboardInset() {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => {
      const k = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setKb(k > 80 ? k : 0);
    };
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return kb;
}

function SheetFrame({ id, reduce, onHeight, children }: {
  id: SheetId; reduce: boolean; onHeight: (id: SheetId, h: number) => void; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const kb = useKeyboardInset();
  const report = useRef(() => {});
  report.current = () => { if (ref.current) onHeight(id, ref.current.offsetHeight + kb); };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    report.current();
    const ro = new ResizeObserver(() => report.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { report.current(); }, [kb]);
  return (
    <motion.section ref={ref} className={`${s.sheet} ${id === 'sticker' ? s.tall : ''} ${kb ? s.kbOpen : ''}`} role="dialog" aria-label={SHEET_NAME[id]}
      data-sheet={id} style={kb ? { bottom: kb } : undefined}
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}>
      {children}
    </motion.section>
  );
}

function SelBtn({ icon, label, danger, accent, onClick }: { icon: IconName; label: string; danger?: boolean; accent?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={danger ? s.danger : accent ? s.accentBtn : ''} onClick={onClick} data-sel={label}>
      <Icon name={icon} size={22} stroke={2} />
      <span>{label}</span>
    </button>
  );
}
