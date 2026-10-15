import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Group, Row, Field, Segmented } from '../components/Form';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet, confirm, menu, progress, toast } from '../components/ui';
import { useAlbum, useSession, type TextSize } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { connectDrive, disconnectDrive, driveConfigured, preloadDrive } from '../lib/drive';
import { clearCache } from '../lib/photoCache';
import { config } from '../lib/config';
import { fmtBytes, squarePhoto } from '../lib/image';
import { isIOS, isStandalone } from '../lib/device';
import { InviteSheet } from './Invite';
import { AlbumSwitcher } from './AlbumSwitcher';
import s from './Settings.module.css';

// ---------- 내 프로필 (이름·사진) ----------
export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const album = useAlbum();
  const me = useSession((st) => st.me);
  const mine = useSession((st) => (me ? st.member(me.id) : null));
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && mine) setName(mine.displayName); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!album || !me || !mine) return null;

  const setPhoto = async (f: File) => {
    const p = progress('사진을 올리는 중');
    try {
      await api.setAvatarPhoto(album.id, me.id, await squarePhoto(f), mine.avatar);
      await useSession.getState().loadMembers();
      p.close();
      toast('프로필 사진을 바꿨어요');
    } catch (e) { p.close(); toast((e as Error).message); }
  };
  const choose = async () => {
    const items = [
      { label: '사진 고르기', value: 'pick', icon: 'image' as const },
      ...(me.avatarUrl ? [{ label: `${me.provider === 'kakao' ? '카카오' : '구글'} 프로필 사진 쓰기`, value: 'provider', icon: 'users' as const }] : []),
      ...(mine.avatar ? [{ label: '사진 없애기', value: 'none', icon: 'trash' as const, danger: true }] : []),
    ];
    const v = await menu(items, '프로필 사진');
    try {
      if (v === 'pick') file.current?.click();
      if (v === 'provider' || v === 'none') {
        await api.updateMe(album.id, me.id, { avatar: v === 'provider' ? me.avatarUrl : '' });
        await useSession.getState().loadMembers();
      }
    } catch (e) { toast((e as Error).message); }
  };
  const save = async () => {
    if (!name.trim()) return toast('이름을 적어 주세요');
    try {
      await api.updateMe(album.id, me.id, { displayName: name.trim() });
      await useSession.getState().loadMembers();
      useSession.getState().loadAlbums().catch(() => {});
      toast('저장했어요');
      onClose();
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="프로필 편집">
      <div className={s.profile}>
        <button className={s.pic} onClick={choose} data-pick-photo>
          <Avatar src={mine.avatar} name={mine.displayName} size={96} />
          <span>사진 바꾸기</span>
        </button>
        <input ref={file} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto(f); }} data-who="file" />
        <Group footer="가족에게 보이는 이름이에요.">
          <Field label="나는 아이의" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="엄마" name="role" data-who="name" />
        </Group>
        <Button size="lg" block onClick={save} data-save>저장</Button>
      </div>
    </Sheet>
  );
}

// ---------- 설정 ----------
export function Settings() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const mine = useSession((st) => st.member(me.id));
  const textSize = useSession((st) => st.textSize);
  const setTextSize = useSession((st) => st.setTextSize);
  const isOwner = album.myRole === 'owner';
  const nav = useNavigate();
  const [profile, setProfile] = useState(false);
  const [invite, setInvite] = useState(false);
  const [switcher, setSwitcher] = useState(false);

  const leave = async () => {
    if (!(await confirm({ title: '이 앨범에서 나갈까요?', message: '다시 들어오려면 초대 코드가 필요해요.', ok: '나가기', danger: true }))) return;
    try {
      await api.leaveAlbum(album.id, me.id);
      await useSession.getState().loadAlbums();
      nav('/', { replace: true });
    } catch (e) { toast((e as Error).message); }
  };
  const remove = async () => {
    if (!(await confirm({ title: `‘${album.name}’을 지울까요?`, message: '모든 사진과 댓글이 가족 모두에게서 사라져요.', ok: '지우기', danger: true }))) return;
    if (!(await confirm({ title: '정말 지울까요?', message: '되돌릴 수 없어요. 필요한 사진은 먼저 저장해 두세요.', ok: '영원히 지우기', danger: true }))) return;
    const p = progress('앨범을 지우는 중');
    try {
      await api.deleteAlbum(album.id, me.id);
      p.close();
      toast('앨범을 지웠어요');
      await useSession.getState().loadAlbums();
      nav('/', { replace: true });
    } catch (e) { p.close(); toast((e as Error).message); }
  };
  const logout = async () => {
    if (!(await confirm({ title: '로그아웃할까요?', ok: '로그아웃' }))) return;
    await api.signOut();
    await clearCache();
    nav('/', { replace: true });
  };

  return (
    <Page>
      <TopBar back title="설정" />
      <div className={s.page}>
        <Group>
          <Row icon={<Avatar src={mine.avatar} name={mine.displayName} size={30} />} label={mine.displayName} detail={me.provider === 'kakao' ? '카카오' : me.provider === 'google' ? 'Google' : ''} onClick={() => setProfile(true)} />
        </Group>

        <Group title="앨범">
          <Row icon={<Icon name="album" size={18} />} label="앨범 바꾸기" detail={album.name} onClick={() => setSwitcher(true)} />
          <Row icon={<Icon name="users" size={18} />} label="가족 초대" detail={`${album.inviteCode.slice(0, 4)}-${album.inviteCode.slice(4)}`} onClick={() => setInvite(true)} />
          {isOwner && <Row icon={<Icon name="edit" size={18} />} label="아이 정보·앨범 이름" onClick={() => nav('/settings/album')} />}
          {isOwner && <Row icon={<Icon name="layers" size={18} />} label="사진 저장 위치" detail={album.storage === 'drive' ? '구글 드라이브' : '기본 저장소'} onClick={() => nav('/settings/storage')} />}
          {!isOwner && <Row icon={<Icon name="layers" size={18} />} label="사진 저장 위치" detail={album.storage === 'drive' ? '관리자의 구글 드라이브' : '기본 저장소'} />}
        </Group>

        <Group title="글자 크기" footer="앱 전체 글자와 버튼 크기가 바뀌어요.">
          <div className={s.segRow}>
            <Segmented<TextSize> label="글자 크기" value={textSize} onChange={setTextSize}
              options={[{ value: 'normal', label: '보통' }, { value: 'large', label: <span style={{ fontSize: '1.08em' }}>크게</span> }, { value: 'xlarge', label: <span style={{ fontSize: '1.18em' }}>아주 크게</span> }]} />
          </div>
        </Group>

        <Group title="휴대폰">
          {!isStandalone() && <Row icon={<Icon name="phone" size={18} />} label="홈 화면에 앱 추가" onClick={() => nav('/settings/install')} />}
          <Row icon={<Icon name="trash" size={18} />} label="보관된 사진 정리" detail="휴대폰 공간 비우기" onClick={async () => {
            if (await confirm({ title: '보관된 사진을 정리할까요?', message: '사진은 앨범에 그대로 있고, 다시 볼 때 새로 받아요.', ok: '정리하기' })) { await clearCache(); toast('정리했어요'); }
          }} />
        </Group>

        <Group>
          <Row label="로그아웃" onClick={logout} chevron={false} />
          <Row label="앨범에서 나가기" onClick={leave} danger chevron={false} />
          {isOwner && <Row label="앨범 지우기" onClick={remove} danger chevron={false} />}
        </Group>
        <p className={s.foot}>Pastel Memories</p>
      </div>
      <ProfileSheet open={profile} onClose={() => setProfile(false)} />
      <InviteSheet open={invite} onClose={() => setInvite(false)} />
      <AlbumSwitcher open={switcher} onClose={() => setSwitcher(false)} />
    </Page>
  );
}

// ---------- 아이 정보 ----------
export function AlbumInfo() {
  const album = useAlbum()!;
  const nav = useNavigate();
  const [baby, setBaby] = useState(album.babyName);
  const [bday, setBday] = useState(album.babyBirthday || '');
  const [name, setName] = useState(album.name);
  const save = async () => {
    if (!name.trim()) return toast('앨범 이름을 적어 주세요');
    try {
      await api.updateAlbum(album.id, { name: name.trim(), babyName: baby.trim(), babyBirthday: bday || null });
      useSession.getState().patchAlbum({ name: name.trim(), babyName: baby.trim(), babyBirthday: bday || null });
      toast('저장했어요');
      nav(-1);
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <Page>
      <TopBar back title="아이 정보" right={<button className={s.saveBtn} onClick={save}>저장</button>} />
      <div className={s.page}>
        <Group title="아이">
          <Field label="이름" value={baby} onChange={(e) => setBaby(e.target.value)} maxLength={20} placeholder="하준" />
          <Field label="생일" type="date" value={bday} onChange={(e) => setBday(e.target.value)} />
        </Group>
        <Group title="앨범">
          <Field label="앨범 이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Group>
      </div>
    </Page>
  );
}

// ---------- 사진 저장 위치 (관리자) ----------
export function StorageSettings() {
  const album = useAlbum()!;
  const posts = usePosts((st) => st.list.length);
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => { preloadDrive(); api.storageUsage().then(setUsage, () => setUsage(null)); }, [posts]);

  const connect = async () => {
    const p = progress('구글 드라이브에 연결하는 중');
    try {
      const email = await connectDrive(album.id);
      useSession.getState().patchAlbum({ storage: 'drive', driveEmail: email, driveReady: true });
      p.close();
      toast('구글 드라이브에 연결했어요');
    } catch (e) { p.close(); toast((e as Error).message); }
  };
  const disconnect = async () => {
    if (!(await confirm({ title: '드라이브 연결을 끊을까요?', message: '앞으로 올리는 사진은 기본 저장소에 저장돼요.\n이미 드라이브에 있는 사진은 앱에서 보이지 않게 돼요. (드라이브에는 그대로 남아요)', ok: '연결 끊기', danger: true }))) return;
    try {
      await disconnectDrive(album.id);
      useSession.getState().patchAlbum({ storage: 'supabase', driveEmail: null });
      toast('연결을 끊었어요');
    } catch (e) { toast((e as Error).message); }
  };
  const useDefault = async () => {
    try {
      await api.updateAlbum(album.id, { storage: 'supabase' });
      useSession.getState().patchAlbum({ storage: 'supabase' });
    } catch (e) { toast((e as Error).message); }
  };
  const useDrive = async () => {
    if (!album.driveReady) return connect();
    try {
      await api.updateAlbum(album.id, { storage: 'drive' });
      useSession.getState().patchAlbum({ storage: 'drive' });
    } catch (e) { toast((e as Error).message); }
  };
  const pct = usage !== null ? Math.min(100, Math.round((usage / config.storageLimitBytes) * 100)) : 0;

  return (
    <Page>
      <TopBar back title="사진 저장 위치" />
      <div className={s.page}>
        <Group footer="앞으로 올리는 사진이 저장될 곳이에요. 이미 올린 사진은 그 자리에 그대로 있어요.">
          <Row label="기본 저장소 (Supabase)" onClick={useDefault} chevron={false}>{album.storage === 'supabase' && <Icon name="check" size={20} style={{ color: 'var(--c-accent-strong)' }} />}</Row>
          <Row label="내 구글 드라이브" detail={album.driveEmail || undefined} onClick={useDrive} chevron={false}>{album.storage === 'drive' && <Icon name="check" size={20} style={{ color: 'var(--c-accent-strong)' }} />}</Row>
        </Group>

        {album.storage === 'drive' || album.driveReady ? (
          <Group title="구글 드라이브" footer="사진은 드라이브의 ‘Pastel Memories’ 폴더에 비공개로 저장돼요. 가족은 앱 안에서만 볼 수 있어요.">
            <Row label="연결된 계정" detail={album.driveEmail || '확인 중'} />
            <Row label="다른 계정으로 다시 연결" onClick={connect} />
            <Row label="연결 끊기" onClick={disconnect} danger chevron={false} />
          </Group>
        ) : (
          <div className={s.driveCard}>
            <Icon name="shield" size={28} />
            <b>내 구글 드라이브에 저장하기</b>
            <p>가족이 올린 사진이 관리자의 드라이브 폴더에 비공개로 모여요. 드라이브 공간(무료 15GB)을 쓰니 더 많이 저장할 수 있어요.</p>
            <Button onClick={connect} disabled={!driveConfigured()}>{driveConfigured() ? '구글 드라이브 연결' : '설정이 필요해요 (설명서 참고)'}</Button>
          </div>
        )}

        <Group title="기본 저장소 사용량">
          <div className={s.meter}>
            <div className={s.bar}><i style={{ width: `${Math.max(2, pct)}%` }} className={pct >= 80 ? s.warn : ''} /></div>
            <p>{usage === null ? '확인 중…' : `${fmtBytes(usage)} / ${fmtBytes(config.storageLimitBytes)} (${pct}%)`}</p>
          </div>
        </Group>
        <OriginalCleanup />
      </div>
    </Page>
  );
}

function OriginalCleanup() {
  const album = useAlbum()!;
  const run = async () => {
    const p = progress('원본을 세는 중');
    let list: api.GridItem[] = [];
    try { list = await api.allPhotos(album.id); } catch (e) { p.close(); return toast((e as Error).message); }
    p.close();
    const now = Date.now();
    const options = ([[3, '3개월'], [6, '6개월'], [12, '1년']] as const).map(([m, label]) => {
      const before = new Date(now - m * 30.4 * 86400000).toISOString();
      const olds = list.filter((it) => it.orig && it.createdAt < before && (it.orig.startsWith('drive:') || it.orig.startsWith(`${album.id}/${it.postId}/`)));
      return { m, label, count: olds.length, bytes: olds.reduce((n, it) => n + (it.origSize || 0), 0), paths: olds.map((it) => it.orig!) };
    });
    const v = await menu(options.map((o) => ({ label: `${o.label} 지난 원본 ${o.count}장${o.count ? ` · ${fmtBytes(o.bytes)}` : ''}`, value: o.count ? o.m : null })), '오래된 원본 정리');
    const o = options.find((x) => x.m === v);
    if (!o) return;
    if (!(await confirm({ title: `원본 ${o.count}장을 지울까요?`, message: '‘원본 파일’만 지워지고 앨범의 사진은 그대로 남아요.\n필요한 원본은 먼저 저장해 두세요.', ok: '원본 지우기', danger: true }))) return;
    const pr = progress('원본을 정리하는 중');
    try {
      const n = await api.dropOriginals(album.id, o.paths);
      pr.close();
      toast(`원본 ${n}장을 정리했어요`);
    } catch (e) { pr.close(); toast((e as Error).message); }
  };
  return (
    <Group footer="공간이 모자랄 때 오래된 사진의 원본만 지워요.">
      <Row label="오래된 원본 정리" onClick={run} />
    </Group>
  );
}

// ---------- 홈 화면에 추가 ----------
export function Install() {
  return (
    <Page>
      <TopBar back title="홈 화면에 추가" />
      <div className={s.page}>
        <div className={s.install}>
          <Icon name="phone" size={32} />
          <p>홈 화면에 추가하면 앱처럼 아이콘을 눌러 바로 열 수 있어요.</p>
        </div>
        <Group title={isIOS() ? '아이폰 (사파리)' : '안드로이드 (크롬·삼성 인터넷)'}>
          {(isIOS()
            ? ['아래쪽 공유 버튼(네모에 화살표)을 눌러요', '목록을 올려 ‘홈 화면에 추가’를 눌러요', '오른쪽 위 ‘추가’를 눌러요']
            : ['오른쪽 위 ⋮ 메뉴를 눌러요', '‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러요', '‘추가’를 눌러요']
          ).map((t, i) => <Row key={i} icon={<b>{i + 1}</b>} label={t} />)}
        </Group>
      </div>
    </Page>
  );
}
