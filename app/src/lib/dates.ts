// 날짜와 아기 나이
const DAY = 86400000;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
type D = Date | string | number | null | undefined;

export function toDate(v: D): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return isNaN(+d) ? null : d;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function ymd(v: D) {
  const d = toDate(v);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(v: D, withWeekday = false) {
  const d = toDate(v);
  if (!d) return '';
  const s = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withWeekday ? `${s} ${WEEK[d.getDay()]}요일` : s;
}

export function fmtShort(v: D) {
  const d = toDate(v);
  if (!d) return '';
  return d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function fmtDots(v: D) {
  const d = toDate(v);
  if (!d) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtMonth(v: D) {
  const d = toDate(v)!;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

// '8월 20일 (목)' — 올해가 아니면(또는 withYear) 앞에 '2025년 '
export function fmtDay(v: D, withYear?: boolean) {
  const d = toDate(v);
  if (!d) return '';
  const y = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return `${y ? `${d.getFullYear()}년 ` : ''}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}

// 달력 머리줄: 일 월 화 수 목 금 토
export const WEEKDAYS: readonly string[] = WEEK;

// 달력 한 달 칸 (m은 0부터): 앞쪽 빈칸(null) + 1…말일. fill을 주면 그 칸 수까지 뒤를 빈칸으로 채워요
export function monthCells(y: number, m: number, fill = 0): (number | null)[] {
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const out: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (out.length < fill) out.push(null);
  return out;
}

export function timeAgo(v: D) {
  const d = toDate(v);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return '방금';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / 3600000)}시간 전`;
  const days = Math.round((+startOfDay(new Date()) - +startOfDay(d)) / DAY);
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  return fmtShort(d);
}

// 태어난 날을 1일로 셉니다 (백일 = 100일째)
export function babyDay(birthday: D, at: D = new Date()) {
  const b = toDate(birthday);
  const d = toDate(at);
  if (!b || !d) return null;
  return Math.round((+startOfDay(d) - +startOfDay(b)) / DAY) + 1;
}

export function babyMonths(birthday: D, at: D = new Date()) {
  const b = toDate(birthday);
  const d = toDate(at);
  if (!b || !d) return null;
  let m = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
  // 31일생은 30일까지인 달엔 마지막 날에 한 달을 채워요 (2월 29일생 돌은 2월 28일)
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() < b.getDate() && d.getDate() < monthEnd) m -= 1;
  return m;
}

// "생후 123일", "만 2살 3개월", "출산 D-10"
export function babyAge(birthday: D, at: D = new Date(), { short = false } = {}) {
  const day = babyDay(birthday, at);
  if (day === null) return '';
  if (day < 1) return `출산 D-${1 - day}`;
  const m = babyMonths(birthday, at)!;
  if (m < 24) return short || m < 1 ? `생후 ${day}일` : `생후 ${day}일 · ${m}개월`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `만 ${y}살 ${rest}개월` : `만 ${y}살`;
}

/** y년 뒤 같은 날 (2월 29일은 윤년이 아니면 2월 28일) */
function anniversary(base: Date, y: number) {
  const last = new Date(base.getFullYear() + y, base.getMonth() + 1, 0).getDate();
  return new Date(base.getFullYear() + y, base.getMonth(), Math.min(base.getDate(), last));
}
/** 오늘이 몇 번째 해의 같은 날인지 (아니면 0) */
function yearsToday(base: Date, d: Date) {
  const y = d.getFullYear() - base.getFullYear();
  if (y < 1) return 0;
  const a = anniversary(base, y);
  return a.getMonth() === d.getMonth() && a.getDate() === d.getDate() ? y : 0;
}

export function babyMilestone(birthday: D, at: D = new Date()) {
  const day = babyDay(birthday, at);
  if (day === null) return '';
  const b = toDate(birthday)!;
  const d = toDate(at)!;
  if (day === 1) return '태어난 날';
  if (day === 50) return '50일';
  if (day === 100) return '백일';
  if (day === 200) return '200일';
  if (day === 300) return '300일';
  const y = day > 1 ? yearsToday(b, d) : 0;
  if (y) return y === 1 ? '첫 돌' : `${y}번째 생일`;
  return '';
}

/** 게시물 옆 아이 나이 (올린 날 기준): '출산 D-68' · '태어난 날 🎉' · '생후 23일' · '백일 🎉' · '생후 5개월' · '첫 돌 🎉' · '만 2살' */
export function postAge(birthday: D, at: D) {
  const day = babyDay(birthday, at);
  if (day === null) return '';
  if (day < 1) return `출산 D-${1 - day}`;
  const m = babyMilestone(birthday, at);
  if (m) return `${m} 🎉`;
  // 백일 전에는 날로, 그다음은 날까지 ('생후 4개월 22일' · '만 2살 3개월 5일')
  return day < 100 ? `생후 ${day}일` : ageLabel(birthday, at);
}

/** 'YYYY-MM-DD'에 며칠 더하기 */
export function addDays(v: D, n: number) {
  const d = toDate(v);
  return d ? ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)) : '';
}

/** a에서 b까지 며칠 (같은 날이면 0) */
export function daysBetween(a: D, b: D) {
  const x = toDate(a), y = toDate(b);
  if (!x || !y) return null;
  return Math.round((+startOfDay(y) - +startOfDay(x)) / DAY);
}

/** 기념일 목록 (첫날을 1일로 세요): 아기는 50일 · 백일 · 200일 · 300일 · 첫 돌 · N번째 생일,
 *  가족·모임·기념일은 100일 · 200일 · 300일 · 500일 · 1000일 · N주년 */
export type MilestoneKind = 'baby' | 'together';
const TOGETHER_DAYS = [100, 200, 300, 500, 1000];
function milestones(base: Date, kind: MilestoneKind, untilYear: number) {
  const days: Array<[number, string]> = kind === 'baby' ? [[50, '50일'], [100, '백일'], [200, '200일'], [300, '300일']] : TOGETHER_DAYS.map((n) => [n, `${n}일`]);
  const out = days.map(([n, label]) => ({ date: new Date(base.getFullYear(), base.getMonth(), base.getDate() + n - 1), label }));
  for (let y = 1; base.getFullYear() + y <= untilYear; y++) {
    out.push({ date: anniversary(base, y), label: kind === 'baby' ? (y === 1 ? '첫 돌' : `${y}번째 생일`) : `${y}주년` });
  }
  return out.sort((a, b) => +a.date - +b.date);
}

/** 다음 기념일: '백일까지 94일' (오늘이 기념일이면 daysLeft 0) · progress는 지난 기념일(또는 첫날)부터 다음 기념일까지 얼마나 왔는지 */
export function nextMilestone(start: D, kind: MilestoneKind, at: D = new Date()) {
  const base = toDate(start), now = toDate(at);
  if (!base || !now) return null;
  const today = startOfDay(now);
  const b = startOfDay(base);
  if (+today < +b) return null;
  const list = milestones(b, kind, today.getFullYear() + 1);
  const i = list.findIndex((m) => +m.date >= +today);
  if (i < 0) return null;
  const next = list[i];
  const prev = i > 0 ? list[i - 1].date : b;
  const span = Math.max(1, Math.round((+next.date - +prev) / DAY));
  const daysLeft = Math.round((+next.date - +today) / DAY);
  return { label: next.label, date: ymd(next.date), daysLeft, progress: Math.min(1, Math.max(0, 1 - daysLeft / span)) };
}

/** 가족·모임·기념일의 그날 (그날 올린 게시물 옆): '100일' · '1000일' · '1주년' */
export function groupMilestone(start: D, at: D) {
  const day = babyDay(start, at);
  if (day === null || day < 2) return '';
  if (TOGETHER_DAYS.includes(day)) return `${day}일`;
  const y = yearsToday(toDate(start)!, toDate(at)!);
  return y ? `${y}주년` : '';
}

/** 생일처럼 해마다: 몇 년인지와 상관없이 그해의 같은 달·날 (2월 29일은 윤년이 아니면 2월 28일) */
function sameDayIn(base: Date, year: number) {
  return anniversary(base, year - base.getFullYear());
}

/** 생일처럼 해마다: 오늘이 그날인지 */
export function isYearlyDay(date: D, at: D) {
  const b = toDate(date), d = toDate(at);
  if (!b || !d) return false;
  const a = sameDayIn(b, d.getFullYear());
  return a.getMonth() === d.getMonth() && a.getDate() === d.getDate();
}

/** 생일처럼 해마다: 다음 그날까지 며칠 (오늘이면 0). 넣은 해와 상관없이 올해 그날이 지났으면 내년 */
export function nextYearly(date: D, at: D = new Date()) {
  const b = toDate(date), now = toDate(at);
  if (!b || !now) return null;
  const today = startOfDay(now);
  let next = sameDayIn(b, today.getFullYear());
  if (+next < +today) next = sameDayIn(b, today.getFullYear() + 1);
  return { date: ymd(next), daysLeft: Math.round((+next - +today) / DAY) };
}

/** 시작한 날부터 몇 년 · 몇 개월 · 며칠 (달이 바뀐 날부터 남은 날을 세요). 시작 전이면 null */
export function ymdSpan(start: D, at: D = new Date()) {
  const b = toDate(start), now = toDate(at);
  const m = babyMonths(start, at);
  if (!b || !now || m === null || m < 0) return null;
  // 지난 '같은 날'(달 끝은 그달 마지막 날)부터 며칠 지났는지
  const last = new Date(b.getFullYear(), b.getMonth() + m + 1, 0).getDate();
  const mark = new Date(b.getFullYear(), b.getMonth() + m, Math.min(b.getDate(), last));
  const d = Math.round((+startOfDay(now) - +mark) / DAY);
  return { y: Math.floor(m / 12), m: m % 12, d };
}

/** '2년 7개월 15일' · '5개월 3일' · '23일' (한 달이 안 되면 첫날을 1일로 세요) */
export function spanLabel(start: D, at: D = new Date()) {
  const day = babyDay(start, at);
  const s = ymdSpan(start, at);
  if (day === null || !s || day < 1) return '';
  if (!s.y && !s.m) return `${day}일`;
  return [s.y && `${s.y}년`, s.m && `${s.m}개월`, s.d && `${s.d}일`].filter(Boolean).join(' ');
}

/** 아기 나이를 날까지: '생후 23일' · '생후 4개월 22일' · '만 2살 3개월 5일' */
export function ageLabel(birthday: D, at: D = new Date()) {
  const day = babyDay(birthday, at);
  const s = ymdSpan(birthday, at);
  if (day === null || !s || day < 1) return '';
  if (!s.y && !s.m) return `생후 ${day}일`;
  if (s.y < 2) return `생후 ${s.y * 12 + s.m}개월${s.d ? ` ${s.d}일` : ''}`;
  return `만 ${s.y}살${s.m ? ` ${s.m}개월` : ''}${s.d ? ` ${s.d}일` : ''}`;
}

// 사진 촬영 날짜 (JPEG EXIF)
export async function readPhotoDate(file: File): Promise<Date> {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    const d = exifDate(v);
    if (d) return d;
  } catch { /* 무시 */ }
  return file.lastModified ? new Date(file.lastModified) : new Date();
}

function exifDate(v: DataView): Date | null {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
    if ((marker & 0xff00) !== 0xff00) return null;
    off += 2 + len;
  }
  return null;
}

function parseTiff(v: DataView, start: number): Date | null {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(start + o, le);
  const u32 = (o: number) => v.getUint32(start + o, le);
  const readIfd = (ifd: number) => {
    const out: Record<number, string | number> = {};
    if (start + ifd + 2 > v.byteLength) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (start + e + 12 > v.byteLength) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      if (type === 2) {
        const o = count > 4 ? u32(e + 8) : e + 8;
        let s = '';
        for (let k = 0; k < count - 1 && start + o + k < v.byteLength; k++) s += String.fromCharCode(v.getUint8(start + o + k));
        out[tag] = s;
      } else if (type === 4) {
        out[tag] = u32(e + 8);
      }
    }
    return out;
  };
  const ifd0 = readIfd(u32(4));
  let str: string | undefined;
  if (ifd0[0x8769]) {
    const exif = readIfd(ifd0[0x8769] as number);
    str = (exif[0x9003] || exif[0x9004]) as string | undefined;
  }
  str = str || (ifd0[0x0132] as string | undefined);
  const m = str && str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(+d) || d.getFullYear() < 1990 ? null : d;
}

/** 동영상 길이 '1:05' (모르면 '') */
export const fmtDur = (sec?: number) => {
  if (!sec || !Number.isFinite(sec)) return '';
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
