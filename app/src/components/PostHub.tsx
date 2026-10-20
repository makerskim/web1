// 게시물 관련 창들을 한 곳에서: 댓글, 크게 보기, 좋아요한 가족, 더보기 메뉴, 글 고치기
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { create } from 'zustand';
import { Comments } from './Comments';
import { LikesSheet } from './LikesSheet';
import { Viewer, type ViewItem } from './Viewer';
import { Sheet, confirm, menu, progress, toast, copyText } from './ui';
import { Button } from './Button';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { saveWithChoice, sharePhotos, type SaveName } from '../lib/media';
import { callName, subj } from '../lib/korean';
import type { PostHandlers } from './PostCard';
import type { Post } from '../lib/types';
import s from './PostHub.module.css';

interface ViewerReq { items: ViewItem[]; start: number; postLink?: boolean }
interface HubState { comments: string | null; viewer: ViewerReq | null; edit: string | null; likes: string | null }
export const useHub = create<HubState>(() => ({ comments: null, viewer: null, edit: null, likes: null }));

export const openComments = (postId: string) => useHub.setState({ comments: postId });
export const openViewer = (req: ViewerReq) => useHub.setState({ viewer: req });
export const openLikes = (postId: string) => useHub.setState({ likes: postId });

export const viewItems = (posts: Post[]): ViewItem[] => posts.flatMap((p) => p.photos.map((ph) => ({
  ...ph, albumId: p.albumId, postId: p.id, authorId: p.authorId, takenAt: p.takenAt, createdAt: p.createdAt,
})));

// 내려받는 파일 이름: 올린 사람 · 앨범 이름
const naming = (p: Post): SaveName => {
  const st = useSession.getState();
  return { who: st.member(p.authorId).displayName, album: st.album()?.name || '' };
};

// 피드·게시물 화면에서 쓰는 카드 동작
export function usePostHandlers(extra: Partial<PostHandlers> = {}): PostHandlers {
  return {
    onComments: (p) => openComments(p.id),
    onView: (p, i) => openViewer({ items: viewItems([p]), start: i }),
    onSave: (p) => saveWithChoice(p.albumId, p.photos, naming(p)),
    onLikes: (p) => openLikes(p.id),
    onShare: (p) => shareText(p).then((t) => sharePhotos(p.albumId, p.photos, t, naming(p))),
    onMore: (p) => postMenu(p),
    ...extra,
  };
}

async function shareText(p: Post) {
  const st = useSession.getState();
  const a = st.album();
  const who = st.member(p.authorId).displayName;
  return `${subj(who)} ${a?.babyName ? `${callName(a.babyName)} ` : ''}사진을 올렸어요\n${location.origin}${location.pathname}#/p/${p.id}`;
}

async function postMenu(p: Post) {
  const st = useSession.getState();
  const mine = p.authorId === st.me?.id;
  const items: Array<{ label: string; value: string; icon?: 'download' | 'send' | 'link' | 'edit' | 'trash'; danger?: boolean }> = [
    { label: '휴대폰에 저장', value: 'save', icon: 'download' },
    { label: '보내기', value: 'share', icon: 'send' },
    { label: '링크 복사', value: 'link', icon: 'link' },
  ];
  if (mine) items.push({ label: '글 고치기', value: 'edit', icon: 'edit' });
  if (mine || st.isOwner()) items.push({ label: '게시물 지우기', value: 'delete', icon: 'trash', danger: true });
  const v = await menu(items);
  if (v === 'save') saveWithChoice(p.albumId, p.photos, naming(p));
  if (v === 'share') sharePhotos(p.albumId, p.photos, await shareText(p), naming(p));
  if (v === 'link' && await copyText(`${location.origin}${location.pathname}#/p/${p.id}`)) toast('링크를 복사했어요');
  if (v === 'edit') useHub.setState({ edit: p.id });
  if (v === 'delete' && await confirm({ title: '게시물을 지울까요?', message: '사진과 댓글이 모두 사라져요.', ok: '지우기', danger: true })) {
    const pr = progress('지우는 중');
    try {
      await api.deletePost(p);
      usePosts.getState().remove(p.id);
      // 앨범 사진으로 쓰던 사진이면 (서버에서도 비워져요) 화면에서도 비워요
      const cover = st.album()?.cover;
      if (cover && (cover.startsWith(`${p.albumId}/${p.id}/`) || p.photos.some((ph) => ph.thumb === cover))) st.patchAlbum({ cover: '' });
      pr.close();
      toast('게시물을 지웠어요');
      if (location.hash.startsWith(`#/p/${p.id}`)) history.back();
    } catch (e) { pr.close(); toast((e as Error).message); }
  }
}

function EditPost({ post, onClose }: { post: Post; onClose: () => void }) {
  const [caption, setCaption] = useState(post.caption);
  const save = async () => {
    try {
      const next = await api.updatePost(post.id, { caption: caption.trim() });
      usePosts.getState().put(next);
      toast('고쳤어요');
      onClose();
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className={s.edit}>
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} rows={5} placeholder="사진 이야기" aria-label="사진 이야기" data-f="caption" />
      <Button size="lg" block onClick={save} data-save>저장</Button>
    </div>
  );
}

// 앱에 한 번만 넣어요
export function PostHubOverlays() {
  const { comments, viewer, edit, likes } = useHub();
  const byId = usePosts((st) => st.byId);
  const nav = useNavigate();
  const close = (k: keyof HubState) => useHub.setState({ [k]: null } as Partial<HubState>);
  return (
    <>
      <AnimatePresence>
        {viewer && (
          <Viewer key="viewer" items={viewer.items} start={viewer.start} onClose={() => close('viewer')}
            onOpenPost={viewer.postLink ? (id) => { close('viewer'); setTimeout(() => nav(`/p/${id}`), 50); } : undefined} />
        )}
      </AnimatePresence>
      <Comments post={comments ? byId[comments] || null : null} open={!!comments} onClose={() => close('comments')} />
      <LikesSheet post={likes ? byId[likes] || null : null} onClose={() => close('likes')} />
      <Sheet open={!!edit && !!byId[edit]} onClose={() => close('edit')} title="글 고치기">
        {edit && byId[edit] && <EditPost post={byId[edit]} onClose={() => close('edit')} />}
      </Sheet>
    </>
  );
}
