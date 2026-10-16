import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { PostCard } from '../components/PostCard';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { usePostHandlers } from '../components/PostHub';
import { useAlbum } from '../state/session';
import { usePosts } from '../state/posts';
import { babyMilestone, ymd } from '../lib/dates';
import { callName } from '../lib/korean';
import { AlbumSwitcher } from './AlbumSwitcher';
import { InviteSheet } from './Invite';
import s from './Feed.module.css';

const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

export function Feed() {
  const album = useAlbum()!;
  const { list, byId, loading, done, error, loadFirst, loadMore, reset } = usePosts();
  const posts = useMemo(() => list.map((id) => byId[id]).filter(Boolean), [list, byId]);
  const [params, setParams] = useSearchParams();
  const [switcher, setSwitcher] = useState(false);
  // 앨범을 막 만들었을 때만 초대 안내가 떠요 (평소 초대는 '가족' 탭에서)
  const welcome = params.get('welcome') === '1';
  const end = useRef<HTMLDivElement>(null);
  const handlers = usePostHandlers();

  useEffect(() => { reset(album.id); if (!usePosts.getState().list.length) loadFirst(); }, [album.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver((en) => en[0].isIntersecting && loadMore(), { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, posts.length]);

  const milestone = album.babyBirthday ? babyMilestone(album.babyBirthday) : '';
  const msKey = `pm-ms-${album.id}-${ymd(new Date())}`;
  const [msHidden, setMsHidden] = useState(() => !!load(msKey, false));

  return (
    <Page>
      <TopBar large title={
        <button className={s.wordmark} onClick={() => setSwitcher(true)} aria-label="앨범 바꾸기" data-f="switcher">
          <span>{album.name}</span><Icon name="down" size={18} stroke={2.2} />
        </button>
      } />

      {milestone && !msHidden && (
        <div className={s.milestone}>
          <p>오늘은 {callName(album.babyName || '아이')}의 <b>{milestone}</b>이에요</p>
          <button onClick={() => { save(msKey, true); setMsHidden(true); }} aria-label="닫기"><Icon name="close" size={18} /></button>
        </div>
      )}

      <div className={s.posts}>
        {posts.map((p) => <PostCard key={p.id} post={p} h={handlers} />)}
      </div>

      <div ref={end} className={s.end}>
        {loading && <span className={s.spinner} />}
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
      <InviteSheet open={welcome} welcome onClose={() => setParams({}, { replace: true })} />
    </Page>
  );
}
