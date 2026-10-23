// 로그인·앨범·가족 상태 (앱 전체에서 함께 써요)
import { create } from 'zustand';
import { sb } from '../lib/supabase';
import * as api from '../lib/api';
import type { Album, Me, Member } from '../lib/types';
import { kidsFrom } from '../lib/kids';

export type TextSize = 'normal' | 'large' | 'xlarge';

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
// 예전 버전이 저장해 둔 앨범에는 아이들·소개가 없어요 → 같은 모양으로 맞춰요
const normAlbum = (a: Album): Album => ({
  ...a,
  children: kidsFrom(a.children, a.babyName || '', a.babyBirthday ?? null),
  bio: a.bio ?? '',
  cover: a.cover ?? '',
  kind: a.kind === 'group' || a.kind === 'family' ? a.kind : 'baby',
  since: a.since ?? null,
  days: api.toDays(a.days),
});
// 앨범을 고칠 때마다 1씩 (고치는 사이에 받아 온 예전 목록으로 덮어쓰지 않게)
let rev = 0;
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

interface Session {
  ready: boolean;
  me: Me | null;
  albums: Album[];
  albumsLoaded: boolean;
  albumId: string | null;
  members: Member[];
  textSize: TextSize;
  // 계산된 값
  album: () => Album | null;
  member: (uid: string) => Member;
  isOwner: () => boolean;
  // 동작
  init: () => Promise<void>;
  loadAlbums: () => Promise<Album[]>;
  selectAlbum: (id: string) => Promise<void>;
  loadMembers: () => Promise<void>;
  setTextSize: (s: TextSize) => void;
  patchAlbum: (patch: Partial<Album>) => void;
}

// 같은 사람이면 언제나 같은 객체 (zustand 선택자가 매번 새 객체를 돌려주면 React가 끝없이 다시 그려요)
const unknowns = new Map<string, Member>();
const unknownMember = (uid: string): Member => {
  let m = unknowns.get(uid);
  if (!m) { m = { userId: uid, displayName: '멤버', avatar: '', role: 'member', joinedAt: '' }; unknowns.set(uid, m); }
  return m;
};

export const useSession = create<Session>((set, get) => ({
  ready: false,
  me: null,
  albums: load<Album[]>('pm-albums', []).map(normAlbum),
  albumsLoaded: false,
  albumId: load<string | null>('pm-album', null),
  members: load<Member[]>('pm-members', []),
  textSize: load<TextSize>('pm-text', 'normal'),

  album: () => get().albums.find((a) => a.id === get().albumId) || null,
  member: (uid) => get().members.find((m) => m.userId === uid) || unknownMember(uid),
  isOwner: () => get().album()?.myRole === 'owner',

  async init() {
    document.documentElement.dataset.text = get().textSize;
    const { data } = await sb.auth.getSession();
    set({ me: api.meFrom(data.session?.user ?? null) });
    sb.auth.onAuthStateChange((event, s) => {
      const me = api.meFrom(s?.user ?? null);
      if (me?.id !== get().me?.id) set({ me });
      if (event === 'SIGNED_OUT') {
        set({ albums: [], albumId: null, members: [], albumsLoaded: false });
        ['pm-albums', 'pm-album', 'pm-members'].forEach((k) => localStorage.removeItem(k));
      }
    });
    if (get().me) {
      const fresh = get().loadAlbums().catch(() => {});
      // 지난번 앨범이 목록에 있으면 바로 열고 새 목록은 뒤에서 받아요 (약한 신호에서 로고에 오래 멈추지 않게)
      // (새로 만들었거나 들어간 앨범처럼 목록에 없으면 새 목록을 기다려요 — 엉뚱한 앨범이 열리지 않게)
      const has = () => get().albums.some((a) => a.id === get().albumId);
      if (!has()) {
        await fresh;
        // 인터넷이 안 돼서 새 목록을 못 받았으면 지난번 목록의 첫 앨범으로
        if (!has() && get().albums.length) set({ albumId: get().albums[0].id });
      }
    }
    set({ ready: true });
  },

  async loadAlbums() {
    const me = get().me;
    if (!me) return [];
    const r = rev;
    const albums = await api.albums(me.id);
    // 받아 오는 사이에 앨범을 고쳤으면(종류·이름…) 이 목록은 예전 것이에요 → 다시 받아요
    if (r !== rev) return get().loadAlbums();
    let albumId = get().albumId;
    if (!albums.some((a) => a.id === albumId)) albumId = albums[0]?.id ?? null;
    set({ albums, albumId, albumsLoaded: true });
    save('pm-albums', albums);
    save('pm-album', albumId);
    // 멤버는 뒤에서 받아요 (약한 신호에서 첫 화면이 로고에 오래 멈추지 않게 — 받기 전엔 지난번 목록을 써요)
    if (albumId) get().loadMembers().catch(() => {});
    return albums;
  },

  async selectAlbum(id) {
    if (!get().albums.some((a) => a.id === id)) return;
    // 새 앨범의 멤버를 먼저 받아 두고 한 번에 바꿔요 (멤버 수·이름이 잠깐 비지 않게)
    const members = await api.members(id).catch(() => null);
    set({ albumId: id, members: members ?? [] });
    save('pm-album', id);
    if (members) save('pm-members', members);
    else await get().loadMembers().catch(() => {});
  },

  async loadMembers() {
    const id = get().albumId;
    if (!id) return;
    const members = await api.members(id);
    if (get().albumId !== id) return;
    set({ members });
    save('pm-members', members);
  },

  setTextSize(textSize) {
    document.documentElement.dataset.text = textSize;
    set({ textSize });
    save('pm-text', textSize);
  },

  patchAlbum(patch) {
    rev++;
    const id = get().albumId;
    const albums = get().albums.map((a) => (a.id === id ? { ...a, ...patch } : a));
    set({ albums });
    save('pm-albums', albums);
  },
}));

export const useAlbum = () => useSession((s) => s.albums.find((a) => a.id === s.albumId) || null);
export const useMe = () => useSession((s) => s.me);
