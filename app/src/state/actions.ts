// 좋아요·댓글처럼 화면 여러 곳에서 쓰는 동작
import * as api from '../lib/api';
import { confirm, progress, toast } from '../components/ui';
import { connectDrive } from '../lib/drive';
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

// ---------- 구글 드라이브 연동 (사진 올리기 · 공유) ----------
// 사진·동영상은 올린 사람의 구글 드라이브에 저장돼요 → 올리려면 한 번 연동해요 (카카오로 로그인한 분도)

/** 구글 창을 열어 연동해요 (진행 표시 · 취소). 연동되면 true · choose: 계정 고르기부터 (다른 계정으로 바꿀 때) */
export async function linkDrive(opts: { choose?: boolean } = {}) {
  const me = useSession.getState().me;
  let cancel = () => {};
  const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new Error('구글 드라이브 연동을 취소했어요.')); });
  cancelled.catch(() => {});
  const p = progress('구글 창에서 계정을 골라 주세요', () => cancel());
  try {
    await connectDrive({
      cancelled,
      // 구글로 로그인한 분은 그 계정으로 (계정 고르기를 건너뛰어요)
      hint: !opts.choose && me?.provider === 'google' && me.email ? me.email : undefined,
      onCode: () => { p.cancelable(false); p.set(0.6, '드라이브에 Pastel Memories 폴더와 앨범 폴더를 만드는 중'); },
    });
    p.close();
    return true;
  } catch (e) {
    p.close();
    toast((e as Error).message);
    return false;
  }
}

/** 사진을 올리려는데 아직 연동 전이면 물어봐요. 확인 → 설정의 '사진 올리기 · 공유'로 가서 연동해요 */
export const askDriveLink = () => confirm({
  title: '사진을 올리려면 구글 드라이브와 연동해 주세요',
  message: '사진·동영상은 올린 사람의 구글 드라이브에 저장되고, 앨범 멤버와 함께 봐요.\n확인을 누르면 연동하는 설정으로 가요.',
  ok: '확인',
  cancel: '취소',
});
