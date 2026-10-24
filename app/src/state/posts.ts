// 앨범 게시물 (홈 피드) — 화면을 옮겨 다녀도 그대로 유지
import { create } from 'zustand';
import * as api from '../lib/api';
import type { ActivityEvent, Post } from '../lib/types';

const PAGE = 8;
const ORDER_KEY = 'pm-feed-order';
const savedOrder = (): api.FeedOrder => { try { return localStorage.getItem(ORDER_KEY) === 'taken' ? 'taken' : 'upload'; } catch { return 'upload'; } };

interface PostsState {
  albumId: string | null;
  list: string[];                 // 홈에 보이는 순서 (order 순서로 최신부터)
  /** 올린 순 · 찍은 날 순 (이 휴대폰에 기억해요) */
  order: api.FeedOrder;
  /** 날짜로 찾기: 이 달(YYYY-MM)부터 거슬러 보는 중 (null이면 맨 위부터) */
  from: string | null;
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
  setOrder: (o: api.FeedOrder) => void;
  jump: (month: string | null) => void;
}

export const usePosts = create<PostsState>((set, get) => ({
  albumId: null, list: [], byId: {}, done: false, loading: false, error: null, activity: [], order: savedOrder(), from: null,

  reset(albumId) {
    if (get().albumId === albumId) return;
    set({ albumId, list: [], byId: {}, done: false, loading: false, error: null, activity: [], from: null });
  },

  async loadFirst() {
    const id = get().albumId;
    if (!id) return;
    set({ loading: true, error: null });
    try {
      const { order, from } = get();
      // 그 달의 마지막 날까지 (다음 달 1일 0시 이전)
      const until = from ? new Date(+from.slice(0, 4), +from.slice(5, 7), 1).toISOString() : null;
      const page = await api.posts(id, { order, from: until }, PAGE);
      if (get().albumId !== id || get().order !== order || get().from !== from) return;
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
      const { order } = get();
      const page = await api.posts(id, { after: byId[list[list.length - 1]], order }, PAGE);
      if (get().albumId !== id || get().order !== order) return;
      const next = { ...get().byId };
      page.forEach((p) => { next[p.id] = p; });
      set({ list: [...get().list, ...page.map((p) => p.id).filter((x) => !get().list.includes(x))], byId: next, done: page.length < PAGE });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  setOrder(order) {
    if (order === get().order) return;
    try { localStorage.setItem(ORDER_KEY, order); } catch { /* 무시 */ }
    set({ order, from: null, list: [], done: false, loading: false, error: null });
    get().loadFirst();
  },
  jump(month) {
    // 날짜로 찾기는 찍은 날 순으로 봐요
    if (month) try { localStorage.setItem(ORDER_KEY, 'taken'); } catch { /* 무시 */ }
    set({ from: month, order: month ? 'taken' : get().order, list: [], done: false, loading: false, error: null });
    get().loadFirst();
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
