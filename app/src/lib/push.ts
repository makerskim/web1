// 알림: 이 휴대폰에서 받을지, 무엇을 받을지 (새 사진 · 댓글 · 기념일 · N년 전 오늘)
import { sb } from './supabase';
import { driveSetup } from './drive';
import { isIOS, isStandalone } from './device';

export interface PushPrefs { post: boolean; comment: boolean; anniv: boolean; memory: boolean }
export const DEFAULT_PREFS: PushPrefs = { post: true, comment: true, anniv: true, memory: true };
// 예전 설정(daily: 기념일·추억 한꺼번에)은 둘 다에 써요
const fromSaved = (d: Partial<PushPrefs> & { daily?: boolean }): PushPrefs => ({
  post: d.post ?? true, comment: d.comment ?? true, anniv: d.anniv ?? d.daily ?? true, memory: d.memory ?? d.daily ?? true,
});

/** ok: 받을 수 있어요 · ios-home: 아이폰은 홈 화면에 추가한 앱에서만 · no: 이 브라우저는 못 받아요 */
export function pushSupport(): 'ok' | 'ios-home' | 'no' {
  const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios-home';
  return can ? 'ok' : 'no';
}

const b64uToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function registration() {
  const r = await navigator.serviceWorker.getRegistration();
  if (r) return r;
  // 아직 등록 전이면 잠깐 기다려요
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('앱을 다시 열고 한 번 더 해 주세요.')), 8000))]);
}

async function currentSub() {
  if (pushSupport() !== 'ok') return null;
  const r = await navigator.serviceWorker.getRegistration();
  return r ? r.pushManager.getSubscription() : null;
}

/** 이 휴대폰의 지금 상태 (켜져 있으면 고른 종류) */
export async function pushState(): Promise<{ on: boolean; prefs: PushPrefs; denied: boolean }> {
  const denied = 'Notification' in window && Notification.permission === 'denied';
  const sub = await currentSub().catch(() => null);
  if (!sub) return { on: false, prefs: DEFAULT_PREFS, denied };
  const { data } = await sb.rpc('my_push', { p_endpoint: sub.endpoint });
  return data ? { on: true, prefs: fromSaved(data as Partial<PushPrefs>), denied } : { on: false, prefs: DEFAULT_PREFS, denied };
}

async function save(sub: PushSubscription, prefs: PushPrefs) {
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await sb.rpc('save_push', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh || '', p_auth: j.keys?.auth || '', p_prefs: { ...prefs, daily: prefs.anniv || prefs.memory } });
  if (error) throw new Error(/function|schema/i.test(error.message) ? 'Supabase에 새 데이터베이스 설정이 필요해요. SQL Editor에서 schema.sql을 한 번 더 실행해 주세요. (설명서 참고)' : '알림을 켜지 못했어요. 잠시 후 다시 해 주세요.');
}

/** 알림 켜기 (버튼을 누른 그 순간에 불러야 아이폰이 허락 창을 보여 줘요) */
export async function enablePush(prefs: PushPrefs = DEFAULT_PREFS) {
  if (pushSupport() === 'ios-home') throw new Error('아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.');
  if (pushSupport() !== 'ok') throw new Error('이 브라우저는 알림을 받을 수 없어요.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied' ? '알림이 막혀 있어요. 휴대폰 설정 → 알림에서 이 앱(또는 브라우저)을 허용해 주세요.' : '알림을 허용해 주세요.');
  }
  const st = await driveSetup();
  const key = st.state === 'ready' || st.state === 'secrets' ? st.vapid : null;
  if (!key) throw new Error('알림 서버가 아직 준비되지 않았어요. (설명서 6-4 서버 기능)');
  const r = await registration();
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
  await save(sub, prefs);
}

export async function disablePush() {
  const sub = await currentSub();
  if (!sub) return;
  await sb.rpc('drop_push', { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}

export async function savePushPrefs(prefs: PushPrefs) {
  const sub = await currentSub();
  if (sub) await save(sub, prefs);
}
