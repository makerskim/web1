// 사진 크게 보기 + 스토리
// - 옆으로 넘기기, 아래로 내려 닫기, 두 번 톡톡/두 손가락으로 확대
// - 스토리: 사진이 다 보이면 5초 뒤 다음, 왼쪽 누르면 이전·오른쪽 다음, 꾹 누르면 멈춤
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, animate } from 'motion/react';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { useBackClose, toast } from './ui';
import { usePhotoURL } from '../hooks/usePhoto';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';
import { addComment, liked, toggleLike } from '../state/actions';
import { babyAge, fmtDate, timeAgo } from '../lib/dates';
import { photoURL } from '../lib/storage';
import { saveWithChoice } from '../lib/media';
import type { PhotoMeta } from '../lib/types';
import s from './Viewer.module.css';

export interface ViewItem extends PhotoMeta { albumId: string; postId: string; authorId: string; takenAt: string; createdAt: string }

const STORY_MS = 5000;
const REACTIONS = ['😍', '🥰', '👏', '😂'];

export function Viewer({ items, start, story = false, hold = false, onClose, onShown, onOpenPost, onComments }: {
  items: ViewItem[]; start: number; story?: boolean; hold?: boolean; onClose: () => void;
  onShown?: (it: ViewItem) => void; onOpenPost?: (postId: string) => void; onComments?: (postId: string) => void;
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(items.length - 1, start)));
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [chrome, setChrome] = useState(true);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const it = items[index];
  useBackClose(true, onClose);

  const go = useCallback((d: number) => {
    const n = index + d;
    if (n < 0) return;
    if (n >= items.length) { if (story) onClose(); return; }
    setIndex(n);
  }, [index, items.length, story, onClose]);

  useEffect(() => { setLoaded(false); setZoom(1); x.set(0); y.set(0); onShown?.(it); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // 이웃 사진 미리 받기
  useEffect(() => {
    [index + 1, index - 1].forEach((k) => items[k] && photoURL(items[k].albumId, items[k].path).catch(() => {}));
  }, [index, items]);

  // 키보드
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [go]);

  // 스토리: 앱이 가려지면 멈춤
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const running = story && loaded && !paused && !hidden && !hold;

  // ----- 손가락 동작 -----
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ x: number; y: number; t: number; dist?: number; zoom: number; moved: boolean; multi: boolean } | null>(null);
  const holdTimer = useRef(0);
  const lastTap = useRef(0);
  const stage = useRef<HTMLDivElement>(null);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    g.current = { x: p[0].x, y: p[0].y, t: Date.now(), zoom, moved: false, multi: (g.current?.multi ?? false) || p.length > 1,
      dist: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : undefined };
    if (story) { clearTimeout(holdTimer.current); holdTimer.current = window.setTimeout(() => setPaused(true), 220); }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    if (p.length > 1 && g.current.dist && !story) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      setZoom(Math.max(1, Math.min(5, g.current.zoom * (d / g.current.dist))));
      g.current.moved = true;
      return;
    }
    const dx = e.clientX - g.current.x;
    const dy = e.clientY - g.current.y;
    if (Math.hypot(dx, dy) > 8) { g.current.moved = true; clearTimeout(holdTimer.current); }
    if (zoom > 1.01) { x.set(dx); y.set(dy); return; }
    if (Math.abs(dy) > Math.abs(dx) && dy > 0) { y.set(dy); x.set(0); }
    else if (!story) x.set(dx);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    clearTimeout(holdTimer.current);
    const gg = g.current;
    if (pts.current.size || !gg) return;
    g.current = null;
    const dx = e.clientX - gg.x;
    const dy = e.clientY - gg.y;
    const wasHeld = story && paused && !gg.moved;
    if (story) setPaused(false);
    if (zoom > 1.01) {
      if (!gg.moved && Date.now() - lastTap.current < 300) { setZoom(1); animate(x, 0); animate(y, 0); }
      lastTap.current = Date.now();
      return;
    }
    if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
    animate(y, 0, { type: 'spring', stiffness: 400, damping: 35 });
    if (!story && Math.abs(dx) > 70) { animate(x, 0, { duration: 0.01 }); go(dx < 0 ? 1 : -1); return; }
    animate(x, 0, { type: 'spring', stiffness: 400, damping: 35 });
    if (gg.moved || gg.multi || wasHeld) return;
    if (story) {
      const r = stage.current!.getBoundingClientRect();
      go(e.clientX - r.left < r.width / 3 ? -1 : 1);
      return;
    }
    if (Date.now() - lastTap.current < 300) { setZoom((z) => (z > 1.01 ? 1 : 2.5)); lastTap.current = 0; }
    else { lastTap.current = Date.now(); setTimeout(() => { if (lastTap.current && Date.now() - lastTap.current >= 290) setChrome((c) => !c); }, 300); }
  };

  const post = usePosts((st) => st.byId[it.postId]);
  const member = useSession((st) => st.member);
  const album = useSession((st) => st.album());
  const author = member(it.authorId);
  const age = album?.babyBirthday ? babyAge(album.babyBirthday, it.takenAt) : '';
  const groupRange = (() => {
    let a = index; let b = index;
    while (a > 0 && items[a - 1].authorId === it.authorId) a--;
    while (b < items.length - 1 && items[b + 1].authorId === it.authorId) b++;
    return [a, b];
  })();

  const react = async (emoji: string) => {
    if (!post) return;
    try {
      await addComment(post, emoji);
      toast(`${emoji} 보냈어요`);
    } catch (e) { toast((e as Error).message); }
  };

  return createPortal(
    <motion.div className={`${s.viewer} ${story ? s.story : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      style={{ ['--fade' as string]: 1 }}>
      <AnimatePresence>
        {(chrome || story) && (
          <motion.header className={s.top} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {story && (
              <div className={s.bars}>
                {items.slice(groupRange[0], groupRange[1] + 1).map((_, k) => {
                  const i = groupRange[0] + k;
                  return (
                    <span key={`${index}-${i}`} className={s.bar}>
                      {i < index ? <i style={{ width: '100%' }} /> : i === index ? (
                        <motion.i initial={{ width: '0%' }} animate={running ? { width: '100%' } : undefined}
                          transition={{ duration: STORY_MS / 1000, ease: 'linear' }} onAnimationComplete={() => running && go(1)} />
                      ) : null}
                    </span>
                  );
                })}
              </div>
            )}
            <div className={s.head}>
              {story ? (
                <span className={s.who}><Avatar src={author.avatar} name={author.displayName} size={32} /><span><b>{author.displayName}</b><small>{[age && age.split(' · ')[0], timeAgo(it.createdAt)].filter(Boolean).join(' · ')}</small></span></span>
              ) : (
                <span className={s.count}>{items.length > 1 ? `${index + 1} / ${items.length}` : ''}</span>
              )}
              {!story && <button className={s.btn} onClick={() => saveWithChoice(it.albumId, [it], it.takenAt)} aria-label="저장"><Icon name="download" size={22} /></button>}
              <button className={s.btn} onClick={onClose} aria-label="닫기" data-v="close"><Icon name="close" size={24} /></button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <div className={s.stage} ref={stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onContextMenu={(e) => story && e.preventDefault()}>
        <motion.div className={s.imgWrap} style={{ x, y }}>
          <motion.div animate={{ scale: zoom }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className={s.imgScale}>
            <ViewerImage item={it} onLoaded={() => setLoaded(true)} />
          </motion.div>
        </motion.div>
        {!story && index > 0 && <button className={`${s.nav} ${s.prev}`} onClick={() => go(-1)} aria-label="이전 사진" data-v="prev"><Icon name="back" size={26} /></button>}
        {!story && index < items.length - 1 && <button className={`${s.nav} ${s.next}`} onClick={() => go(1)} aria-label="다음 사진" data-v="next"><Icon name="right" size={26} /></button>}
      </div>

      <AnimatePresence>
        {(chrome || story) && (
          <motion.footer className={s.bottom} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {story ? (
              <div className={s.storyActions}>
                {post && (
                  <button className={`${s.btn} ${liked(post) ? s.liked : ''}`} onClick={() => toggleLike(post)} aria-label="좋아요" aria-pressed={liked(post)}>
                    <Icon name="heart" size={26} filled={liked(post)} stroke={liked(post) ? 0 : 1.8} />
                  </button>
                )}
                <div className={s.reacts}>{REACTIONS.map((e) => <button key={e} onClick={() => react(e)} aria-label={`${e} 보내기`}>{e}</button>)}</div>
                {onComments && <button className={s.btn} onClick={() => onComments(it.postId)} aria-label="댓글"><Icon name="comment" size={24} /></button>}
              </div>
            ) : (
              <div className={s.meta}>
                <p>{fmtDate(it.takenAt)}{age ? ` · ${age}` : ''}</p>
                {onOpenPost && <button className={s.link} onClick={() => onOpenPost(it.postId)}>게시물 보기</button>}
              </div>
            )}
          </motion.footer>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

function ViewerImage({ item, onLoaded }: { item: ViewItem; onLoaded: () => void }) {
  const { url, failed } = usePhotoURL(item.albumId, item.path);
  const [ok, setOk] = useState(false);
  useEffect(() => { if (failed) onLoaded(); }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(onLoaded, 12000); return () => clearTimeout(t); }, [item.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const ph = /^data:image\/jpeg;base64,/.test(item.ph) ? item.ph : '';
  return (
    <div className={s.img} style={ph ? { backgroundImage: `url(${ph})` } : undefined}>
      {url && <img src={url} alt="" draggable={false} onLoad={() => { setOk(true); onLoaded(); }} className={ok ? s.on : ''} />}
    </div>
  );
}
