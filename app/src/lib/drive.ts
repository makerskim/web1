// 관리자: 내 구글 드라이브를 앨범 저장소로 연결 (구글 로그인 창 → 서버 기능이 연결 정보 보관)
// 클라이언트 ID는 앱 코드가 아니라 서버 기능(Supabase 비밀값 GOOGLE_CLIENT_ID)에서 받아 와요.
import { driveCall } from './storage';

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initCodeClient(o: Record<string, unknown>): { requestCode(): void } } } };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

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

/** 드라이브 연결 준비 상태: ready면 버튼을 누를 수 있어요. 나머지는 앱을 만든 분이 한 번 해 줄 일 */
export type DriveSetup =
  | { state: 'ready'; clientId: string }
  | { state: 'missing' | 'old' | 'secrets' | 'jwt' | 'offline' | 'unreachable' | 'error' };

let setup: Promise<DriveSetup> | null = null;
async function loadSetup(): Promise<DriveSetup> {
  try {
    const r = await driveCall<{ clientId?: string; ready?: boolean }>('config');
    return r.clientId && r.ready ? { state: 'ready', clientId: r.clientId } : { state: 'secrets' };
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    // 인터넷은 되는데 닿지 않으면, 서버 기능이 없거나 막힌 경우가 많아요 (그 응답엔 CORS 헤더가 없어요)
    if (code === 'offline') return { state: navigator.onLine === false ? 'offline' : 'unreachable' };
    if (code === 'drive_404') return { state: 'missing' };
    if (code === 'drive_401') return { state: 'jwt' };
    // 예전 서버 기능은 config를 몰라서 '앨범이 없어요'라고 답해요
    if (code === 'bad_album' || code === 'unknown_route') return { state: 'old' };
    return { state: 'error' };
  }
}
/** 준비됐을 때만 기억해요 (설정을 마치고 다시 열면 바로 반영) */
export function driveSetup(fresh = false) {
  if (!setup || fresh) setup = loadSetup().then((r) => { if (r.state !== 'ready') setup = null; return r; });
  return setup;
}

/** 준비가 안 됐을 때 알려 줄 말 (설명서 6번의 몇 단계인지) */
export const setupHelp: Record<Exclude<DriveSetup['state'], 'ready'>, string> = {
  missing: '서버 기능(drive)이 아직 없어요. 설명서 6-3을 해 주세요.',
  old: '서버 기능(drive)이 예전 코드예요. 설명서 6-3대로 새 코드로 바꿔 주세요.',
  secrets: '구글 클라이언트 ID·보안 비밀번호가 아직 없어요. 설명서 6-5를 해 주세요.',
  jwt: '서버 기능의 Verify JWT가 켜져 있어요. 설명서 6-4를 해 주세요.',
  offline: '인터넷 연결을 확인해 주세요.',
  unreachable: '서버 기능(drive)에 닿지 않아요. 설명서 6-3(배포)과 6-4(Verify JWT 끄기)를 확인해 주세요.',
  error: '서버 기능에 문제가 있어요. 잠시 후 다시 확인해 주세요.',
};

// 버튼을 누르자마자 창을 열 수 있게 미리 불러 둬요 (늦으면 팝업이 막혀요)
export const preloadDrive = () => { driveSetup().then((r) => { if (r.state === 'ready') loadGis().catch(() => {}); }); };

/** 아이폰 홈 화면 앱 · 카카오톡 안에서는 구글 창이 안 열릴 수 있어요 */
export function popupWarning() {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return '카카오톡 안에서는 구글 연결 창이 열리지 않아요. 오른쪽 아래 ⋯ → 다른 브라우저로 열기에서 연결해 주세요.';
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  if (standalone && /iPhone|iPad|iPod/.test(ua)) return '홈 화면 앱에서 구글 창이 안 열리면, Safari에서 앱 주소를 열고 연결해 주세요. 한 번만 연결하면 돼요.';
  return '';
}

export async function connectDrive(albumId: string): Promise<string | null> {
  const st = await driveSetup();
  if (st.state !== 'ready') throw new Error(setupHelp[st.state]);
  await loadGis();
  const code = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: st.clientId,
      scope: SCOPE,
      ux_mode: 'popup',
      prompt: 'consent',
      select_account: true,
      callback: (r: { code?: string; scope?: string; error?: string }) => {
        if (!r.code) return reject(new Error('연결을 취소했어요.'));
        // 구글 화면에서 드라이브 항목 체크를 풀었으면
        if (r.scope && !r.scope.split(' ').includes(SCOPE)) return reject(new Error('구글 화면에서 ‘Google Drive 파일’ 항목에 체크한 뒤 계속을 눌러 주세요.'));
        resolve(r.code);
      },
      error_callback: (e: { type?: string }) => reject(new Error(e?.type === 'popup_failed_to_open'
        ? (popupWarning() || '구글 창이 열리지 않았어요. 팝업 차단을 풀고 다시 눌러 주세요.')
        : '연결을 취소했어요.')),
    });
    client.requestCode();
  });
  const r = await driveCall<{ email: string | null }>('connect', {
    method: 'POST', body: JSON.stringify({ album: albumId, code }), headers: { 'Content-Type': 'application/json' },
  });
  return r.email;
}

export async function disconnectDrive(albumId: string) {
  await driveCall('disconnect', { method: 'POST', body: JSON.stringify({ album: albumId }), headers: { 'Content-Type': 'application/json' } });
}
