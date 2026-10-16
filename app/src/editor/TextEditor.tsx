// 글씨 넣기: 사진 위를 어둡게 덮고, 가운데에서 크게 쓰는 화면 (인스타그램 글씨 도구처럼)
// 아래 고르는 칸(글씨체·색)은 휴대폰 자판 바로 위에 붙어 있어요.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Icon } from '../components/Icon';
import { TEXT_COLORS, TEXT_FONTS, fontById, loadFont } from './decor';
import { inkOn, softBox, type TextAlign, type TextBg } from './render';
import s from './editor.module.css';

export interface TextDraft { text: string; font: string; color: string; box: TextBg; align: TextAlign; scale: number }

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const BG_NEXT: Record<TextBg, TextBg> = { none: 'solid', solid: 'soft', soft: 'none' };
const BG_NAME: Record<TextBg, string> = { none: '배경 없음', solid: '배경 있음', soft: '반투명 배경' };
const ALIGN_NEXT: Record<TextAlign, TextAlign> = { center: 'left', left: 'right', right: 'center' };
const ALIGN_NAME: Record<TextAlign, string> = { center: '가운데 정렬', left: '왼쪽 정렬', right: '오른쪽 정렬' };
const ALIGN_ICON = { center: 'alignCenter', left: 'alignLeft', right: 'alignRight' } as const;

// 자판이 올라오면 보이는 영역(visual viewport)에 맞춰요
function useVisualBox() {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setBox({ top: Math.max(0, vv.offsetTop), height: vv.height });
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return box;
}

// 화면에서 자동으로 줄이 바뀐 곳을 찾아, 사진에도 똑같이 줄을 나눠요
function visualLines(root: HTMLElement): string {
  const out: string[] = [];
  const range = document.createRange();
  root.querySelectorAll<HTMLElement>('[data-ln]').forEach((span) => {
    const node = span.firstChild;
    const str = (node?.textContent || '').replace(/​/g, '');
    if (!node || node.nodeType !== Node.TEXT_NODE || !str) { out.push(''); return; }
    let start = 0;
    let lastTop: number | null = null;
    let i = 0;
    for (const ch of str) {
      range.setStart(node, i);
      range.setEnd(node, i + ch.length);
      const r = range.getClientRects()[0];
      if (r && r.width > 0) {
        if (lastTop !== null && r.top > lastTop + r.height / 2) {
          out.push(str.slice(start, i).replace(/\s+$/, ''));
          start = i;
        }
        lastTop = r.top;
      }
      i += ch.length;
    }
    out.push(str.slice(start));
  });
  return out.join('\n');
}

export function TextEditor({ initial, unit, onCancel, onDone }: {
  initial: TextDraft;
  /** 사진 폭 (화면 px) — 사진에 들어갈 크기 그대로 보여 줘요 */
  unit: number;
  onCancel: () => void;
  onDone: (d: TextDraft) => void;
}) {
  const [d, setD] = useState<TextDraft>(initial);
  const [tab, setTab] = useState<'font' | 'color'>('font');
  const ta = useRef<HTMLTextAreaElement>(null);
  const vis = useRef<HTMLDivElement>(null);
  const box = useVisualBox();
  const reduce = useReducedMotion();
  const set = (patch: Partial<TextDraft>) => setD((x) => ({ ...x, ...patch }));

  // 고르는 칸의 글씨체 이름을 각 글씨체로 보여 주려면 미리 받아 둬요
  useEffect(() => { TEXT_FONTS.forEach((f) => { loadFont(`${f.weight} 40px ${f.family}`, f.name + '가나다'); }); }, []);

  // 누르자마자 자판이 뜨도록 바로 초점 (iOS는 누른 순간에만 자판을 열어요)
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.focus({ preventScroll: true });
    const n = t.value.length;
    t.setSelectionRange(n, n);
  }, []);

  const f = fontById(d.font);
  const fontPx = Math.max(16, Math.min(72, unit * 0.075 * d.scale * f.k));
  const maxW = Math.max(160, Math.min(unit * 0.94, (typeof window !== 'undefined' ? window.innerWidth : 400) - 32));
  const hasBox = d.box !== 'none';
  const ink = hasBox ? inkOn(d.color) : d.color;
  const lineBg = d.box === 'solid' ? d.color : d.box === 'soft' ? softBox(d.color) : 'transparent';
  const shadow = hasBox ? 'none' : (parseInt(d.color.slice(1, 3), 16) > 120 ? '0 1px 6px rgba(0,0,0,.45)' : '0 1px 6px rgba(255,255,255,.6)');
  const fieldStyle = {
    fontFamily: f.family, fontWeight: f.weight, fontSize: `${fontPx}px`, textAlign: d.align, maxWidth: `${maxW}px`,
    '--ink': ink, '--line-bg': lineBg, '--shadow': shadow,
  } as CSSProperties;
  const lines = (d.text || '').split('\n');
  const empty = !d.text;

  // 글씨체·색을 골라도 자판이 내려가지 않게 (입력칸 초점 유지)
  const keepFocus = (e: RMouseEvent) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); };

  const done = () => {
    const text = vis.current && !empty ? visualLines(vis.current) : d.text;
    onDone({ ...d, text: text.replace(/\s+$/, '') });
  };

  return (
    <motion.div className={s.textOv} role="dialog" aria-modal="true" aria-label="글씨 쓰기"
      style={box ? { top: box.top, height: box.height, bottom: 'auto' } : undefined}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}>
      <div className={s.textInner}>
        <header className={s.textTop}>
          <button type="button" className={s.headBtn} onClick={onCancel} data-text-cancel>취소</button>
          <div className={s.textTools} onMouseDown={keepFocus}>
            <button type="button" className={s.roundBtn} aria-label={`${BG_NAME[d.box]} — 눌러서 바꾸기`} data-text-bg={d.box}
              onClick={() => set({ box: BG_NEXT[d.box] })}>
              <span className={`${s.bgIcon} ${s[`bg_${d.box}`]}`}>가</span>
            </button>
            <button type="button" className={s.roundBtn} aria-label={`${ALIGN_NAME[d.align]} — 눌러서 바꾸기`} data-text-align={d.align}
              onClick={() => set({ align: ALIGN_NEXT[d.align] })}>
              <Icon name={ALIGN_ICON[d.align]} size={24} stroke={2.2} />
            </button>
          </div>
          <button type="button" className={`${s.headBtn} ${s.headDone}`} onClick={done} data-text-done>완료</button>
        </header>

        <div className={s.textMid} onClick={(e) => { if (e.target === e.currentTarget) ta.current?.focus(); }}>
          <div className={s.textField} style={fieldStyle}>
            <div ref={vis} className={s.textVisual} aria-hidden="true">
              {empty
                ? <span className={s.placeholder}>글씨를 써 주세요</span>
                : lines.map((l, i) => (
                  <span key={i}><span className={s.ln} data-ln>{l || '​'}</span>{i < lines.length - 1 ? '\n' : ''}</span>
                ))}
            </div>
            <textarea ref={ta} className={s.textInput} value={d.text} maxLength={80} rows={1} spellCheck={false}
              aria-label="사진에 넣을 글씨" data-text-input
              onChange={(e) => set({ text: e.target.value })} />
          </div>
        </div>

        <div className={s.textBottom} onMouseDown={keepFocus}>
          <div className={s.textBar}>
            <div className={s.seg} role="tablist" aria-label="글씨 꾸미기">
              <button type="button" role="tab" aria-selected={tab === 'font'} className={tab === 'font' ? s.on : ''} onClick={() => setTab('font')}>글씨체</button>
              <button type="button" role="tab" aria-selected={tab === 'color'} className={tab === 'color' ? s.on : ''} onClick={() => setTab('color')} data-text-tab="color">색</button>
            </div>
            <div className={s.sizeBtns}>
              <button type="button" className={s.roundBtn} aria-label="글씨 작게" disabled={d.scale <= MIN_SCALE}
                onClick={() => set({ scale: Math.max(MIN_SCALE, d.scale / 1.15) })}><Icon name="minus" size={22} stroke={2.4} /></button>
              <button type="button" className={s.roundBtn} aria-label="글씨 크게" disabled={d.scale >= MAX_SCALE}
                onClick={() => set({ scale: Math.min(MAX_SCALE, d.scale * 1.15) })}><Icon name="plus" size={22} stroke={2.4} /></button>
            </div>
          </div>
          {tab === 'font' ? (
            <div className={s.fontGrid}>
              {TEXT_FONTS.map((x) => (
                <button key={x.id} type="button" className={d.font === x.id ? s.on : ''} aria-pressed={d.font === x.id}
                  style={{ fontFamily: x.family, fontWeight: x.weight }} onClick={() => set({ font: x.id })} data-font={x.id}>{x.name}</button>
              ))}
            </div>
          ) : (
            <div className={s.colorGrid}>
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" className={d.color === c ? s.on : ''} aria-label={`색 ${c}`} aria-pressed={d.color === c}
                  onClick={() => set({ color: c })} data-color={c}>
                  <i style={{ background: c }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
