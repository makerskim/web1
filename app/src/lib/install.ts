// 홈 화면에 추가 (앱 설치)
// - 안드로이드 크롬 · 삼성 인터넷 · 엣지: 버튼 한 번이면 브라우저가 '홈 화면에 추가' 창을 띄워 아이콘을 만들어요
// - 아이폰(사파리) · 카카오톡 안 브라우저: 그런 창을 앱이 띄울 수 없어서 방법을 안내해요
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'pm-installed';
let deferred: InstallPromptEvent | null = null;

/** ready: 버튼 한 번으로 추가할 수 있어요 · installed: 이 휴대폰에 이미 추가했어요 */
export const useInstall = create<{ ready: boolean; installed: boolean }>(() => {
  let installed = false;
  try { installed = localStorage.getItem(KEY) === '1'; } catch { /* 무시 */ }
  return { ready: false, installed };
});

const markInstalled = () => {
  useInstall.setState({ ready: false, installed: true });
  try { localStorage.setItem(KEY, '1'); } catch { /* 무시 */ }
};

/** 앱이 열리자마자 불러요 (브라우저가 '추가할 수 있어요' 신호를 일찍 보내요) */
export function listenInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저가 멋대로 띄우지 않게, 설정의 버튼을 누를 때 띄워요
    deferred = e as InstallPromptEvent;
    useInstall.setState({ ready: true, installed: false });
  });
  window.addEventListener('appinstalled', () => { deferred = null; markInstalled(); });
}

/** '홈 화면에 추가' 창 띄우기 (누른 그 순간에 불러요) */
export async function installApp(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  useInstall.setState({ ready: false });
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') markInstalled();
  return outcome;
}
