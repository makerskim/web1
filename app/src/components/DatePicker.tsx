// 날짜 고르기: 아이폰의 인라인 날짜 선택처럼 아래에서 올라오는 달력
// - 날짜를 누르면 바로 정해져요. 위 '2026년 10월 ›'을 누르면 연·월 휠이 나와요.
// - 옆으로 밀거나 ‹ › 로 달을 넘겨요.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { Sheet } from './ui';
import { Icon } from './Icon';
import { WEEKDAYS, fmtDate, monthCells, toDate, ymd } from '../lib/dates';
import s from './DatePicker.module.css';

const slide = { type: 'spring' as const, stiffness: 380, damping: 40, mass: 0.9 }; // 아이폰처럼 미끄러지는 달 넘김
const pad = (n: number) => String(n).padStart(2, '0');

export function DatePickerSheet({ open, title, value, onChange, onClose, min, max, allowClear = false }: {
  open: boolean; title: string; value: string | null; onChange: (v: string | null) => void; onClose: () => void;
  min?: string; max?: string; allowClear?: boolean;
}) {
  const today = ymd(new Date());
  const start = toDate(value) || new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [wheel, setWheel] = useState(false);
  const [dir, setDir] = useState(0);
  useEffect(() => {
    if (!open) return;
    const d = toDate(value) || new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setWheel(false);
    setDir(0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (n: number) => {
    setDir(n);
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };
  const inRange = (k: string) => (!min || k >= min) && (!max || k <= max);

  // 밀다가 손을 뗀 건 '누른 것'으로 치지 않아요 (손가락이 10px 넘게 움직였으면 무시)
  const touch = useRef({ x: 0, y: 0, moved: false, at: 0 });
  const onDown = (e: React.PointerEvent) => { touch.current = { x: e.clientX, y: e.clientY, moved: false, at: 0 }; };
  const onUp = (e: React.PointerEvent) => {
    const t = touch.current;
    t.moved = Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10;
    t.at = Date.now();
  };
  const pick = (k: string) => {
    if (!inRange(k) || (touch.current.moved && Date.now() - touch.current.at < 400)) return;
    onChange(k);
    setTimeout(onClose, 140); // 고른 날이 잠깐 보이고 닫혀요
  };
  const onDragEnd = (_: unknown, { offset, velocity }: PanInfo) => {
    if (Math.abs(offset.x) > 56 || (Math.abs(velocity.x) > 420 && Math.abs(offset.x) > 16)) move(offset.x < 0 ? 1 : -1);
  };

  // 늘 6줄(42칸)이라 달마다 높이가 바뀌지 않아요
  const cells = useMemo(() => monthCells(view.y, view.m, 42), [view]);

  // 휠: 연도는 (최소 연도 또는 1990) ~ (최대 연도 또는 올해+2)
  const now = new Date().getFullYear();
  const y0 = Math.min(min ? Number(min.slice(0, 4)) : 1990, view.y);
  const y1 = Math.max(max ? Number(max.slice(0, 4)) : now + 2, view.y);
  const years = useMemo(() => Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ v: y0 + i, text: `${y0 + i}년` })), [y0, y1]);
  const months = Array.from({ length: 12 }, (_, i) => {
    const k = `${view.y}-${pad(i + 1)}`;
    return { v: i + 1, text: `${i + 1}월`, dim: (!!min && k < min.slice(0, 7)) || (!!max && k > max.slice(0, 7)) };
  });

  const goToday = () => {
    const d = new Date();
    const n = d.getFullYear() * 12 + d.getMonth() - (view.y * 12 + view.m);
    setDir(Math.sign(n));
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setWheel(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={s.head}>
        <button type="button" className={s.monthBtn} onClick={() => setWheel(!wheel)} aria-expanded={wheel}
          aria-label={`${view.y}년 ${view.m + 1}월 — ${wheel ? '달력으로 돌아가기' : '연도와 달 고르기'}`} data-dp="title">
          {view.y}년 {view.m + 1}월
          <Icon name="right" size={17} stroke={2.6} className={s.chev} />
        </button>
        <span className={`${s.navs} ${wheel ? s.navsOff : ''}`} aria-hidden={wheel || undefined}>
          <button type="button" className={s.nav} onClick={() => move(-1)} aria-label="이전 달" data-dp="prev" tabIndex={wheel ? -1 : undefined}><Icon name="back" size={24} stroke={2.4} /></button>
          <button type="button" className={s.nav} onClick={() => move(1)} aria-label="다음 달" data-dp="next" tabIndex={wheel ? -1 : undefined}><Icon name="right" size={24} stroke={2.4} /></button>
        </span>
      </div>

      <div className={s.body}>
        {/* 달력은 휠이 열려도 자리를 지켜서, 시트 높이가 출렁이지 않아요 */}
        <div className={`${s.cal} ${wheel ? s.off : ''}`} aria-hidden={wheel || undefined}>
          <div className={s.week}>{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
          <div className={s.viewport} onPointerDownCapture={onDown} onPointerUpCapture={onUp}>
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div key={`${view.y}-${view.m}`} className={s.grid} custom={dir}
                variants={{
                  enter: (d: number) => ({ x: d ? `${d * 100}%` : 0, opacity: d ? 1 : 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d: number) => ({ x: d ? `${d * -100}%` : 0, opacity: d ? 1 : 0 }),
                }}
                initial="enter" animate="center" exit="exit" transition={{ x: slide, opacity: { duration: 0.18 } }}
                drag={wheel ? false : 'x'} dragDirectionLock dragMomentum={false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.85}
                onDragEnd={onDragEnd}>
                {cells.map((d, i) => {
                  if (!d) return <span key={`b${i}`} className={s.blank} />;
                  const k = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
                  const sel = k === value;
                  return (
                    <button key={k} type="button" disabled={!inRange(k)} onClick={() => pick(k)} data-day={k} tabIndex={wheel ? -1 : undefined}
                      className={`${s.day} ${sel ? s.sel : ''} ${k === today ? s.today : ''}`}
                      aria-pressed={sel} aria-label={`${fmtDate(k, true)}${k === today ? ' (오늘)' : ''}`}>
                      {d}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {wheel && (
            <motion.div key="wheel" className={s.wheel} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}>
              <Wheel kind="year" label="연도" items={years} value={view.y} onPick={(y) => { setDir(0); setView((v) => ({ ...v, y })); }} />
              <Wheel kind="month" label="달" items={months} value={view.m + 1} onPick={(m) => { setDir(0); setView((v) => ({ ...v, m: m - 1 })); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={s.foot}>
        {allowClear && value
          ? <button type="button" className={`${s.textBtn} ${s.clear}`} onClick={() => { onChange(null); onClose(); }} data-dp="clear">날짜 지우기</button>
          : <span />}
        <button type="button" className={s.textBtn} onClick={goToday} aria-label="오늘로 가기" data-dp="today">오늘</button>
      </div>
    </Sheet>
  );
}

// 아이폰 휠: 위아래로 굴리면 가운데 띠에 걸린 값이 골라져요. 눌러도 그 값이 가운데로 와요.
function Wheel({ kind, label, items, value, onPick }: {
  kind: 'year' | 'month'; label: string; items: Array<{ v: number; text: string; dim?: boolean }>; value: number; onPick: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const target = useRef<number | null>(null); // 코드로 굴리는 중이면 그 목적지
  const idx = Math.max(0, items.findIndex((it) => it.v === value));
  const rowH = () => ref.current?.querySelector<HTMLElement>('button')?.offsetHeight || 44;

  // 처음 열 때: 고른 값을 바로 가운데에
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = idx * rowH();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 값이 밖에서 바뀌면(눌러서 고름) 부드럽게 굴려요
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = rowH();
    if (Math.round(el.scrollTop / h) === idx) return;
    target.current = idx;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: idx * h, behavior: calm ? 'auto' : 'smooth' });
  }, [idx]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / rowH())));
    if (target.current !== null) {
      if (i !== target.current) return;
      target.current = null;
    }
    if (items[i].v !== value) onPick(items[i].v);
  };
  const grab = () => { target.current = null; };

  return (
    <div ref={ref} className={`${s.col} ${kind === 'year' ? s.colYear : s.colMonth}`} onScroll={onScroll}
      onPointerDown={grab} onTouchStart={grab} onWheel={grab} role="group" aria-label={label}>
      {items.map((it) => {
        const attr = kind === 'year' ? { 'data-wheel-year': it.v } : { 'data-wheel-month': it.v };
        return (
          <button key={it.v} type="button" className={`${s.item} ${it.v === value ? s.itemOn : ''} ${it.dim ? s.itemDim : ''}`}
            onClick={() => onPick(it.v)} aria-pressed={it.v === value} aria-label={it.text} {...attr}>
            {it.text}
          </button>
        );
      })}
    </div>
  );
}

// 설정·만들기 화면의 한 줄: '생일·예정일   2026년 6월 1일 (월)  📅'
export function DateField({ label, value, onChange, title, placeholder = '날짜 고르기', name, min, max, allowClear }: {
  label: string; value: string | null; onChange: (v: string | null) => void; title?: string; placeholder?: string;
  name?: string; min?: string; max?: string; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={s.field} onClick={() => setOpen(true)} data-date-field={name} data-value={value || ''}>
        <span className={s.fieldLabel}>{label}</span>
        <span className={`${s.fieldValue} ${value ? '' : s.placeholder}`}>{value ? fmtDate(value, true) : placeholder}</span>
        <Icon name="calendar" size={20} className={s.fieldIcon} />
      </button>
      <DatePickerSheet open={open} title={title || label} value={value} onChange={onChange} onClose={() => setOpen(false)} min={min} max={max} allowClear={allowClear} />
    </>
  );
}
