import { Component, useEffect, useMemo, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams, type Location } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { OverlayHosts, afterBack } from './components/ui';
import { loadMyDrive, preloadDrive, useMyDrive } from './lib/drive';
import { askDriveLink } from './state/actions';
import { TabBar } from './components/Bars';
import { Stack, forgetScroll } from './components/Stack';
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
import { Settings, AccountSettings, DeleteAccount, AlbumSettings, AlbumInfo, UploadSettings, NotifySettings, Install } from './screens/Settings';
import { DayEdit } from './screens/DayEdit';
import { ComposeHost, startCompose } from './screens/Compose';
import { Memories } from './screens/Memories';

// 초대 링크(?invite=코드)는 로그인 뒤에 쓰려고 기억해 둬요
const inviteFromUrl = new URLSearchParams(location.search).get('invite');
if (inviteFromUrl) {
  sessionStorage.setItem('pm-invite', inviteFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
  history.replaceState(null, '', location.pathname + location.hash);
}

// 화면을 그리다 문제가 생겨도 하얀 화면 대신 다시 열 수 있게
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error('[pm] render error', e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 16, padding: 24, textAlign: 'center' }} data-f="crash">
        <Logo size={64} />
        <p style={{ margin: 0 }}>화면을 여는 중에 문제가 생겼어요.</p>
        <button onClick={() => { location.hash = '#/home'; location.reload(); }} style={{ padding: '12px 20px', borderRadius: 12, border: 0, background: 'var(--c-accent, #f19bb4)', color: '#fff', fontSize: 16 }}>다시 열기</button>
      </div>
    );
  }
}

function Splash() {
  return <div style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center' }}><Logo size={72} /></div>;
}

// 알림에서 열 때: 그 앨범으로 바꾼 다음 그 화면으로 (#/open?album=…&to=/p/…)
function Open() {
  const [q] = useSearchParams();
  const nav = useNavigate();
  useEffect(() => {
    const albumId = q.get('album') || '';
    const raw = q.get('to') || '/home';
    const to = /^\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_-]*)?$/.test(raw) ? raw : '/home';
    (async () => {
      if (albumId && albumId !== useSession.getState().albumId) await useSession.getState().selectAlbum(albumId).catch(() => {});
      nav(to, { replace: true });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Splash />;
}

function Shell() {
  const album = useSession((st) => st.album());
  const me = useSession((st) => st.me)!;
  const activity = usePosts((st) => st.activity);
  const loc = useLocation();
  const nav = useNavigate();

  const albums = useSession((st) => st.albums);
  // 앨범이 바뀌면 피드 새로 · 탭 화면은 맨 위부터 (이전 앨범의 스크롤 위치를 쓰지 않게)
  useEffect(() => {
    if (!album) return;
    usePosts.getState().reset(album.id);
    ['/home', '/grid', '/activity', '/album'].forEach(forgetScroll);
  }, [album?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 고른 앨범이 목록에 없으면(지워졌거나 나갔으면) 첫 앨범으로 (새 목록을 받은 다음에만)
  const albumsLoaded = useSession((st) => st.albumsLoaded);
  useEffect(() => { if (!album && albums.length && albumsLoaded) useSession.getState().selectAlbum(albums[0].id).catch(() => {}); }, [album, albums, albumsLoaded]);

  // 새 소식 확인 (1분마다, 앱으로 돌아올 때)
  useEffect(() => {
    const asked = new Set<string>();
    const check = async () => {
      if (document.hidden) return;
      await usePosts.getState().loadActivity().catch(() => {});
      // 앨범 사진·이름이 바뀌었으면 가족 모두에게 반영돼요
      useSession.getState().loadAlbums().catch(() => {});
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

  // 내 구글 드라이브 연결 상태 (+ 버튼을 누를 때 써요). 아직이면 구글 창을 미리 불러 둬요 (누르자마자 열리게)
  useEffect(() => { loadMyDrive().then((d) => { if (!d.email) preloadDrive(); }); }, [me.id]);
  // 사진·동영상은 올린 사람의 구글 드라이브에 저장돼요 → 연동한 사람만 올려요
  // (연동 전이면 물어보고, 확인 → 설정의 '사진 올리기 · 공유'에서 연동 → 끝나면 바로 사진 고르기)
  const compose = async () => {
    const d = useMyDrive.getState();
    if (d.loaded && !d.email) {
      if (await askDriveLink()) { await afterBack(); nav('/settings/upload?then=pick'); }
      return;
    }
    startCompose();
  };

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

  const tabs = (l: Location) => !/^\/(settings|p\/|create|join|open|memories)/.test(l.pathname);
  // 화면마다 아래 탭을 함께 그려요 → 깊은 화면으로 갈 때 탭도 화면과 같이 밀려나요 (아이폰처럼)
  const render = (l: Location) => (
    <>
      <Routes location={l}>
        <Route path="/home" element={<Feed />} />
        <Route path="/grid" element={<Grid />} />
        <Route path="/grid/:month" element={<Grid />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/album" element={<AlbumHome />} />
        <Route path="/open" element={<Open />} />
        <Route path="/memories" element={<Memories />} />
        <Route path="/p/:id" element={<PostPage />} />
        <Route path="/p/:id/:extra" element={<PostPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/account" element={<AccountSettings />} />
        <Route path="/settings/account/delete" element={<DeleteAccount />} />
        <Route path="/settings/album" element={<AlbumSettings />} />
        {/* 고치는 화면은 앨범마다 새로 (다른 앨범으로 바뀌면 이전 앨범 값을 저장하지 않게) */}
        <Route path="/settings/album/info" element={<AlbumInfo key={album?.id} />} />
        <Route path="/settings/album/day/:id" element={<DayEdit key={album?.id} />} />
        <Route path="/settings/storage" element={<Navigate to="/settings/upload" replace />} />
        <Route path="/settings/drive" element={<Navigate to="/settings/upload" replace />} />
        <Route path="/settings/upload" element={<UploadSettings />} />
        <Route path="/settings/notify" element={<NotifySettings />} />
        <Route path="/settings/install" element={<Install />} />
        <Route path="/create" element={<CreateAlbum />} />
        <Route path="/join" element={<JoinAlbum />} />
        <Route path="/join/:code" element={<JoinAlbum />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      {tabs(l) && <TabBar onCompose={compose} badge={{ activity: l.pathname === '/activity' ? 0 : badge }} />}
    </>
  );
  if (!album) return <Splash />;
  return (
    <>
      <Stack render={render} />
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
      <Stack render={(l) => (
        <Routes location={l}>
          <Route path="/create" element={<CreateAlbum />} />
          <Route path="/join" element={<JoinAlbum />} />
          <Route path="/join/:code" element={<JoinAlbum />} />
          <Route path="/settings/account/delete" element={<DeleteAccount />} />
          <Route path="*" element={sessionStorage.getItem('pm-invite') ? <Navigate to={`/join/${sessionStorage.getItem('pm-invite')}`} replace /> : <Start />} />
        </Routes>
      )} />
    );
  }
  return <Shell />;
}

export default function App() {
  useEffect(() => { useSession.getState().init(); }, []);
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Boundary><Gate /></Boundary>
      </HashRouter>
      <OverlayHosts />
    </MotionConfig>
  );
}
