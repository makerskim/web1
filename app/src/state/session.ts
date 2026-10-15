// 로그인·앨범·가족 상태 (앱 전체에서 함께 써요)
import { create } from 'zustand';
import { sb } from '../lib/supabase';
import * as api from '../lib/api';
import type { Album, Me, Member } from '../lib/types';

export type TextSize = 'normal' | 'large' | 'xlarge';

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
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

const unknownMember = (uid: string): Member => ({ userId: uid, displayName: '가족', avatar: '', role: 'member', joinedAt: '' });

export const useSession = create<Session>((set, get) => ({
  ready: false,
  me: null,
  albums: load<Album[]>('pm-albums', []),
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
    if (get().me) await get().loadAlbums().catch(() => {});
    set({ ready: true });
  },

  async loadAlbums() {
    const me = get().me;
    if (!me) return [];
    const albums = await api.albums(me.id);
    let albumId = get().albumId;
    if (!albums.some((a) => a.id === albumId)) albumId = albums[0]?.id ?? null;
    set({ albums, albumId, albumsLoaded: true });
    save('pm-albums', albums);
    save('pm-album', albumId);
    if (albumId) await get().loadMembers().catch(() => {});
    return albums;
  },

  async selectAlbum(id) {
    set({ albumId: id, members: [] });
    save('pm-album', id);
    await get().loadMembers();
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
    const id = get().albumId;
    const albums = get().albums.map((a) => (a.id === id ? { ...a, ...patch } : a));
    set({ albums });
    save('pm-albums', albums);
  },
}));

export const useAlbum = () => useSession((s) => s.albums.find((a) => a.id === s.albumId) || null);
export const useMe = () => useSession((s) => s.me);
