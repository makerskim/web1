// 좋아요·댓글처럼 화면 여러 곳에서 쓰는 동작
import * as api from '../lib/api';
import { toast } from '../components/ui';
import { usePosts } from './posts';
import { useSession } from './session';
import type { Post } from '../lib/types';

export const liked = (p: Post) => p.likes.some((l) => l.userId === useSession.getState().me?.id);

export async function toggleLike(p: Post, on = !liked(p)) {
  const me = useSession.getState().me!.id;
  const before = p;
  const next: Post = { ...p, likes: on ? [...p.likes.filter((l) => l.userId !== me), { userId: me, createdAt: new Date().toISOString() }] : p.likes.filter((l) => l.userId !== me) };
  usePosts.getState().put(next);
  try {
    await api.like(p, on, me);
  } catch (e) {
    usePosts.getState().put(before);
    toast((e as Error).message);
  }
}

export async function addComment(p: Post, body: string) {
  const c = await api.addComment(p, body);
  // 게시물을 올린 사람과 댓글을 단 가족에게 알림
  api.notify(p.albumId, 'comment', c.id);
  const cur = usePosts.getState().byId[p.id] || p;
  usePosts.getState().put({ ...cur, comments: [...cur.comments, c] });
  return c;
}

export async function deleteComment(p: Post, id: string) {
  const c = p.comments.find((x) => x.id === id);
  if (!c) return;
  await api.deleteComment(c);
  const cur = usePosts.getState().byId[p.id] || p;
  usePosts.getState().put({ ...cur, comments: cur.comments.filter((x) => x.id !== id) });
}
