import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from './Avatar';
import { Photo } from './Photo';
import { VideoSlide, isVideo } from './Video';
import { Icon } from './Icon';
import { FaceStack } from './People';
import { useSession } from '../state/session';
import { myReaction, react } from '../state/actions';
import { fmtDay, timeAgo, ymd } from '../lib/dates';
import { postTag } from '../lib/album';
import { hasBatchim } from '../lib/korean';
import { REACTIONS, type Post, type Reaction } from '../lib/types';
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
  // 사진 위에 크게 떴다 사라지는 리액션
  const [burst, setBurst] = useState<{ n: number; emoji: Reaction } | null>(null);
  const pop = (emoji: Reaction) => setBurst((b) => ({ n: (b?.n || 0) + 1, emoji }));
  // 리액션 고르기 (하트를 길게 누르거나 웃는 얼굴 버튼)
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const reactBtn = useRef<HTMLButtonElement>(null);
  const press = useRef<{ t: number; long: boolean }>({ t: 0, long: false });
  const [open, setOpen] = useState(full);
  const track = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<number>(0);
  const mine = myReaction(post);
  const first = post.photos[0];
  const ratio = Math.min(1.25, Math.max(0.52, first.h / first.w)); // 4:5 ~ 1.91:1
  // 아이 나이(모임은 기념일)는 사진을 찍은 날 기준
  const shotAt = post.takenAt || post.createdAt;
  const age = postTag(album, shotAt);
  // 찍은 날이 올린 날과 다르면 같이 보여 줘요 ('8월 20일 (목)에 찍은 사진 · 3일 전')
  const shot = ymd(shotAt) !== ymd(post.createdAt) ? fmtDay(shotAt) : null;

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      pop(mine || '❤️');
      if (!mine) react(post, '❤️');
    } else {
      lastTap.current = now;
      tapTimer.current = window.setTimeout(() => h.onView(post, idx), 300);
    }
  };
  const go = (d: number) => {
    const t = track.current!;
    t.scrollTo({ left: (idx + d) * t.clientWidth, behavior: 'smooth' });
  };
  // 하트: 누르면 ❤️ 남기기·없애기, 길게 누르면 다른 리액션 고르기
  const onHeart = () => {
    if (press.current.long) { press.current.long = false; return; }
    if (!mine) pop('❤️');
    react(post, mine ? null : '❤️');
  };
  const holdStart = () => {
    clearTimeout(press.current.t);
    press.current.long = false;
    press.current.t = window.setTimeout(() => { press.current.long = true; setPicker(true); navigator.vibrate?.(10); }, 450);
  };
  const holdEnd = () => clearTimeout(press.current.t);
  const choose = (e: Reaction) => {
    setPicker(false);
    if (e === mine) { react(post, null); return; }
    pop(e);
    react(post, e);
  };
  useEffect(() => {
    if (!picker) return;
    const off = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (!pickerRef.current?.contains(t) && !reactBtn.current?.contains(t)) setPicker(false);
    };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setPicker(false); };
    document.addEventListener('pointerdown', off, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc); };
  }, [picker]);
  // 리액션 모아 보기: 많이 남긴 것부터 3개까지
  const counts = new Map<Reaction, number>();
  post.likes.forEach((l) => counts.set(l.emoji, (counts.get(l.emoji) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
  const onlyHearts = top.length === 1 && top[0] === '❤️';
  // 리액션한 가족 이름 (최근에 누른 사람부터): 3명까지는 모두, 4명부터는 "엄마, 아빠 외 2명이 좋아해요"
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
          <span className={s.whoText}>
            <b>{author.displayName}</b>{age && <small className={s.ageTag} data-f="age">{age}</small>}
            {post.visibility === 'owners' && <small className={s.lockTag} data-f="owners-only" title="관리자와 올린 사람만 봐요"><Icon name="lock" size={12} stroke={2.4} />관리자만</small>}
          </span>
        </span>
        <button className={s.iconBtn} onClick={() => h.onMore(post)} aria-label="더보기" data-act="more"><Icon name="more" size={22} /></button>
      </header>

      <div className={`${s.media} ${post.bg === 'black' ? s.bgBlack : post.bg === 'white' ? s.bgWhite : ''}`} style={{ aspectRatio: `1 / ${ratio}` }} data-bg={post.bg}>
        <div className={s.track} ref={track} onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))} onClick={onTap} data-act="media">
          {/* 사진은 자르지 않고 칸에 맞게 줄여서 전체를 보여 줘요 (남는 자리는 올릴 때 고른 대로: 흐리게 · 검은색 · 흰색) */}
          {post.photos.map((p, i) => (isVideo(p)
            ? <VideoSlide key={p.path} albumId={post.albumId} item={p} className={s.slide} />
            : <Photo key={p.path} albumId={post.albumId} path={p.path} ph={p.ph} className={`${s.slide} ${s.fitted}`} fit="contain" eager={i === 0} />))}
        </div>
        {post.photos.length > 1 && <span className={s.count}>{idx + 1}/{post.photos.length}</span>}
        {post.photos.length > 1 && idx > 0 && <button className={`${s.arrow} ${s.prev}`} onClick={() => go(-1)} aria-label="이전 사진"><Icon name="back" size={16} stroke={2.6} /></button>}
        {post.photos.length > 1 && idx < post.photos.length - 1 && <button className={`${s.arrow} ${s.next}`} onClick={() => go(1)} aria-label="다음 사진"><Icon name="right" size={16} stroke={2.6} /></button>}
        <AnimatePresence>
          {burst && (
            <motion.span key={burst.n} className={s.burst} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 1] }} exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} onAnimationComplete={() => setTimeout(() => setBurst(null), 350)} data-burst={burst.emoji}>
              {burst.emoji === '❤️' ? <Icon name="heart" size={96} filled stroke={0} /> : <span className={s.burstEmoji}>{burst.emoji}</span>}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className={s.actions}>
        <motion.button whileTap={{ scale: 0.82 }} className={`${s.act} ${mine ? s.liked : ''}`} onClick={onHeart}
          onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()}
          aria-pressed={!!mine} aria-label={mine ? `내 리액션 ${mine} (누르면 없애요, 길게 누르면 바꿔요)` : '좋아요 (길게 누르면 다른 리액션)'} data-act="like" data-mine={mine || ''}>
          <motion.span key={mine || 'none'} initial={{ scale: mine ? 0.6 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 15 }}>
            {mine && mine !== '❤️' ? <span className={s.mineEmoji}>{mine}</span> : <Icon name="heart" size={26} filled={!!mine} stroke={mine ? 0 : 1.8} />}
          </motion.span>
        </motion.button>
        <motion.button ref={reactBtn} whileTap={{ scale: 0.85 }} className={`${s.act} ${s.reactBtn}`} onClick={() => setPicker((v) => !v)} aria-label="리액션 고르기" aria-expanded={picker} data-act="react">
          <Icon name="smile" size={23} />
        </motion.button>
        <AnimatePresence>
          {picker && (
            <motion.div ref={pickerRef} className={s.reactBar} role="menu" aria-label="리액션" data-f="react-bar"
              initial={{ opacity: 0, y: 8, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
              {REACTIONS.map((e, i) => (
                <motion.button key={e} role="menuitemradio" aria-checked={mine === e} className={`${s.reactOpt} ${mine === e ? s.reactOn : ''}`} onClick={() => choose(e)}
                  initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.025, type: 'spring', stiffness: 600, damping: 22 }}
                  whileTap={{ scale: 1.25 }} data-react={e}>{e}</motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
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
            {!onlyHearts && <span className={s.reactSum} data-f="react-sum">{top.join('')}</span>}
            <span>
              {named.map((m, i) => <span key={m.userId}>{i > 0 && ', '}<b>{m.displayName}</b></span>)}
              {rest > 0 ? ` 외 ${rest}명이 ${onlyHearts ? '좋아해요' : '반응했어요'}` : `${hasBatchim(last) ? '이' : '가'} ${onlyHearts ? '좋아해요' : '반응했어요'}`}
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
        <p className={s.time}>
          {shot && <><time dateTime={shotAt} data-f="shot-day">{shot}에 찍은 사진</time> · </>}
          <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
        </p>
      </div>
    </article>
  );
}
