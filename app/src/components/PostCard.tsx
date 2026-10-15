import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from './Avatar';
import { Photo } from './Photo';
import { Icon } from './Icon';
import { useSession } from '../state/session';
import { liked, toggleLike } from '../state/actions';
import { babyAge, fmtShort, timeAgo, ymd } from '../lib/dates';
import { subj } from '../lib/korean';
import type { Post } from '../lib/types';
import s from './PostCard.module.css';

export interface PostHandlers {
  onComments: (p: Post) => void;
  onView: (p: Post, index: number) => void;
  onMore: (p: Post) => void;
  onSave: (p: Post) => void;
  onShare: (p: Post) => void;
  onAuthor?: (uid: string) => void;
  storyRing?: (uid: string) => 'unseen' | 'seen' | null;
}

export function PostCard({ post, h, full = false }: { post: Post; h: PostHandlers; full?: boolean }) {
  const member = useSession((st) => st.member);
  const album = useSession((st) => st.album());
  const me = useSession((st) => st.me);
  const author = member(post.authorId);
  const [idx, setIdx] = useState(0);
  const [burst, setBurst] = useState(0);
  const [open, setOpen] = useState(full);
  const track = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<number>(0);
  const isLiked = liked(post);
  const first = post.photos[0];
  const ratio = Math.min(1.25, Math.max(0.52, first.h / first.w)); // 4:5 ~ 1.91:1
  const age = album?.babyBirthday ? babyAge(album.babyBirthday, post.takenAt, { short: true }) : '';
  const sub = [age, ymd(post.takenAt) !== ymd(post.createdAt) ? fmtShort(post.takenAt) : ''].filter(Boolean).join(' · ');
  const ring = h.storyRing?.(post.authorId) ?? null;

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst((n) => n + 1);
      if (!isLiked) toggleLike(post, true);
    } else {
      lastTap.current = now;
      tapTimer.current = window.setTimeout(() => h.onView(post, idx), 300);
    }
  };
  const go = (d: number) => {
    const t = track.current!;
    t.scrollTo({ left: (idx + d) * t.clientWidth, behavior: 'smooth' });
  };
  const likers = post.likes.slice(-2).map((l) => member(l.userId));
  const shownComments = full ? [] : post.comments.slice(-2);

  return (
    <article className={s.card} data-id={post.id}>
      <header className={s.head}>
        <button className={s.who} onClick={() => h.onAuthor?.(post.authorId)} disabled={!h.onAuthor}>
          <Avatar src={author.avatar} name={author.displayName} size={34} ring={!!ring} seen={ring === 'seen'} />
          <span className={s.whoText}><b>{author.displayName}</b>{sub && <small>{sub}</small>}</span>
        </button>
        <button className={s.iconBtn} onClick={() => h.onMore(post)} aria-label="더보기" data-act="more"><Icon name="more" size={22} /></button>
      </header>

      <div className={s.media} style={{ aspectRatio: `1 / ${ratio}` }}>
        <div className={s.track} ref={track} onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))} onClick={onTap} data-act="media">
          {post.photos.map((p, i) => <Photo key={p.path} albumId={post.albumId} path={p.path} ph={p.ph} className={s.slide} fit="cover" eager={i === 0} />)}
        </div>
        {post.photos.length > 1 && <span className={s.count}>{idx + 1}/{post.photos.length}</span>}
        {post.photos.length > 1 && idx > 0 && <button className={`${s.arrow} ${s.prev}`} onClick={() => go(-1)} aria-label="이전 사진"><Icon name="back" size={16} stroke={2.6} /></button>}
        {post.photos.length > 1 && idx < post.photos.length - 1 && <button className={`${s.arrow} ${s.next}`} onClick={() => go(1)} aria-label="다음 사진"><Icon name="right" size={16} stroke={2.6} /></button>}
        <AnimatePresence>
          {burst > 0 && (
            <motion.span key={burst} className={s.burst} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 1] }} exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} onAnimationComplete={() => setTimeout(() => setBurst(0), 350)}>
              <Icon name="heart" size={96} filled stroke={0} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className={s.actions}>
        <motion.button whileTap={{ scale: 0.82 }} className={`${s.act} ${isLiked ? s.liked : ''}`} onClick={() => { if (!isLiked) setBurst((n) => n + 1); toggleLike(post); }} aria-pressed={isLiked} aria-label="좋아요" data-act="like">
          <motion.span key={String(isLiked)} initial={{ scale: isLiked ? 0.6 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 15 }}>
            <Icon name="heart" size={26} filled={isLiked} stroke={isLiked ? 0 : 1.8} />
          </motion.span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} className={s.act} onClick={() => h.onComments(post)} aria-label="댓글" data-act="comments"><Icon name="comment" size={25} /></motion.button>
        <motion.button whileTap={{ scale: 0.85 }} className={s.act} onClick={() => h.onShare(post)} aria-label="보내기" data-act="share"><Icon name="send" size={24} /></motion.button>
        {post.photos.length > 1 && (
          <span className={s.dots} aria-hidden="true">{post.photos.map((_, i) => <i key={i} className={i === idx ? s.dotOn : ''} />)}</span>
        )}
        <motion.button whileTap={{ scale: 0.85 }} className={`${s.act} ${s.save}`} onClick={() => h.onSave(post)} aria-label="휴대폰에 저장" data-act="save"><Icon name="download" size={24} /></motion.button>
      </div>

      <div className={s.body}>
        {post.likes.length > 0 && (
          <p className={s.likes}>
            {post.likes.length === 1
              ? <><b>{likers[0].userId === me?.id ? '내' : likers[0].displayName}</b>{likers[0].userId === me?.id ? '가 좋아해요' : subj(likers[0].displayName).slice(likers[0].displayName.length) + ' 좋아해요'}</>
              : <><b>{likers[likers.length - 1].displayName}</b> 외 {post.likes.length - 1}명이 좋아해요</>}
          </p>
        )}
        {post.caption && (
          <p className={`${s.caption} ${open ? s.open : ''}`} onClick={() => setOpen(true)}>
            <b>{author.displayName}</b> {post.caption}
          </p>
        )}
        {!full && post.comments.length > 2 && <button className={s.more} onClick={() => h.onComments(post)}>댓글 {post.comments.length}개 모두 보기</button>}
        {shownComments.map((c) => (
          <p key={c.id} className={s.comment}><b>{member(c.authorId).displayName}</b> {c.body}</p>
        ))}
        <time className={s.time} dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
      </div>
    </article>
  );
}
