// 편집 도구 시트 내용 (필터 · 조정 · 스티커 · 테두리 · 자르기)
// 사진(EditPhoto)을 그 자리에서 바꾸고 change()로 알려요. 고르는 것은 모두 위아래로만 움직이는 격자예요.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { toast } from '../components/ui';
import { FILTERS, ADJUSTS, filterById, type AdjustId } from './filters';
import { STICKER_SETS, LABELS, FRAMES, frameById, loadFont } from './decor';
import { ASPECTS, captionText, drawPreview, labelText, makeThumb, type EditPhoto, type Item } from './render';
import s from './editor.module.css';

/** 새로 넣을 스티커·글씨 (위치·크기는 넣을 때 정해요) */
export type NewItem = Item extends infer T ? (T extends Item ? Omit<T, 'id' | 'x' | 'y' | 'scale' | 'rot' | 'bw' | 'bh'> : never) : never;

export interface SheetProps {
  p: EditPhoto;
  photos: EditPhoto[];
  baby: string | null;
  /** 사진을 바꾼 뒤: 'fit'은 사진 모양(비율·테두리)이 바뀔 때 */
  change: (how?: 'draw' | 'fit') => void;
  /** 글씨체를 받은 뒤 다시 그리기만 */
  redraw: () => void;
  /** 열기 전으로 되돌리고 닫기 */
  onCancel: () => void;
  /** 바꾼 것을 두고 닫기 */
  onDone: () => void;
}

const LABEL_FAMILY = '"Gowun Dodum", "Pretendard Variable", sans-serif';
const adjKey = (p: EditPhoto) => JSON.stringify(p.adj || {});
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// ---------- 시트 머리 ----------
export function SheetHead({ title, onCancel, onBack, backLabel, onDone, doneLabel = '완료' }: {
  title: ReactNode; onCancel?: () => void; onBack?: () => void; backLabel?: string; onDone: () => void; doneLabel?: string;
}) {
  return (
    <header className={s.sheetHead}>
      {onBack ? (
        <button type="button" className={`${s.headBtn} ${s.headBack}`} onClick={onBack} data-sheet-back>
          <Icon name="back" size={22} stroke={2.2} /><span>{backLabel || '뒤로'}</span>
        </button>
      ) : onCancel ? (
        <button type="button" className={s.headBtn} onClick={onCancel} data-sheet-cancel>취소</button>
      ) : <span />}
      <h2 className={s.sheetTitle}>{title}</h2>
      <button type="button" className={`${s.headBtn} ${s.headDone}`} onClick={onDone} data-sheet-done>{doneLabel}</button>
    </header>
  );
}

// ---------- 작은 미리보기 ----------
// 필터·테두리 미리보기에 쓰는 작은 정사각형 사진 (매번 큰 원본을 쓰지 않도록)
function useMiniPhoto(p: EditPhoto): EditPhoto {
  return useMemo(() => {
    const plain: EditPhoto = { ...p, filter: 'none', adj: {}, strength: 100, frame: 'none', aspect: '1:1', cx: 0.5, cy: 0.5, items: [], stamp: false, _flt: undefined };
    const src = makeThumb(plain, 240, null);
    return { ...plain, src, rot: 0, _rot: undefined };
  }, [p, p.rot]);
}

// deps가 바뀔 때만 다시 그려요 (필터 계산이 무거워서)
function Preview({ photo, deps, size = 220 }: { photo: EditPhoto; deps: unknown[]; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawPreview(ref.current, photo, size, null);
  }, deps);
  return <canvas ref={ref} />;
}

// ---------- 큰 막대 (강도·조정) ----------
function BigSlider({ value, min, max, centered, reset, label, onChange }: {
  value: number; min: number; max: number; centered?: boolean; reset: number; label: string; onChange: (v: number) => void;
}) {
  const last = useRef(0);
  const pct = ((value - min) / (max - min)) * 100;
  const lo = centered ? Math.min(50, pct) : 0;
  const hi = centered ? Math.max(50, pct) : pct;
  // 두 번 톡톡 누르면 처음 값으로
  const onUp = () => {
    const now = Date.now();
    if (now - last.current < 320) { onChange(reset); last.current = 0; } else last.current = now;
  };
  return (
    <div className={`${s.big} ${centered ? s.bigCentered : ''}`}>
      <output className={s.bigValue} aria-hidden="true">{centered ? signed(value) : value}</output>
      <input type="range" min={min} max={max} step={1} value={value} aria-label={label}
        style={{ '--lo': `${lo}%`, '--hi': `${hi}%` } as CSSProperties}
        onChange={(e) => onChange(Math.round(+e.target.value))} onPointerUp={onUp} />
      <div className={s.bigEnds} aria-hidden="true"><span>{min}</span><span>{centered ? 0 : ''}</span><span>{max}</span></div>
      <p className={s.bigHint}>두 번 누르면 {centered ? '0으로' : '처음대로'} 돌아가요</p>
    </div>
  );
}

// ---------- 필터 ----------
export function FilterSheet({ p, photos, change, onCancel, onDone }: SheetProps) {
  const [view, setView] = useState<'grid' | 'strength'>('grid');
  const mini = useMiniPhoto(p);
  const ak = adjKey(p);
  const pick = (id: string) => {
    if (p.filter === id) { if (id !== 'none') setView('strength'); return; }
    p.filter = id;
    p.strength = 100;
    change();
  };
  const applyAll = () => {
    photos.forEach((x) => { x.filter = p.filter; x.strength = p.strength; });
    change();
    toast(`${photos.length}장 모두 ‘${filterById(p.filter).name}’ 필터를 적용했어요`);
  };

  if (view === 'strength') {
    return (
      <>
        <SheetHead title={`${filterById(p.filter).name} 강도`} onBack={() => setView('grid')} backLabel="필터" onDone={onDone} />
        <div className={`${s.sheetBody} ${s.sheetCenter}`}>
          <BigSlider label="필터 강도" min={0} max={100} reset={100} value={p.strength ?? 100}
            onChange={(v) => { p.strength = v; change(); }} />
        </div>
      </>
    );
  }
  return (
    <>
      <SheetHead title="필터" onCancel={onCancel} onDone={onDone} />
      <div className={s.sheetBody}>
        <div className={`${s.grid} ${s.filterGrid}`}>
          {FILTERS.map((f) => {
            const on = p.filter === f.id;
            return (
              <button key={f.id} type="button" className={`${s.tile} ${on ? s.on : ''}`} aria-pressed={on} data-filter={f.id}
                aria-label={on && f.id !== 'none' ? `${f.name} — 한 번 더 누르면 강도 조절` : f.name} onClick={() => pick(f.id)}>
                <span className={s.tileImg}>
                  <Preview photo={{ ...mini, filter: f.id, adj: p.adj }} deps={[mini, ak]} />
                  {on && f.id !== 'none' && <i className={s.tileBadge}><Icon name="sliders" size={16} stroke={2.2} /></i>}
                </span>
                <span className={s.tileName}>{f.name}</span>
              </button>
            );
          })}
        </div>
        {(p.filter !== 'none' || photos.length > 1) && (
          <div className={`${s.actions} ${s.after}`}>
            {p.filter !== 'none' && (
              <button type="button" className={s.action} onClick={() => setView('strength')} data-strength>
                <Icon name="sliders" size={18} /><span>강도 {p.strength ?? 100}</span>
              </button>
            )}
            {photos.length > 1 && (
              <button type="button" className={s.action} onClick={applyAll}><Icon name="layers" size={18} /><span>모든 사진에 적용</span></button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- 조정 ----------
const ADJUST_ICONS: Record<AdjustId, IconName> = {
  bright: 'sun', contrast: 'contrast', sat: 'droplet', warm: 'thermo', fade: 'fade', vignette: 'vignette',
};

export function AdjustSheet({ p, change, onCancel, onDone }: SheetProps) {
  const [tool, setTool] = useState<AdjustId | null>(null);
  const a = p.adj || {};
  const any = ADJUSTS.some((x) => a[x.id]);
  if (tool) {
    const t = ADJUSTS.find((x) => x.id === tool)!;
    return (
      <>
        <SheetHead title={t.name} onBack={() => setTool(null)} backLabel="조정" onDone={onDone} />
        <div className={`${s.sheetBody} ${s.sheetCenter}`}>
          <BigSlider label={t.name} centered min={-50} max={50} reset={0} value={a[tool] || 0}
            onChange={(v) => { p.adj = { ...(p.adj || {}), [tool]: v }; change(); }} />
        </div>
      </>
    );
  }
  return (
    <>
      <SheetHead title="조정" onCancel={onCancel} onDone={onDone} />
      <div className={s.sheetBody}>
        <div className={`${s.grid} ${s.toolGrid}`}>
          {ADJUSTS.map((x) => {
            const val = a[x.id] || 0;
            return (
              <button key={x.id} type="button" className={`${s.toolTile} ${val ? s.set : ''}`} onClick={() => setTool(x.id)} data-adjust={x.id}>
                <Icon name={ADJUST_ICONS[x.id]} size={28} />
                <span>{x.name}</span>
                <small>{val ? signed(val) : ' '}</small>
              </button>
            );
          })}
          <button type="button" className={`${s.toolTile} ${s.toolReset}`} disabled={!any}
            onClick={() => { p.adj = {}; change(); }}>
            <Icon name="undo" size={28} />
            <span>처음대로</span>
            <small> </small>
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- 스티커 ----------
export function StickerSheet({ p, baby, set, onSet, addItem, onCancel }: SheetProps & {
  set: string; onSet: (id: string) => void; addItem: (it: NewItem) => void;
}) {
  const tabs = [...STICKER_SETS.map((x) => ({ id: x.id, name: x.name, icon: x.icon })), { id: 'label', name: '글자', icon: '🏷️' }];
  const emojis = STICKER_SETS.find((x) => x.id === set)?.items;
  return (
    <>
      <SheetHead title="스티커" onDone={onCancel} doneLabel="닫기" />
      <div className={s.sheetFixed}>
        <div className={s.tabs} role="tablist" aria-label="스티커 종류">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === set} className={t.id === set ? s.on : ''}
              onClick={() => onSet(t.id)} data-set={t.id}>
              <i aria-hidden="true">{t.icon}</i><span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={s.sheetBody} key={set}>
        {emojis ? (
          <div className={s.emojiGrid}>
            {emojis.map((e) => (
              <button key={e} type="button" aria-label={`${e} 스티커 넣기`} data-sticker={e} onClick={() => addItem({ kind: 'emoji', text: e })}>{e}</button>
            ))}
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
      </div>
    </>
  );
}

// ---------- 테두리 ----------
export function FrameSheet({ p, photos, baby, change, redraw, onCancel, onDone }: SheetProps) {
  const mini = useMiniPhoto(p);
  const ak = adjKey(p);
  const fr = frameById(p.frame);
  const [typing, setTyping] = useState(false); // 폴라로이드 글씨를 쓰는 동안엔 칸만 보여요 (사진이 가려지지 않게)
  const pick = (id: string) => {
    p.frame = id;
    change('fit');
    if (frameById(id).caption) loadFont('700 40px "Gowun Batang"', captionText(p, baby)).then(redraw);
  };
  const applyAll = () => {
    photos.forEach((x) => { x.frame = p.frame; x.stamp = p.stamp; x.frameText = p.frameText; });
    change();
    toast(`${photos.length}장 모두 같은 테두리를 적용했어요`);
  };
  return (
    <>
      <SheetHead title="테두리" onCancel={onCancel} onDone={onDone} />
      <div className={s.sheetBody}>
        {!typing && <div className={`${s.grid} ${s.filterGrid}`}>
          {FRAMES.map((f) => {
            const on = p.frame === f.id;
            return (
              <button key={f.id} type="button" className={`${s.tile} ${on ? s.on : ''}`} aria-pressed={on} onClick={() => pick(f.id)} data-frame={f.id}>
                <span className={`${s.tileImg} ${s.tileContain}`}>
                  <Preview photo={{ ...mini, filter: p.filter, adj: p.adj, strength: p.strength, frame: f.id, frameText: p.frameText }}
                    deps={[mini, p.filter, p.strength, ak]} />
                </span>
                <span className={s.tileName}>{f.name}</span>
              </button>
            );
          })}
        </div>}
        {fr.caption && (
          <label className={`${s.field} ${typing ? '' : s.after}`}>
            <span>폴라로이드 아래 글씨</span>
            <input maxLength={40} value={captionText(p, baby)} placeholder="비워 두면 글씨 없이" enterKeyHint="done"
              onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              onChange={(e) => {
              p.frameText = e.target.value;
              loadFont('700 40px "Gowun Batang"', p.frameText).then(redraw);
              change();
            }} />
          </label>
        )}
        {!typing && <div className={`${s.actions} ${s.after}`}>
          <label className={`${s.action} ${s.toggle}`}>
            <Icon name="calendar" size={18} />
            <span>날짜 도장</span>
            <input type="checkbox" role="switch" checked={p.stamp} onChange={(e) => { p.stamp = e.target.checked; change(); }} data-stamp />
          </label>
          {photos.length > 1 && (
            <button type="button" className={s.action} onClick={applyAll}><Icon name="layers" size={18} /><span>모든 사진에 적용</span></button>
          )}
        </div>}
      </div>
    </>
  );
}

// ---------- 자르기 ----------
function Shape({ r }: { r?: number }) {
  if (!r) return <Icon name="image" size={30} />;
  const w = r >= 1 ? 34 : 34 * r;
  const h = r >= 1 ? 34 / r : 34;
  return <i className={s.shape} style={{ width: w, height: h }} />;
}

export function CropSheet({ p, change, onCancel, onDone }: SheetProps) {
  const rotate = () => {
    p.rot = (p.rot + 90) % 360;
    p._flt = undefined;
    p.cx = 0.5;
    p.cy = 0.5;
    change('fit');
  };
  const crop = p.aspect !== 'orig';
  return (
    <>
      <SheetHead title="자르기" onCancel={onCancel} onDone={onDone} />
      <p className={`${s.sheetFixed} ${s.hint}`}>
        {crop ? <><Icon name="flip" size={16} /> 사진을 끌어서 위치를 맞춰요</> : '비율을 고르면 사진을 끌어서 위치를 맞출 수 있어요'}
      </p>
      <div className={s.sheetBody}>
        <div className={`${s.grid} ${s.cropGridTiles}`}>
          {ASPECTS.map((a) => {
            const on = p.aspect === a.id;
            return (
              <button key={a.id} type="button" className={`${s.cropTile} ${on ? s.on : ''}`} aria-pressed={on} data-aspect={a.id}
                onClick={() => { p.aspect = a.id; p.cx = 0.5; p.cy = 0.5; change('fit'); }}>
                <span className={s.cropShape}><Shape r={a.r} /></span>
                <b>{a.name}</b>
                <small>{a.sub}</small>
              </button>
            );
          })}
          <button type="button" className={s.cropTile} onClick={rotate} data-rotate>
            <span className={s.cropShape}><Icon name="rotate" size={30} /></span>
            <b>돌리기</b>
            <small>90°씩</small>
          </button>
        </div>
      </div>
    </>
  );
}
