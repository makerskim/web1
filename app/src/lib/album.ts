// 앨범 종류에 따라 달라지는 것: 기준 날짜와 게시물 옆 꼬리표
import { groupMilestone, postAge, ymd } from './dates';
import type { Album } from './types';

/** 모임 시작일 (넣지 않았으면 앨범을 만든 날) */
export const albumSince = (a: Pick<Album, 'since' | 'createdAt'>) => a.since || (a.createdAt ? ymd(a.createdAt) : null);

/** 게시물 옆 꼬리표 (올린 날 기준): 아기 앨범은 '출산 D-68' · '생후 23일' · '백일 🎉', 모임 앨범은 기념일에만 '1주년 🎉' */
export function postTag(a: Album | null | undefined, at: string) {
  if (!a) return '';
  if (a.kind === 'group') {
    const since = albumSince(a);
    const m = since ? groupMilestone(since, at) : '';
    return m ? `${m} 🎉` : '';
  }
  return a.babyBirthday ? postAge(a.babyBirthday, at) : '';
}
