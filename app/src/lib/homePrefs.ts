// 홈 화면에 보일 카드 (이 휴대폰에서만): 오늘의 기념일 · N년 전 오늘
import { create } from 'zustand';

export interface HomePrefs { anniv: boolean; memory: boolean }
const KEY = 'pm-home-cards';
const load = (): HomePrefs => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { anniv: v.anniv !== false, memory: v.memory !== false };
  } catch {
    return { anniv: true, memory: true };
  }
};
export const useHomePrefs = create<HomePrefs>(() => load());
export function setHomePref(k: keyof HomePrefs, v: boolean) {
  useHomePrefs.setState({ [k]: v });
  try { localStorage.setItem(KEY, JSON.stringify(useHomePrefs.getState())); } catch { /* 무시 */ }
}
