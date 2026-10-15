// 관리자: 내 구글 드라이브를 앨범 저장소로 연결 (구글 로그인 창 → 서버 기능이 연결 정보 보관)
import { config } from './config';
import { driveCall } from './storage';

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initCodeClient(o: Record<string, unknown>): { requestCode(): void } } } };
  }
}

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

export const driveConfigured = () => !!config.googleClientId;

// 버튼을 누르자마자 불러 두면 팝업이 막히지 않아요
export const preloadDrive = () => { if (driveConfigured()) loadGis().catch(() => {}); };

export async function connectDrive(albumId: string): Promise<string | null> {
  if (!driveConfigured()) throw new Error('구글 드라이브 연결이 아직 설정되지 않았어요. (설명서의 드라이브 단계)');
  await loadGis();
  const code = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: config.googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      ux_mode: 'popup',
      prompt: 'consent',
      callback: (r: { code?: string; error?: string }) => (r.code ? resolve(r.code) : reject(new Error('연결을 취소했어요.'))),
      error_callback: () => reject(new Error('연결을 취소했어요.')),
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
