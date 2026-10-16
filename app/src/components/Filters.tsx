// 사진 거르기: 올린 사람 · 날짜 (가족 탭과 모아보기에서 함께 써요)
// 칩을 누르면 아래에서 시트가 올라와요. 고르면 칩이 채워지고 ×로 풀 수 있어요.
import { useMemo, useState } from 'react';
import { Sheet } from './ui';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { useSession } from '../state/session';
import s from './Filters.module.css';

export interface Filter { who: string | null; period: string | null } // period: 'YYYY' | 'YYYY-MM' (올린 날 기준)
export const NO_FILTER: Filter = { who: null, period: null };
export interface Dated { authorId: string; createdAt: string }

// 올린 날(내 휴대폰 시간)의 'YYYY-MM'
const localMonth = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const monthOf = localMonth;

export function matches(f: Filter, it: Dated) {
  if (f.who && it.authorId !== f.who) return false;
  if (f.period && !localMonth(it.createdAt).startsWith(f.period)) return false;
  return true;
}

export const periodLabel = (p: string) => (p.length === 4 ? `${p}년` : `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`);

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
  const people = members.filter((m) => counts.get(m.userId));
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
  const years = useMemo(() => {
    const byMonth = new Map<string, number>();
    items.forEach((it) => { const k = localMonth(it.createdAt); byMonth.set(k, (byMonth.get(k) || 0) + 1); });
    const ys = [...new Set([...byMonth.keys()].map((k) => k.slice(0, 4)))].sort().reverse();
    return ys.map((y) => ({
      y,
      total: [...byMonth.entries()].filter(([k]) => k.startsWith(y)).reduce((n, [, c]) => n + c, 0),
      months: Array.from({ length: 12 }, (_, i) => {
        const k = `${y}-${String(i + 1).padStart(2, '0')}`;
        return { k, m: i + 1, n: byMonth.get(k) || 0 };
      }),
    }));
  }, [items]);
  return (
    <Sheet open={open} onClose={onClose} title="날짜">
      <button type="button" className={s.option} onClick={() => onPick(null)} aria-pressed={!value}>
        <span className={s.allIcon}><Icon name="calendar" size={22} /></span>
        <span className={s.optLabel}>모든 날짜</span>
        <small>{items.length}{unit}</small>
        {!value && <Icon name="check" size={20} className={s.check} />}
      </button>
      {years.map(({ y, total, months }) => (
        <section key={y} className={s.year}>
          <button type="button" className={`${s.yearHead} ${value === y ? s.picked : ''}`} onClick={() => onPick(y)} aria-pressed={value === y}>
            <b>{y}년</b><small>{total}{unit}</small>
          </button>
          <div className={s.months}>
            {months.map(({ k, m, n }) => (
              <button key={k} type="button" className={`${s.month} ${value === k ? s.picked : ''}`} disabled={!n}
                onClick={() => onPick(k)} aria-pressed={value === k} aria-label={`${y}년 ${m}월 ${n}${unit}`} data-month={k}>
                <b>{m}월</b><small>{n ? `${n}${unit}` : ''}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  );
}
