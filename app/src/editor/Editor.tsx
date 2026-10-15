// 사진 꾸미기 편집 화면
// 사진(EditPhoto)을 그 자리에서 바꿔요. '다음'을 누르면 onNext, '취소'는 onCancel.
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from '../components/Icon';
import { confirm } from '../components/ui';
import { STICKER_SETS, fontById, loadFont } from './decor';
import { drawPreview, labelText, layout, render, type EditPhoto, type Item, type Layout } from './render';
import { AdjustPanel, CropPanel, FilterPanel, FramePanel, StickerPanel, TextPanel, type NewItem, type PanelBase, type TextStyle } from './panels';
import s from './editor.module.css';

type Tool = 'filter' | 'adjust' | 'sticker' | 'text' | 'frame' | 'crop';
const TOOLS: { id: Tool; name: string; icon: IconName }[] = [
  { id: 'filter', name: '필터', icon: 'sparkles' },
  { id: 'adjust', name: '조정', icon: 'sliders' },
  { id: 'sticker', name: '스티커', icon: 'smile' },
  { id: 'text', name: '글씨', icon: 'text' },
  { id: 'frame', name: '테두리', icon: 'frame' },
  { id: 'crop', name: '자르기', icon: 'crop' },
];

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface Drag { mode: 'item' | 'pan'; it?: Item; ox: number; oy: number; x: number; y: number; cx: number; cy: number; moved: boolean; was: boolean }
interface Pinch { it: Item; d0: number; a0: number; s0: number; r0: number }

export function Editor({ photos, babyBirthday: baby, onNext, onCancel }: {
  photos: EditPhoto[]; babyBirthday: string | null; onNext: () => void; onCancel: () => void;
}) {
  const [cur, setCur] = useState(0);
  const [tool, setTool] = useState<Tool>('filter');
  const [selected, setSelectedState] = useState<string | null>(null);
  const [stickerSet, setStickerSet] = useState(STICKER_SETS[0].id);
  const [textStyle, setTextStyle] = useState<TextStyle>({ font: 'basic', color: '#FFFFFF', box: false });
  const [draft, setDraft] = useState(''); // 아직 넣지 않은 글씨
  const [, bump] = useReducer((n: number) => n + 1, 0); // 사진 객체를 직접 바꾼 뒤 화면 갱신

  const p = photos[cur];
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const thumbRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  // 그리기·손가락 처리에 쓰는 값 (다시 렌더링하지 않아도 되는 것들)
  const [v] = useState(() => ({
    p, baby, L: null as Layout | null, maxSide: 1000, raf: 0, sel: null as string | null,
    dirty: false, thumbTimer: 0, cur: 0,
    pts: new Map<number, { x: number; y: number }>(), drag: null as Drag | null, pinch: null as Pinch | null,
  }));
  v.p = p;
  v.baby = baby;
  v.cur = cur;

  // ----- 그리기 -----
  const draw = () => {
    if (v.raf) return;
    v.raf = requestAnimationFrame(() => {
      v.raf = 0;
      const c = canvasRef.current;
      if (c && v.L) render(c.getContext('2d')!, v.p, v.L, { baby: v.baby, selected: v.sel });
    });
  };

  // 화면 크기에 맞춰 캔버스 크기 정하기
  const fit = () => {
    const stage = stageRef.current;
    const c = canvasRef.current;
    if (!stage || !c) return;
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const l0 = layout(v.p, 1000);
    const A = l0.W / l0.H;
    const pad = 32;
    let w = box.width - pad;
    let h = w / A;
    if (h > box.height - pad) { h = box.height - pad; w = h * A; }
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    v.maxSide = Math.min(1400, Math.round(Math.max(w, h) * Math.min(2, devicePixelRatio || 1)));
    v.L = layout(v.p, v.maxSide);
    c.width = v.L.W;
    c.height = v.L.H;
    draw();
  };

  const relayout = () => {
    v.L = layout(v.p, v.maxSide);
    const c = canvasRef.current;
    if (c && (c.width !== v.L.W || c.height !== v.L.H)) fit(); else draw();
  };

  const drawThumb = (i: number) => {
    const c = thumbRefs.current[i];
    if (c) drawPreview(c, photos[i], 140, v.baby);
  };
  const refreshThumbs = () => photos.forEach((_, i) => drawThumb(i));

  // 바뀐 것이 있다고 표시하고, 아래 작은 사진은 조금 뒤에 다시 그려요
  const touch = () => {
    v.dirty = true;
    clearTimeout(v.thumbTimer);
    v.thumbTimer = window.setTimeout(() => drawThumb(v.cur), 400);
  };

  const change = (how: 'draw' | 'fit' = 'draw') => {
    touch();
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

  // 화면 크기가 바뀌면 다시 맞추기 (fit은 ref만 읽으므로 처음 것을 써도 돼요)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(stage);
    const timers = photos.map((_, i) => window.setTimeout(() => drawThumb(i), 50 * i));
    return () => {
      ro.disconnect();
      timers.forEach(clearTimeout);
      clearTimeout(v.thumbTimer);
      cancelAnimationFrame(v.raf);
      v.raf = 0;
    };
  }, []);

  const selItem = p.items.find((i) => i.id === selected) || null;

  const addItem = (spec: NewItem) => {
    const it = {
      ...spec, id: uid(), scale: 1, rot: 0,
      x: 0.5 + (Math.random() - 0.5) * 0.16,
      y: 0.5 + (Math.random() - 0.5) * 0.16,
    } as Item;
    v.p.items.push(it);
    setSelected(it.id);
    change();
    if (it.kind === 'label') loadFont('400 40px "Gowun Dodum"', labelText(it.text, v.p, baby)).then(draw);
    if (it.kind === 'text') { const f = fontById(it.font); loadFont(`${f.weight} 40px ${f.family}`, it.text).then(draw); }
  };

  const switchPhoto = (i: number) => {
    if (i === cur) return;
    v.sel = null;
    setSelectedState(null);
    setCur(i);
  };

  // ----- 위 막대 -----
  const cancel = async () => {
    if (v.dirty && !(await confirm({ title: '편집을 그만할까요?', message: '꾸민 내용은 사라져요.', ok: '그만하기', cancel: '계속 편집', danger: true }))) return;
    onCancel();
  };
  const next = () => {
    v.sel = null;
    setSelectedState(null);
    if (canvasRef.current && v.L) render(canvasRef.current.getContext('2d')!, v.p, v.L, { baby });
    onNext();
  };

  // ----- 선택한 스티커·글씨 -----
  const selAction = (a: 'smaller' | 'bigger' | 'rotate' | 'edit' | 'delete') => {
    const it = selItem;
    if (!it) return;
    if (a === 'smaller') it.scale = Math.max(MIN_SCALE, it.scale / 1.2);
    if (a === 'bigger') it.scale = Math.min(MAX_SCALE, it.scale * 1.2);
    if (a === 'rotate') it.rot = (it.rot || 0) + Math.PI / 12;
    if (a === 'delete') { p.items = p.items.filter((x) => x !== it); setSelected(null); }
    if (a === 'edit') {
      setTool('text');
      requestAnimationFrame(() => textRef.current?.focus());
    }
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
    if (!v.L) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    v.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (v.pts.size === 2) {
      const it = v.p.items.find((i) => i.id === v.sel);
      if (it) {
        const pi = pinchInfo();
        v.pinch = { it, d0: pi.d, a0: pi.ang, s0: it.scale, r0: it.rot || 0 };
        v.drag = null;
      }
      return;
    }
    const pt = toPhoto(e.clientX, e.clientY);
    const it = hit(pt.nx, pt.ny);
    const base = { x: e.clientX, y: e.clientY, moved: false, ox: 0, oy: 0, cx: v.p.cx, cy: v.p.cy, was: false };
    if (it) {
      const was = v.sel === it.id;
      v.p.items = [...v.p.items.filter((x) => x !== it), it]; // 맨 앞으로
      v.drag = { ...base, mode: 'item', it, ox: it.x - pt.nx, oy: it.y - pt.ny, was };
      setSelected(it.id);
    } else if (tool === 'crop' && v.L.canPan) {
      v.drag = { ...base, mode: 'pan' };
    } else {
      v.drag = null;
      setSelected(null);
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
      touch();
      draw();
      return;
    }
    if (!drag || !v.L) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
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
    touch();
    draw();
  };

  const onPointerUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!v.pts.has(e.pointerId)) return;
    v.pts.delete(e.pointerId);
    if (v.pts.size < 2) v.pinch = null;
    const d = v.drag;
    // 이미 고른 글씨를 한 번 더 누르면 글씨 고치기
    if (d?.mode === 'item' && !d.moved && d.was && d.it?.kind === 'text' && tool !== 'text') setTool('text');
    if (!v.pts.size) v.drag = null;
  };

  // ----- 도구 패널 -----
  const base: PanelBase = { p, photos, baby, change, redraw: draw, refreshThumbs };
  const panel = (() => {
    switch (tool) {
      case 'filter': return <FilterPanel {...base} />;
      case 'adjust': return <AdjustPanel {...base} />;
      case 'sticker': return <StickerPanel {...base} set={stickerSet} onSet={setStickerSet} addItem={addItem} />;
      case 'text': return (
        <TextPanel {...base} editing={selItem?.kind === 'text' ? selItem : null} style={textStyle} onStyle={setTextStyle}
          draft={draft} onDraft={setDraft} addItem={addItem} onDone={() => setSelected(null)} inputRef={textRef} />
      );
      case 'frame': return <FramePanel {...base} />;
      case 'crop': return <CropPanel {...base} canPan={!!v.L?.canPan} />;
    }
  })();

  return (
    <motion.div className={s.wrap} role="dialog" aria-modal="true" aria-label="사진 편집"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
      <div className={s.editor}>
        <header className={s.top}>
          <button type="button" className={s.txtBtn} onClick={cancel}>취소</button>
          <h2 className={s.title}>편집{photos.length > 1 && <small>{cur + 1}/{photos.length}</small>}</h2>
          <button type="button" className={`${s.txtBtn} ${s.accent}`} onClick={next}>다음</button>
        </header>

        <div ref={stageRef} className={s.stage}>
          <canvas ref={canvasRef} className={s.canvas} aria-label="꾸미는 사진"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
        </div>

        {selItem && (
          <div className={s.selBar}>
            <SelBtn icon="minus" label="작게" onClick={() => selAction('smaller')} />
            <SelBtn icon="plus" label="크게" onClick={() => selAction('bigger')} />
            <SelBtn icon="rotate" label="돌리기" onClick={() => selAction('rotate')} />
            {selItem.kind === 'text' && <SelBtn icon="edit" label="고치기" onClick={() => selAction('edit')} />}
            <SelBtn icon="trash" label="지우기" danger onClick={() => selAction('delete')} />
          </div>
        )}

        {photos.length > 1 && (
          <div className={s.thumbs}>
            {photos.map((_, i) => (
              <button key={i} type="button" className={i === cur ? s.on : ''} aria-label={`${i + 1}번째 사진`} aria-pressed={i === cur}
                onClick={() => switchPhoto(i)}>
                <canvas ref={(el) => { thumbRefs.current[i] = el; }} />
              </button>
            ))}
          </div>
        )}

        <div className={s.dock}>
          <div className={s.panel} key={`${tool}-${cur}`}>{panel}</div>
          <nav className={s.tools} aria-label="편집 도구">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className={tool === t.id ? s.on : ''} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
                <Icon name={t.icon} size={24} />
                <span>{t.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </motion.div>
  );
}

function SelBtn({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={danger ? s.danger : ''} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}
