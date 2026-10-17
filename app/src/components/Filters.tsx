// 사진 거르기: 올린 사람 · 날짜 (가족 탭과 모아보기에서 함께 써요)
// 칩은 오른쪽에 모여 있어요. 누르면 아래에서 시트가 올라오고, 고르면 칩이 채워지고 ×로 풀 수 있어요.
// 날짜는 아이폰 달력 앱처럼 달이 위아래로 이어져요. 하루를 누르면 그날만, '이 달 전체'를 누르면 한 달을 봐요.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './ui';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { useSession } from '../state/session';
import { WEEKDAYS, fmtDay, monthCells, ymd } from '../lib/dates';
import s from './Filters.module.css';

export interface Filter { who: string | null; period: string | null } // period: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' (올린 날 기준)
export const NO_FILTER: Filter = { who: null, period: null };
export interface Dated { authorId: string; createdAt: string }

// 올린 날(내 휴대폰 시간)의 'YYYY-MM-DD' / 'YYYY-MM'
const localDay = (iso: string) => ymd(new Date(iso));
const localMonth = (iso: string) => localDay(iso).slice(0, 7);
export const monthOf = localMonth;

export function matches(f: Filter, it: Dated) {
  if (f.who && it.authorId !== f.who) return false;
  if (f.period && !localDay(it.createdAt).startsWith(f.period)) return false;
  return true;
}

// '2026년' · '2026년 8월' · '8월 20일 (목)' (올해가 아니면 '2025년 8월 20일 (목)')
export const periodLabel = (p: string) =>
  p.length === 4 ? `${p}년` : p.length === 7 ? `${p.slice(0, 4)}년 ${Number(p.slice(5))}월` : fmtDay(p);

const pad = (n: number) => String(n).padStart(2, '0');

export function FilterChips({ value, onChange, items, unit = '장' }: {
  value: Filter; onChange: (f: Filter) => void; items: Dated[]; unit?: string;
}) {
  const [sheet, setSheet] = useState<'who' | 'date' | null>(null);
  const member = useSession((st) => st.member);
  return (
    <>
      <div className={s.chips} role="toolbar" aria-label="사진 거르기">
        <Chip on={!!value.who} label={value.who ? member(value.who).displayName : '올린 사람'}
          onOpen={() => setSheet('who')} onClear={() => onChange({ ...value, who: null })} data-chip="who" />
        <Chip on={!!value.period} label={value.period ? periodLabel(value.period) : '날짜'}
          onOpen={() => setSheet('date')} onClear={() => onChange({ ...value, period: null })} data-chip="date" />
      </div>
      <WhoSheet open={sheet === 'who'} onClose={() => setSheet(null)} items={items} unit={unit}
        value={value.who} onPick={(who) => { onChange({ ...value, who }); setSheet(null); }} />
      <DateSheet open={sheet === 'date'} onClose={() => setSheet(null)} items={items} unit={unit}
        value={value.period} onPick={(period) => { onChange({ ...value, period }); setSheet(null); }} />
    </>
  );
}

function Chip({ on, label, onOpen, onClear, ...rest }: { on: boolean; label: string; onOpen: () => void; onClear: () => void; 'data-chip': string }) {
  return (
    <span className={`${s.chip} ${on ? s.on : ''}`} {...rest}>
      <button type="button" className={s.chipMain} onClick={onOpen} aria-haspopup="dialog">
        {label}{!on && <Icon name="down" size={14} stroke={2.4} />}
      </button>
      {on && <button type="button" className={s.chipX} onClick={onClear} aria-label={`${label} 거르기 풀기`}><Icon name="close" size={14} stroke={2.6} /></button>}
    </span>
  );
}

function WhoSheet({ open, onClose, items, value, onPick, unit }: {
  open: boolean; onClose: () => void; items: Dated[]; value: string | null; onPick: (v: string | null) => void; unit: string;
}) {
  const members = useSession((st) => st.members);
  const me = useSession((st) => st.me);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it) => m.set(it.authorId, (m.get(it.authorId) || 0) + 1));
    return m;
  }, [items]);
  // 지금 가족 + 앨범을 떠난 가족(사진은 남아 있어요)
  const member = useSession((st) => st.member);
  const people = [...members.filter((m) => counts.get(m.userId)), ...[...counts.keys()].filter((id) => !members.some((m) => m.userId === id)).map((id) => ({ ...member(id), displayName: '예전 가족' }))];
  return (
    <Sheet open={open} onClose={onClose} title="올린 사람">
      <ul className={s.list}>
        <li><button type="button" className={s.option} onClick={() => onPick(null)} aria-pressed={!value}>
          <span className={s.allIcon}><Icon name="users" size={22} /></span>
          <span className={s.optLabel}>모든 가족</span>
          <small>{items.length}{unit}</small>
          {!value && <Icon name="check" size={20} className={s.check} />}
        </button></li>
        {people.map((m) => (
          <li key={m.userId}><button type="button" className={s.option} onClick={() => onPick(m.userId)} aria-pressed={value === m.userId} data-who={m.displayName}>
            <Avatar src={m.avatar} name={m.displayName} size={40} />
            <span className={s.optLabel}>{m.displayName}{m.userId === me?.id && <em>나</em>}</span>
            <small>{counts.get(m.userId)}{unit}</small>
            {value === m.userId && <Icon name="check" size={20} className={s.check} />}
          </button></li>
        ))}
      </ul>
    </Sheet>
  );
}

function DateSheet({ open, onClose, items, value, onPick, unit }: {
  open: boolean; onClose: () => void; items: Dated[]; value: string | null; onPick: (v: string | null) => void; unit: string;
}) {
  // 날마다·달마다 몇 장인지, 그리고 가장 오래된 달부터 가장 최근 달까지 (빈 달도 이어서)
  const cal = useMemo(() => {
    const byDay = new Map<string, number>();
    const byMonth = new Map<string, number>();
    items.forEach((it) => {
      const d = localDay(it.createdAt);
      byDay.set(d, (byDay.get(d) || 0) + 1);
      byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) || 0) + 1);
    });
    const keys = [...byMonth.keys()].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
    const months: Array<{ k: string; y: number; m: number }> = [];
    if (keys.length) {
      const [lo, hi] = [keys[0], keys[keys.length - 1]];
      for (let y = Number(lo.slice(0, 4)), m = Number(lo.slice(5)) - 1; ; m++) {
        if (m > 11) { m = 0; y++; }
        const k = `${y}-${pad(m + 1)}`;
        months.push({ k, y, m });
        if (k >= hi) break;
      }
    }
    return { byDay, byMonth, months };
  }, [items]);
  const today = ymd(new Date());
  const box = useRef<HTMLDivElement>(null);

  // 열 때: 고른 달(없으면 가장 최근 달)이 바로 보이게
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const want = value ? cal.months.filter((x) => x.k.startsWith(value.slice(0, 7))).pop()?.k : undefined;
    const k = want || cal.months[cal.months.length - 1]?.k;
    const sec = k && el.querySelector<HTMLElement>(`[data-cal-month="${k}"]`);
    let sc = el.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sec || !sc) return;
    const bar = el.querySelector<HTMLElement>('[data-cal-week]')?.offsetHeight || 0;
    sc.scrollTop += sec.getBoundingClientRect().top - sc.getBoundingClientRect().top - bar;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} onClose={onClose} title="날짜" tall>
      <div ref={box} className={s.calBox}>
        <button type="button" className={s.option} onClick={() => onPick(null)} aria-pressed={!value} data-day-all>
          <span className={s.allIcon}><Icon name="calendar" size={22} /></span>
          <span className={s.optLabel}>모든 날짜</span>
          <small>{items.length}{unit}</small>
          {!value && <Icon name="check" size={20} className={s.check} />}
        </button>

        <div className={s.weekBar} data-cal-week aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>

        {cal.months.map(({ k, y, m }) => {
          const n = cal.byMonth.get(k) || 0;
          const cells = monthCells(y, m);
          while (cells.length % 7) cells.push(null);
          const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
          return (
            <section key={k} className={s.mon} data-cal-month={k} aria-label={`${y}년 ${m + 1}월`}>
              <div className={s.monHead}>
                <h3 className={s.monTitle}>{y}년 {m + 1}월</h3>
                <button type="button" className={`${s.pill} ${value === k ? s.pillOn : ''}`} disabled={!n}
                  onClick={() => onPick(k)} aria-pressed={value === k} aria-label={`${y}년 ${m + 1}월 전체 ${n}${unit}`} data-month={k}>
                  {n ? `이 달 전체 ${n}${unit}` : '사진 없음'}
                </button>
              </div>
              {weeks.map((w, wi) => (
                <div key={wi} className={s.wk}>
                  {w.map((d, di) => {
                    if (!d) return <span key={di} className={s.blank} />;
                    const key = `${k}-${pad(d)}`;
                    const c = cal.byDay.get(key) || 0;
                    const mark = key === today ? s.isToday : value === key ? s.isSel : '';
                    const num = <span className={`${s.num} ${mark} ${key === today && value === key ? s.isBoth : ''}`}>{d}</span>;
                    return c ? (
                      <button key={di} type="button" className={`${s.cell} ${s.has}`} onClick={() => onPick(key)}
                        aria-pressed={value === key} aria-label={`${m + 1}월 ${d}일 ${c}${unit}`} data-day-pick={key}>
                        {num}<i className={s.dot} />
                      </button>
                    ) : (
                      <span key={di} className={s.cell}>{num}</span>
                    );
                  })}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
