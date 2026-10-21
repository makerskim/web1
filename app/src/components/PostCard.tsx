import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from './Avatar';
import { Photo } from './Photo';
import { Icon } from './Icon';
import { FaceStack } from './People';
import { useSession } from '../state/session';
import { liked, toggleLike } from '../state/actions';
import { postAge, timeAgo } from '../lib/dates';
import { hasBatchim } from '../lib/korean';
import type { Post } from '../lib/types';
import s from './PostCard.module.css';

export interface PostHandlers {
  onComments: (p: Post) => void;
  onView: (p: Post, index: number) => void;
  onMore: (p: Post) => void;
  onSave: (p: Post) => void;
  onShare: (p: Post) => void;
  onLikes: (p: Post) => void;
}


export function PostCard({ post, h, full = false }: { post: Post; h: PostHandlers; full?: boolean }) {
  const member = useSession((st) => st.member);
  const album = useSession((st) => st.album());
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
  // 아이 나이는 올린 날 기준
  const age = album?.babyBirthday ? postAge(album.babyBirthday, post.createdAt) : '';

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
  // 좋아요한 가족 이름 (최근에 누른 사람부터): 3명까지는 모두, 4명부터는 "엄마, 아빠 외 2명이 좋아해요"
  const likers = [...post.likes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => member(l.userId));
  const named = likers.length <= 3 ? likers : likers.slice(0, 2);
  const rest = likers.length - named.length;
  const last = named[named.length - 1]?.displayName || '';
  // 글이 두 줄을 넘으면 '더 보기'
  const capRef = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = capRef.current;
    setLong(!!el && !open && el.scrollHeight > el.clientHeight + 1);
  }, [post.caption, open]);
  const nComments = post.comments.length;

  return (
    <article className={s.card} data-id={post.id}>
      <header className={s.head}>
        <span className={s.who}>
          <Avatar src={author.avatar} name={author.displayName} size={36} />
          <span className={s.whoText}><b>{author.displayName}</b>{age && <small className={s.ageTag} data-f="age">{age}</small>}</span>
        </span>
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
        {likers.length > 0 && (
          <button className={s.likes} onClick={() => h.onLikes(post)} data-act="likers">
            <FaceStack people={likers.slice(0, 3)} />
            <span>
              {named.map((m, i) => <span key={m.userId}>{i > 0 && ', '}<b>{m.displayName}</b></span>)}
              {rest > 0 ? ` 외 ${rest}명이 좋아해요` : `${hasBatchim(last) ? '이' : '가'} 좋아해요`}
            </span>
          </button>
        )}
        {post.caption && (
          <>
            <p ref={capRef} className={`${s.caption} ${open ? s.open : ''}`} onClick={() => setOpen(true)}>
              <b>{author.displayName}</b> {post.caption}
            </p>
            {long && <button className={s.more} onClick={() => setOpen(true)}>더 보기</button>}
          </>
        )}
        {/* 댓글 내용은 눌러야 보여요 (피드·게시물 화면 모두) */}
        {nComments > 0 && (
          <button className={s.cmtLink} onClick={() => h.onComments(post)} data-act="comments-link">댓글 {nComments}개 보기</button>
        )}
        <time className={s.time} dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
      </div>
    </article>
  );
}
