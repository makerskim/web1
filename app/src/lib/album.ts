// 앨범 종류에 따라 달라지는 것: 기준 날짜, 게시물 옆 꼬리표, 기념일
import { babyMilestone, groupMilestone, postAge, toDate, ymd } from './dates';
import { dayLabelOn, nextDay } from './days';
import { callName } from './korean';
import type { Album } from './types';

/** 가족·모임 앨범의 시작일 (넣지 않았으면 앨범을 만든 날) */
export const albumSince = (a: Pick<Album, 'since' | 'createdAt'>) => a.since || (a.createdAt ? ymd(a.createdAt) : null);

// 그날이 이 기념일인지 · 다음 그날 (매년 · 매월 · 매주 · N일마다 · 100일·주년 · 한 번, 음력도): lib/days.ts
export { dayLabelOn, nextDay } from './days';

/** 가까운 기념일부터 n개 */
export function upcomingDays(a: Pick<Album, 'days'>, n = 2, at: Date = new Date()) {
  return (a.days || []).map((d) => nextDay(d, at)).filter((x): x is NonNullable<typeof x> => !!x)
    .sort((x, y) => x.daysLeft - y.daysLeft).slice(0, n);
}

/** 오늘 챙길 날 (홈 맨 위 축하): '하준이의 백일' · '우리 가족의 1주년' · '결혼기념일 6주년' */
export function celebrationsToday(a: Album, at: Date = new Date()) {
  const out: string[] = [];
  if (a.kind === 'baby') {
    const m = a.babyBirthday ? babyMilestone(a.babyBirthday, at) : '';
    if (m) out.push(`${callName(a.babyName || '아이')}의 ${m}`);
  } else {
    const since = albumSince(a);
    const m = since && toDate(since) ? groupMilestone(since, at) : '';
    if (m) out.push(`우리 ${a.kind === 'family' ? '가족' : '모임'}의 ${m}`);
  }
  for (const d of a.days || []) {
    const l = dayLabelOn(d, at);
    if (l) out.push(l);
  }
  return out;
}

/** 게시물 옆 꼬리표 (올린 날 기준): 아기 앨범은 '출산 D-68' · '생후 23일' · '백일 🎉',
 *  가족·모임 앨범은 기념일에만 '1주년 🎉' · '결혼기념일 6주년 🎉' */
export function postTag(a: Album | null | undefined, at: string) {
  if (!a) return '';
  if (a.kind === 'baby') return a.babyBirthday ? postAge(a.babyBirthday, at) : '';
  const since = albumSince(a);
  const m = since ? groupMilestone(since, at) : '';
  if (m) return `${m} 🎉`;
  for (const d of a.days || []) {
    const l = dayLabelOn(d, at);
    if (l) return `${l} 🎉`;
  }
  return '';
}

/** 앨범 종류 (설정 · 새 앨범) */
export const KINDS = [
  { v: 'baby', icon: '👶', label: '아기 앨범', short: '아기', desc: '출산·성장' },
  { v: 'family', icon: '🏠', label: '가족 앨범', short: '가족', desc: '가족 기념일' },
  { v: 'group', icon: '🙌', label: '친구·모임 앨범', short: '친구·모임', desc: '모임 추억' },
] as const;
export const kindInfo = (k: Album['kind']) => KINDS.find((x) => x.v === k) || KINDS[0];
/** 가족·모임 앨범의 시작일 이름 */
export const sinceLabel = (k: Album['kind']) => (k === 'group' ? '모임 시작일' : '가족 시작일');
