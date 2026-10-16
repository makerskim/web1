// 날짜 고르기: 휴대폰 기본 달력 대신, 아래에서 올라오는 깔끔한 달력 (아이폰 달력처럼)
// - 날짜를 누르면 바로 정해져요. 위 '2026년 6월'을 누르면 연·월을 한 번에 골라요.
// - 옆으로 밀거나 ‹ › 로 달을 넘겨요.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sheet } from './ui';
import { Icon } from './Icon';
import { fmtDate, toDate, ymd } from '../lib/dates';
import s from './DatePicker.module.css';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const ease = [0.22, 1, 0.36, 1] as const;

export function DatePickerSheet({ open, title, value, onChange, onClose, min, max, allowClear = false }: {
  open: boolean; title: string; value: string | null; onChange: (v: string | null) => void; onClose: () => void;
  min?: string; max?: string; allowClear?: boolean;
}) {
  const today = ymd(new Date());
  const start = toDate(value) || new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const [dir, setDir] = useState(0);
  useEffect(() => {
    if (!open) return;
    const d = toDate(value) || new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setMode('days');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (n: number) => {
    setDir(n);
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };
  const inRange = (k: string) => (!min || k >= min) && (!max || k <= max);
  const pick = (k: string) => {
    if (!inRange(k)) return;
    onChange(k);
    setTimeout(onClose, 140); // 고른 날이 잠깐 보이고 닫혀요
  };

  // 달력 칸: 앞쪽 빈칸 + 그 달의 날들
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as (number | null)[];
  }, [view]);

  // 옆으로 밀어서 달 넘기기
  const sw = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { sw.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const a = sw.current;
    sw.current = null;
    if (!a) return;
    const dx = e.clientX - a.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - a.y) * 1.4) move(dx < 0 ? 1 : -1);
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={s.head}>
        <button type="button" className={s.monthBtn} onClick={() => setMode(mode === 'days' ? 'months' : 'days')} aria-expanded={mode === 'months'} data-dp="title">
          {mode === 'days' ? `${view.y}년 ${view.m + 1}월` : `${view.y}년`}
          <Icon name="down" size={18} stroke={2.4} className={mode === 'months' ? s.flip : ''} />
        </button>
        <span className={s.navs}>
          <button type="button" className={s.nav} onClick={() => (mode === 'days' ? move(-1) : setView((v) => ({ ...v, y: v.y - 1 })))} aria-label={mode === 'days' ? '이전 달' : '이전 해'} data-dp="prev"><Icon name="back" size={22} stroke={2.2} /></button>
          <button type="button" className={s.nav} onClick={() => (mode === 'days' ? move(1) : setView((v) => ({ ...v, y: v.y + 1 })))} aria-label={mode === 'days' ? '다음 달' : '다음 해'} data-dp="next"><Icon name="right" size={22} stroke={2.2} /></button>
        </span>
      </div>

      {mode === 'months' ? (
        <div className={s.months}>
          {Array.from({ length: 12 }, (_, i) => {
            const on = toDate(value)?.getFullYear() === view.y && toDate(value)?.getMonth() === i;
            return (
              <button key={i} type="button" className={`${s.monthCell} ${on ? s.on : ''}`} onClick={() => { setView((v) => ({ ...v, m: i })); setMode('days'); }} data-dp-month={i + 1}>
                {i + 1}월
              </button>
            );
          })}
        </div>
      ) : (
        <div className={s.cal} onPointerDown={onDown} onPointerUp={onUp}>
          <div className={s.week}>{WEEK.map((w, i) => <span key={w} className={i === 0 ? s.sun : i === 6 ? s.sat : ''}>{w}</span>)}</div>
          <div className={s.viewport}>
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div key={`${view.y}-${view.m}`} className={s.grid} custom={dir}
                variants={{ enter: (d: number) => ({ x: d * 48, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d * -48, opacity: 0 }) }}
                initial="enter" animate="center" exit="exit" transition={{ duration: 0.26, ease }}>
                {cells.map((d, i) => {
                  if (!d) return <span key={`b${i}`} />;
                  const k = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const sel = k === value;
                  return (
                    <button key={k} type="button" disabled={!inRange(k)} onClick={() => pick(k)} data-day={k}
                      className={`${s.day} ${sel ? s.sel : ''} ${k === today ? s.today : ''} ${i % 7 === 0 ? s.sun : ''}`}
                      aria-pressed={sel} aria-label={fmtDate(k, true)}>
                      {d}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className={s.foot}>
        <button type="button" className={s.chip} onClick={() => { const d = new Date(); setDir(0); setView({ y: d.getFullYear(), m: d.getMonth() }); setMode('days'); }}>오늘로 가기</button>
        {allowClear && value && <button type="button" className={`${s.chip} ${s.clear}`} onClick={() => { onChange(null); onClose(); }}>날짜 지우기</button>}
      </div>
    </Sheet>
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
