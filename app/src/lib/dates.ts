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
  if (d.getDate() < b.getDate()) m -= 1;
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
  if (d.getMonth() === b.getMonth() && d.getDate() === b.getDate() && day > 1) {
    const y = d.getFullYear() - b.getFullYear();
    return y === 1 ? '첫 돌' : `${y}번째 생일`;
  }
  return '';
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
