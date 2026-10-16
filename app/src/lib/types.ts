export type StorageKind = 'supabase' | 'drive';
export type Role = 'owner' | 'member';

export interface Album {
  id: string;
  name: string;
  babyName: string;
  babyBirthday: string | null;
  inviteCode: string;
  storage: StorageKind;
  driveEmail: string | null;
  driveReady: boolean;
  /** 가족 탭 맨 위 앨범 사진: '' | 이 앨범 사진 경로 | drive:파일ID */
  cover: string;
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
