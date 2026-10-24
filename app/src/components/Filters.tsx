// 사진 거르기: 올린 사람(사람 모양) · 날짜(달력 모양) — 홈 · 모아보기 · 가족 탭에서 함께 써요
// 두 버튼은 양옆에 같은 모양으로 놓여요. 누르면 아래에서 시트가 올라오고, 고르면 버튼이 채워지고 ×로 풀어요.
// 날짜: 하루 · 한 달(달력) / 한 해 / 기간(시작일 ~ 끝날) / 생후 N개월(아기 앨범). 사진을 찍은 날 기준이에요 (없으면 올린 날)
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Sheet } from './ui';
import { Icon, type IconName } from './Icon';
import { Avatar } from './Avatar';
import { useSession } from '../state/session';
import { WEEKDAYS, addDays, babyMonths, fmtDay, monthCells, toDate, ymd } from '../lib/dates';
import s from './Filters.module.css';

/** period: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | 'YYYY-MM-DD~YYYY-MM-DD'(기간) | 'm:N'(생후 N개월) */
export interface Filter { who: string | null; period: string | null }
export const NO_FILTER: Filter = { who: null, period: null };
export interface Dated { authorId: string; createdAt: string; takenAt?: string | null }
/** 이 사진의 날짜: 찍은 날 (없으면 올린 날) */
export const dayOf = (it: Dated) => ymd(new Date(it.takenAt || it.createdAt));

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
  const m = p.match(/^m:(\d{1,3})$/);
  if (m && birthday) return [babyMonthStart(birthday, +m[1]), babyMonthStart(birthday, +m[1] + 1)];
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

// '2026년' · '2026년 8월' · '8월 20일 (목)' · '8월 1일 ~ 8월 15일' · '생후 3개월'
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
  const m = p.match(/^m:(\d+)$/);
  if (m) return +m[1] === 0 ? '생후 첫 달' : `생후 ${m[1]}개월`;
  return p;
}

// ---------- 버튼: 아이콘 + 이름 (고르면 채워지고 ×) ----------
function FilterButton({ icon, label, on, onOpen, onClear, compact, ...rest }: {
  icon: IconName; label: string; on: boolean; onOpen: () => void; onClear: () => void; compact?: boolean; 'data-chip': string;
}) {
  return (
    <span className={`${s.chip} ${on ? s.on : ''} ${compact && !on ? s.iconOnly : ''}`} {...rest}>
      <button type="button" className={s.chipMain} onClick={onOpen} aria-haspopup="dialog" aria-label={compact && !on ? label : undefined}>
        <Icon name={icon} size={18} stroke={2} />{(!compact || on) && <span className={s.chipText}>{label}</span>}
      </button>
      {on && <button type="button" className={s.chipX} onClick={onClear} aria-label={`${label} 거르기 풀기`}><Icon name="close" size={14} stroke={2.6} /></button>}
    </span>
  );
}

/** 날짜 버튼 하나 (+ 시트). compact: 고르기 전엔 달력 아이콘만 (홈 위쪽) */
export function DateFilter({ value, onChange, items, unit = '장', birthday, compact }: {
  value: string | null; onChange: (p: string | null) => void; items: Dated[]; unit?: string; birthday?: string | null; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FilterButton icon="calendar" label={value ? periodLabel(value) : '날짜'} on={!!value} compact={compact}
        onOpen={() => setOpen(true)} onClear={() => onChange(null)} data-chip="date" />
      <DateSheet open={open} onClose={() => setOpen(false)} items={items} unit={unit} birthday={birthday}
        value={value} onPick={(p) => { onChange(p); setOpen(false); }} />
    </>
  );
}

/** 올린 사람(왼쪽) · 가운데(선택) · 날짜(오른쪽) — 양옆 대칭 */
export function FilterChips({ value, onChange, items, unit = '장', birthday, middle }: {
  value: Filter; onChange: (f: Filter) => void; items: Dated[]; unit?: string; birthday?: string | null; middle?: ReactNode;
}) {
  const [who, setWho] = useState(false);
  const member = useSession((st) => st.member);
  return (
    <>
      <div className={s.chips} role="toolbar" aria-label="사진 거르기">
        <div className={s.side}>
          <FilterButton icon="user" label={value.who ? member(value.who).displayName : '올린 사람'} on={!!value.who}
            onOpen={() => setWho(true)} onClear={() => onChange({ ...value, who: null })} data-chip="who" />
        </div>
        {middle && <div className={s.middle}>{middle}</div>}
        <div className={`${s.side} ${s.end}`}>
          <DateFilter value={value.period} onChange={(period) => onChange({ ...value, period })} items={items} unit={unit} birthday={birthday} />
        </div>
      </div>
      <WhoSheet open={who} onClose={() => setWho(false)} items={items} unit={unit}
        value={value.who} onPick={(w) => { onChange({ ...value, who: w }); setWho(false); }} />
    </>
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

type Tab = 'day' | 'year' | 'range' | 'baby';
const tabOf = (v: string | null): Tab => (!v ? 'day' : v.length === 4 ? 'year' : v.includes('~') ? 'range' : v.startsWith('m:') ? 'baby' : 'day');

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

  // 날마다·달마다·해마다 몇 개인지, 그리고 가장 오래된 달부터 가장 최근 달까지 (빈 달도 이어서)
  const cal = useMemo(() => {
    const byDay = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const byYear = new Map<string, number>();
    items.forEach((it) => {
      const d = dayOf(it);
      byDay.set(d, (byDay.get(d) || 0) + 1);
      byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) || 0) + 1);
      byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) || 0) + 1);
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
    return { byDay, byMonth, byYear, months };
  }, [items]);
  // 아기 개월: 사진이 있는 개월만 (생후 N개월마다 몇 개인지)
  const babyRows = useMemo(() => {
    if (!birthday) return [];
    const by = new Map<number, number>();
    items.forEach((it) => { const n = babyMonths(birthday, dayOf(it)); if (n !== null && n >= 0) by.set(n, (by.get(n) || 0) + 1); });
    // 사진이 있는 개월만 (최근부터)
    return [...by.entries()].sort((x, y) => y[0] - x[0]).map(([n, count]) => ({ n, count }));
  }, [items, birthday]);
  const today = ymd(new Date());
  const box = useRef<HTMLDivElement>(null);

  // 달력을 열 때: 고른 달(없으면 가장 최근 달)이 바로 보이게
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el || (tab !== 'day' && tab !== 'range')) return;
    const at = tab === 'range' ? a : value;
    const want = at && /^\d{4}-\d{2}/.test(at) ? cal.months.filter((x) => x.k.startsWith(at.slice(0, 7))).pop()?.k : undefined;
    const k = want || cal.months[cal.months.length - 1]?.k;
    const sec = k && el.querySelector<HTMLElement>(`[data-cal-month="${k}"]`);
    let sc = el.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sec || !sc) return;
    const bar = el.querySelector<HTMLElement>('[data-cal-top]')?.offsetHeight || 0; // 위에 붙은 띠만큼 덜 내려요
    sc.scrollTop += sec.getBoundingClientRect().top - sc.getBoundingClientRect().top - bar;
  }, [open, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const [lo, hi] = a && b ? (a <= b ? [a, b] : [b, a]) : [a, a];
  const rangeCount = lo && hi ? [...cal.byDay.entries()].filter(([d]) => d >= lo && d <= hi).reduce((n, [, c]) => n + c, 0) : 0;
  const tapRange = (d: string) => { if (!a || b) { setA(d); setB(null); } else setB(d); };
  const tabs: Array<[Tab, string]> = [['day', '날짜'], ['year', '연도'], ['range', '기간'], ...(birthday ? [['baby', '개월'] as [Tab, string]] : [])];

  return (
    <Sheet open={open} onClose={onClose} title="날짜로 보기" tall>
      <div ref={box} className={s.calBox}>
        {/* 고르는 방법 · '모든 날짜' · 요일 줄은 위에 붙어 있어요 */}
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
          {tab === 'range' && <p className={s.rangeHint}>{!a ? '시작하는 날을 눌러 주세요' : !b ? '끝나는 날을 눌러 주세요' : '다시 누르면 새로 골라요'}</p>}
          {(tab === 'day' || tab === 'range') && <div className={s.weekBar} data-cal-week aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>}
        </div>

        {tab === 'year' && (
          <ul className={s.list}>
            {[...cal.byYear.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([y, n]) => (
              <li key={y}><button type="button" className={s.option} onClick={() => onPick(y)} aria-pressed={value === y} data-year={y}>
                <span className={s.allIcon}><b className={s.yearNum}>{y.slice(2)}</b></span>
                <span className={s.optLabel}>{y}년</span>
                <small>{n}{unit}</small>
                {value === y && <Icon name="check" size={20} className={s.check} />}
              </button></li>
            ))}
          </ul>
        )}

        {tab === 'baby' && birthday && (
          <ul className={s.list}>
            {babyRows.map(({ n, count }) => {
              const [st, en] = periodRange(`m:${n}`, birthday)!;
              const key = `m:${n}`;
              return (
                <li key={n}><button type="button" className={s.option} onClick={() => onPick(key)} aria-pressed={value === key} data-baby-month={n}>
                  <span className={s.allIcon}><b className={s.yearNum}>{n}</b></span>
                  <span className={s.optLabel}>{n === 0 ? '생후 첫 달' : `생후 ${n}개월`}<em className={s.sub}>{md(st)} ~ {md(addDays(en, -1))}</em></span>
                  <small>{count}{unit}</small>
                  {value === key && <Icon name="check" size={20} className={s.check} />}
                </button></li>
              );
            })}
          </ul>
        )}

        {(tab === 'day' || tab === 'range') && cal.months.map(({ k, y, m }) => {
          const n = cal.byMonth.get(k) || 0;
          const cells = monthCells(y, m);
          while (cells.length % 7) cells.push(null);
          const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
          return (
            <section key={k} className={s.mon} data-cal-month={k} aria-label={`${y}년 ${m + 1}월`}>
              <div className={s.monHead}>
                <h3 className={s.monTitle}>{y}년 {m + 1}월</h3>
                {tab === 'day' && (
                  <button type="button" className={`${s.pill} ${value === k ? s.pillOn : ''}`} disabled={!n}
                    onClick={() => onPick(k)} aria-pressed={value === k} aria-label={`${y}년 ${m + 1}월 전체 ${n}${unit}`} data-month={k}>
                    {n ? `이 달 전체 ${n}${unit}` : '사진 없음'}
                  </button>
                )}
              </div>
              {weeks.map((w, wi) => (
                <div key={wi} className={s.wk}>
                  {w.map((d, di) => {
                    if (!d) return <span key={di} className={s.blank} />;
                    const key = `${k}-${pad(d)}`;
                    const c = cal.byDay.get(key) || 0;
                    if (tab === 'range') {
                      // 기간: 사진이 없는 날도 고를 수 있어요
                      const edge = key === lo || key === hi;
                      const inside = !!lo && !!hi && key > lo && key < hi;
                      return (
                        <button key={di} type="button" className={`${s.cell} ${c ? s.has : ''} ${inside ? s.inRange : ''}`} onClick={() => tapRange(key)}
                          aria-pressed={edge} aria-label={`${m + 1}월 ${d}일 ${c}${unit}`} data-range-day={key}>
                          <span className={`${s.num} ${edge ? s.isSel : key === today ? s.isToday : ''}`}>{d}</span>
                          {c ? <i className={s.dot} /> : null}
                        </button>
                      );
                    }
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

        {tab === 'range' && (
          <div className={s.rangeBar}>
            <span>{lo ? (hi && hi !== lo ? `${md(lo)} ~ ${md(hi)}` : md(lo)) : '기간을 골라 주세요'}{lo ? ` · ${rangeCount}${unit}` : ''}</span>
            <button type="button" disabled={!lo} onClick={() => lo && onPick(`${lo}~${hi || lo}`)} data-range-apply>이 기간 보기</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
