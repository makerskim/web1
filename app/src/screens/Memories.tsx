// 추억 보기: 사진이 영상처럼 천천히 움직이며 넘어가요 (N년 전 오늘 · 한 달 모아 재생)
// - 화면 왼쪽/오른쪽을 누르면 이전/다음, 가운데 버튼으로 멈춤·재생
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../components/Icon';
import { useAlbum, useSession } from '../state/session';
import { usePhotoURL } from '../hooks/usePhoto';
import { photoURL } from '../lib/storage';
import { fmtDate, fmtMonth } from '../lib/dates';
import { dayOf } from '../components/Filters';
import * as api from '../lib/api';
import type { PhotoMeta } from '../lib/types';
import s from './Memories.module.css';

const SHOW_MS = 4500;

interface Slide extends PhotoMeta { key: string; postId: string; authorId: string; createdAt: string; caption: string }

const yearsAgo = (iso: string) => new Date().getFullYear() - new Date(iso).getFullYear();

/** 오늘과 같은 날(지난해들)에 올린 사진: 1년 전 → 2년 전 … 해마다 묶어서 (같은 해 안에서는 올린 순서) */
export async function memoriesToday(albumId: string): Promise<Slide[]> {
  const posts = await api.onThisDay(albumId);
  return posts.flatMap((p) => p.photos.map((ph, i) => ({ ...ph, key: `${p.id}-${i}`, postId: p.id, authorId: p.authorId, createdAt: p.createdAt, caption: i === 0 ? p.caption : '' })))
    .sort((a, b) => yearsAgo(a.createdAt) - yearsAgo(b.createdAt) || a.createdAt.localeCompare(b.createdAt));
}

export function Memories() {
  const album = useAlbum()!;
  const member = useSession((st) => st.member);
  const nav = useNavigate();
  const [q] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(q.get('month') || '') ? q.get('month')! : null;
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    let live = true;
    const load = month
      ? api.allPhotos(album.id).then((list) => list.filter((it) => dayOf(it).slice(0, 7) === month)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.postId.localeCompare(b.postId) || a.index - b.index)
        .map((it) => ({ ...it, key: `${it.postId}-${it.index}`, caption: '' } as Slide)))
      : memoriesToday(album.id);
    load.then((l) => live && setSlides(l), () => live && setSlides([]));
    return () => { live = false; };
  }, [album.id, month]);

  const close = () => {
    // 알림으로 바로 열었으면 뒤로 갈 곳이 없어요 → 홈으로
    if ((history.state as { idx?: number } | null)?.idx) nav(-1); else nav('/home', { replace: true });
  };
  const go = (d: number) => {
    if (!slides?.length) return;
    const n = i + d;
    if (n >= slides.length) { setEnded(true); return; }
    setEnded(false);
    setI(Math.max(0, n));
  };

  // 자동으로 넘겨요 (멈추면 남은 시간을 기억했다가 이어서, 끝이면 쉬어요)
  const left = useRef(SHOW_MS);
  const startedAt = useRef(0);
  useEffect(() => { left.current = SHOW_MS; }, [i]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!slides?.length || ended) return;
    if (paused) {
      if (startedAt.current) left.current = Math.max(300, left.current - (Date.now() - startedAt.current));
      startedAt.current = 0;
      return;
    }
    startedAt.current = Date.now();
    timer.current = window.setTimeout(() => go(1), left.current);
    return () => clearTimeout(timer.current);
  }, [i, paused, ended, slides]); // eslint-disable-line react-hooks/exhaustive-deps

  // 다음 사진 미리 받기
  useEffect(() => {
    if (!slides) return;
    [i + 1, i + 2].forEach((k) => slides[k] && photoURL(album.id, slides[k].path).catch(() => {}));
  }, [i, slides, album.id]);

  const it = slides?.[i];
  const title = month ? fmtMonth(`${month}-01`) : it ? `${yearsAgo(it.createdAt)}년 전 오늘` : 'N년 전 오늘';
  const years = useMemo(() => [...new Set((slides || []).map((x) => yearsAgo(x.createdAt)))], [slides]);

  return createPortal(
    <motion.div className={s.wrap} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} data-f="memories">
      {/* 위: 진행 막대 · 제목 · 닫기 */}
      <header className={s.top}>
        {!!slides?.length && (
          <div className={s.bars} aria-hidden="true">
            {slides.map((x, k) => (
              <i key={x.key}>
                <b className={k < i || (k === i && ended) ? s.full : k === i ? `${s.run} ${paused ? s.paused : ''}` : ''}
                  style={k === i && !ended ? { animationDuration: `${SHOW_MS}ms` } : undefined} />
              </i>
            ))}
          </div>
        )}
        <div className={s.head}>
          <div>
            <h2 data-f="mem-title">{title}</h2>
            {it && <small>{fmtDate(it.createdAt)}{!month && years.length > 1 ? ` · ${years.map((y) => `${y}년 전`).join(', ')}` : ''}</small>}
          </div>
          <button className={s.btn} onClick={close} aria-label="닫기" data-f="mem-close"><Icon name="close" size={24} /></button>
        </div>
      </header>

      {/* 사진: 천천히 다가가며 겹쳐 바뀌어요 */}
      <div className={s.stage}>
        <AnimatePresence initial={false}>
          {it && <KenBurns key={it.key} albumId={album.id} item={it} index={i} paused={paused} />}
        </AnimatePresence>
        {slides && !slides.length && (
          <div className={s.empty} data-f="mem-empty">
            <Icon name="film" size={40} />
            <p>{month ? '이 달에는 사진이 없어요' : '오늘은 지난해 같은 날 찍은 사진이 없어요'}</p>
            <small>모아보기에서 달마다 ▶를 누르면 그 달 사진을 재생해요</small>
          </div>
        )}
        {!slides && <span className={s.spin} />}
        {/* 왼쪽·오른쪽 누르기 */}
        {!!slides?.length && !ended && (
          <>
            <button className={`${s.tap} ${s.left}`} onClick={() => go(-1)} aria-label="이전 사진" data-f="mem-prev" />
            <button className={`${s.tap} ${s.right}`} onClick={() => go(1)} aria-label="다음 사진" data-f="mem-next" />
          </>
        )}
      </div>

      {/* 아래: 누가 · 이야기 · 멈춤 */}
      {it && !ended && (
        <footer className={s.bottom}>
          <p className={s.who}><b>{member(it.authorId).displayName}</b>{it.caption ? ` ${it.caption}` : ''}</p>
          <button className={s.pause} onClick={() => setPaused((p) => !p)} aria-label={paused ? '재생' : '멈춤'} data-f="mem-pause">
            <Icon name={paused ? 'play' : 'pause'} size={20} />
          </button>
        </footer>
      )}
      {ended && (
        <div className={s.end} data-f="mem-end">
          <p>추억을 다 봤어요 🤍</p>
          <div>
            <button onClick={() => { left.current = SHOW_MS; setEnded(false); setI(0); }} data-f="mem-again"><Icon name="refresh" size={18} /> 다시 보기</button>
            <button onClick={() => it && nav(`/p/${it.postId}`)} >게시물 보기</button>
          </div>
        </div>
      )}
    </motion.div>,
    document.body,
  );
}

// 사진마다 방향을 바꿔 천천히 확대·이동 (멈추면 그 자리에서)
function KenBurns({ albumId, item, index, paused }: { albumId: string; item: Slide; index: number; paused: boolean }) {
  const { url } = usePhotoURL(albumId, item.path);
  const dirs = [[-2, -1.5], [2, -1], [-1.5, 1.5], [1.5, 1.5]];
  const [dx, dy] = dirs[index % dirs.length];
  return (
    <motion.div className={s.slide} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: 'easeInOut' }}>
      {url && <img src={url} alt="" aria-hidden="true" className={s.blur} />}
      {url && (
        <img src={url} alt="" className={`${s.photo} ${paused ? s.hold : ''}`}
          style={{ ['--dx' as string]: `${dx}%`, ['--dy' as string]: `${dy}%`, animationDuration: `${SHOW_MS + 1200}ms` }} data-f="mem-photo" />
      )}
      {item.kind === 'video' && <span className={s.video}><Icon name="play" size={12} /> 동영상</span>}
    </motion.div>
  );
}
