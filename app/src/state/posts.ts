// 앨범 게시물 (홈 피드) — 화면을 옮겨 다녀도 그대로 유지
import { create } from 'zustand';
import * as api from '../lib/api';
import type { ActivityEvent, Post } from '../lib/types';

const PAGE = 8;

interface PostsState {
  albumId: string | null;
  list: string[];                 // 홈에 보이는 순서 (최신순)
  byId: Record<string, Post>;
  done: boolean;
  loading: boolean;
  error: string | null;
  activity: ActivityEvent[];
  reset: (albumId: string) => void;
  loadFirst: () => Promise<void>;
  loadMore: () => Promise<void>;
  put: (p: Post) => void;
  prepend: (p: Post) => void;
  remove: (id: string) => void;
  loadActivity: () => Promise<void>;
}

export const usePosts = create<PostsState>((set, get) => ({
  albumId: null, list: [], byId: {}, done: false, loading: false, error: null, activity: [],

  reset(albumId) {
    if (get().albumId === albumId) return;
    set({ albumId, list: [], byId: {}, done: false, loading: false, error: null, activity: [] });
  },

  async loadFirst() {
    const id = get().albumId;
    if (!id) return;
    set({ loading: true, error: null });
    try {
      const page = await api.posts(id, undefined, PAGE);
      if (get().albumId !== id) return;
      const byId = { ...get().byId };
      page.forEach((p) => { byId[p.id] = p; });
      set({ list: page.map((p) => p.id), byId, done: page.length < PAGE });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  async loadMore() {
    const { albumId: id, loading, done, list, byId } = get();
    if (!id || loading || done) return;
    set({ loading: true });
    try {
      const before = byId[list[list.length - 1]]?.createdAt;
      const page = await api.posts(id, before, PAGE);
      if (get().albumId !== id) return;
      const next = { ...get().byId };
      page.forEach((p) => { next[p.id] = p; });
      set({ list: [...get().list, ...page.map((p) => p.id).filter((x) => !get().list.includes(x))], byId: next, done: page.length < PAGE });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  put(p) { set({ byId: { ...get().byId, [p.id]: p } }); },
  prepend(p) { set({ byId: { ...get().byId, [p.id]: p }, list: [p.id, ...get().list.filter((x) => x !== p.id)] }); },
  remove(id) {
    const byId = { ...get().byId };
    delete byId[id];
    set({ byId, list: get().list.filter((x) => x !== id) });
  },

  async loadActivity() {
    const id = get().albumId;
    if (!id) return;
    const activity = await api.activity(id);
    if (get().albumId === id) set({ activity });
  },
}));
