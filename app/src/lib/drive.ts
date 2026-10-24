// 각자 구글 드라이브
// - 연결: 앱의 '구글 로그인' 창에서 내 계정을 고르면, 서버 기능이 연결 정보를 보관해요 (한 번만)
//         구글로 앱에 로그인할 때 드라이브도 허락했으면 저절로 연결돼요
// - 올리기: 앱이 내 드라이브 'Pastel Memories/앨범이름' 폴더에 바로 올려요 (Supabase를 거치지 않아요)
// - 보기: 앨범 폴더는 '링크가 있는 사람 보기'로 공유돼서, 가족은 구글 드라이브에서 바로 받아 봐요
// 클라이언트 ID·API 키는 앱 코드가 아니라 서버 기능(Supabase 비밀값)에서 받아 와요.
import { create } from 'zustand';
import { sb } from './supabase';
import { fnCall, fnUrl } from './fn';

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initCodeClient(o: Record<string, unknown>): { requestCode(): void } } } };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com';

let gis: Promise<void> | null = null;
function loadGis() {
  gis ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gis = null; reject(new Error('구글 연결 창을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
    document.head.appendChild(s);
  });
  return gis;
}

// ---------------- 준비 상태 ----------------
/** ready면 연결·올리기·보기를 할 수 있어요. 나머지는 앱을 만든 분이 한 번 해 줄 일 */
export type DriveSetup =
  | { state: 'ready'; clientId: string; apiKey: string; vapid: string | null }
  | { state: 'secrets'; need: string[]; vapid: string | null }
  /** 세 값은 다 있는데 틀렸어요 (서버 기능이 구글에 물어보고 알려 줘요) */
  | { state: 'bad'; problem: string; clientId: string }
  | { state: 'missing' | 'old' | 'jwt' | 'offline' | 'unreachable' | 'error' };

let setup: Promise<DriveSetup> | null = null;
let known: DriveSetup | null = null;
async function loadSetup(): Promise<DriveSetup> {
  try {
    const r = await fnCall<{ clientId?: string; apiKey?: string; ready?: boolean; need?: string[]; problem?: string | null; vapid?: string | null }>('config');
    // 예전 서버 기능은 API 키·알림 키를 몰라요
    if (!Array.isArray(r.need)) return { state: 'old' };
    if (!r.need.length && r.problem) return { state: 'bad', problem: r.problem, clientId: r.clientId || '' };
    return r.ready && r.clientId && r.apiKey
      ? { state: 'ready', clientId: r.clientId, apiKey: r.apiKey, vapid: r.vapid ?? null }
      : { state: 'secrets', need: r.need, vapid: r.vapid ?? null };
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    // 인터넷은 되는데 닿지 않으면, 서버 기능이 없거나 막힌 경우가 많아요 (그 응답엔 CORS 헤더가 없어요)
    if (code === 'offline') return navigator.onLine === false ? { state: 'offline' } : probe();
    if (code === 'drive_404') return { state: 'missing' };
    if (code === 'drive_401') return { state: 'jwt' };
    if (code === 'bad_album' || code === 'unknown_route') return { state: 'old' };
    return { state: 'error' };
  }
}
// 머리말 없이 한 번 더 물어봐요: Supabase가 읽을 수 있는 답을 주면 '함수 없음'·'JWT 켜짐'을 가려요
async function probe(): Promise<DriveSetup> {
  const r = await fetch(fnUrl('config')).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) as { code?: string; error?: string; message?: string } })).catch(() => null);
  if (r && (r.status === 404 || r.body.code === 'NOT_FOUND')) return { state: 'missing' };
  if (r && r.status === 401 && r.body.error !== 'not_signed_in') return { state: 'jwt' };
  return { state: 'unreachable' };
}
/** 앱을 만든 분이 주소창에서 직접 확인하는 주소 (정상이면 {"error":"not_signed_in"}) */
export const driveCheckUrl = () => fnUrl('config');

/** 준비됐을 때만 기억해요 (설정을 마치고 다시 열면 바로 반영) */
export function driveSetup(fresh = false) {
  if (!setup || fresh) setup = loadSetup().then((r) => { known = r; if (r.state !== 'ready') setup = null; return r; });
  return setup;
}
/** 지금 알고 있는 API 키 (없으면 null) */
export const apiKeyNow = () => (known?.state === 'ready' ? known.apiKey : null);

/** 준비가 안 됐을 때 알려 줄 말 (설명서 6번의 몇 단계인지) */
export function setupHelp(st: Exclude<DriveSetup, { state: 'ready' }>) {
  switch (st.state) {
    case 'missing': return '이 Supabase 프로젝트에 서버 기능 drive가 없어요. 설명서 6-4대로 이름을 정확히 drive로 배포해 주세요.';
    case 'old': return '서버 기능(drive)이 예전 코드예요. 설명서 6-4대로 새 코드로 바꿔 주세요.';
    case 'secrets': return `Supabase 비밀값 ${st.need.join(', ')}이 아직 없어요. 설명서 6-6을 해 주세요.`;
    case 'jwt': return '서버 기능의 Verify JWT가 켜져 있어요. 설명서 6-5를 해 주세요.';
    case 'bad': return badSecret(st.problem, st.clientId);
    case 'offline': return '인터넷 연결을 확인해 주세요.';
    case 'unreachable': return '서버 기능(drive)에 닿지 않아요. drive가 이 프로젝트에 없거나(설명서 6-4) Verify JWT가 켜져 있어요(설명서 6-5).';
    default: return '서버 기능에 문제가 있어요. 잠시 후 다시 확인해 주세요.';
  }
}

// Supabase 비밀값이 틀렸을 때: 어느 칸에 무엇을 넣어야 하는지
function badSecret(problem: string, clientId: string) {
  const ID = '클라이언트 ID(숫자-글자.apps.googleusercontent.com)';
  switch (problem) {
    case 'client_is_secret': return `GOOGLE_CLIENT_ID 칸에 보안 비밀번호(GOCSPX-…)가 들어 있어요. ${ID}를 넣어 주세요. (설명서 6-6 ①)`;
    case 'client_is_apikey': return `GOOGLE_CLIENT_ID 칸에 API 키(AIza…)가 들어 있어요. ${ID}를 넣어 주세요. (설명서 6-6 ①)`;
    case 'client_format': return `GOOGLE_CLIENT_ID 값이 클라이언트 ID 모양이 아니에요. ${ID} 전체를 넣어 주세요. (설명서 6-6 ①)`;
    case 'apikey_is_client': return 'GOOGLE_API_KEY 칸에 클라이언트 ID가 들어 있어요. AIza로 시작하는 API 키를 넣어 주세요. (설명서 6-6 ③)';
    case 'apikey_is_secret': return 'GOOGLE_API_KEY 칸에 보안 비밀번호(GOCSPX-…)가 들어 있어요. AIza로 시작하는 API 키를 넣어 주세요. (설명서 6-6 ③)';
    case 'apikey_format': return 'GOOGLE_API_KEY 값이 API 키 모양이 아니에요. AIza로 시작하는 39글자를 넣어 주세요. (설명서 6-6 ③)';
    case 'client_not_found': return `구글에 이 클라이언트 ID가 없어요: ${clientId || '(비어 있음)'}. 구글 클라우드 → 클라이언트의 ID와 한 글자씩 같은지 확인하고 다시 넣어 주세요. 방금 만든 클라이언트면 5분쯤 뒤에 다시 확인해 주세요. (설명서 6-6 ①)`;
    case 'secret_wrong': return 'GOOGLE_CLIENT_SECRET이 이 클라이언트의 보안 비밀번호가 아니에요. 같은 클라이언트에서 Add secret으로 새로 만들어 넣어 주세요. (설명서 6-6 ②)';
    default: return 'Supabase 비밀값 중 틀린 값이 있어요. 설명서 6-6을 다시 확인해 주세요.';
  }
}

// 버튼을 누르자마자 창을 열 수 있게 미리 불러 둬요 (늦으면 팝업이 막혀요)
export const preloadDrive = () => { driveSetup().then((r) => { if (r.state === 'ready') loadGis().catch(() => {}); }); };

/** 아이폰 홈 화면 앱 · 카카오톡 안에서는 구글 창이 안 열릴 수 있어요 */
export function popupWarning() {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return '카카오톡 안에서는 구글 로그인 창이 열리지 않아요. 오른쪽 아래 ⋯ → 다른 브라우저로 열기에서 해 주세요.';
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  if (standalone && /iPhone|iPad|iPod/.test(ua)) return '홈 화면 앱에서 구글 창이 안 열리면, Safari에서 앱 주소를 열고 구글 로그인해 주세요. 한 번만 하면 돼요.';
  return '';
}

// ---------------- 내 드라이브 연결 상태 ----------------
interface MyDrive { loaded: boolean; email: string | null; root: string | null }
export const useMyDrive = create<MyDrive>(() => ({ loaded: false, email: null, root: null }));
export async function loadMyDrive() {
  // 로그인하면서 연결하는 중이면 끝난 다음에 확인해요 (먼저 끝난 '연결 안 됨'이 덮어쓰지 않게)
  if (linking) await linking;
  try {
    const { data, error } = await sb.rpc('my_drive');
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { email?: string | null; root_folder?: string | null } | null;
    useMyDrive.setState({ loaded: true, email: row ? row.email || '연결됨' : null, root: row?.root_folder || null });
  } catch {
    // 데이터베이스 설정 전이면 연결 안 된 것으로
    useMyDrive.setState({ loaded: true, email: null, root: null });
  }
  return useMyDrive.getState();
}
export const driveFolderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;

// 구글로 앱에 로그인할 때 드라이브도 허락했으면 그 연결 정보로 바로 연결해요 (안 되면 조용히 넘어가요 → + 를 누를 때 물어봐요)
let linking: Promise<unknown> | null = null;
export function linkFromLogin(refreshToken: string) {
  linking = fnCall<{ email: string | null; root: string | null }>('connect', { refresh_token: refreshToken })
    .then((r) => { tickets.clear(); useMyDrive.setState({ loaded: true, email: r.email || '연결됨', root: r.root }); })
    .catch((e) => console.warn('[pm] drive link from login', (e as { code?: string }).code || e))
    .finally(() => { linking = null; });
  return linking;
}

/** cancelled: 사용자가 '취소'를 누르면 끝나는 약속 · onCode: 구글 창에서 허용한 다음 (이제는 취소 못 해요)
 *  hint: 구글로 로그인한 분의 이메일 (계정 고르기를 건너뛰어요) */
export async function connectDrive(hooks: { cancelled?: Promise<never>; onCode?: () => void; hint?: string } = {}) {
  const st = await driveSetup();
  if (st.state !== 'ready') throw new Error(`아직 구글 로그인 준비가 안 됐어요 (앱을 만든 분이 할 일). ${setupHelp(st)}`);
  await loadGis();
  const asked = new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: st.clientId,
      scope: SCOPE,
      ux_mode: 'popup',
      ...(hooks.hint ? { login_hint: hooks.hint } : { select_account: true }),
      callback: (r: { code?: string; scope?: string; error?: string }) => {
        if (!r.code) return reject(new Error('구글 로그인을 취소했어요.'));
        // 구글 화면에서 드라이브 항목 체크를 풀었으면
        if (r.scope && !r.scope.split(' ').includes(SCOPE)) return reject(new Error('구글 화면에서 ‘Google Drive 파일’ 항목에 체크한 뒤 계속을 눌러 주세요.'));
        resolve(r.code);
      },
      error_callback: (e: { type?: string }) => reject(new Error(e?.type === 'popup_failed_to_open'
        ? (popupWarning() || '구글 창이 열리지 않았어요. 팝업 차단을 풀고 다시 눌러 주세요.')
        : '구글 로그인을 취소했어요.')),
    });
    client.requestCode();
  });
  // 홈 화면 앱에서는 구글 창이 답을 안 줄 때가 있어서 취소할 수 있게 해요
  const code = await (hooks.cancelled ? Promise.race([asked, hooks.cancelled]) : asked);
  hooks.onCode?.();
  const r = await fnCall<{ email: string | null; root: string | null }>('connect', { code });
  tickets.clear();
  useMyDrive.setState({ loaded: true, email: r.email || '연결됨', root: r.root });
  return r.email;
}

export async function disconnectDrive() {
  await fnCall('disconnect', {});
  tickets.clear();
  useMyDrive.setState({ loaded: true, email: null, root: null });
}

// ---------------- 올리기 ----------------
// 출입증: 잠깐(1시간) 쓰는 액세스 토큰 + 이 앨범 폴더 (원본) · 작은 사진 폴더
interface Ticket { token: string; exp: number; folder: string; small: string }
const tickets = new Map<string, Promise<Ticket>>();
async function ticket(albumId: string, fresh = false): Promise<Ticket> {
  const hit = tickets.get(albumId);
  if (hit && !fresh) {
    const t = await hit.catch(() => null);
    if (t && t.exp > Date.now() + 5 * 60_000) return t;
  }
  const p = fnCall<Ticket>('token', fresh ? { album: albumId, fresh: true } : { album: albumId }).catch((e) => {
    tickets.delete(albumId);
    // 구글에서 연결이 풀렸으면 '연결 안 됨'으로
    if (/drive_reconnect|drive_not_connected/.test((e as { code?: string }).code || '')) useMyDrive.setState({ loaded: true, email: null, root: null });
    throw e;
  });
  tickets.set(albumId, p);
  return p;
}

const uploadError = (status: number, text: string) => {
  if (/storageQuotaExceeded/.test(text)) return new Error('구글 드라이브 공간이 가득 찼어요. 드라이브를 정리하거나 공간을 늘려 주세요.');
  return Object.assign(new Error(status === 0 ? '인터넷 연결을 확인해 주세요.' : '구글 드라이브에 올리지 못했어요. 다시 시도해 주세요.'), { status });
};

function xhr(method: string, url: string, headers: Record<string, string>, body: Blob | string | null, onProgress?: (sent: number) => void) {
  return new Promise<{ status: number; text: string; location: string | null; range: string | null }>((resolve) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    Object.entries(headers).forEach(([k, v]) => x.setRequestHeader(k, v));
    if (onProgress) x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () => resolve({ status: x.status, text: x.responseText, location: x.getResponseHeader('Location'), range: x.getResponseHeader('Range') });
    x.onerror = () => resolve({ status: 0, text: '', location: null, range: null });
    x.send(body);
  });
}

const SMALL_LIMIT = 5 * 1024 * 1024;
const CHUNK = 8 * 1024 * 1024; // 256KB의 배수

async function sendOnce(t: Ticket, blob: Blob, name: string, type: string, small: boolean, onProgress?: (sent: number) => void) {
  const meta = JSON.stringify({ name, parents: [small ? t.small : t.folder] });
  const auth = { Authorization: `Bearer ${t.token}` };
  if (blob.size <= SMALL_LIMIT) {
    const b = `pm${Math.random().toString(36).slice(2)}`;
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${type}\r\n\r\n`, blob, `\r\n--${b}--`]);
    const r = await xhr('POST', `${API}/upload/drive/v3/files?uploadType=multipart&fields=id`, { ...auth, 'Content-Type': `multipart/related; boundary=${b}` }, body, onProgress);
    if (r.status >= 200 && r.status < 300) return JSON.parse(r.text).id as string;
    throw uploadError(r.status, r.text);
  }
  // 큰 파일(동영상·큰 원본)은 나눠서 올려요 (끊겨도 이어서)
  const init = await xhr('POST', `${API}/upload/drive/v3/files?uploadType=resumable&fields=id`,
    { ...auth, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(blob.size) }, meta);
  if (init.status < 200 || init.status >= 300 || !init.location) throw uploadError(init.status, init.text);
  let at = 0;
  let tries = 0;
  while (at < blob.size) {
    const end = Math.min(blob.size, at + CHUNK);
    const r = await xhr('PUT', init.location, { 'Content-Range': `bytes ${at}-${end - 1}/${blob.size}` }, blob.slice(at, end), (n) => onProgress?.(at + n));
    if (r.status === 200 || r.status === 201) return JSON.parse(r.text).id as string;
    if (r.status === 308) {
      // 받은 데까지 이어서
      const m = r.range?.match(/bytes=0-(\d+)/);
      at = m ? +m[1] + 1 : end;
      tries = 0;
      continue;
    }
    if ((r.status === 0 || r.status >= 500) && tries++ < 4) {
      await new Promise((res) => setTimeout(res, 1000 * 2 ** tries));
      // 어디까지 받았는지 물어보고 이어서
      const q = await xhr('PUT', init.location, { 'Content-Range': `bytes */${blob.size}` }, null);
      if (q.status === 200 || q.status === 201) return JSON.parse(q.text).id as string;
      const m = q.range?.match(/bytes=0-(\d+)/);
      at = q.status === 308 ? (m ? +m[1] + 1 : 0) : at;
      continue;
    }
    throw uploadError(r.status, r.text);
  }
  throw uploadError(0, '');
}

/** 내 드라이브의 이 앨범 폴더에 올리고 파일 ID를 돌려줘요 (small: 앱용 작은 사진 폴더) */
export async function uploadToDrive(albumId: string, blob: Blob, opts: { name: string; type: string; small?: boolean; onProgress?: (sent: number) => void }) {
  let t = await ticket(albumId);
  try {
    return await sendOnce(t, blob, opts.name, opts.type, !!opts.small, opts.onProgress);
  } catch (e) {
    // 출입증이 만료됐거나(401) 폴더를 지웠으면(404) 새로 받아 한 번 더
    const status = (e as { status?: number }).status;
    if (status !== 401 && status !== 403 && status !== 404) throw e;
    t = await ticket(albumId, true);
    return sendOnce(t, blob, opts.name, opts.type, !!opts.small, opts.onProgress);
  }
}

/** 내가 올린 파일을 드라이브 휴지통으로 (게시물을 지울 때). 다른 사람 파일은 그대로 */
export async function trashOnDrive(albumId: string, ids: string[]) {
  if (!ids.length) return;
  const t = await ticket(albumId).catch(() => null);
  if (!t) return;
  await Promise.all(ids.map((id) => fetch(`${API}/drive/v3/files/${id}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
  }).catch(() => null)));
}

// ---------------- 보기 ----------------
/** 공유된 드라이브 파일 주소 (API 키로 읽어요) */
export async function driveFileURL(id: string) {
  const st = await driveSetup();
  if (st.state !== 'ready') throw new Error(setupHelp(st));
  return `${API}/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(st.apiKey)}`;
}
export async function fetchDriveFile(id: string): Promise<Blob> {
  const res = await fetch(await driveFileURL(id)).catch(() => null);
  if (!res) throw new Error('인터넷 연결을 확인해 주세요.');
  if (!res.ok) {
    const err = new Error(res.status === 404 ? '사진이 올린 사람의 구글 드라이브에서 지워졌어요.' : '구글 드라이브에서 사진을 받지 못했어요.') as Error & { notFound?: boolean };
    err.notFound = res.status === 404;
    throw err;
  }
  return res.blob();
}
export const driveViewLink = (id: string) => `https://drive.google.com/file/d/${id}/view`;
