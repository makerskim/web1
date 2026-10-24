import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { PostCard } from '../components/PostCard';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { usePostHandlers } from '../components/PostHub';
import { usePageScroll } from '../components/Stack';
import { AmpText } from '../components/AlbumBits';
import { useAlbum } from '../state/session';
import { usePosts } from '../state/posts';
import { babyMonths, fmtMonth, toDate, ymd } from '../lib/dates';
import { Sheet } from '../components/ui';
import * as api from '../lib/api';
import type { FeedOrder } from '../lib/api';
import { celebrationsToday } from '../lib/album';
import { hasBatchim } from '../lib/korean';
import { AlbumSwitcher } from './AlbumSwitcher';
import { memoriesToday } from './Memories';
import { Photo } from '../components/Photo';
import type { Album, PhotoMeta } from '../lib/types';
import { InviteSheet } from './Invite';
import s from './Feed.module.css';

const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

function SkeletonPost() {
  return (
    <div className={s.skel} aria-hidden="true" data-f="skeleton">
      <div className={s.skelHead}><i className={s.skelAvatar} /><i className={s.skelLine} /></div>
      <i className={s.skelMedia} />
      <i className={`${s.skelLine} ${s.skelShort}`} />
    </div>
  );
}

// 타임라인의 달 구분: 찍은 날 순이면 그 달(아기 앨범은 몇 개월), 올린 순이면 올린 달
function monthLabel(month: string, order: FeedOrder, album: Album) {
  const m = order === 'taken' && album.kind === 'baby' && album.babyBirthday ? babyMonths(album.babyBirthday, toDate(`${month}-15`)) : null;
  return `${fmtMonth(`${month}-01`)}${order === 'upload' ? '에 올린 사진' : ''}${m !== null && m >= 0 ? ` · ${m === 0 ? '첫 달' : `${m}개월`}` : ''}`;
}

// 날짜로 찾기: 사진을 찍은 달 목록 → 누르면 그 달부터 (찍은 날 순)
function JumpSheet({ open, onClose, album, onPick }: { open: boolean; onClose: () => void; album: Album; onPick: (m: string) => void }) {
  const [months, setMonths] = useState<{ month: string; count: number }[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    api.postMonths(album.id).then((l) => live && setMonths(l), () => live && setMonths([]));
    return () => { live = false; };
  }, [open, album.id]);
  const years = useMemo(() => {
    const m = new Map<string, { month: string; count: number }[]>();
    (months || []).forEach((x) => m.set(x.month.slice(0, 4), [...(m.get(x.month.slice(0, 4)) || []), x]));
    return [...m.entries()];
  }, [months]);
  return (
    <Sheet open={open} onClose={onClose} title="날짜로 찾기" tall>
      {!months && <p className={s.jumpMsg}>불러오는 중…</p>}
      {months && !months.length && <p className={s.jumpMsg}>아직 사진이 없어요</p>}
      {years.map(([y, list]) => (
        <section key={y} className={s.jumpYear}>
          <h4>{y}년</h4>
          <div className={s.jumpGrid}>
            {list.map((x) => (
              <button key={x.month} className={s.jumpMonth} onClick={() => onPick(x.month)} data-jump={x.month}>
                <b>{Number(x.month.slice(5))}월</b>
                <small>{x.count}개{album.kind === 'baby' && album.babyBirthday ? (() => { const n = babyMonths(album.babyBirthday!, toDate(`${x.month}-15`)); return n !== null && n >= 0 ? ` · ${n}개월` : ''; })() : ''}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  );
}

export function Feed() {
  const album = useAlbum()!;
  const { list, byId, loading, done, error, loadFirst, loadMore, reset, order, from, setOrder, jump } = usePosts();
  const [jumping, setJumping] = useState(false);
  const posts = useMemo(() => list.map((id) => byId[id]).filter(Boolean), [list, byId]);
  const [params, setParams] = useSearchParams();
  const [switcher, setSwitcher] = useState(false);
  // 앨범을 막 만들었을 때만 초대 안내가 떠요 (평소 초대는 '가족' 탭에서)
  const welcome = params.get('welcome') === '1';
  const end = useRef<HTMLDivElement>(null);
  const handlers = usePostHandlers();
  const root = usePageScroll();
  // 비어 있다가 처음 불러온 사진만 살며시 나타나요 (뒤로 와서 다시 그릴 때는 그대로)
  const appear = useRef(posts.length === 0);
  if (posts.length === 0) appear.current = true;

  useEffect(() => { reset(album.id); if (!usePosts.getState().list.length) loadFirst(); }, [album.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver((en) => en[0].isIntersecting && loadMore(), { root, rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, posts.length, root]);

  // 오늘 챙길 날: 아기 기념일 · 가족/모임 1주년 · 설정한 기념일 (여럿이면 한 줄에)
  const today = celebrationsToday(album);
  const milestone = today.join(' · ');
  const msKey = `pm-ms-${album.id}-${ymd(new Date())}`;
  const [msHidden, setMsHidden] = useState(() => !!load(msKey, false));

  // N년 전 오늘: 지난해 같은 날 찍은 사진이 있으면 '추억 보기'
  const nav = useNavigate();
  const [mem, setMem] = useState<{ count: number; years: number; cover: PhotoMeta } | null>(null);
  const memKey = `pm-mem-${album.id}-${ymd(new Date())}`;
  const [memHidden, setMemHidden] = useState(() => !!load(memKey, false));
  useEffect(() => {
    let live = true;
    setMem(null);
    setMemHidden(!!load(memKey, false));
    memoriesToday(album.id).then((l) => {
      if (!live || !l.length) return;
      const last = l[l.length - 1];
      setMem({ count: l.length, years: new Date().getFullYear() - new Date(last.takenAt).getFullYear(), cover: last });
    }, () => {});
    return () => { live = false; };
  }, [album.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <TopBar large title={
        <button className={s.wordmark} onClick={() => setSwitcher(true)} aria-label="앨범 바꾸기" data-f="switcher">
          <AmpText text={album.name} /><Icon name="down" size={18} stroke={2.2} />
        </button>
      } />

      {milestone && !msHidden && (
        <div className={s.milestone}>
          <p data-f="celebrate">오늘은 <b>{milestone}</b>{hasBatchim(milestone) ? '이에요' : '예요'} 🎉</p>
          <button onClick={() => { save(msKey, true); setMsHidden(true); }} aria-label="닫기"><Icon name="close" size={18} /></button>
        </div>
      )}

      {mem && !memHidden && (
        <div className={s.memory} data-f="memory-card">
          <button className={s.memoryMain} onClick={() => nav('/memories')} data-f="memory-open">
            <Photo albumId={album.id} path={mem.cover.thumb} ph={mem.cover.ph} className={s.memoryThumb} />
            <span className={s.memoryText}><b>{mem.years}년 전 오늘</b><small>사진 {mem.count}장 · 눌러서 추억 보기</small></span>
            <span className={s.memoryPlay}><Icon name="play" size={16} /></span>
          </button>
          <button className={s.memoryClose} onClick={() => { save(memKey, true); setMemHidden(true); }} aria-label="오늘은 그만 보기"><Icon name="close" size={16} /></button>
        </div>
      )}

      {/* 타임라인 정렬 · 날짜로 찾기 */}
      {(posts.length > 0 || from) && (
        <div className={s.tools} data-f="feed-tools">
          <div className={s.seg} role="radiogroup" aria-label="타임라인 순서">
            {([['upload', '올린 순'], ['taken', '찍은 날 순']] as const).map(([v, label]) => (
              <button key={v} role="radio" aria-checked={order === v} className={order === v ? s.segOn : ''} onClick={() => { setOrder(v); root?.scrollTo({ top: 0 }); }} data-order={v}>{label}</button>
            ))}
          </div>
          <button className={s.jumpBtn} onClick={() => setJumping(true)} data-f="feed-jump"><Icon name="calendar" size={16} />날짜로 찾기</button>
        </div>
      )}
      {from && (
        <div className={s.fromBar} data-f="feed-from">
          <span><b>{fmtMonth(`${from}-01`)}</b>부터 보는 중</span>
          <button onClick={() => { jump(null); root?.scrollTo({ top: 0 }); }} data-f="feed-latest">최신으로</button>
        </div>
      )}

      <div className={`${s.posts} ${appear.current ? s.appear : ''}`}>
        {posts.map((p, i) => {
          const key = (x: typeof p) => ymd(order === 'taken' ? x.takenAt || x.createdAt : x.createdAt).slice(0, 7);
          const k = key(p);
          const head = i === 0 ? (order === 'taken' || !!from) : key(posts[i - 1]) !== k;
          return (
            <Fragment key={p.id}>
              {head && <h3 className={s.monthDiv} data-feed-month={k}>{monthLabel(k, order, album)}</h3>}
              <PostCard post={p} h={handlers} />
            </Fragment>
          );
        })}
        {/* 처음 불러오는 동안: 빈 화면 대신 사진 자리 */}
        {loading && posts.length === 0 && [0, 1].map((i) => <SkeletonPost key={i} />)}
      </div>

      <div ref={end} className={s.end}>
        {loading && posts.length > 0 && <span className={s.spinner} />}
        {!loading && error && <Button variant="secondary" onClick={() => loadFirst()}>다시 불러오기</Button>}
        {!loading && !error && done && posts.length > 0 && <p className={s.endNote}>처음 사진까지 다 봤어요</p>}
        {!loading && !error && done && posts.length === 0 && (
          <div className={s.empty}>
            <div className={s.emptyArt}><Icon name="camera" size={36} stroke={1.4} /></div>
            <h2>첫 사진을 올려 보세요</h2>
            <p>아래 <span className={s.plusHint}><Icon name="plus" size={14} stroke={2.6} /></span> 버튼을 누르면 사진을 고를 수 있어요.</p>
          </div>
        )}
      </div>

      <AlbumSwitcher open={switcher} onClose={() => setSwitcher(false)} />
      <JumpSheet open={jumping} onClose={() => setJumping(false)} album={album} onPick={(m) => { setJumping(false); jump(m); root?.scrollTo({ top: 0 }); }} />
      <InviteSheet open={welcome} welcome onClose={() => setParams({}, { replace: true })} />
    </Page>
  );
}
