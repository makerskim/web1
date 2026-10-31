// 기념일 셈: 기념일 · 생일, 반복(매년 · 매월 · 매주 · N일마다 · 100일·주년 · 한 번), 양력 · 음력
// 음력은 한국천문연구원 자료로 만든 korean-lunar-calendar로 양력으로 바꿔요 (음력 1000년 ~ 2050년)
// 서버 기능(drive)의 아침 알림에도 같은 셈이 들어 있어요 (supabase/functions/drive/index.ts의 dayLabelOn)
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { WEEKDAYS, addDays, babyDay, babyMonths, daysBetween, groupMilestone, isYearlyDay, nextMilestone, ymd } from './dates';
import type { Anniversary, DayRepeat, LunarDate } from './types';

const cal = new KoreanLunarCalendar();
const pad = (n: number) => String(n).padStart(2, '0');
/** 앨범마다 넣을 수 있는 기념일 수 (데이터베이스의 valid_days와 같아요) */
export const MAX_DAYS = 30;
export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2050;

/** 음력 → 양력 'YYYY-MM-DD' (그해에 없는 날 · 없는 윤달이면 null) */
export function lunarToSolar(y: number, m: number, d: number, leap = false): string | null {
  if (!cal.setLunarDate(y, m, d, leap)) return null;
  // 윤달이 없는 해에 윤달을 넣으면 그냥 평달로 바꿔 버려요 → 되돌려 보고 다르면 없는 날
  const back = cal.getLunarCalendar();
  if (back.month !== m || back.day !== d || !!back.intercalation !== leap) return null;
  const s = cal.getSolarCalendar();
  return `${s.year}-${pad(s.month)}-${pad(s.day)}`;
}

/** 양력 'YYYY-MM-DD' → 음력 */
export function solarToLunar(day: string): LunarDate | null {
  const [y, m, d] = day.split('-').map(Number);
  if (!cal.setSolarDate(y, m, d)) return null;
  const l = cal.getLunarCalendar();
  return { y: l.year, m: l.month, d: l.day, leap: !!l.intercalation };
}

/** 그 음력 달이 며칠까지 있는지 (29 · 30) */
export const lunarMonthDays = (y: number, m: number, leap = false) => (lunarToSolar(y, m, 30, leap) ? 30 : 29);

/** 그해 그 음력 달에 윤달이 있는지 */
export const hasLeapMonth = (y: number, m: number) => !!lunarToSolar(y, m, 1, true);

export const lunarLabel = (l: LunarDate, withYear = true) => `음력 ${withYear ? `${l.y}년 ` : ''}${l.leap ? '윤' : ''}${l.m}월 ${l.d}일`;

// 음력 30일생은 29일까지인 달엔 29일에 챙겨요
const lunarMatch = (want: LunarDate, l: LunarDate) =>
  l.d === want.d || (want.d === 30 && l.d === 29 && lunarMonthDays(l.y, l.m, l.leap) === 29);

export const REPEATS: Array<{ v: DayRepeat; label: string; sub: string }> = [
  { v: 'yearly', label: '매년', sub: '해마다 그날' },
  { v: 'monthly', label: '매월', sub: '달마다 같은 날' },
  { v: 'weekly', label: '매주', sub: '같은 요일' },
  { v: 'days', label: 'N일마다', sub: '100일 · 200일 …' },
  { v: 'count', label: '100일·주년', sub: '100 · 200 · 300 · 500 · 1000일, N주년' },
  { v: 'once', label: '한 번', sub: '그날만' },
];

/** '매년' · '매월' · '매주 토요일' · '100일마다' … */
export function repeatLabel(d: Pick<Anniversary, 'repeat' | 'every' | 'date' | 'lunar'>) {
  if (d.repeat === 'weekly') return `매주 ${WEEKDAYS[new Date(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +d.date.slice(8, 10)).getDay()]}요일`;
  if (d.repeat === 'days') return `${(d.every || 100).toLocaleString()}일마다`;
  if (d.repeat === 'count') return '100일·주년마다';
  const r = REPEATS.find((x) => x.v === d.repeat)?.label || '';
  return d.lunar && (d.repeat === 'yearly' || d.repeat === 'monthly') ? `${r} (음력)` : r;
}

/** 그날이 이 기념일이면 이름표: '아빠 생일' · '결혼기념일 6주년' · '처음 만난 날 300일' · '만난 지 3개월' (아니면 '') */
export function dayLabelOn(d: Anniversary, at: string | Date): string {
  const day = ymd(at);
  if (!day || day < d.date) return '';
  switch (d.repeat) {
    case 'once':
      return day === d.date ? d.name : '';
    case 'yearly': {
      let n: number | null = null;
      if (d.lunar) {
        const l = solarToLunar(day);
        if (l && !l.leap && l.m === d.lunar.m && lunarMatch(d.lunar, l)) n = l.y - d.lunar.y;
      } else if (isYearlyDay(d.date, day)) n = +day.slice(0, 4) - +d.date.slice(0, 4);
      if (n === null) return '';
      return d.birthday || n === 0 ? d.name : `${d.name} ${n}주년`;
    }
    case 'monthly': {
      if (d.lunar) {
        const l = solarToLunar(day);
        return l && lunarMatch(d.lunar, l) ? d.name : '';
      }
      const n = babyMonths(d.date, day);
      if (n === null || n < 0) return '';
      // 달 끝: 31일은 짧은 달엔 마지막 날
      const base = new Date(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +d.date.slice(8, 10));
      const last = new Date(base.getFullYear(), base.getMonth() + n + 1, 0).getDate();
      const mark = ymd(new Date(base.getFullYear(), base.getMonth() + n, Math.min(base.getDate(), last)));
      if (mark !== day) return '';
      return n === 0 || d.birthday ? d.name : `${d.name} ${n}개월`;
    }
    case 'weekly': {
      const k = daysBetween(d.date, day);
      return k !== null && k % 7 === 0 ? d.name : '';
    }
    case 'days': {
      if (day === d.date) return d.name;
      const k = babyDay(d.date, day);
      const every = Math.max(2, d.every || 100);
      return k !== null && k % every === 0 ? `${d.name} ${k.toLocaleString()}일` : '';
    }
    default: { // 'count': 100 · 200 · 300 · 500 · 1000일, N주년
      if (day === d.date) return d.name;
      const m = groupMilestone(d.date, day);
      return m ? `${d.name} ${m}` : '';
    }
  }
}

export interface NextDay { id: string; label: string; date: string; daysLeft: number; birthday: boolean; lunar: LunarDate | null }

/** 다음 그날 (오늘이면 daysLeft 0) */
export function nextDay(d: Anniversary, at: Date = new Date()): NextDay | null {
  const today = ymd(at);
  const from = d.date > today ? d.date : today;
  let date: string | null = null;
  if (d.repeat === 'once') date = d.date >= today ? d.date : null;
  else if (d.repeat === 'count') date = d.date >= today ? d.date : nextMilestone(d.date, 'together', at)?.date ?? null;
  else if (d.repeat === 'days') {
    const every = Math.max(2, d.every || 100);
    const k = babyDay(d.date, from)!;
    date = from === d.date ? d.date : addDays(d.date, Math.ceil(k / every) * every - 1);
  } else if (d.repeat === 'weekly') {
    const k = daysBetween(d.date, from)!;
    date = addDays(from, (7 - (k % 7)) % 7);
  } else if (d.repeat === 'yearly' && d.lunar) {
    // 음력 해마다: 올해 · 내년 음력 그날을 양력으로
    const ly = solarToLunar(from)?.y ?? +from.slice(0, 4);
    for (const y of [ly - 1, ly, ly + 1, ly + 2]) {
      const s = lunarToSolar(y, d.lunar.m, Math.min(d.lunar.d, lunarMonthDays(y, d.lunar.m)));
      if (s && s >= from) { date = s; break; }
    }
  } else {
    // 매년(양력) · 매월: 하루씩 확인 (매월은 두 달 안, 매년은 한 해 안에 꼭 있어요)
    for (let i = 0, end = d.repeat === 'monthly' ? 62 : 367; i <= end && !date; i++) {
      const x = addDays(from, i);
      if (dayLabelOn(d, x)) date = x;
    }
  }
  if (!date) return null;
  return { id: d.id, label: dayLabelOn(d, date) || d.name, date, daysLeft: daysBetween(today, date) ?? 0, birthday: !!d.birthday, lunar: d.lunar ? solarToLunar(date) : null };
}

/** 앞으로 n번 (미리 보기) */
export function nextDays(d: Anniversary, n = 3, at: Date = new Date()): NextDay[] {
  const out: NextDay[] = [];
  let from = at;
  for (let i = 0; i < n; i++) {
    const x = nextDay(d, from);
    if (!x || out.some((o) => o.date === x.date)) break;
    out.push({ ...x, daysLeft: daysBetween(ymd(at), x.date) ?? 0 });
    const [y, m, dd] = addDays(x.date, 1).split('-').map(Number);
    from = new Date(y, m - 1, dd);
  }
  return out;
}
