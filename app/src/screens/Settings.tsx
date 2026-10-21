import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Group, Row, Field } from '../components/Form';
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
import { fmtDate, ymd } from '../lib/dates';
import { albumSince } from '../lib/album';
import { DatePickerSheet } from '../components/DatePicker';
import { childName, isBorn, kidsLabel, kidsPatch, newChild, spaceAmp, suggestAlbumName, termDays, type Child } from '../lib/kids';
import type { AlbumKind } from '../lib/types';
import { KidsForm } from '../components/KidsForm';

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
    <Sheet open={open} onClose={onClose} title="내 프로필">
      <div className={s.profile}>
        <button className={s.pic} onClick={choose} data-pick-photo>
          <Avatar src={mine.avatar} name={mine.displayName} size={96} />
          <span>사진 바꾸기</span>
        </button>
        <input ref={file} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto(f); }} data-who="file" />
        <Group footer="앨범에서 보이는 이름이에요.">
          <Field label={album.kind === 'group' ? '앨범에서 보일 이름' : '나는 아이의'} value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
            placeholder={album.kind === 'group' ? '민지' : '엄마'} name="role" data-who="name" />
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
          <Row icon={<span aria-hidden="true">{album.kind === 'group' ? '🙌' : '👶'}</span>} label="앨범 종류" detail={album.kind === 'group' ? '친구·모임' : '아기·가족'} onClick={() => nav('/settings/album')} data-row="kind" />
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
      <p className={s.preview}>{album?.kind === 'group' ? '오늘도 모두 웃고 있어요 🙂' : `${album?.babyName ? `${callName(album.babyName)}가` : '아기가'} 웃고 있어요 🙂`}</p>
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
  const [released, setReleased] = useState<string[]>([]);
  useEffect(() => { api.memberCounts(albums.map((a) => a.id)).then(setCounts, () => setCounts({})); }, [albums]);
  useEffect(() => { api.driveLinksToRelease().then(setReleased, () => setReleased([])); }, []);
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
          {shared.length > 0 && <li>다른 사람과 함께 쓰는 앨범 {shared.length}개에서 나가게 돼요. 내가 올린 사진과 댓글은 앨범에 남아요.</li>}
          {released.length > 0 && <li data-f="drive-release">{released.map((n) => `‘${n}’`).join(', ')} 앨범이 쓰던 내 구글 드라이브 연결이 끊겨요. 드라이브에 저장된 사진은 멤버가 앱에서 더 이상 볼 수 없어요. (사진은 내 드라이브에 그대로 남아요)</li>}
          <li>내가 누른 좋아요는 지워져요.</li>
          {owned.length > 0 && <li>내가 관리자인 앨범은 가장 먼저 들어온 멤버가 관리자가 돼요.</li>}
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
  const [sheet, setSheet] = useState<'members' | 'since' | null>(null);
  const code = `${album.inviteCode.slice(0, 4)}-${album.inviteCode.slice(4)}`;
  const alone = members.length <= 1;
  const isGroup = album.kind === 'group';
  const since = albumSince(album);

  // 앨범 종류: 아기·가족 ↔ 친구·모임 (아이 정보는 지우지 않고 그대로 둬요)
  const setKind = async (kind: AlbumKind) => {
    if (kind === album.kind) return;
    try {
      await api.updateAlbum(album.id, { kind });
      useSession.getState().patchAlbum({ kind });
      toast(kind === 'group' ? '친구·모임 앨범으로 바꿨어요' : '아기·가족 앨범으로 바꿨어요');
    } catch (e) { toast((e as Error).message); }
  };
  const setSince = async (v: string | null) => {
    try {
      await api.updateAlbum(album.id, { since: v });
      useSession.getState().patchAlbum({ since: v });
      toast('모임 시작일을 바꿨어요');
    } catch (e) { toast((e as Error).message); }
  };
  const check = <Icon name="check" size={20} style={{ color: 'var(--c-accent-strong)' }} />;

  const newCode = async () => {
    if (!(await confirm({ title: '초대 코드를 새로 만들까요?', message: '지금 코드는 더 이상 쓸 수 없어요. 이미 들어온 멤버는 그대로예요.', ok: '새로 만들기' }))) return;
    try {
      const c = await api.resetInvite(album.id);
      useSession.getState().patchAlbum({ inviteCode: c });
      toast('초대 코드를 새로 만들었어요');
    } catch (e) { toast((e as Error).message); }
  };
  const leave = async () => {
    const lastOwner = isOwner && !members.some((m) => m.userId !== me.id && m.role === 'owner');
    if (!(await confirm({ title: '앨범에서 나갈까요?', message: `내가 올린 사진과 댓글은 앨범에 남아요.${lastOwner ? '\n가장 먼저 들어온 멤버가 관리자가 돼요.' : ''}\n다시 들어오려면 초대 코드가 필요해요.`, ok: '나가기', danger: true }))) return;
    try {
      await api.leaveAlbum(album.id, me.id);
      await useSession.getState().loadAlbums();
      nav('/', { replace: true });
    } catch (e) { toast((e as Error).message); }
  };
  const remove = async () => {
    if (!(await confirm({ title: `‘${album.name}’을 지울까요?`, message: `모든 사진과 댓글이 지워지고, 멤버 ${members.length}명 모두 더 이상 볼 수 없어요.`, ok: '지우기', danger: true }))) return;
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
        {/* 앨범 종류와 기준 날짜 (아기: 아이·예정일·임신 시작일은 '프로필 편집'에서 · 모임: 시작일은 여기서) */}
        <Group title="앨범 종류" footer={isGroup
          ? '친구·모임 앨범은 시작일부터 함께한 날과 다음 기념일(100일 · 1주년)까지 남은 날을 보여 줘요.'
          : '아기·가족 앨범은 출산 예정일까지 남은 날과 임신 주수를 보여 줘요. 임신 시작일을 넣으면 쌍둥이처럼 일찍 낳는 경우도 정확해요.'}>
          <Row icon={<span aria-hidden="true">👶</span>} label="아기·가족 앨범" onClick={isOwner ? () => setKind('baby') : undefined} chevron={false} data-kind="baby">{!isGroup && check}</Row>
          <Row icon={<span aria-hidden="true">🙌</span>} label="친구·모임 앨범" onClick={isOwner ? () => setKind('group') : undefined} chevron={false} data-kind="group">{isGroup && check}</Row>
          {isGroup
            ? <Row icon={<Icon name="calendar" size={22} />} label="모임 시작일" detail={since ? fmtDate(since) : '고르기'} onClick={isOwner ? () => setSheet('since') : undefined} data-row="since" />
            : <Row icon={<Icon name="calendar" size={22} />} label="아이 · 출산 예정일" detail={kidsLabel(album.children) || '넣기'} onClick={isOwner ? () => nav('/settings/album/info') : undefined} data-row="kids" />}
        </Group>

        <Group title="멤버" footer={isOwner ? '가족뿐 아니라 초대받은 누구나 멤버가 될 수 있어요. 관리자는 멤버와 초대 코드를 관리해요.' : undefined}>
          <Row icon={<Icon name="users" size={22} />} label="멤버" detail={`${members.length}명`} onClick={() => setSheet('members')} data-row="members" />
          <Row icon={<Icon name="key" size={22} />} label="초대 코드" detail={code} onClick={async () => { if (await copyText(album.inviteCode)) toast('초대 코드를 복사했어요'); }} chevron={false} />
          {isOwner && <Row icon={<Icon name="refresh" size={22} />} label="초대 코드 새로 만들기" onClick={newCode} chevron={false} data-row="new-code" />}
        </Group>

        <Group title="사진" footer="내려받으면 원본 화질 그대로 저장돼요.">
          <Row icon={<Icon name="cloud" size={22} />} label="사진 저장 위치" detail={album.storage === 'drive' ? (isOwner ? '구글 드라이브' : '관리자의 구글 드라이브') : '기본 저장소'}
            onClick={isOwner ? () => nav('/settings/storage') : undefined} />
        </Group>

        <Group footer={isOwner ? '앨범을 지우면 모든 멤버에게서 사라져요.' : undefined}>
          {!alone && <Row label="앨범에서 나가기" onClick={leave} danger chevron={false} data-row="leave" />}
          {isOwner && <Row label="앨범 지우기" onClick={remove} danger chevron={false} data-row="delete-album" />}
        </Group>
      </div>
      <MembersSheet open={sheet === 'members'} onClose={() => setSheet(null)} />
      {isOwner && isGroup && (
        <DatePickerSheet open={sheet === 'since'} onClose={() => setSheet(null)} title="모임 시작일" value={since} min="1950-01-01" max={ymd(new Date())}
          onChange={(v) => { if (v) setSince(v); }} />
      )}
    </Page>
  );
}

// ---------- 프로필 편집 (관리자): 앨범 사진 · 이름 · 소개 · 아이(태명·이름·출산 예정일) ----------
const BIO_MAX = 150;
export function AlbumInfo() {
  const album = useAlbum()!;
  const nav = useNavigate();
  const cover = useCoverChanger();
  const isOwner = album.myRole === 'owner';
  const isGroup = album.kind === 'group';
  const [kids, setKids] = useState<Child[]>(() => (album.children.length ? album.children : [newChild()]));
  // 앨범 이름을 직접 바꾼 적이 없으면 아이 이름을 따라가요 (태어나서 이름을 넣으면 '하준이네 앨범'으로). 모임 앨범은 직접 써요
  const [touched, setTouched] = useState(() => isGroup || spaceAmp(album.name) !== suggestAlbumName(album.children));
  const [name, setName] = useState(album.name);
  const [bio, setBio] = useState(album.bio || '');
  const albumName = touched ? name : suggestAlbumName(kids) || name;
  const save = async () => {
    const filled = kids.filter((c) => childName(c));
    if (!isGroup) {
      if (!filled.length) return toast('아이의 태명이나 이름을 적어 주세요');
      if (filled.some((c) => c.born && c.birthday && c.birthday > ymd(new Date()))) return toast('태어난 날은 오늘이나 그 전 날짜로 골라 주세요');
      if (filled.some((c) => !isBorn(c) && c.start && c.birthday && termDays(c) === null)) return toast('임신 시작일과 출산 예정일 사이가 20주 ~ 44주가 되게 골라 주세요');
    }
    const n = spaceAmp(albumName);
    if (!n) return toast('앨범 이름을 적어 주세요');
    try {
      // 모임 앨범은 아이 정보를 건드리지 않아요 (아기 앨범으로 돌아가면 그대로 있어요)
      await api.updateAlbum(album.id, { name: n, bio: bio.trim(), ...(isGroup ? {} : { children: filled }) });
      useSession.getState().patchAlbum({ name: n, bio: bio.trim(), ...(isGroup ? {} : kidsPatch(filled)) });
      toast('저장했어요');
      nav(-1);
    } catch (e) { toast((e as Error).message); }
  };

  // 관리자가 아니면 바꿀 수 없어요 (주소로 바로 들어와도)
  if (!isOwner) {
    return (
      <Page>
        <TopBar back title="프로필 편집" />
        <div className={s.page}><p className={s.ownerOnly}>앨범 정보는 관리자만 바꿀 수 있어요.</p></div>
      </Page>
    );
  }
  return (
    <Page>
      <TopBar back title="프로필 편집" right={<button className={s.saveBtn} onClick={save} data-save>저장</button>} />
      <div className={s.page}>
        <button className={s.coverPick} onClick={cover.open} data-f="cover-change">
          <CoverFace size={96} />
          <span>사진 바꾸기</span>
        </button>

        <Group title="앨범" footer={`${touched ? '' : '아이 이름이 바뀌면 앨범 이름도 따라 바뀌어요. '}소개는 ${isGroup ? '모임' : '가족'} 탭 맨 위에 보여요.`}>
          <Field label="앨범 이름" value={albumName} onChange={(e) => { setTouched(true); setName(e.target.value); }} onBlur={() => setName((v) => spaceAmp(v))} maxLength={40} name="album" />
          <label className={s.bioRow}>
            <span className={s.bioLabel}>소개</span>
            <textarea className={s.bioBox} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={BIO_MAX} rows={4}
              placeholder={isGroup ? '예) 2019년부터 함께한 우리 모임 사진첩이에요' : '예) 12월에 만나요! 씩씩이 & 튼튼이를 기다리는 우리 가족 앨범이에요'} name="bio" />
            <small className={s.count} data-f="bio-count">{bio.length}/{BIO_MAX}</small>
          </label>
        </Group>

        {isGroup
          ? <p className={s.kindNote}>친구·모임 앨범이에요. 모임 시작일은 <b>설정 → 앨범 종류</b>에서 바꿀 수 있어요.</p>
          : <KidsForm kids={kids} onChange={setKids} />}
      </div>
      {cover.ui}
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
      useSession.getState().patchAlbum({ storage: 'supabase', driveEmail: null, driveReady: false });
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
          <Group title="구글 드라이브" footer="사진은 드라이브의 ‘Pastel Memories’ 폴더에 비공개로 저장돼요. 멤버는 앱 안에서만 볼 수 있어요.">
            <Row label="연결된 계정" detail={album.driveEmail || '확인 중'} />
            <Row label="다른 계정으로 다시 연결" onClick={connect} />
            <Row label="연결 끊기" onClick={disconnect} danger chevron={false} />
          </Group>
        ) : (
          <div className={s.driveCard}>
            <Icon name="shield" size={28} />
            <b>내 구글 드라이브에 저장하기</b>
            <p>멤버가 올린 사진이 관리자의 드라이브 폴더에 비공개로 모여요. 드라이브 공간(무료 15GB)을 쓰니 더 많이 저장할 수 있어요.</p>
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
