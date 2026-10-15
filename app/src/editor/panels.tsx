// 편집 화면 아래쪽 도구 패널들 (필터 · 조정 · 스티커 · 글씨 · 테두리 · 자르기)
// 사진(EditPhoto)을 그 자리에서 바꾸고 change()로 알려 줍니다.
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Icon } from '../components/Icon';
import { toast } from '../components/ui';
import { FILTERS, ADJUSTS } from './filters';
import { STICKER_SETS, LABELS, TEXT_FONTS, TEXT_COLORS, FRAMES, frameById, fontById, loadFont } from './decor';
import { ASPECTS, captionText, drawPreview, labelText, makeThumb, type EditPhoto, type Item, type TextItem } from './render';
import s from './editor.module.css';

/** 새로 넣을 스티커·글씨 (위치·크기는 넣을 때 정해요) */
export type NewItem = Item extends infer T ? (T extends Item ? Omit<T, 'id' | 'x' | 'y' | 'scale' | 'rot' | 'bw' | 'bh'> : never) : never;
export interface TextStyle { font: string; color: string; box: boolean }

export interface PanelBase {
  p: EditPhoto;
  photos: EditPhoto[];
  baby: string | null;
  /** 사진을 바꾼 뒤: 'fit'은 캔버스 크기가 바뀔 때 */
  change: (how?: 'draw' | 'fit') => void;
  /** 글씨체를 받은 뒤 다시 그리기만 */
  redraw: () => void;
  /** 아래 작은 사진들을 모두 다시 그리기 */
  refreshThumbs: () => void;
}

const LABEL_FAMILY = '"Gowun Dodum", "Pretendard Variable", sans-serif';
const adjKey = (p: EditPhoto) => JSON.stringify(p.adj || {});

// ---------- 작은 미리보기 ----------
// 필터·테두리 미리보기에 쓰는 작은 정사각형 사진 (매번 큰 원본을 쓰지 않도록)
function useMiniPhoto(p: EditPhoto): EditPhoto {
  return useMemo(() => {
    const plain: EditPhoto = { ...p, filter: 'none', adj: {}, strength: 100, frame: 'none', aspect: '1:1', cx: 0.5, cy: 0.5, items: [], stamp: false, _flt: undefined };
    const src = makeThumb(plain, 160, null);
    return { ...plain, src, rot: 0, _rot: undefined };
  }, [p, p.rot]);
}

// deps가 바뀔 때만 다시 그려요 (필터 계산이 무거워서)
function Preview({ photo, deps }: { photo: EditPhoto; deps: unknown[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawPreview(ref.current, photo, 128, null);
  }, deps);
  return <canvas ref={ref} className={s.optImg} />;
}

function Chip({ on, onClick, children, style }: { on?: boolean; onClick: () => void; children: ReactNode; style?: CSSProperties }) {
  return <button type="button" className={`${s.chip} ${on ? s.on : ''}`} aria-pressed={on} onClick={onClick} style={style}>{children}</button>;
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={s.slider}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={1} value={value} style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Math.round(+e.target.value))} />
      <b>{value}</b>
    </label>
  );
}

// ---------- 필터 ----------
export function FilterPanel({ p, photos, change, refreshThumbs }: PanelBase) {
  const mini = useMiniPhoto(p);
  const ak = adjKey(p);
  const applyAll = () => {
    photos.forEach((x) => { x.filter = p.filter; x.strength = p.strength; x.adj = { ...(p.adj || {}) }; });
    refreshThumbs();
    toast('모든 사진에 같은 필터를 적용했어요.');
  };
  return (
    <>
      <div className={s.row}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`${s.opt} ${p.filter === f.id ? s.on : ''}`} aria-pressed={p.filter === f.id}
            onClick={() => { p.filter = f.id; change(); }}>
            <Preview photo={{ ...mini, filter: f.id, adj: p.adj }} deps={[mini, ak]} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
      {p.filter !== 'none' && (
        <Slider label="강도" min={0} max={100} value={p.strength ?? 100} onChange={(v) => { p.strength = v; change(); }} />
      )}
      {photos.length > 1 && <button type="button" className={s.link} onClick={applyAll}>모든 사진에 적용</button>}
    </>
  );
}

// ---------- 조정 ----------
export function AdjustPanel({ p, change }: PanelBase) {
  const a = p.adj || {};
  return (
    <>
      <div className={s.sliders}>
        {ADJUSTS.map((x) => (
          <Slider key={x.id} label={x.name} min={-50} max={50} value={a[x.id] || 0}
            onChange={(v) => { p.adj = { ...(p.adj || {}), [x.id]: v }; change(); }} />
        ))}
      </div>
      <button type="button" className={s.link} onClick={() => { p.adj = {}; p.strength = 100; change(); }}>처음대로</button>
    </>
  );
}

// ---------- 스티커 ----------
export function StickerPanel({ p, baby, set, onSet, addItem }: PanelBase & { set: string; onSet: (id: string) => void; addItem: (it: NewItem) => void }) {
  const emojis = STICKER_SETS.find((x) => x.id === set)?.items;
  return (
    <>
      <div className={s.row}>
        {STICKER_SETS.map((x) => <Chip key={x.id} on={x.id === set} onClick={() => onSet(x.id)}>{x.name}</Chip>)}
        <Chip on={set === 'label'} onClick={() => onSet('label')}>🏷️ 글자</Chip>
      </div>
      {emojis ? (
        <div className={s.emojis}>
          {emojis.map((e) => <button key={e} type="button" aria-label={e} onClick={() => addItem({ kind: 'emoji', text: e })}>{e}</button>)}
        </div>
      ) : (
        <div className={s.labels}>
          {LABELS.map((l) => (
            <button key={l.text} type="button" className={s.label} style={{ background: l.bg, color: l.fg, fontFamily: LABEL_FAMILY }}
              onClick={() => addItem({ kind: 'label', text: l.text, bg: l.bg, fg: l.fg })}>
              {labelText(l.text, p, baby)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- 글씨 ----------
export function TextPanel({ change, redraw, editing, style, onStyle, draft, onDraft, addItem, onDone, inputRef }: PanelBase & {
  editing: TextItem | null;
  style: TextStyle;
  onStyle: (s: TextStyle) => void;
  draft: string;
  onDraft: (v: string) => void;
  addItem: (it: NewItem) => void;
  onDone: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const st = editing || style;
  const reloadFont = (t: TextItem) => { const f = fontById(t.font); loadFont(`${f.weight} 40px ${f.family}`, t.text).then(redraw); };

  const setStyle = (patch: Partial<TextStyle>) => {
    if (!editing) { onStyle({ ...style, ...patch }); return; }
    Object.assign(editing, patch);
    reloadFont(editing);
    change();
  };
  const onInput = (v: string) => {
    if (!editing) { onDraft(v); return; }
    editing.text = v || ' ';
    reloadFont(editing);
    change();
  };
  const add = () => {
    const v = draft.trim();
    if (!v) { toast('먼저 글씨를 써 주세요.'); inputRef.current?.focus(); return; }
    addItem({ kind: 'text', text: v, ...style });
    onDraft('');
  };

  return (
    <>
      <div className={s.textRow}>
        <textarea ref={inputRef} rows={1} maxLength={80} placeholder="글씨를 써 주세요"
          value={editing ? (editing.text.trim() ? editing.text : '') : draft} onChange={(e) => onInput(e.target.value)} />
        {editing
          ? <button type="button" className={s.soft} onClick={onDone}>완료</button>
          : <button type="button" className={s.primary} onClick={add}>넣기</button>}
      </div>
      <div className={s.row}>
        {TEXT_FONTS.map((f) => (
          <Chip key={f.id} on={st.font === f.id} onClick={() => setStyle({ font: f.id })} style={{ fontFamily: f.family, fontWeight: f.weight }}>{f.name}</Chip>
        ))}
      </div>
      <div className={s.row}>
        {TEXT_COLORS.map((c) => (
          <button key={c} type="button" className={`${s.color} ${st.color === c ? s.on : ''}`} aria-label={`색 ${c}`} aria-pressed={st.color === c}
            onClick={() => setStyle({ color: c })}>
            <i style={{ background: c }} />
          </button>
        ))}
        <Chip on={st.box} onClick={() => setStyle({ box: !st.box })}>배경 상자</Chip>
      </div>
    </>
  );
}

// ---------- 테두리 ----------
export function FramePanel({ p, photos, baby, change, redraw, refreshThumbs }: PanelBase) {
  const mini = useMiniPhoto(p);
  const ak = adjKey(p);
  const fr = frameById(p.frame);
  const pick = (id: string) => {
    p.frame = id;
    change('fit');
    if (frameById(id).caption) loadFont('700 40px "Gowun Batang"', captionText(p, baby)).then(redraw);
  };
  const applyAll = () => {
    photos.forEach((x) => { x.frame = p.frame; x.stamp = p.stamp; });
    refreshThumbs();
    toast('모든 사진에 같은 테두리를 적용했어요.');
  };
  return (
    <>
      <div className={s.row}>
        {FRAMES.map((f) => (
          <button key={f.id} type="button" className={`${s.opt} ${p.frame === f.id ? s.on : ''}`} aria-pressed={p.frame === f.id} onClick={() => pick(f.id)}>
            <Preview photo={{ ...mini, filter: p.filter, adj: p.adj, strength: p.strength, frame: f.id }} deps={[mini, p.filter, p.strength, ak]} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
      {fr.caption && (
        <label className={s.field}>
          <span>폴라로이드 아래 글씨</span>
          <input maxLength={40} value={captionText(p, baby)} onChange={(e) => {
            p.frameText = e.target.value;
            loadFont('700 40px "Gowun Batang"', p.frameText).then(redraw);
            change();
          }} />
        </label>
      )}
      <div className={s.row}>
        <Chip on={p.stamp} onClick={() => { p.stamp = !p.stamp; change(); }}>
          <Icon name={p.stamp ? 'check' : 'calendar'} size={16} /> 날짜 도장
        </Chip>
        {photos.length > 1 && <button type="button" className={s.link} onClick={applyAll}>모든 사진에 적용</button>}
      </div>
    </>
  );
}

// ---------- 자르기 ----------
export function CropPanel({ p, change, canPan }: PanelBase & { canPan: boolean }) {
  const rotate = () => {
    p.rot = (p.rot + 90) % 360;
    p._flt = undefined;
    p.cx = 0.5;
    p.cy = 0.5;
    change('fit');
  };
  return (
    <>
      <div className={s.row}>
        {ASPECTS.map((a) => (
          <Chip key={a.id} on={p.aspect === a.id} onClick={() => { p.aspect = a.id; p.cx = 0.5; p.cy = 0.5; change('fit'); }}>{a.name}</Chip>
        ))}
        <Chip onClick={rotate}><Icon name="rotate" size={16} /> 돌리기</Chip>
      </div>
      <p className={s.hint}>{canPan ? '사진을 끌어서 보일 부분을 맞춰 보세요.' : '비율을 고르면 사진을 끌어서 위치를 맞출 수 있어요.'}</p>
    </>
  );
}
