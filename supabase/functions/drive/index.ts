// Pastel Memories · 서버 기능 (Supabase Edge Function, 이름: drive)
//
// 1) 각자 구글 드라이브
//    멤버마다 자기 구글 드라이브를 한 번 연결해요. 사진·동영상은 앱(휴대폰)이 올린 사람의 드라이브
//    'Pastel Memories/앨범이름' 폴더에 바로 올리고, 그 폴더는 '링크가 있는 사람 보기'로 공유돼서
//    가족은 앱 안에서 구글 드라이브의 파일을 바로 봐요. (Supabase 저장공간·전송량을 쓰지 않아요)
//    이 기능은 연결 정보(갱신 토큰)를 보관하고, 올릴 때 잠깐 쓰는 출입증(액세스 토큰)과 폴더를 만들어 줘요.
//    연결: 앱의 '구글 로그인' 창(카카오로 로그인한 분도) · 또는 구글로 앱에 로그인할 때 드라이브도 허락하면 저절로
//    (Supabase 구글 로그인에도 아래와 같은 클라이언트 ID·보안 비밀번호를 넣어야 저절로 연결돼요)
// 2) 알림
//    새 사진·댓글 알림을 보내고, 매일 아침(daily) 기념일·'N년 전 오늘' 알림을 보내요.
//    알림 서명 키(VAPID)는 처음 한 번 스스로 만들어 데이터베이스(app_keys)에 보관해요.
//
// 필요한 비밀값 (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   (Google Cloud의 '웹 애플리케이션' OAuth 클라이언트)
//   GOOGLE_API_KEY                            (Google Cloud의 API 키: 공유된 사진을 앱에서 읽을 때)
// SUPABASE_URL 과 서버용 비밀 키는 Supabase가 자동으로 넣어 줘요.
// (새 키 방식이면 SUPABASE_SECRET_KEYS, 예전 방식이면 SUPABASE_SERVICE_ROLE_KEY)

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    if (keys.default) return keys.default;
  } catch { /* 예전 방식으로 */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}
const SERVICE_KEY = serviceKey();
// 붙여넣을 때 딸려 온 빈칸·줄바꿈·따옴표는 떼어 내요
const secret = (k: string) => (Deno.env.get(k) ?? '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
const CLIENT_ID = secret('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = secret('GOOGLE_CLIENT_SECRET');
const API_KEY = secret('GOOGLE_API_KEY');
const CLIENT_ID_OK = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(CLIENT_ID);
const API_KEY_OK = /^AIza[0-9A-Za-z_-]{30,}$/.test(API_KEY);
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const ROOT_NAME = 'Pastel Memories';
const SMALL_NAME = '앱용 작은 사진';
const FOLDER = 'application/vnd.google-apps.folder';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400) => json({ error }, status);

// ================================================================
//  구글 연결
// ================================================================
async function googleToken(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = String(body.error || res.status);
    // invalid_client: 비밀값이 클라이언트 ID와 안 맞아요 · invalid_grant: 연결이 취소·만료됐어요
    if (e === 'invalid_client' || e === 'unauthorized_client') throw new Error('drive_bad_secret');
    if (e === 'invalid_grant') throw new Error(params.grant_type === 'refresh_token' ? 'drive_reconnect' : 'drive_code_expired');
    throw new Error(`google_token: ${e}`);
  }
  return body as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}

// 비밀값이 맞는지 미리 확인해요 (틀리면 구글 창에 'OAuth client was not found'가 떠요)
// 모양: 클라이언트 ID는 '숫자-글자.apps.googleusercontent.com', API 키는 'AIza…'(39글자)
// 구글에 확인: 가짜 인증 코드로 물어보면, 클라이언트가 없으면 'not found', 비밀번호가 틀리면 'Unauthorized',
// 둘 다 맞으면 '코드가 틀렸다(invalid_grant)'고 답해요
let checked: { at: number; problem: string | null } | null = null;
async function secretProblem(): Promise<string | null> {
  // 자리를 바꿔 넣은 경우가 많아서 무엇을 넣었는지도 알려 줘요 (값 자체는 앱에 보내지 않아요)
  const kind = (v: string) => (/^GOCSPX-/.test(v) ? 'secret' : /^AIza/.test(v) ? 'apikey' : /googleusercontent\.com/.test(v) ? 'client' : '');
  if (!CLIENT_ID_OK) return kind(CLIENT_ID) === 'secret' ? 'client_is_secret' : kind(CLIENT_ID) === 'apikey' ? 'client_is_apikey' : 'client_format';
  if (!API_KEY_OK) return kind(API_KEY) === 'client' ? 'apikey_is_client' : kind(API_KEY) === 'secret' ? 'apikey_is_secret' : 'apikey_format';
  if (/^AIza|googleusercontent\.com/.test(CLIENT_SECRET)) return 'secret_wrong';
  if (checked && Date.now() - checked.at < (checked.problem ? 20_000 : 30 * 60_000)) return checked.problem;
  let problem: string | null = null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code: 'pm-self-check', redirect_uri: 'postmessage' }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.error === 'invalid_client' || body.error === 'unauthorized_client') {
      problem = /not\s*found/i.test(String(body.error_description || '')) ? 'client_not_found' : 'secret_wrong';
    } else if (body.error === 'deleted_client') problem = 'client_not_found';
  } catch { return null; /* 구글에 닿지 않으면 다음에 다시 */ }
  checked = { at: Date.now(), problem };
  return problem;
}

// 구글에 연결 정보 돌려주기 (끊을 때 · 다른 계정으로 바꿀 때). 실패해도 괜찮아요
// 돌려주면 그 구글 계정의 연결이 통째로 풀려요 → 같은 구글 계정을 쓰는 다른 사용자가 있으면 그대로 둬요
async function revoke(token: string, email: string | null, userId: string) {
  if (email) {
    const { data } = await admin.from('user_drives').select('user_id').eq('email', email).neq('user_id', userId).limit(1);
    if (data?.length) return;
  }
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }),
  }).catch(() => {});
}

// 구글 드라이브 오류를 알아듣게 (401: 출입증이 막혔어요 → 새로 받아 한 번 더)
async function driveError(res: Response, fallback: string) {
  if (res.status === 401) return 'drive_auth';
  const t = await res.text().catch(() => '');
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used/.test(t)) return 'drive_api_disabled';
  if (/insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(t)) return 'drive_scope_missing';
  if (/storageQuotaExceeded/.test(t)) return 'drive_quota';
  return fallback;
}

type DriveRow = { user_id: string; refresh_token: string; email: string | null; root_folder: string | null; folders: Record<string, { id: string; small: string }> };
const tokenCache = new Map<string, { token: string; exp: number }>();

async function userToken(row: DriveRow) {
  const c = tokenCache.get(row.user_id);
  if (c && c.exp > Date.now() + 5 * 60_000) return c;
  try {
    const t = await googleToken({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
    const v = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
    tokenCache.set(row.user_id, v);
    return v;
  } catch (e) {
    // 구글에서 연결을 풀었거나 만료됐으면 연결 정보를 지워요 (앱이 '다시 연결'을 보여 줘요)
    if ((e as Error).message === 'drive_reconnect') await admin.from('user_drives').delete().eq('user_id', row.user_id);
    throw e;
  }
}

const gget = (token: string, url: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` } });
async function exists(token: string, id: string | null | undefined) {
  if (!id || !/^[A-Za-z0-9_-]{10,200}$/.test(id)) return false;
  const res = await gget(token, `${DRIVE}/files/${id}?fields=id,trashed`);
  if (res.status === 401) throw new Error('drive_auth');
  if (!res.ok) return false;
  return !(await res.json()).trashed;
}
// 앱이 만든 폴더는 표시(appProperties)로 다시 찾아요 (다시 연결해도 폴더가 늘어나지 않게, 이름이 같은 앨범끼리 섞이지 않게)
async function folder(token: string, name: string, parent: string | null, tag: Record<string, string>) {
  const q = [`mimeType='${FOLDER}'`, 'trashed=false', ...Object.entries(tag).map(([k, v]) => `appProperties has { key='${k}' and value='${v}' }`)].join(' and ');
  const found = await gget(token, `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&spaces=drive`);
  if (found.status === 401) throw new Error('drive_auth');
  if (found.ok) {
    const id = (await found.json()).files?.[0]?.id as string | undefined;
    if (id) return id;
  }
  const res = await fetch(`${DRIVE}/files?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, appProperties: tag, ...(parent ? { parents: [parent] } : {}) }),
  });
  if (!res.ok) throw new Error(await driveError(res, 'drive_folder_failed'));
  return (await res.json()).id as string;
}
// 앨범 폴더: 링크가 있는 사람은 볼 수 있게 (안의 사진·동영상도 같이) — 검색에는 나오지 않아요
async function shareByLink(token: string, id: string) {
  const res = await fetch(`${DRIVE}/files/${id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }),
  });
  if (!res.ok) throw new Error(await driveError(res, 'drive_share_failed'));
}
const folderName = (v: string) => v.replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 60) || '앨범';
// 앨범 폴더 'Pastel Memories › 앨범이름'(링크 공유) + 그 안의 '앱용 작은 사진' (old: 예전에 만든 폴더가 남아 있으면 이어 써요)
async function albumFolder(token: string, root: string, albumId: string, name: string, old?: { id: string; small: string }) {
  const id = old && (await exists(token, old.id)) ? old.id : await folder(token, folderName(name), root, { pmAlbum: albumId });
  await shareByLink(token, id);
  const small = await folder(token, SMALL_NAME, id, { pmSmall: albumId });
  return { id, small };
}

// ================================================================
//  알림 (Web Push: VAPID 서명 + aes128gcm 암호화)
// ================================================================
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

type Vapid = { publicKey: string; privateJwk: JsonWebKey };
let vapidCache: Vapid | null = null;
async function vapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const { data } = await admin.from('app_keys').select('value').eq('name', 'vapid').maybeSingle();
  if (data?.value?.publicKey) return (vapidCache = data.value as Vapid);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const v: Vapid = { publicKey: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
  // 동시에 두 번 만들어도 먼저 저장된 하나만 써요
  await admin.from('app_keys').upsert({ name: 'vapid', value: v }, { onConflict: 'name', ignoreDuplicates: true });
  const { data: again } = await admin.from('app_keys').select('value').eq('name', 'vapid').maybeSingle();
  return (vapidCache = (again?.value as Vapid) || v);
}

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// RFC 8291: 받는 휴대폰만 풀 수 있게 알림 내용을 잠가요
async function encryptPayload(p256dh: string, authSecret: string, payload: Uint8Array) {
  const ua = fromB64u(p256dh);
  const auth = fromB64u(authSecret);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, sealed);
}

async function vapidHeader(endpoint: string) {
  const v = await vapid();
  const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:pastel-memories@users.noreply.github.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.publicKey}`;
}

type Sub = { endpoint: string; p256dh: string; auth: string; prefs: Record<string, boolean> | null };
type Note = { title: string; body: string; url: string; tag: string };

async function pushTo(subs: Sub[], note: Note) {
  let sent = 0;
  const payload = enc.encode(JSON.stringify(note));
  for (const s of subs) {
    try {
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: { Authorization: await vapidHeader(s.endpoint), TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
        body: await encryptPayload(s.p256dh, s.auth, payload),
      });
      // 앱을 지웠거나 알림을 끈 휴대폰은 목록에서 빼요
      if (res.status === 404 || res.status === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint);
      else if (res.ok) sent++;
    } catch { /* 한 휴대폰이 안 돼도 나머지는 보내요 */ }
  }
  return sent;
}

// 앨범 멤버들의 휴대폰 (나는 빼고, 그 종류 알림을 켠 사람만)
async function subsFor(userIds: string[], kind: 'post' | 'comment' | 'daily') {
  if (!userIds.length) return [];
  const { data } = await admin.from('push_subs').select('endpoint, p256dh, auth, prefs').in('user_id', userIds);
  return ((data || []) as Sub[]).filter((s) => s.prefs?.[kind] !== false);
}

// 처음 보내는 거면 true (두 번 보내지 않게)
async function firstTime(key: string) {
  const { error } = await admin.from('push_sent').insert({ key });
  return !error;
}

// ---------- 한국어 ----------
const batchim = (w: string) => {
  const c = w.trim().replace(/[^가-힣0-9a-zA-Z]+$/, '').slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[013678]$/.test(String.fromCharCode(c)); // 일·삼·육·칠·팔·영…
};
const isYeyo = (w: string) => `${w}${batchim(w) ? '이에요' : '예요'}`;
const callName = (n: string) => (batchim(n) && /[가-힣]$/.test(n) ? `${n}이` : n);

// ---------- 날짜 (한국 시간) ----------
const DAY = 86400000;
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const dayCount = (from: string, to: string) => Math.round((toUTC(to) - toUTC(from)) / DAY);
// 그해의 같은 날 (2월 29일은 윤년이 아니면 2월 28일)
function sameDayIn(d: string, year: number) {
  const m = +d.slice(5, 7), dd = +d.slice(8, 10);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
}
const yearsOn = (d: string, today: string) => {
  const y = +today.slice(0, 4) - +d.slice(0, 4);
  return y > 0 && sameDayIn(d, +today.slice(0, 4)) === today ? y : 0;
};
function babyMilestone(birthday: string, today: string) {
  const day = dayCount(birthday, today) + 1;
  if (day === 50) return '50일';
  if (day === 100) return '백일';
  if (day === 200) return '200일';
  if (day === 300) return '300일';
  const y = yearsOn(birthday, today);
  return y ? (y === 1 ? '첫 돌' : `${y}번째 생일`) : '';
}
function togetherMilestone(since: string, today: string) {
  const day = dayCount(since, today) + 1;
  if ([100, 200, 300, 500, 1000].includes(day)) return `${day}일`;
  const y = yearsOn(since, today);
  return y ? `${y}주년` : '';
}

type Fam = { id: string; name: string; kind: string; since: string | null; created_at: string; children: Array<{ nickname?: string; name?: string; birthday?: string | null; born?: boolean }>; days: Array<{ name: string; date: string; yearly?: boolean }> };
function celebrations(f: Fam, today: string) {
  const out: string[] = [];
  if (f.kind === 'baby') {
    for (const c of f.children || []) {
      if (!c.birthday || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthday)) continue;
      const who = callName((c.name || c.nickname || '아기').trim());
      if (c.born === false) { if (c.birthday === today) out.push(`${who}의 출산 예정일`); continue; }
      if (c.birthday > today) continue;
      const m = babyMilestone(c.birthday, today);
      if (m) out.push(`${who}의 ${m}`);
    }
  } else {
    const since = f.since || new Date(new Date(f.created_at).getTime() + 9 * 3600000).toISOString().slice(0, 10);
    const m = togetherMilestone(since, today);
    if (m) out.push(`우리 ${f.kind === 'family' ? '가족' : '모임'}의 ${m}`);
  }
  for (const d of f.days || []) {
    if (!d?.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || d.date > today) continue;
    if (d.yearly) { if (sameDayIn(d.date, +today.slice(0, 4)) === today) out.push(d.name); continue; }
    if (d.date === today) out.push(d.name);
    else { const m = togetherMilestone(d.date, today); if (m) out.push(`${d.name} ${m}`); }
  }
  return out;
}

// 매일 아침: 앨범마다 오늘 챙길 날 + N년 전 오늘 사진
async function daily() {
  const today = kstToday();
  const md = today.slice(5);
  const { data: fams } = await admin.from('families').select('id, name, kind, since, created_at, children, days');
  let sent = 0;
  for (const f of (fams || []) as Fam[]) {
    const cel = celebrations(f, today);
    const { data: posts } = await admin.from('posts').select('id, taken_at, photos').eq('family_id', f.id).lt('taken_at', `${today}T00:00:00+09:00`);
    const old = (posts || []).filter((p: { taken_at: string }) => new Date(new Date(p.taken_at).getTime() + 9 * 3600000).toISOString().slice(5, 10) === md);
    if (!cel.length && !old.length) continue;
    if (!(await firstTime(`daily:${f.id}:${today}`))) continue;
    const years = [...new Set(old.map((p: { taken_at: string }) => +today.slice(0, 4) - new Date(new Date(p.taken_at).getTime() + 9 * 3600000).getUTCFullYear()))].sort((a, b) => a - b);
    const shots = old.reduce((n: number, p: { photos: unknown[] }) => n + (p.photos?.length || 0), 0);
    const lines = [
      cel.length ? `오늘은 ${isYeyo(cel.join(' · '))} 🎉` : '',
      old.length ? `${years[0]}년 전 오늘의 사진 ${shots}장이 있어요 · 눌러서 추억 보기` : '',
    ].filter(Boolean);
    const { data: mem } = await admin.from('members').select('user_id').eq('family_id', f.id);
    const subs = await subsFor((mem || []).map((m: { user_id: string }) => m.user_id), 'daily');
    sent += await pushTo(subs, {
      title: f.name, body: lines.join('\n'), tag: `daily-${f.id}`,
      url: old.length ? `#/open?album=${f.id}&to=${encodeURIComponent('/memories')}` : `#/open?album=${f.id}&to=${encodeURIComponent('/home')}`,
    });
  }
  return sent;
}

// ================================================================
//  요청 처리
// ================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const route = url.pathname.split('/').filter(Boolean).pop();

    // 매일 아침 알림 (데이터베이스의 예약 작업이 불러요): 비밀값이 맞아야 해요
    if (route === 'daily') {
      const { data } = await admin.from('app_keys').select('value').eq('name', 'cron').maybeSingle();
      const key = req.headers.get('x-cron-key') || '';
      if (!data?.value || key !== data.value) return fail('not_allowed', 403);
      return json({ sent: await daily() });
    }

    // 로그인한 사람 확인
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return fail('not_signed_in', 401);
    const body = req.method === 'POST' && (req.headers.get('content-type') || '').includes('application/json') ? await req.json() : {};

    // 앱이 처음에 물어봐요: 구글 연결에 쓰는 공개값과 준비 상태, 알림 공개 키
    if (route === 'config') {
      const need = [!CLIENT_ID && 'GOOGLE_CLIENT_ID', !CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET', !API_KEY && 'GOOGLE_API_KEY'].filter(Boolean);
      // 세 값이 다 있으면, 맞는 값인지도 확인해요 (어느 값이 틀렸는지 앱이 알려 줘요)
      const problem = need.length ? null : await secretProblem();
      const v = await vapid().catch(() => null);
      // 모양이 맞는 값만 보내요 (자리를 바꿔 넣은 보안 비밀번호가 앱으로 나가지 않게)
      return json({ clientId: CLIENT_ID_OK ? CLIENT_ID : '', apiKey: API_KEY_OK ? API_KEY : '', ready: !need.length && !problem, need, problem, vapid: v?.publicKey || null });
    }

    // ---------- 내 구글 드라이브 연결 ----------
    // code: 앱의 '구글 로그인' 창에서 받은 인증 코드 · refresh_token: 구글로 앱에 로그인할 때 드라이브도 허락했으면 (auto)
    if (route === 'connect') {
      if (!CLIENT_ID || !CLIENT_SECRET) return fail('drive_not_configured', 500);
      const auto = typeof body.refresh_token === 'string' && !!body.refresh_token;
      if (!auto && (typeof body.code !== 'string' || !body.code)) return fail('drive_code_expired');
      const t = auto
        ? await googleToken({ grant_type: 'refresh_token', refresh_token: body.refresh_token })
        : await googleToken({ grant_type: 'authorization_code', code: body.code, redirect_uri: 'postmessage' });
      // 구글 화면에서 드라이브 항목 체크를 풀면 사진을 저장할 수 없어요
      if (t.scope && !t.scope.split(' ').includes(SCOPE)) return fail('drive_scope_missing');
      const aboutRes = await gget(t.access_token, `${DRIVE}/about?fields=user(emailAddress)`);
      if (!aboutRes.ok) return fail(await driveError(aboutRes, 'drive_folder_failed'), 502);
      const email = ((await aboutRes.json())?.user?.emailAddress as string | undefined) || null;
      const { data: old } = await admin.from('user_drives').select('*').eq('user_id', user.id).maybeSingle() as { data: DriveRow | null };
      const same = !!old && old.email === email;
      // 로그인하면서 저절로 연결할 때는, 이미 다른 계정으로 연결해 둔 걸 바꾸지 않아요
      if (auto && old && !same) return json({ email: old.email, root: old.root_folder, kept: true });
      // 이미 허락한 계정이면 구글이 갱신 토큰을 다시 안 줄 수 있어요 → 같은 계정의 연결 정보를 이어 써요
      let refresh: string | null = auto ? body.refresh_token : t.refresh_token || (same ? old!.refresh_token : null);
      if (!refresh && email) {
        const { data: other } = await admin.from('user_drives').select('refresh_token').eq('email', email).limit(1);
        refresh = other?.[0]?.refresh_token || null;
      }
      if (!refresh) return fail('drive_no_refresh_token');
      // 'Pastel Memories' 폴더 (내 드라이브 맨 위)
      const root = same && (await exists(t.access_token, old!.root_folder)) ? old!.root_folder! : await folder(t.access_token, ROOT_NAME, null, { pm: 'root' });
      // 그 안에 내가 들어 있는 앨범마다 폴더를 바로 만들어요 (나중에 들어간 앨범은 처음 올릴 때 만들어요)
      const folders: DriveRow['folders'] = { ...(same ? old!.folders || {} : {}) };
      const { data: mine } = await admin.from('members').select('family_id, families(name)').eq('user_id', user.id).order('joined_at').limit(30);
      for (const m of (mine || []) as unknown as { family_id: string; families: { name: string } | null }[]) {
        const f = folders[m.family_id];
        try {
          if (f && (await exists(t.access_token, f.id)) && (await exists(t.access_token, f.small))) continue;
          folders[m.family_id] = await albumFolder(t.access_token, root, m.family_id, m.families?.name || '앨범', f);
        } catch { /* 처음 올릴 때 다시 만들어요 */ }
      }
      const { error } = await admin.from('user_drives').upsert({
        user_id: user.id, refresh_token: refresh, email, root_folder: root, folders, updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      tokenCache.set(user.id, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
      // 다른 계정으로 바꿨으면 예전 계정의 연결은 돌려줘요
      if (old && !same && old.refresh_token !== refresh) await revoke(old.refresh_token, old.email, user.id);
      return json({ email, root, albums: Object.keys(folders).length });
    }

    if (route === 'disconnect') {
      const { data: old } = await admin.from('user_drives').select('refresh_token, email').eq('user_id', user.id).maybeSingle();
      await admin.from('user_drives').delete().eq('user_id', user.id);
      tokenCache.delete(user.id);
      if (old?.refresh_token) await revoke(old.refresh_token, old.email, user.id);
      return json({ ok: true });
    }

    // 앨범마다 확인: 그 앨범의 멤버인지
    const albumId: string = url.searchParams.get('album') || body.album || '';
    if (!/^[0-9a-f-]{36}$/.test(albumId)) return fail('bad_album');
    const { data: me } = await admin.from('members').select('role, display_name').eq('family_id', albumId).eq('user_id', user.id).maybeSingle();
    if (!me) return fail('not_member', 403);
    const { data: fam } = await admin.from('families').select('name').eq('id', albumId).single();

    // ---------- 올리기 전에: 잠깐 쓰는 출입증 + 이 앨범 폴더 ----------
    if (route === 'token') {
      const { data: row } = await admin.from('user_drives').select('*').eq('user_id', user.id).maybeSingle() as { data: DriveRow | null };
      if (!row) return fail('drive_not_connected', 409);
      // 앱이 '출입증이 안 된다'고 하면 새로 받아요
      if (body.fresh) tokenCache.delete(user.id);
      const prepare = async () => {
        const t = await userToken(row);
        let f = row.folders?.[albumId];
        // 처음이거나, 폴더를 지웠거나 휴지통에 넣었으면 (다시) 만들어요
        if (!f || !(await exists(t.token, f.id)) || !(await exists(t.token, f.small))) {
          const root = (await exists(t.token, row.root_folder)) ? row.root_folder! : await folder(t.token, ROOT_NAME, null, { pm: 'root' });
          f = await albumFolder(t.token, root, albumId, fam?.name || '앨범', f);
          await admin.from('user_drives').update({ root_folder: root, folders: { ...(row.folders || {}), [albumId]: f }, updated_at: new Date().toISOString() }).eq('user_id', user.id);
        }
        return { t, f };
      };
      let r: Awaited<ReturnType<typeof prepare>>;
      try {
        r = await prepare();
      } catch (e) {
        // 보관해 둔 출입증이 막혔으면(구글에서 권한을 없앴거나) 새로 받아 한 번 더 → 연결이 풀렸으면 drive_reconnect
        if ((e as Error).message !== 'drive_auth') throw e;
        tokenCache.delete(user.id);
        r = await prepare();
      }
      return json({ token: r.t.token, exp: r.t.exp, folder: r.f.id, small: r.f.small });
    }

    // ---------- 새 사진 · 댓글 알림 ----------
    if (route === 'notify') {
      const type = body.type === 'comment' ? 'comment' : 'post';
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return fail('bad_id');
      const stale = (at: string) => new Date(at).getTime() < Date.now() - 15 * 60_000;
      const who = me.display_name || '멤버';
      if (type === 'post') {
        const { data: p } = await admin.from('posts').select('id, author_id, caption, photos, created_at').eq('id', id).eq('family_id', albumId).maybeSingle();
        if (!p || p.author_id !== user.id || stale(p.created_at)) return fail('not_found', 404);
        if (!(await firstTime(`post:${id}`))) return json({ sent: 0 });
        const n = (p.photos || []).length;
        const videos = (p.photos || []).filter((x: { kind?: string }) => x.kind === 'video').length;
        const what = videos === n ? `동영상${n > 1 ? ` ${n}개` : ''}` : videos ? `사진·동영상 ${n}개` : `사진${n > 1 ? ` ${n}장` : ''}`;
        const { data: mem } = await admin.from('members').select('user_id').eq('family_id', albumId).neq('user_id', user.id);
        const subs = await subsFor((mem || []).map((m: { user_id: string }) => m.user_id), 'post');
        const cap = String(p.caption || '').replace(/\s+/g, ' ').trim();
        return json({ sent: await pushTo(subs, {
          title: fam?.name || 'Pastel Memories', tag: `post-${id}`,
          body: `${who}${batchim(who) ? '이' : '가'} ${what}${batchim(what) ? '을' : '를'} 올렸어요${cap ? `\n${cap.slice(0, 60)}` : ''}`,
          url: `#/open?album=${albumId}&to=${encodeURIComponent(`/p/${id}`)}`,
        }) });
      }
      const { data: c } = await admin.from('comments').select('id, post_id, author_id, body, created_at').eq('id', id).eq('family_id', albumId).maybeSingle();
      if (!c || c.author_id !== user.id || stale(c.created_at)) return fail('not_found', 404);
      if (!(await firstTime(`comment:${id}`))) return json({ sent: 0 });
      // 게시물을 올린 사람과 그 게시물에 댓글을 단 사람들에게
      const { data: p } = await admin.from('posts').select('author_id').eq('id', c.post_id).maybeSingle();
      const { data: others } = await admin.from('comments').select('author_id').eq('post_id', c.post_id);
      const to = [...new Set([p?.author_id, ...(others || []).map((o: { author_id: string }) => o.author_id)].filter((u): u is string => !!u && u !== user.id))];
      const subs = await subsFor(to, 'comment');
      return json({ sent: await pushTo(subs, {
        title: `${fam?.name || 'Pastel Memories'} · 댓글`, tag: `comment-${c.post_id}`,
        body: `${who}: ${String(c.body).replace(/\s+/g, ' ').slice(0, 80)}`,
        url: `#/open?album=${albumId}&to=${encodeURIComponent(`/p/${c.post_id}`)}`,
      }) });
    }

    return fail('unknown_route', 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg, /drive_not_connected|drive_reconnect|drive_auth/.test(msg) ? 409 : /drive_quota/.test(msg) ? 507 : /drive_code_expired/.test(msg) ? 400 : 500);
  }
});
