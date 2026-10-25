import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { babyMonths, fmtDay, fmtMonth, toDate, ymd } from '../lib/dates';
import * as api from '../lib/api';
import { DateFilter, FilterSummary, periodRange } from '../components/Filters';
import { noticesFor } from '../lib/album';
import { hasBatchim } from '../lib/korean';
import { AlbumSwitcher } from './AlbumSwitcher';
import { memoriesToday } from './Memories';
import { Photo } from '../components/Photo';
import type { Album, PhotoMeta } from '../lib/types';
import { InviteSheet } from './Invite';
import s from './Feed.module.css';

function SkeletonPost() {
  return (
    <div className={s.skel} aria-hidden="true" data-f="skeleton">
      <div className={s.skelHead}><i className={s.skelAvatar} /><i className={s.skelLine} /></div>
      <i className={s.skelMedia} />
      <i className={`${s.skelLine} ${s.skelShort}`} />
    </div>
  );
}

// 타임라인의 달 구분: 날짜로 볼 때는 찍은 달(아기 앨범은 몇 개월), 평소엔 올린 달
function monthLabel(month: string, album: Album) {
  const m = album.kind === 'baby' && album.babyBirthday ? babyMonths(album.babyBirthday, toDate(`${month}-15`)) : null;
  return `${fmtMonth(`${month}-01`)}에 올린 사진${m !== null && m >= 0 ? ` · ${m === 0 ? '첫 달' : `${m}개월`}` : ''}`;
}

export function Feed() {
  const album = useAlbum()!;
  const { list, byId, loading, done, error, loadFirst, loadMore, reset, period, range, setPeriod } = usePosts();
  // 날짜로 보기: 달력에 쓰는 게시물 날짜들 (게시물이 바뀌면 다시)
  const [dates, setDates] = useState<{ authorId: string; createdAt: string }[]>([]);
  useEffect(() => { let live = true; api.postDates(album.id).then((d) => live && setDates(d), () => {}); return () => { live = false; }; }, [album.id, list.length]);
  const birthday = album.kind === 'baby' && album.babyBirthday && album.babyBirthday <= ymd(new Date()) ? album.babyBirthday : null;
  const pickPeriod = (p: string | null) => { setPeriod(p, p ? periodRange(p, birthday) : null); root?.scrollTo({ top: 0 }); };
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

  // 공지: 생일 · 기념일 · 아기 백일 · 돌 … 7일 전부터 그날까지 (그날은 '축하해요', 지나면 사라져요)
  // 늘 맨 위에, 내려도 앨범 이름 아래에 붙어 있어요
  const notices = noticesFor(album);
  const noticeKey = notices.map((n) => `${n.key}:${n.daysLeft}`).join();
  const celRef = useRef<HTMLDivElement>(null);
  const [celH, setCelH] = useState(0);
  useLayoutEffect(() => {
    const el = celRef.current;
    if (!el) { setCelH(0); return; }
    const ro = new ResizeObserver(() => setCelH(el.offsetHeight));
    ro.observe(el);
    setCelH(el.offsetHeight);
    return () => ro.disconnect();
  }, [noticeKey]);

  // N년 전 오늘: 몇 해 전 같은 날 올린 사진이 있으면 '추억 보기' (늘 보여요)
  const nav = useNavigate();
  const [mem, setMem] = useState<{ count: number; years: string; cover: PhotoMeta } | null>(null);
  useEffect(() => {
    let live = true;
    setMem(null);
    memoriesToday(album.id).then((l) => {
      if (!live || !l.length) return;
      // 1년 전 · 2년 전 … (가까운 해부터)
      const years = [...new Set(l.map((x) => new Date().getFullYear() - new Date(x.createdAt).getFullYear()))];
      setMem({ count: l.length, years: years.join(' · '), cover: l[0] });
    }, () => {});
    return () => { live = false; };
  }, [album.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <TopBar large white title={
        <button className={s.wordmark} onClick={() => setSwitcher(true)} aria-label="앨범 바꾸기" data-f="switcher">
          <AmpText text={album.name} /><Icon name="down" size={18} stroke={2.2} />
        </button>
      } right={<span data-f="feed-date"><DateFilter value={period} onChange={pickPeriod} items={dates} unit="개" birthday={birthday} /></span>} />
      {notices.length > 0 && (
        <div ref={celRef} className={s.celWrap} data-f="celebrate-bar">
          <div className={s.milestone} data-f="celebrate">
            {notices.slice(0, 4).map((n) => (
              <p key={n.key} className={n.daysLeft ? s.soon : s.today} data-notice={n.key} data-days={n.daysLeft}>
                <span className={s.noticeIcon} aria-hidden="true">{n.emoji}</span>
                {n.daysLeft
                  ? <span><b>{n.label}</b> <em className={s.dday}>D-{n.daysLeft}</em> <small>{fmtDay(n.date)}</small></span>
                  : <span>오늘은 <b>{n.label}</b>{hasBatchim(n.label) ? '이에요' : '예요'}! {n.birthday ? '생일 축하해요 🎂' : '축하해요 🎉'}</span>}
              </p>
            ))}
            {notices.length > 4 && <p className={s.soon}><span className={s.noticeIcon} aria-hidden="true">＋</span><span>외 {notices.length - 4}개</span></p>}
          </div>
        </div>
      )}
      {/* 맨 위와 첫 사진 사이 띄우기 */}
      <div className={s.headGap} aria-hidden="true" />

      {mem && (
        <div className={s.memory} data-f="memory-card">
          <button className={s.memoryMain} onClick={() => nav('/memories')} data-f="memory-open">
            <Photo albumId={album.id} path={mem.cover.thumb} ph={mem.cover.ph} className={s.memoryThumb} />
            <span className={s.memoryText}><b>{mem.years}년 전 오늘</b><small>사진 {mem.count}장 · 눌러서 추억 보기</small></span>
            <span className={s.memoryPlay}><Icon name="play" size={16} /></span>
          </button>
        </div>
      )}

      <FilterSummary value={{ who: null, period }} onClear={() => pickPeriod(null)} />

      <div className={`${s.posts} ${appear.current ? s.appear : ''}`} style={{ '--cel-h': `${celH}px` } as CSSProperties}>
        {posts.map((p, i) => {
          const key = (x: typeof p) => ymd(x.createdAt).slice(0, 7);
          const k = key(p);
          const head = i === 0 ? !!range : key(posts[i - 1]) !== k;
          return (
            <Fragment key={p.id}>
              {head && <h3 className={s.monthDiv} data-feed-month={k}>{monthLabel(k, album)}</h3>}
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
        {!loading && !error && done && posts.length > 0 && <p className={s.endNote}>{period ? '이 기간의 사진을 다 봤어요' : '처음 사진까지 다 봤어요'}</p>}
        {!loading && !error && done && posts.length === 0 && period && (
          <div className={s.empty} data-f="feed-period-empty">
            <div className={s.emptyArt}><Icon name="calendar" size={34} stroke={1.4} /></div>
            <h2>이 기간에 찍은 사진이 없어요</h2>
            <Button variant="secondary" onClick={() => pickPeriod(null)}>모두 보기</Button>
          </div>
        )}
        {!loading && !error && done && posts.length === 0 && !period && (
          <div className={s.empty}>
            <div className={s.emptyArt}><Icon name="camera" size={36} stroke={1.4} /></div>
            <h2>첫 사진을 올려 보세요</h2>
            <p>아래 <span className={s.plusHint}><Icon name="plus" size={14} stroke={2.6} /></span> 버튼을 누르면 사진을 고를 수 있어요.</p>
          </div>
        )}
      </div>

      <AlbumSwitcher open={switcher} onClose={() => setSwitcher(false)} />
      <InviteSheet open={welcome} welcome onClose={() => setParams({}, { replace: true })} />
    </Page>
  );
}
