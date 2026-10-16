import { useEffect, useMemo } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { OverlayHosts } from './components/ui';
import { TabBar } from './components/Bars';
import { PostHubOverlays } from './components/PostHub';
import { Logo } from './components/Logo';
import { useSession } from './state/session';
import { usePosts } from './state/posts';
import { Landing } from './screens/Landing';
import { Start, CreateAlbum, JoinAlbum } from './screens/Start';
import { Feed } from './screens/Feed';
import { Grid } from './screens/Grid';
import { Activity, activitySeenAt } from './screens/Activity';
import { AlbumHome } from './screens/AlbumHome';
import { PostPage } from './screens/PostPage';
import { Settings, AccountSettings, DeleteAccount, AlbumSettings, AlbumInfo, StorageSettings, Install } from './screens/Settings';
import { ComposeHost, startCompose } from './screens/Compose';

// 초대 링크(?invite=코드)는 로그인 뒤에 쓰려고 기억해 둬요
const inviteFromUrl = new URLSearchParams(location.search).get('invite');
if (inviteFromUrl) {
  sessionStorage.setItem('pm-invite', inviteFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
  history.replaceState(null, '', location.pathname + location.hash);
}

function Splash() {
  return <div style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center' }}><Logo size={72} /></div>;
}

function Shell() {
  const album = useSession((st) => st.album());
  const me = useSession((st) => st.me)!;
  const activity = usePosts((st) => st.activity);
  const loc = useLocation();
  const nav = useNavigate();

  // 앨범이 바뀌면 피드 새로
  useEffect(() => { if (album) usePosts.getState().reset(album.id); }, [album?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 새 소식 확인 (1분마다, 앱으로 돌아올 때)
  useEffect(() => {
    const asked = new Set<string>();
    const check = async () => {
      if (document.hidden) return;
      await usePosts.getState().loadActivity().catch(() => {});
      // 새로 들어온 가족이 있으면 가족 목록 다시 받기 (나간 가족은 한 번만 확인)
      const known = new Set(useSession.getState().members.map((m) => m.userId));
      const unknown = usePosts.getState().activity.map((e) => e.userId).filter((u) => !known.has(u) && !asked.has(u));
      if (unknown.length) { unknown.forEach((u) => asked.add(u)); useSession.getState().loadMembers().catch(() => {}); }
    };
    check();
    const t = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, [album?.id]);

  // 초대 코드를 들고 왔으면 들어가기 화면으로
  useEffect(() => {
    const code = sessionStorage.getItem('pm-invite');
    if (code && !loc.pathname.startsWith('/join')) nav(`/join/${code}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const badge = useMemo(() => {
    if (!album) return 0;
    // 처음이면 내가 들어온 때부터 세요 (들어오기 전 소식은 새 소식이 아니에요)
    const seen = activitySeenAt(album.id) || useSession.getState().member(me.id).joinedAt || '';
    return activity.filter((e) => e.userId !== me.id && e.at > seen).length;
  }, [activity, album, me.id, loc.pathname]);

  const hideTabs = /^\/(settings|p\/|create|join)/.test(loc.pathname);
  return (
    <>
      <Routes>
        <Route path="/home" element={<Feed />} />
        <Route path="/grid" element={<Grid />} />
        <Route path="/grid/:month" element={<Grid />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/album" element={<AlbumHome />} />
        <Route path="/p/:id" element={<PostPage />} />
        <Route path="/p/:id/:extra" element={<PostPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/account" element={<AccountSettings />} />
        <Route path="/settings/account/delete" element={<DeleteAccount />} />
        <Route path="/settings/album" element={<AlbumSettings />} />
        <Route path="/settings/album/info" element={<AlbumInfo />} />
        <Route path="/settings/storage" element={<StorageSettings />} />
        <Route path="/settings/install" element={<Install />} />
        <Route path="/create" element={<CreateAlbum />} />
        <Route path="/join" element={<JoinAlbum />} />
        <Route path="/join/:code" element={<JoinAlbum />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      {!hideTabs && <TabBar onCompose={startCompose} badge={{ activity: loc.pathname === '/activity' ? 0 : badge }} />}
      <ComposeHost />
      <PostHubOverlays />
    </>
  );
}

function Gate() {
  const { ready, me, albums, albumsLoaded } = useSession();
  if (!ready) return <Splash />;
  if (!me) return <Landing />;
  if (!albums.length) {
    if (!albumsLoaded) return <Splash />;
    return (
      <Routes>
        <Route path="/create" element={<CreateAlbum />} />
        <Route path="/join" element={<JoinAlbum />} />
        <Route path="/join/:code" element={<JoinAlbum />} />
        <Route path="*" element={sessionStorage.getItem('pm-invite') ? <Navigate to={`/join/${sessionStorage.getItem('pm-invite')}`} replace /> : <Start />} />
      </Routes>
    );
  }
  return <Shell />;
}

export default function App() {
  useEffect(() => { useSession.getState().init(); }, []);
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Gate />
      </HashRouter>
      <OverlayHosts />
    </MotionConfig>
  );
}
