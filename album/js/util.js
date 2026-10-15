// 공통 도우미: HTML 만들기, 날짜/아기 나이 계산, 사진 날짜 읽기

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- 안전한 HTML 템플릿 ----------
// html`<p>${이름}</p>` 처럼 쓰면 사용자 글자는 자동으로 이스케이프됩니다.
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function piece(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(piece).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += piece(values[i]) + strings[i + 1];
  return new Raw(out);
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 한국어 조사: 받침이 있으면 '이/을', 없으면 '가/를'
export function hasBatchim(word) {
  const c = String(word).trim().charCodeAt(String(word).trim().length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[013678LMNRlmnr]$/.test(String(word).trim()); // 숫자·영어 끝소리 대략
}
export const subj = (n) => `${n}${hasBatchim(n) ? '이' : '가'}`;
export const obj = (n) => `${n}${hasBatchim(n) ? '을' : '를'}`;
// '하준' → '하준이', '서아' → '서아'
export const callName = (name) => (hasBatchim(name) && /[가-힣]$/.test(name) ? `${name}이` : name);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- 날짜 ----------
const DAY = 86400000;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  // 'YYYY-MM-DD'는 현지 시간 자정으로
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function ymd(d) {
  d = toDate(d);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(d, withWeekday = true) {
  d = toDate(d);
  if (!d) return '';
  const s = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withWeekday ? `${s} (${WEEK[d.getDay()]})` : s;
}

export function fmtDateDots(d) {
  d = toDate(d);
  if (!d) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtMonth(d) {
  d = toDate(d);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

export function timeAgo(v) {
  const d = toDate(v);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / 3600000)}시간 전`;
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (d.getFullYear() === new Date().getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return fmtDate(d, false);
}

// ---------- 아기 나이 ----------
// 태어난 날을 1일로 셉니다 (백일 = 100일째).
export function babyDay(birthday, at = new Date()) {
  const b = toDate(birthday);
  const d = toDate(at);
  if (!b || !d) return null;
  return Math.round((startOfDay(d) - startOfDay(b)) / DAY) + 1;
}

export function babyMonths(birthday, at = new Date()) {
  const b = toDate(birthday);
  const d = toDate(at);
  if (!b || !d) return null;
  let m = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
  if (d.getDate() < b.getDate()) m -= 1;
  return m;
}

// "생후 123일", "만 2살 3개월", "출산 D-10"
export function babyAge(birthday, at = new Date(), { short = false } = {}) {
  const day = babyDay(birthday, at);
  if (day === null) return '';
  if (day < 1) return `출산 D-${1 - day}`;
  const m = babyMonths(birthday, at);
  if (m < 24) {
    if (short || m < 1) return `생후 ${day}일`;
    return `생후 ${day}일 · ${m}개월`;
  }
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `만 ${y}살 ${rest}개월` : `만 ${y}살`;
}

// 특별한 날 (백일, 돌 등)
export function babyMilestone(birthday, at = new Date()) {
  const day = babyDay(birthday, at);
  if (day === null) return '';
  const b = toDate(birthday);
  const d = toDate(at);
  if (day === 1) return '👶 태어난 날';
  if (day === 50) return '🎈 50일';
  if (day === 100) return '🎉 백일';
  if (day === 200) return '🎈 200일';
  if (day === 300) return '🎈 300일';
  if (d.getMonth() === b.getMonth() && d.getDate() === b.getDate() && day > 1) {
    const y = d.getFullYear() - b.getFullYear();
    return y === 1 ? '🎂 첫 돌' : `🎂 ${y}번째 생일`;
  }
  return '';
}

// ---------- 사진 촬영 날짜 (EXIF) ----------
export async function readPhotoDate(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const d = exifDate(new DataView(buf));
    if (d) return d;
  } catch { /* 무시 */ }
  return file.lastModified ? new Date(file.lastModified) : new Date();
}

function exifDate(v) {
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

function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, le);
  const u32 = (o) => v.getUint32(start + o, le);
  const readIfd = (ifd) => {
    const out = {};
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
  let str = null;
  if (ifd0[0x8769]) {
    const exif = readIfd(ifd0[0x8769]);
    str = exif[0x9003] || exif[0x9004];
  }
  str = str || ifd0[0x0132];
  const m = str && str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d) || d.getFullYear() < 1990 ? null : d;
}

// ---------- 기기 ----------
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isKakaoInApp = () => /KAKAOTALK/i.test(navigator.userAgent);

export function blobToFile(blob, name) {
  return new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
}

// 원본 파일 형식 (Supabase 버킷에서 허용하는 형식만)
const ORIG_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
export function originalInfo(file) {
  const ext = (file.name?.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  const byType = Object.entries(ORIG_TYPES).find(([, t]) => t === file.type);
  const type = byType ? file.type : ORIG_TYPES[ext];
  if (!type) return null;
  return { type, ext: byType ? (byType[0] === 'jpeg' ? 'jpg' : byType[0]) : (ext === 'jpeg' ? 'jpg' : ext) };
}

// 얼굴: 이모지 또는 'img:경로' (내가 올린 프로필 사진). 사진은 media.js가 화면에 붙을 때 불러와요
export function av(a, size = '') {
  if (typeof a === 'string' && a.startsWith('img:')) {
    return html`<span class="avatar photo ${size}"><img data-path="${a.slice(4)}" alt=""></span>`;
  }
  return html`<span class="avatar ${size}">${a || '🙂'}</span>`;
}

// 게시물 사진 한 장에 딸린 파일들 (보여주기용, 작은 사진, 원본)
export const filesOf = (ph) => [ph.path, ph.thumb, ph.orig].filter(Boolean);
