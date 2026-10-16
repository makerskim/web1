import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Group, Row, Field, Toggle } from '../components/Form';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet, confirm, copyText, menu, progress, toast } from '../components/ui';
import { CoverFace, MembersSheet, useCoverChanger } from '../components/AlbumBits';
import { GoogleIcon, KakaoIcon, providerName } from '../components/ProviderIcon';
import { useAlbum, useSession, type TextSize } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { connectDrive, disconnectDrive, driveConfigured, preloadDrive } from '../lib/drive';
import { clearCache } from '../lib/photoCache';
import { config } from '../lib/config';
import { fmtBytes, squarePhoto } from '../lib/image';
import { isIOS, isStandalone } from '../lib/device';
import { fmtDate } from '../lib/dates';
import { callName } from '../lib/korean';
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
const TEXT_SIZES: Array<{ value: TextSize; label: string; px: number }> = [
  { value: 'normal', label: '보통', px: 16 }, { value: 'large', label: '크게', px: 18 }, { value: 'xlarge', label: '아주 크게', px: 20 },
];
const VERSION = '3.0';

function LoginBadge({ provider, size = 30 }: { provider: string; size?: number }) {
  return (
    <span className={`${s.badge} ${provider === 'kakao' ? s.kakao : s.google}`} style={{ width: size, height: size }}>
      {provider === 'kakao' ? <KakaoIcon size={size * 0.6} /> : <GoogleIcon size={size * 0.55} />}
    </span>
  );
}
const Two = ({ title, sub }: { title: string; sub?: string }) => <span className={s.two}><b>{title}</b>{sub && <small>{sub}</small>}</span>;

export function Settings() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const mine = useSession((st) => st.member(me.id));
  const albums = useSession((st) => st.albums);
  const textSize = useSession((st) => st.textSize);
  const nav = useNavigate();
  const [sheet, setSheet] = useState<'profile' | 'albums' | 'text' | null>(null);
  const close = () => setSheet(null);

  const logout = async () => {
    if (!(await confirm({ title: '로그아웃할까요?', message: '이 휴대폰에서만 로그아웃돼요. 다시 들어올 때는 같은 계정으로 로그인하면 돼요.', ok: '로그아웃' }))) return;
    await api.signOut();
    await clearCache();
    nav('/', { replace: true });
  };

  return (
    <Page>
      <TopBar back title="설정" />
      <div className={s.page}>
        <Group title="계정">
          <Row icon={<Avatar src={mine.avatar} name={mine.displayName} size={40} />} label={<Two title={mine.displayName} sub="이 앨범에서 쓰는 이름과 사진" />}
            onClick={() => setSheet('profile')} data-row="profile" />
          <Row icon={<LoginBadge provider={me.provider} />} label={<Two title={`${providerName(me.provider)}로 로그인`} sub={me.email || me.name || undefined} />}
            onClick={() => nav('/settings/account')} data-row="account" />
        </Group>

        <Group title="앨범">
          <Row icon={<CoverFace size={30} />} label="앨범 설정" detail={album.name} onClick={() => nav('/settings/album')} data-row="album" />
          <Row icon={<Icon name="swap" size={22} />} label="다른 앨범" detail={`${albums.length}개`} onClick={() => setSheet('albums')} data-row="albums" />
        </Group>

        <Group title="앱">
          <Row icon={<Icon name="text" size={22} />} label="글자 크기" detail={TEXT_SIZES.find((t) => t.value === textSize)?.label} onClick={() => setSheet('text')} data-row="text" />
          {isStandalone()
            ? <Row icon={<Icon name="phone" size={22} />} label="홈 화면에 추가" detail="추가됨" />
            : <Row icon={<Icon name="phone" size={22} />} label="홈 화면에 추가" onClick={() => nav('/settings/install')} />}
          <Row icon={<Icon name="refresh" size={22} />} label="저장 공간 정리" detail="이 휴대폰" onClick={async () => {
            if (await confirm({ title: '이 휴대폰에 보관된 사진을 비울까요?', message: '앨범의 사진은 그대로예요. 다시 볼 때 새로 받아요.', ok: '비우기' })) { await clearCache(); toast('비웠어요'); }
          }} />
          <Row icon={<Icon name="info" size={22} />} label="버전" detail={`Pastel Memories ${VERSION}`} />
        </Group>

        <Group>
          <Row label="로그아웃" onClick={logout} danger chevron={false} data-row="logout" />
        </Group>
      </div>
      <ProfileSheet open={sheet === 'profile'} onClose={close} />
      <AlbumSwitcher open={sheet === 'albums'} onClose={close} />
      <TextSizeSheet open={sheet === 'text'} onClose={close} />
    </Page>
  );
}

// 글자 크기: 고르면 바로 바뀌어요
function TextSizeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const album = useAlbum();
  const textSize = useSession((st) => st.textSize);
  const setTextSize = useSession((st) => st.setTextSize);
  return (
    <Sheet open={open} onClose={onClose} title="글자 크기">
      <p className={s.preview}>{album?.babyName ? `${callName(album.babyName)}가` : '아기가'} 웃고 있어요 🙂</p>
      <div className={s.options}>
        {TEXT_SIZES.map((t) => (
          <button key={t.value} className={s.option} onClick={() => setTextSize(t.value)} aria-pressed={textSize === t.value} data-value={t.value}>
            <span style={{ fontSize: t.px }}>{t.label}</span>
            {textSize === t.value && <Icon name="check" size={22} />}
          </button>
        ))}
      </div>
      <p className={s.sheetFoot}>앱 전체 글자와 버튼 크기가 바뀌어요.</p>
    </Sheet>
  );
}

// ---------- 계정 ----------
export function AccountSettings() {
  const me = useSession((st) => st.me)!;
  const nav = useNavigate();
  const logout = async () => {
    if (!(await confirm({ title: '로그아웃할까요?', message: '이 휴대폰에서만 로그아웃돼요.', ok: '로그아웃' }))) return;
    await api.signOut();
    await clearCache();
    nav('/', { replace: true });
  };
  const name = providerName(me.provider);
  return (
    <Page>
      <TopBar back title="계정" />
      <div className={s.page}>
        <div className={s.account}>
          <LoginBadge provider={me.provider} size={64} />
          <b>{name}로 로그인했어요</b>
        </div>
        <Group title="로그인 정보" footer={`비밀번호와 보안은 ${name}에서 관리해요.`}>
          <Row icon={<LoginBadge provider={me.provider} size={26} />} label="로그인 방법" detail={name} />
          {me.name && <Row icon={<Icon name="user" size={22} />} label="이름" detail={me.name} />}
          {me.email && <Row icon={<Icon name="mail" size={22} />} label="이메일" detail={me.email} />}
        </Group>
        <Group footer="이 휴대폰에서만 로그아웃돼요.">
          <Row label="로그아웃" onClick={logout} danger chevron={false} data-row="logout" />
        </Group>
        <Group footer="계정을 삭제하면 되돌릴 수 없어요.">
          <Row label="계정 삭제" onClick={() => nav('/settings/account/delete')} danger data-row="delete-account" />
        </Group>
      </div>
    </Page>
  );
}

// ---------- 계정 삭제 (확인 화면) ----------
export function DeleteAccount() {
  const me = useSession((st) => st.me)!;
  const albums = useSession((st) => st.albums);
  const nav = useNavigate();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { api.memberCounts(albums.map((a) => a.id)).then(setCounts, () => setCounts({})); }, [albums]);
  const alone = albums.filter((a) => counts && (counts[a.id] || 0) <= 1);
  const shared = albums.filter((a) => counts && (counts[a.id] || 0) > 1);
  const owned = shared.filter((a) => a.myRole === 'owner');
  const name = providerName(me.provider);

  const remove = async () => {
    if (!ok) return;
    if (!(await confirm({ title: '계정을 삭제할까요?', message: '되돌릴 수 없어요.', ok: '계정 삭제', danger: true }))) return;
    const p = progress('계정을 삭제하는 중');
    try {
      await api.deleteAccount(me.id, albums);
      await clearCache();
      p.close();
      toast('계정을 삭제했어요');
      nav('/', { replace: true });
    } catch (e) { p.close(); toast((e as Error).message); }
  };

  return (
    <Page>
      <TopBar back title="계정 삭제" />
      <div className={s.page}>
        <h2 className={s.bigTitle}>계정을 삭제하기 전에<br />확인해 주세요</h2>
        <ul className={s.bullets}>
          {alone.length > 0 && <li>혼자 쓰는 앨범 {alone.length}개({alone.map((a) => a.name).join(', ')})는 사진과 함께 완전히 지워져요.</li>}
          {shared.length > 0 && <li>가족과 함께 쓰는 앨범 {shared.length}개에서 나가게 돼요. 내가 올린 사진과 댓글은 앨범에 남아요.</li>}
          <li>내가 누른 좋아요는 지워져요.</li>
          {owned.length > 0 && <li>내가 관리자인 앨범은 가장 먼저 들어온 가족이 관리자가 돼요.</li>}
          <li>{name} 계정은 지워지지 않아요. 이 앱과의 연결만 끊겨요.</li>
          <li>삭제한 계정은 되살릴 수 없어요. 필요한 사진은 먼저 저장해 두세요.</li>
        </ul>
        <label className={s.agree}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-f="agree" />
          <span>위 내용을 확인했어요</span>
        </label>
        <Button size="lg" block variant="danger" disabled={!ok || !counts} onClick={remove} data-f="delete">계정 삭제</Button>
      </div>
    </Page>
  );
}

// ---------- 앨범 설정 ----------
export function AlbumSettings() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const members = useSession((st) => st.members);
  const isOwner = album.myRole === 'owner';
  const nav = useNavigate();
  const cover = useCoverChanger();
  const [sheet, setSheet] = useState<'members' | null>(null);
  const [withOrig, setWithOrig] = useState(() => { try { return localStorage.getItem('pm-upload-original') !== 'off'; } catch { return true; } });
  const code = `${album.inviteCode.slice(0, 4)}-${album.inviteCode.slice(4)}`;
  const edit = isOwner ? () => nav('/settings/album/info') : undefined;
  const alone = members.length <= 1;

  const setOrig = (v: boolean) => {
    setWithOrig(v);
    try { localStorage.setItem('pm-upload-original', v ? 'on' : 'off'); } catch { /* 무시 */ }
  };
  const newCode = async () => {
    if (!(await confirm({ title: '초대 코드를 새로 만들까요?', message: '지금 코드는 더 이상 쓸 수 없어요. 이미 들어온 가족은 그대로예요.', ok: '새로 만들기' }))) return;
    try {
      const c = await api.resetInvite(album.id);
      useSession.getState().patchAlbum({ inviteCode: c });
      toast('초대 코드를 새로 만들었어요');
    } catch (e) { toast((e as Error).message); }
  };
  const leave = async () => {
    const lastOwner = isOwner && !members.some((m) => m.userId !== me.id && m.role === 'owner');
    if (!(await confirm({ title: '앨범에서 나갈까요?', message: `내가 올린 사진과 댓글은 앨범에 남아요.${lastOwner ? '\n가장 먼저 들어온 가족이 관리자가 돼요.' : ''}\n다시 들어오려면 초대 코드가 필요해요.`, ok: '나가기', danger: true }))) return;
    try {
      await api.leaveAlbum(album.id, me.id);
      await useSession.getState().loadAlbums();
      nav('/', { replace: true });
    } catch (e) { toast((e as Error).message); }
  };
  const remove = async () => {
    if (!(await confirm({ title: `‘${album.name}’을 지울까요?`, message: `모든 사진과 댓글이 지워지고, 가족 ${members.length}명 모두 더 이상 볼 수 없어요.`, ok: '지우기', danger: true }))) return;
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

  return (
    <Page>
      <TopBar back title="앨범 설정" />
      <div className={s.page}>
        <div className={s.hero}>
          <CoverFace size={88} />
          {isOwner && <button className={s.heroLink} onClick={cover.open} data-row="cover">앨범 사진 바꾸기</button>}
        </div>

        <Group title="앨범 정보" footer={isOwner ? '아이 나이(생후 N일)는 사진을 올린 날 기준으로 보여 줘요.' : '앨범 정보는 관리자만 바꿀 수 있어요.'}>
          <Row label="앨범 이름" detail={album.name} onClick={edit} />
          <Row label="아이 이름" detail={album.babyName || '없음'} onClick={edit} />
          <Row label="생일" detail={album.babyBirthday ? fmtDate(album.babyBirthday) : '없음'} onClick={edit} />
        </Group>

        <Group title="가족" footer={isOwner ? '관리자는 앨범 정보와 가족을 관리할 수 있어요.' : undefined}>
          <Row icon={<Icon name="users" size={22} />} label="가족 구성원" detail={`${members.length}명`} onClick={() => setSheet('members')} data-row="members" />
          <Row icon={<Icon name="key" size={22} />} label="초대 코드" detail={code} onClick={async () => { if (await copyText(album.inviteCode)) toast('초대 코드를 복사했어요'); }} chevron={false} />
          {isOwner && <Row icon={<Icon name="refresh" size={22} />} label="초대 코드 새로 만들기" onClick={newCode} chevron={false} data-row="new-code" />}
        </Group>

        <Group title="사진" footer="켜 두면 사진을 올릴 때 원본도 저장해서 가족이 그대로 내려받을 수 있어요.">
          <Row icon={<Icon name="cloud" size={22} />} label="사진 저장 위치" detail={album.storage === 'drive' ? (isOwner ? '구글 드라이브' : '관리자의 구글 드라이브') : '기본 저장소'}
            onClick={isOwner ? () => nav('/settings/storage') : undefined} />
          <Row icon={<Icon name="image" size={22} />} label="원본도 함께 저장">
            <Toggle checked={withOrig} onChange={setOrig} label="원본도 함께 저장" data-f="orig-default" />
          </Row>
        </Group>

        <Group footer={isOwner ? '앨범을 지우면 모든 가족에게서 사라져요.' : undefined}>
          {!alone && <Row label="앨범에서 나가기" onClick={leave} danger chevron={false} data-row="leave" />}
          {isOwner && <Row label="앨범 지우기" onClick={remove} danger chevron={false} data-row="delete-album" />}
        </Group>
      </div>
      {cover.ui}
      <MembersSheet open={sheet === 'members'} onClose={() => setSheet(null)} />
    </Page>
  );
}

// ---------- 앨범 정보 고치기 (관리자) ----------
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
      <TopBar back title="앨범 정보" right={<button className={s.saveBtn} onClick={save} data-save>저장</button>} />
      <div className={s.page}>
        <Group title="아이">
          <Field label="이름" value={baby} onChange={(e) => setBaby(e.target.value)} maxLength={20} placeholder="하준" name="baby" />
          <Field label="생일" type="date" value={bday} onChange={(e) => setBday(e.target.value)} name="bday" />
        </Group>
        <Group title="앨범">
          <Field label="앨범 이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} name="album" />
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
