// 아이(들): 태어나기 전엔 태명, 태어나면 이름. 한 명이 기본이고 쌍둥이·다둥이는 더 넣을 수 있어요.
import { uuid } from './uuid';
import { babyDay, daysBetween, toDate } from './dates';
import { callName } from './korean';

export interface Child {
  id: string;
  /** 태명 (씩씩이) */
  nickname: string;
  /** 이름 (태어난 뒤에 넣어요) */
  name: string;
  /** 생일 또는 출산 예정일 'YYYY-MM-DD' */
  birthday: string | null;
  /** 태어났는지 (false: 날짜는 출산 예정일 · true: 날짜는 생일 · 없음: 예전 앨범이라 날짜로 짐작) */
  born?: boolean;
  /** 임신 시작일 'YYYY-MM-DD' (마지막 생리 시작일 · 병원 주수 기준). 없으면 예정일을 40주로 봐요 */
  start?: string | null;
}

export const MAX_KIDS = 6;
export const newChild = (p: Partial<Child> = {}): Child => ({ id: uuid(), nickname: '', name: '', birthday: null, born: false, ...p });

/** 보이는 이름: 이름이 있으면 이름, 없으면 태명 */
export const childName = (c: Child) => (c.name.trim() || c.nickname.trim());

/** 태어났는지: '태어났어요'를 눌렀으면 그대로, 예전 앨범은 날짜로 짐작 (오늘이거나 지났으면)
 *  예정일이 지나도 '뱃속에 있어요'면 아직 안 태어난 거예요 (늦게 태어나는 아기가 많아요) */
export const isBorn = (c: Pick<Child, 'birthday' | 'born'>, at: Date = new Date()) => {
  if (typeof c.born === 'boolean') return c.born;
  const d = babyDay(c.birthday, at);
  return d !== null && d >= 1;
};

/** 태어났는데 아직 이름이 없는 아이 */
export const needsName = (c: Child) => isBorn(c) && !c.name.trim();

/** '씩씩이 & 튼튼이' */
export const kidsLabel = (kids: Child[]) => kids.map(childName).filter(Boolean).join(' & ');

/** 앨범 이름 추천: '씩씩이 & 튼튼이네 앨범' (받침 있는 이름은 '하준이') */
export function suggestAlbumName(kids: Child[]) {
  const names = kids.map(childName).filter(Boolean);
  if (!names.length) return '';
  return `${names.map(callName).join(' & ')}네 앨범`;
}

/** '&' 양쪽에 한 칸씩 (씩씩이&튼튼이 → 씩씩이 & 튼튼이) */
export const spaceAmp = (s: string) => s.replace(/\s*&\s*/g, ' & ').replace(/\s{2,}/g, ' ').trim();

/** 나이·디데이 기준이 되는 아이 (첫 번째) */
export const primary = (kids: Child[]) => kids[0] || null;

/** 예전 앨범(아이 정보가 baby_name/baby_birthday 하나뿐)도 같은 모양으로 */
export function kidsFrom(raw: unknown, babyName: string, babyBirthday: string | null): Child[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((x) => x && typeof x === 'object').map((x: Record<string, unknown>) => ({
      id: typeof x.id === 'string' ? x.id : uuid(),
      nickname: typeof x.nickname === 'string' ? x.nickname : '',
      name: typeof x.name === 'string' ? x.name : '',
      birthday: typeof x.birthday === 'string' && toDate(x.birthday) ? x.birthday : null,
      ...(typeof x.born === 'boolean' ? { born: x.born } : {}),
      ...(typeof x.start === 'string' && toDate(x.start) ? { start: x.start } : {}),
    }));
  }
  if (babyName || babyBirthday) return [newChild({ name: babyName || '', birthday: babyBirthday, born: undefined })];
  return [];
}

/** 사진의 나이('생후 N일')·기념일의 기준 날짜: 첫째 아이의 생일
 *  아직 뱃속이면 예정일까지는 예정일('출산 D-30'), 예정일이 지났으면 없음 (태어난 것처럼 보이지 않게) */
export function ageBirthday(kids: Child[], at: Date = new Date()): string | null {
  const c = kids[0];
  if (!c?.birthday) return null;
  if (isBorn(c, at)) return c.birthday;
  const d = babyDay(c.birthday, at);
  return d !== null && d < 1 ? c.birthday : null;
}

/** 앨범에 바로 반영할 값 (보이는 이름·기준 생일 포함) */
export const kidsPatch = (kids: Child[]) => ({ children: kids, babyName: kidsLabel(kids), babyBirthday: ageBirthday(kids) });

/** 출산 예정일까지 (태어났거나 날짜가 없으면 null)
 *  임신 시작일이 있으면 그날부터, 없으면 예정일을 임신 40주 0일로 보고 셉니다 (쌍둥이는 일찍 낳는 경우가 많아요) */
export interface DueInfo {
  /** 'D-68'의 68 (예정일 전날이 1) */
  daysLeft: number;
  /** 오늘 임신 주수 · 일수 (33주 2일) */
  week: number;
  day: number;
  /** 0 ~ 1 (임신 시작 → 출산 예정일) */
  progress: number;
  /** 임신 시작부터 예정일까지 며칠 (보통 280일) */
  total: number;
  /** 예정일의 주수 (37주 2일) */
  dueWeek: number;
  dueDay: number;
  /** 임신 시작일을 넣었는지 */
  custom: boolean;
}
export const FULL_TERM = 280;
/** 임신 시작일부터 예정일까지 20주 ~ 44주일 때만 그 날짜를 써요 */
export const TERM_MIN = 140;
export const TERM_MAX = 308;
export function termDays(c: Pick<Child, 'birthday' | 'start'>): number | null {
  const n = c.start && c.birthday ? daysBetween(c.start, c.birthday) : null;
  return n !== null && n >= TERM_MIN && n <= TERM_MAX ? n : null;
}
export function dueInfo(c: Pick<Child, 'birthday' | 'born' | 'start'> | null | undefined, now: Date = new Date()): DueInfo | null {
  const d = c?.birthday ? babyDay(c.birthday, now) : null;
  if (d === null || !c || isBorn(c, now)) return null;
  // 예정일이 지났는데 아직 뱃속이면 0이나 음수 (D-day, D+3)
  const daysLeft = 1 - d;
  const custom = termDays(c);
  const total = custom ?? FULL_TERM;
  // 예정일이 지나도 주수는 계속 늘어요 (40주 3일)
  const gest = Math.max(0, total - daysLeft);
  return { daysLeft, week: Math.floor(gest / 7), day: gest % 7, progress: Math.min(1, gest / total), total, dueWeek: Math.floor(total / 7), dueDay: total % 7, custom: custom !== null };
}

/** 태어난 주수 (임신 시작일을 넣었을 때만): '37주 2일' */
export function bornWeeks(c: Pick<Child, 'birthday' | 'start'>) {
  const n = c.start && c.birthday ? daysBetween(c.start, c.birthday) : null;
  return n !== null && n >= TERM_MIN && n <= TERM_MAX ? `${Math.floor(n / 7)}주${n % 7 ? ` ${n % 7}일` : ''}` : '';
}

/** '33주 2일' (0일이면 '33주') */
export const weeksText = (w: number, d: number) => `${w}주${d ? ` ${d}일` : ''}`;
/** 몇 주차: 27주 6일은 28주차 (0주 0일 ~ 0주 6일이 1주차) */
export const weekNth = (w: number) => `${w + 1}주차`;
/** '33주 2일이에요' · '37주예요' */
export const weeksIs = (w: number, d: number) => `${weeksText(w, d)}${d ? '이에요' : '예요'}`;

/** 'D-68' · 'D-day' · 'D+3' */
export const ddayText = (i: DueInfo) => (i.daysLeft > 0 ? `D-${i.daysLeft.toLocaleString()}` : i.daysLeft === 0 ? 'D-day' : `D+${(-i.daysLeft).toLocaleString()}`);
/** 이름 아래 한 줄: '만나기까지 68일' · '오늘이 예정일이에요' · '예정일이 3일 지났어요' */
export const dueStatus = (i: DueInfo) => (i.daysLeft > 0 ? `만나기까지 ${i.daysLeft.toLocaleString()}일` : i.daysLeft === 0 ? '오늘이 예정일이에요' : `예정일이 ${(-i.daysLeft).toLocaleString()}일 지났어요`);

/** '임신 30주 2일' (아직 너무 이르면 '') */
export const weeksLabel = (i: DueInfo) => (i.week || i.day ? `임신 ${i.week}주${i.day ? ` ${i.day}일` : ''}` : '');
