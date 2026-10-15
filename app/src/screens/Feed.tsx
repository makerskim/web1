import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Page, TopBar, IconButton } from '../components/Bars';
import { PostCard } from '../components/PostCard';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { openViewer, usePostHandlers, viewItems } from '../components/PostHub';
import { useAlbum, useSession } from '../state/session';
import { usePosts } from '../state/posts';
import { babyMilestone, ymd } from '../lib/dates';
import { callName } from '../lib/korean';
import { AlbumSwitcher } from './AlbumSwitcher';
import { InviteSheet } from './Invite';
import type { Post } from '../lib/types';
import s from './Feed.module.css';

const STORY_HOURS = 72;
const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

// 최근 3일 사진을 올린 사람별로 묶은 스토리
function useStories(posts: Post[], albumId: string) {
  const key = `pm-story-seen-${albumId}`;
  const [seen, setSeen] = useState<Record<string, string>>(() => load(key, {}));
  const since = new Date(Date.now() - STORY_HOURS * 3600e3).toISOString();
  const groups = useMemo(() => {
    const by = new Map<string, Post[]>();
    posts.filter((p) => p.createdAt > since).forEach((p) => by.set(p.authorId, [...(by.get(p.authorId) || []), p]));
    return [...by.entries()].map(([uid, ps]) => ({ uid, posts: ps.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), latest: ps.reduce((m, p) => (p.createdAt > m ? p.createdAt : m), '') }));
  }, [posts, since]);
  const isSeen = (g: { uid: string; latest: string }) => (seen[g.uid] || '') >= g.latest;
  const markSeen = (uid: string, at: string) => {
    setSeen((cur) => {
      if ((cur[uid] || '') >= at) return cur;
      const next = { ...cur, [uid]: at };
      save(key, next);
      return next;
    });
  };
  return { groups: [...groups.filter((g) => !isSeen(g)), ...groups.filter(isSeen)], isSeen, markSeen };
}

export function Feed() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const member = useSession((st) => st.member);
  const { list, byId, loading, done, error, loadFirst, loadMore, reset } = usePosts();
  const posts = useMemo(() => list.map((id) => byId[id]).filter(Boolean), [list, byId]);
  const [params, setParams] = useSearchParams();
  const [switcher, setSwitcher] = useState(false);
  const [invite, setInvite] = useState(params.get('welcome') === '1');
  const nav = useNavigate();
  const end = useRef<HTMLDivElement>(null);
  const stories = useStories(posts, album.id);

  useEffect(() => { reset(album.id); if (!usePosts.getState().list.length) loadFirst(); }, [album.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver((en) => en[0].isIntersecting && loadMore(), { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, posts.length]);

  const openStory = (uid: string) => {
    const gs = stories.groups;
    const start = Math.max(0, gs.findIndex((g) => g.uid === uid));
    const ordered = [...gs.slice(start), ...gs.slice(0, start)];
    const items = ordered.flatMap((g) => viewItems(g.posts));
    openViewer({ items, start: 0, story: true, onShown: (it) => stories.markSeen(it.authorId, it.createdAt) });
  };
  const handlers = usePostHandlers({
    onAuthor: (uid) => (stories.groups.some((g) => g.uid === uid) ? openStory(uid) : undefined),
    storyRing: (uid) => {
      const g = stories.groups.find((x) => x.uid === uid);
      return g ? (stories.isSeen(g) ? 'seen' : 'unseen') : null;
    },
  });

  const milestone = album.babyBirthday ? babyMilestone(album.babyBirthday) : '';
  const msKey = `pm-ms-${album.id}-${ymd(new Date())}`;
  const [msHidden, setMsHidden] = useState(() => !!load(msKey, false));

  return (
    <Page>
      <TopBar large title={
        <button className={s.wordmark} onClick={() => setSwitcher(true)} aria-label="앨범 바꾸기">
          <span>{album.name}</span><Icon name="down" size={18} stroke={2.2} />
        </button>
      } right={<IconButton icon="users" label="가족 초대" onClick={() => setInvite(true)} />} />

      {(stories.groups.length > 0 || true) && (
        <div className={s.strip} role="list" aria-label="최근 소식">
          {stories.groups.map((g) => {
            const m = member(g.uid);
            const seenIt = stories.isSeen(g);
            return (
              <motion.button whileTap={{ scale: 0.94 }} key={g.uid} className={s.story} onClick={() => openStory(g.uid)} role="listitem" data-story={seenIt ? 'seen' : 'unseen'}>
                <Avatar src={m.avatar} name={m.displayName} size={60} ring seen={seenIt} />
                <span>{g.uid === me.id ? '내 소식' : m.displayName}</span>
              </motion.button>
            );
          })}
          <motion.button whileTap={{ scale: 0.94 }} className={s.story} onClick={() => setInvite(true)} role="listitem">
            <span className={s.addRing}><Icon name="plus" size={24} /></span>
            <span>가족 초대</span>
          </motion.button>
        </div>
      )}

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
            <p>올린 사진은 가족 모두에게 바로 보여요.</p>
            <Button onClick={() => nav('/new')}>사진 올리기</Button>
          </div>
        )}
      </div>

      <AlbumSwitcher open={switcher} onClose={() => setSwitcher(false)} />
      <InviteSheet open={invite} welcome={params.get('welcome') === '1'} onClose={() => { setInvite(false); if (params.get('welcome')) setParams({}, { replace: true }); }} />
    </Page>
  );
}
