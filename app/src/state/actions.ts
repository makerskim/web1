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

// ---------- 구글 로그인 (내 구글 드라이브 연결) ----------
// 사진·동영상은 올린 사람의 구글 드라이브에 저장돼요 → 올리려면 한 번 구글 로그인이 필요해요 (카카오로 로그인한 분도)

/** 구글 창을 열어 연결해요 (진행 표시 · 취소). 연결되면 true · choose: 계정 고르기부터 (다른 계정으로 바꿀 때) */
export async function linkDrive(opts: { choose?: boolean } = {}) {
  const me = useSession.getState().me;
  let cancel = () => {};
  const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new Error('구글 로그인을 취소했어요.')); });
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

/** + 를 눌렀는데 아직 구글 로그인 전이면: 예 → 바로 구글 창 · 아니요 → 그대로. 연결되면 true */
export async function askGoogleLogin() {
  const ok = await confirm({
    title: '사진을 올리기 위해서는 구글 로그인이 필요해요',
    message: '구글 로그인을 하면 내 구글 드라이브에 ‘Pastel Memories’ 폴더와 앨범 폴더가 생기고, 사진은 그 폴더에 저장되면서 앱에 올라와요.\n구글 로그인할까요?',
    ok: '예',
    cancel: '아니요',
  });
  // '예'를 누른 그 순간에 구글 창을 열어요 (늦으면 휴대폰이 팝업을 막아요)
  return ok ? linkDrive() : false;
}

/** 올리기 전에: 구글 로그인 전이면 물어보고(예/아니요), 로그인되면 바로 고를 수 있게 한 번 더 물어봐요
 *  (사진 고르기 창은 누른 순간에만 열려서 구글 창을 다녀온 뒤에는 저절로 열 수 없어요) */
export async function loginThenPick(pick: () => void) {
  if (!(await askGoogleLogin())) return false;
  const name = useSession.getState().album()?.name || '앨범';
  const go = await confirm({
    title: '구글 로그인이 됐어요',
    message: `내 구글 드라이브에 ‘Pastel Memories › ${name}’ 폴더를 만들었어요.\n이제 사진·동영상을 골라 올려 보세요.`,
    ok: '사진 고르기',
    cancel: '나중에',
  });
  if (go) pick();
  return true;
}
