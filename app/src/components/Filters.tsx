// 사진 거르기: 올린 사람(사람 아이콘) · 날짜(달력 아이콘) — 홈 · 모아보기 · 가족 탭에서 함께 써요
// 버튼은 글씨 없이 아이콘만. 고르면 버튼이 진하게 채워지고, 무엇을 골랐는지는 아래 한 줄(FilterSummary)에 나와요.
// 날짜: 하루 · 한 달 / 한 해 · 그 해의 달 / 기간(시작일 ~ 끝날) / 생후 N개월(아기 앨범). 언제나 올린 날 기준이에요
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './ui';
import { Icon, type IconName } from './Icon';
import { Avatar } from './Avatar';
import { useSession } from '../state/session';
import { hasBatchim } from '../lib/korean';
import { WEEKDAYS, addDays, babyMonths, fmtDay, monthCells, toDate, ymd } from '../lib/dates';
import s from './Filters.module.css';

/** period: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | 'YYYY-MM-DD~YYYY-MM-DD'(기간) | 'm:N'(생후 N개월) | 'm:A-B'(생후 A~B개월) */
export interface Filter { who: string | null; period: string | null }
export const NO_FILTER: Filter = { who: null, period: null };
export interface Dated { authorId: string; createdAt: string }
/** 이 사진의 날짜: 올린 날 */
export const dayOf = (it: Dated) => ymd(new Date(it.createdAt));

const pad = (n: number) => String(n).padStart(2, '0');

/** 생후 n개월이 시작하는 날 (babyMonths와 같은 셈: 31일생은 짧은 달엔 마지막 날) */
export function babyMonthStart(birthday: string, n: number) {
  const b = toDate(birthday)!;
  const t = new Date(b.getFullYear(), b.getMonth() + n, 1);
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(b.getDate(), end)));
}

/** 기간 → [시작일, 끝 다음날) 'YYYY-MM-DD' (아기 개월은 생일이 있어야 해요) */
export function periodRange(p: string, birthday?: string | null): [string, string] | null {
  if (/^\d{4}$/.test(p)) return [`${p}-01-01`, `${+p + 1}-01-01`];
  if (/^\d{4}-\d{2}$/.test(p)) return [`${p}-01`, ymd(new Date(+p.slice(0, 4), +p.slice(5, 7), 1))];
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return [p, addDays(p, 1)];
  const r = p.match(/^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/);
  if (r) { const [a, b] = r[1] <= r[2] ? [r[1], r[2]] : [r[2], r[1]]; return [a, addDays(b, 1)]; }
  const m = p.match(/^m:(\d{1,3})(?:-(\d{1,3}))?$/);
  if (m && birthday) return [babyMonthStart(birthday, +m[1]), babyMonthStart(birthday, +(m[2] ?? m[1]) + 1)];
  return null;
}

export function matches(f: Filter, it: Dated, birthday?: string | null) {
  if (f.who && it.authorId !== f.who) return false;
  if (f.period) {
    const r = periodRange(f.period, birthday);
    const d = dayOf(it);
    if (!r || d < r[0] || d >= r[1]) return false;
  }
  return true;
}

// 돌: 0~11개월은 첫 돌까지, 12~23개월은 두 돌까지 …
const DOL = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const dolTitle = (i: number) => `${DOL[i] ?? `${i + 1}번째`} 돌까지`;

// '2026년' · '2026년 8월' · '8월 20일 (목)' · '8월 1일 ~ 8월 15일' · '생후 3개월' · '생후 0~11개월'
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;
export function periodLabel(p: string) {
  if (p.length === 4) return `${p}년`;
  if (p.length === 7) return `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`;
  if (p.length === 10) return fmtDay(p);
  const r = p.match(/^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/);
  if (r) {
    const [a, b] = r[1] <= r[2] ? [r[1], r[2]] : [r[2], r[1]];
    if (a === b) return fmtDay(a);
    const thisYear = String(new Date().getFullYear());
    const y = (d: string) => (d.slice(0, 4) === thisYear && a.slice(0, 4) === b.slice(0, 4) ? '' : `${d.slice(0, 4)}년 `);
    return `${y(a)}${md(a)} ~ ${a.slice(0, 4) === b.slice(0, 4) ? '' : `${b.slice(0, 4)}년 `}${md(b)}`;
  }
  const m = p.match(/^m:(\d+)(?:-(\d+))?$/);
  if (m && m[2]) return `생후 ${m[1]}~${m[2]}개월`;
  if (m) return +m[1] === 0 ? '생후 첫 달' : `생후 ${m[1]}개월`;
  return p;
}

// ---------- 버튼: 아이콘만 (고르면 진하게) ----------
function FilterButton({ icon, label, on, onOpen, ...rest }: {
  icon: IconName; label: string; on: boolean; onOpen: () => void; 'data-chip': string;
}) {
  return (
    <button type="button" className={`${s.iconBtn} ${on ? s.on : ''}`} onClick={onOpen} aria-haspopup="dialog" aria-pressed={on} aria-label={label} {...rest}>
      <Icon name={icon} size={20} stroke={2} />
    </button>
  );
}

/** 날짜 버튼 (+ 시트) */
export function DateFilter({ value, onChange, items, unit = '장', birthday }: {
  value: string | null; onChange: (p: string | null) => void; items: Dated[]; unit?: string; birthday?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FilterButton icon="calendar" label={value ? `날짜: ${periodLabel(value)}` : '날짜로 보기'} on={!!value} onOpen={() => setOpen(true)} data-chip="date" />
      <DateSheet open={open} onClose={() => setOpen(false)} items={items} unit={unit} birthday={birthday}
        value={value} onPick={(p) => { onChange(p); setOpen(false); }} />
    </>
  );
}

/** 올린 사람 · 날짜 아이콘 두 개 (나란히) */
export function FilterIcons({ value, onChange, items, unit = '장', birthday }: {
  value: Filter; onChange: (f: Filter) => void; items: Dated[]; unit?: string; birthday?: string | null;
}) {
  const [who, setWho] = useState(false);
  const member = useSession((st) => st.member);
  return (
    <span className={s.icons} role="toolbar" aria-label="사진 거르기">
      <FilterButton icon="user" label={value.who ? `올린 사람: ${member(value.who).displayName}` : '올린 사람으로 보기'} on={!!value.who} onOpen={() => setWho(true)} data-chip="who" />
      <DateFilter value={value.period} onChange={(period) => onChange({ ...value, period })} items={items} unit={unit} birthday={birthday} />
      <WhoSheet open={who} onClose={() => setWho(false)} items={items} unit={unit}
        value={value.who} onPick={(w) => { onChange({ ...value, who: w }); setWho(false); }} />
    </span>
  );
}

// 고른 것: '2025년 8월에 엄마가 올린 사진'
function Chosen({ value }: { value: Filter }) {
  const member = useSession((st) => st.member);
  const name = value.who ? member(value.who).displayName : '';
  return (
    <>
      {value.period && <><b>{periodLabel(value.period)}</b>에 </>}
      {name && <><b>{name}</b>{hasBatchim(name) ? '이' : '가'} </>}
      올린 사진
    </>
  );
}

/** 고른 것 한 줄 + 모두 보기 (홈 위쪽, 고른 게 없으면 안 보여요) */
export function FilterSummary({ value, onClear }: { value: Filter; onClear: () => void }) {
  if (!value.who && !value.period) return null;
  return (
    <div className={s.summary} data-f="filter-summary">
      <span><Chosen value={value} /></span>
      <button type="button" onClick={onClear} data-f="filter-all">모두 보기</button>
    </div>
  );
}

/** 모아보기 · 가족 탭: 왼쪽에 몇 개인지(고르면 고른 것), 오른쪽에 아이콘 두 개 */
export function FilterBar({ value, onChange, items, shown, label, unit = '장', birthday }: {
  value: Filter; onChange: (f: Filter) => void; items: Dated[]; shown: number; label: string; unit?: string; birthday?: string | null;
}) {
  const on = !!(value.who || value.period);
  return (
    <div className={s.bar} data-f="filter-bar">
      <p className={s.barText} data-f="filter-text">
        {on ? <><Chosen value={value} /><small> · {shown}{unit}</small></> : <>{label} <small>{items.length}{unit}</small></>}
      </p>
      {on && <button type="button" className={s.barClear} onClick={() => onChange(NO_FILTER)} data-f="filter-all">모두 보기</button>}
      <FilterIcons value={value} onChange={onChange} items={items} unit={unit} birthday={birthday} />
    </div>
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
  const people = [...members.filter((m) => counts.get(m.userId)), ...[...counts.keys()].filter((id) => !members.some((m) => m.userId === id)).map((id) => ({ ...member(id), displayName: '예전 멤버' }))];
  return (
    <Sheet open={open} onClose={onClose} title="올린 사람">
      <ul className={s.list}>
        <li><button type="button" className={s.option} onClick={() => onPick(null)} aria-pressed={!value}>
          <span className={s.allIcon}><Icon name="users" size={22} /></span>
          <span className={s.optLabel}>모든 사람</span>
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

// ---------- 날짜로 보기 ----------
// 네 가지 모두 같은 모양이에요: 위에 고르는 방법 · '모든 날짜' (붙어 있어요)
// → 묶음마다 분홍 제목 + 오른쪽 '전체' 버튼 + 동그란 칸들(올린 게 있으면 점)
type Tab = 'day' | 'year' | 'range' | 'baby';
const tabOf = (v: string | null): Tab => (!v ? 'day' : v.length === 4 ? 'year' : v.includes('~') ? 'range' : v.startsWith('m:') ? 'baby' : 'day');
const MONTHS = Array.from({ length: 12 }, (_, i) => i);

interface Cell { key: string; label: string; count: number; pick: string; today?: boolean; off?: boolean }
interface Section { key: string; title: string; sub?: string; all: { pick: string; count: number; label: string } | null; week?: boolean; cols: number; cells: (Cell | null)[] }

function DateSheet({ open, onClose, items, value, onPick, unit, birthday }: {
  open: boolean; onClose: () => void; items: Dated[]; value: string | null; onPick: (v: string | null) => void; unit: string; birthday?: string | null;
}) {
  const [tab, setTab] = useState<Tab>(tabOf(value));
  // 기간: 처음 누른 날 ~ 다음에 누른 날
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    setTab(tabOf(value));
    const r = value?.match(/^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/);
    setA(r ? r[1] : null); setB(r ? r[2] : null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 날마다·달마다·해마다·생후 개월마다 몇 개인지
  const cal = useMemo(() => {
    const byDay = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const byYear = new Map<string, number>();
    const byAge = new Map<number, number>();
    items.forEach((it) => {
      const d = dayOf(it);
      byDay.set(d, (byDay.get(d) || 0) + 1);
      byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) || 0) + 1);
      byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) || 0) + 1);
      const n = birthday ? babyMonths(birthday, d) : null;
      if (n !== null && n >= 0) byAge.set(n, (byAge.get(n) || 0) + 1);
    });
    // 가장 오래된 달부터 가장 최근 달까지 (빈 달도 이어서)
    const keys = [...byMonth.keys()].sort();
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
    const years = keys.length ? Array.from({ length: +keys[keys.length - 1].slice(0, 4) - +keys[0].slice(0, 4) + 1 }, (_, i) => String(+keys[0].slice(0, 4) + i)) : [];
    return { byDay, byMonth, byYear, byAge, months, years };
  }, [items, birthday]);

  const today = ymd(new Date());
  const thisMonth = today.slice(0, 7);
  const ageNow = birthday ? babyMonths(birthday, today) : null;
  const [lo, hi] = a && b ? (a <= b ? [a, b] : [b, a]) : [a, a];
  const tapRange = (d: string) => { if (!a || b) { setA(d); setB(null); } else setB(d); };
  const sumDays = (x: string, y: string) => [...cal.byDay.entries()].filter(([d]) => d >= x && d <= y).reduce((n, [, c]) => n + c, 0);
  const rangeCount = lo && hi ? sumDays(lo, hi) : 0;

  // 지금 고르는 방법의 묶음들
  const sections: Section[] = useMemo(() => {
    if (tab === 'year') {
      return cal.years.map((y) => ({
        key: y, title: `${y}년`, cols: 4,
        all: { pick: y, count: cal.byYear.get(y) || 0, label: '이 해 전체' },
        cells: MONTHS.map((m) => {
          const k = `${y}-${pad(m + 1)}`;
          return { key: k, label: `${m + 1}월`, count: cal.byMonth.get(k) || 0, pick: k, today: k === thisMonth };
        }),
      }));
    }
    if (tab === 'baby') {
      if (!birthday) return [];
      const top = Math.max(ageNow ?? 0, ...cal.byAge.keys());
      return Array.from({ length: Math.floor(top / 12) + 1 }, (_, i) => {
        const [from, to] = [i * 12, i * 12 + 11];
        const count = [...cal.byAge.entries()].filter(([n]) => n >= from && n <= to).reduce((x, [, c]) => x + c, 0);
        return {
          key: `a${i}`, title: dolTitle(i), sub: `생후 ${from}~${to}개월`, cols: 4,
          all: { pick: `m:${from}-${to}`, count, label: '1년 전체' },
          cells: MONTHS.map((j) => {
            const n = from + j;
            return { key: `m:${n}`, label: `${n}개월`, count: cal.byAge.get(n) || 0, pick: `m:${n}`, today: n === ageNow, off: ageNow !== null && n > ageNow };
          }),
        };
      });
    }
    // 날짜 · 기간: 달력
    return cal.months.map(({ k, y, m }) => {
      const last = `${k}-${pad(new Date(y, m + 1, 0).getDate())}`;
      return {
        key: k, title: `${y}년 ${m + 1}월`, cols: 7, week: true,
        all: { pick: tab === 'range' ? `${k}-01~${last}` : k, count: cal.byMonth.get(k) || 0, label: '이 달 전체' },
        cells: monthCells(y, m).map((d) => {
          if (!d) return null;
          const key = `${k}-${pad(d)}`;
          return { key, label: String(d), count: cal.byDay.get(key) || 0, pick: key, today: key === today };
        }),
      };
    });
  }, [tab, cal, birthday, ageNow, today, thisMonth]);

  // 시트를 열거나 방법을 바꾸면: 고른 묶음(없으면 가장 최근 묶음)이 바로 보이게
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el || !sections.length) return;
    const at = tab === 'range' ? a : value;
    let want: string | undefined;
    if (at && tab === 'year') want = at.slice(0, 4);
    else if (at && (tab === 'day' || tab === 'range') && /^\d{4}-\d{2}/.test(at)) want = at.slice(0, 7);
    else if (at && tab === 'baby') { const n = at.match(/^m:(\d+)/); if (n) want = `a${Math.floor(+n[1] / 12)}`; }
    const k = sections.some((x) => x.key === want) ? want! : sections[sections.length - 1].key;
    const sec = el.querySelector<HTMLElement>(`[data-sec="${k}"]`);
    let sc = el.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sec || !sc) return;
    const bar = el.querySelector<HTMLElement>('[data-cal-top]')?.offsetHeight || 0; // 위에 붙은 띠만큼 덜 내려요
    sc.scrollTop += sec.getBoundingClientRect().top - sc.getBoundingClientRect().top - bar;
  }, [open, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: Array<[Tab, string]> = [['day', '날짜'], ['year', '연도'], ['range', '기간'], ...(birthday ? [['baby', '개월'] as [Tab, string]] : [])];
  const isRange = tab === 'range';
  // 칸을 누르면: 날짜 · 연도 · 개월은 바로 보기, 기간은 시작일 → 끝날
  const pickCell = (c: Cell) => (isRange ? tapRange(c.pick) : onPick(c.pick));
  const pickAll = (sec: Section) => {
    if (!sec.all) return;
    if (!isRange) { onPick(sec.all.pick); return; }
    const [x, y] = sec.all.pick.split('~');
    setA(x); setB(y);
  };
  const allOn = (sec: Section) => (isRange ? !!sec.all && sec.all.pick === `${lo}~${hi}` : value === sec.all?.pick);
  const attr = (c: Cell) => (tab === 'year' ? { 'data-year-month': c.pick } : tab === 'baby' ? { 'data-baby-month': c.pick.slice(2) } : isRange ? { 'data-range-day': c.pick } : { 'data-day-pick': c.pick });
  const allAttr = (sec: Section) => (tab === 'year' ? { 'data-year': sec.key } : tab === 'baby' ? { 'data-baby-year': sec.key.slice(1) } : { 'data-month': sec.key });

  return (
    <Sheet open={open} onClose={onClose} title="날짜로 보기" tall>
      <div ref={box} className={s.calBox}>
        {/* 고르는 방법 · '모든 날짜'는 어느 방법이든 같은 자리에 붙어 있어요 */}
        <div className={s.calTop} data-cal-top>
          <div className={s.tabs} role="tablist">
            {tabs.map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? s.tabOn : ''} onClick={() => setTab(t)} data-date-tab={t}>{label}</button>
            ))}
          </div>
          <button type="button" className={`${s.option} ${s.allRow}`} onClick={() => onPick(null)} aria-pressed={!value} data-day-all>
            <span className={s.allIcon}><Icon name="calendar" size={22} /></span>
            <span className={s.optLabel}>모든 날짜</span>
            <small>{items.length}{unit}</small>
            {!value && <Icon name="check" size={20} className={s.check} />}
          </button>
        </div>

        {tab === 'baby' && !birthday && <p className={s.calEmpty}>아기 생일을 넣으면 개월로 볼 수 있어요</p>}
        {sections.map((sec) => (
          <section key={sec.key} className={s.mon} data-sec={sec.key} data-cal-month={sec.cols === 7 ? sec.key : undefined} aria-label={sec.title}>
            <div className={s.monHead}>
              <h3 className={s.monTitle}>{sec.title}{sec.sub && <small>{sec.sub}</small>}</h3>
              {sec.all && (
                <button type="button" className={`${s.pill} ${allOn(sec) ? s.pillOn : ''}`} disabled={!sec.all.count}
                  onClick={() => pickAll(sec)} aria-pressed={allOn(sec)} aria-label={`${sec.title} ${sec.all.label} ${sec.all.count}${unit}`} {...allAttr(sec)}>
                  {sec.all.count ? `${sec.all.label} ${sec.all.count}${unit}` : '사진 없음'}
                </button>
              )}
            </div>
            {sec.week && <div className={s.weekBar} aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>}
            <div className={`${s.cells} ${sec.cols === 4 ? s.cells4 : ''}`}>
              {sec.cells.map((c, i) => {
                if (!c) return <span key={`b${i}`} className={s.blank} />;
                const edge = isRange && (c.pick === lo || c.pick === hi);
                const inside = isRange && !!lo && !!hi && c.pick > lo && c.pick < hi;
                const sel = isRange ? edge : value === c.pick;
                // 기간은 사진이 없는 날도 고를 수 있어요
                const can = !c.off && (isRange || c.count > 0);
                const num = <span className={`${s.num} ${sec.cols === 4 ? s.numWide : ''} ${sel ? s.isSel : c.today ? s.isToday : ''} ${sel && c.today ? s.isBoth : ''}`}>{c.label}</span>;
                return can ? (
                  <button key={c.key} type="button" className={`${s.cell} ${c.count ? s.has : ''} ${inside ? s.inRange : ''}`} onClick={() => pickCell(c)}
                    aria-pressed={sel} aria-label={`${sec.cols === 7 ? `${sec.title} ${c.label}일` : c.label} ${c.count}${unit}`} {...attr(c)}>
                    {num}{c.count ? <i className={s.dot} /> : null}
                  </button>
                ) : (
                  <span key={c.key} className={`${s.cell} ${c.off ? s.off : ''}`} {...attr(c)}>{num}</span>
                );
              })}
            </div>
          </section>
        ))}

        {isRange && (
          <div className={s.rangeBar} data-f="range-bar">
            <span>{!lo ? '시작하는 날을 눌러 주세요' : !b ? <>{md(lo)}부터 · <em>끝나는 날을 눌러 주세요</em></> : `${md(lo)} ~ ${md(hi!)} · ${rangeCount}${unit}`}</span>
            <button type="button" disabled={!lo} onClick={() => lo && onPick(`${lo}~${hi || lo}`)} data-range-apply>이 기간 보기</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
