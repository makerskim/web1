// 사진 크게 보기
// - 옆으로 넘기기, 아래로 내려 닫기, 두 번 톡톡/두 손가락으로 확대
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, animate } from 'motion/react';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { useBackClose } from './ui';
import { usePhotoURL } from '../hooks/usePhoto';
import { useSession } from '../state/session';
import { fmtDate } from '../lib/dates';
import { postTag } from '../lib/album';
import { photoURL } from '../lib/storage';
import { saveWithChoice } from '../lib/media';
import type { PhotoMeta } from '../lib/types';
import s from './Viewer.module.css';

export interface ViewItem extends PhotoMeta { albumId: string; postId: string; authorId: string; takenAt: string; createdAt: string }

export function Viewer({ items, start, onClose, onOpenPost }: {
  items: ViewItem[]; start: number; onClose: () => void; onOpenPost?: (postId: string) => void;
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(items.length - 1, start)));
  const [zoom, setZoom] = useState(1);
  const [chrome, setChrome] = useState(true);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const it = items[index];
  useBackClose(true, onClose);

  const go = useCallback((d: number) => {
    const n = index + d;
    if (n < 0 || n >= items.length) return;
    setIndex(n);
  }, [index, items.length]);

  useEffect(() => { setZoom(1); x.set(0); y.set(0); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ----- 손가락 동작 -----
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ x: number; y: number; dist?: number; zoom: number; moved: boolean; multi: boolean } | null>(null);
  const lastTap = useRef(0);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    g.current = { x: p[0].x, y: p[0].y, zoom, moved: false, multi: (g.current?.multi ?? false) || p.length > 1,
      dist: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : undefined };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    if (p.length > 1 && g.current.dist) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      setZoom(Math.max(1, Math.min(5, g.current.zoom * (d / g.current.dist))));
      g.current.moved = true;
      return;
    }
    const dx = e.clientX - g.current.x;
    const dy = e.clientY - g.current.y;
    if (Math.hypot(dx, dy) > 8) g.current.moved = true;
    if (zoom > 1.01) { x.set(dx); y.set(dy); return; }
    if (Math.abs(dy) > Math.abs(dx) && dy > 0) { y.set(dy); x.set(0); }
    else x.set(dx);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    const gg = g.current;
    if (pts.current.size || !gg) return;
    g.current = null;
    const dx = e.clientX - gg.x;
    const dy = e.clientY - gg.y;
    if (zoom > 1.01) {
      if (!gg.moved && Date.now() - lastTap.current < 300) { setZoom(1); animate(x, 0); animate(y, 0); }
      lastTap.current = Date.now();
      return;
    }
    if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
    animate(y, 0, { type: 'spring', stiffness: 400, damping: 35 });
    if (Math.abs(dx) > 70) { animate(x, 0, { duration: 0.01 }); go(dx < 0 ? 1 : -1); return; }
    animate(x, 0, { type: 'spring', stiffness: 400, damping: 35 });
    if (gg.moved || gg.multi) return;
    if (Date.now() - lastTap.current < 300) { setZoom((z) => (z > 1.01 ? 1 : 2.5)); lastTap.current = 0; }
    else { lastTap.current = Date.now(); setTimeout(() => { if (lastTap.current && Date.now() - lastTap.current >= 290) setChrome((c) => !c); }, 300); }
  };

  const member = useSession((st) => st.member);
  const album = useSession((st) => st.album());
  const author = member(it.authorId);
  // 아이 나이(모임은 기념일)는 올린 날 기준
  const age = postTag(album, it.createdAt);

  return createPortal(
    <motion.div className={s.viewer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <AnimatePresence>
        {chrome && (
          <motion.header className={s.top} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={s.head}>
              <span className={s.count}>{items.length > 1 ? `${index + 1} / ${items.length}` : ''}</span>
              <button className={s.btn} onClick={() => saveWithChoice(it.albumId, [it], { who: author.displayName, album: useSession.getState().albums.find((a) => a.id === it.albumId)?.name || album?.name || '' })} aria-label="휴대폰에 저장"><Icon name="download" size={22} /></button>
              <button className={s.btn} onClick={onClose} aria-label="닫기" data-v="close"><Icon name="close" size={24} /></button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <div className={s.stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <motion.div className={s.imgWrap} style={{ x, y }}>
          <motion.div animate={{ scale: zoom }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className={s.imgScale}>
            <ViewerImage item={it} />
          </motion.div>
        </motion.div>
        {index > 0 && <button className={`${s.nav} ${s.prev}`} onClick={() => go(-1)} aria-label="이전 사진" data-v="prev"><Icon name="back" size={26} /></button>}
        {index < items.length - 1 && <button className={`${s.nav} ${s.next}`} onClick={() => go(1)} aria-label="다음 사진" data-v="next"><Icon name="right" size={26} /></button>}
      </div>

      <AnimatePresence>
        {chrome && (
          <motion.footer className={s.bottom} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={s.meta}>
              <span className={s.who}>
                <Avatar src={author.avatar} name={author.displayName} size={32} />
                <span className={s.whoText}><b>{author.displayName}</b><small>{[fmtDate(it.createdAt), age].filter(Boolean).join(' · ')}</small></span>
              </span>
              {onOpenPost && <button className={s.link} onClick={() => onOpenPost(it.postId)}>게시물 보기</button>}
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

function ViewerImage({ item }: { item: ViewItem }) {
  const { url } = usePhotoURL(item.albumId, item.path);
  const [ok, setOk] = useState(false);
  const ph = /^data:image\/jpeg;base64,/.test(item.ph) ? item.ph : '';
  return (
    <div className={s.img} style={ph ? { backgroundImage: `url(${ph})` } : undefined}>
      {url && <img src={url} alt="" draggable={false} onLoad={() => setOk(true)} className={ok ? s.on : ''} />}
    </div>
  );
}
