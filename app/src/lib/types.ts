import type { Child } from './kids';

export type StorageKind = 'supabase' | 'drive';
export type Role = 'owner' | 'member';

/** 앨범 종류: 아기 앨범 / 가족 앨범 / 친구·모임 앨범 */
export type AlbumKind = 'baby' | 'family' | 'group';

/** 기념일: 결혼기념일(100일 · 1주년 …) 또는 생일처럼 해마다 */
/** 반복: 매년 · 매월 · 매주 · N일마다 · 100일·주년(100·200·300·500·1000일, N주년) · 한 번 */
export type DayRepeat = 'yearly' | 'monthly' | 'weekly' | 'days' | 'count' | 'once';
/** 음력 날짜 (leap: 윤달) */
export interface LunarDate { y: number; m: number; d: number; leap: boolean }
export interface Anniversary {
  id: string;
  name: string;
  /** 양력 'YYYY-MM-DD' (음력으로 넣었으면 그 음력 날의 양력) */
  date: string;
  /** 생일 (🎂) · 아니면 기념일 (🎉) */
  birthday: boolean;
  repeat: DayRepeat;
  /** N일마다의 N */
  every?: number;
  /** 음력으로 넣었으면 그 음력 날 (매년 · 매월은 해마다 · 달마다 음력으로 다시 셈) */
  lunar?: LunarDate;
  /** 예전 앱과 맞추려고: 매년이면 true */
  yearly: boolean;
}

export interface Album {
  id: string;
  name: string;
  /** 아이들 (한 명이 기본, 쌍둥이·다둥이는 여러 명) */
  children: Child[];
  /** 앨범 소개 (관리자가 써요) */
  bio: string;
  /** 보이는 아이 이름 '씩씩이 & 튼튼이' (children에서 만들어요) */
  babyName: string;
  /** 나이·디데이 기준: 첫째 아이의 생일(예정일) */
  babyBirthday: string | null;
  inviteCode: string;
  /** (예전 값) 이제 사진은 언제나 올린 사람의 구글 드라이브에 저장돼요 */
  storage: StorageKind;
  /** 가족 탭 맨 위 앨범 사진: '' | 이 앨범 사진 경로 | gd:파일ID */
  cover: string;
  /** 아기 앨범(baby) / 가족 앨범(family) / 친구·모임 앨범(group) */
  kind: AlbumKind;
  /** 가족·모임 앨범의 시작일 'YYYY-MM-DD' (없으면 앨범을 만든 날) */
  since: string | null;
  /** 기념일 (모든 앨범) */
  days: Anniversary[];
  createdAt: string;
  myRole: Role;
  myName: string;
  myAvatar: string;
}

export interface Member {
  userId: string;
  displayName: string;
  avatar: string; // '' | https://… | sb:path
  role: Role;
  joinedAt: string;
}

export interface PhotoMeta {
  /** 화면용 사진 (동영상이면 첫 장면) */
  path: string;
  thumb: string;
  /** 원본 사진 · 동영상 파일 */
  orig?: string;
  origName?: string;
  origSize?: number;
  w: number;
  h: number;
  ph: string;
  dec?: boolean;
  /** 동영상이면 'video' (orig가 동영상, 구글 드라이브에만) */
  kind?: 'video';
  /** 동영상 길이(초) */
  dur?: number;
  /** 동영상 형식 (video/mp4 …) */
  mime?: string;
}

export interface Like { userId: string; createdAt: string; emoji: Reaction }
export interface Comment { id: string; postId: string; authorId: string; body: string; createdAt: string }

export interface Post {
  id: string;
  albumId: string;
  authorId: string;
  caption: string;
  takenAt: string;
  createdAt: string;
  photos: PhotoMeta[];
  likes: Like[];
  comments: Comment[];
  /** 세로 사진 양옆 배경 */
  bg: PhotoBg;
  /** 공개 범위: 모든 멤버 · 관리자만 */
  visibility: Visibility;
}
export type PhotoBg = 'blur' | 'black' | 'white';
export type Visibility = 'all' | 'owners';
/** 리액션 (한 사람이 게시물마다 하나) */
export const REACTIONS = ['❤️', '😍', '😂', '👏', '🥹', '🙏'] as const;
export type Reaction = typeof REACTIONS[number];

export interface ActivityEvent {
  type: 'post' | 'like' | 'comment' | 'join';
  at: string;
  userId: string;
  postId?: string;
  post?: { id: string; photos: PhotoMeta[] };
  body?: string;
  count?: number;
  /** 리액션이면 어떤 것 */
  emoji?: Reaction;
}

export interface Me {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string;
  provider: string;
}
