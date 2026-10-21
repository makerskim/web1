import type { Child } from './kids';

export type StorageKind = 'supabase' | 'drive';
export type Role = 'owner' | 'member';

/** 앨범 종류: 아기·가족 앨범 / 친구·모임 앨범 */
export type AlbumKind = 'baby' | 'group';

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
  storage: StorageKind;
  driveEmail: string | null;
  driveReady: boolean;
  /** 가족 탭 맨 위 앨범 사진: '' | 이 앨범 사진 경로 | drive:파일ID */
  cover: string;
  /** 아기·가족 앨범(baby) / 친구·모임 앨범(group) */
  kind: AlbumKind;
  /** 모임 시작일 'YYYY-MM-DD' (없으면 앨범을 만든 날) */
  since: string | null;
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
  path: string;
  thumb: string;
  orig?: string;
  origName?: string;
  origSize?: number;
  w: number;
  h: number;
  ph: string;
  dec?: boolean;
}

export interface Like { userId: string; createdAt: string }
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
}

export interface ActivityEvent {
  type: 'post' | 'like' | 'comment' | 'join';
  at: string;
  userId: string;
  postId?: string;
  post?: { id: string; photos: PhotoMeta[] };
  body?: string;
  count?: number;
}

export interface Me {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string;
  provider: string;
}
