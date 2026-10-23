import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Group, Row, Field, Toggle } from '../components/Form';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet, confirm, copyText, menu, progress, toast, useOnce } from '../components/ui';
import { CoverFace, MembersSheet, useCoverChanger } from '../components/AlbumBits';
import { GoogleIcon, KakaoIcon, providerName } from '../components/ProviderIcon';
import { useAlbum, useSession, type TextSize } from '../state/session';
import { linkDrive, loginThenPick } from '../state/actions';
import * as api from '../lib/api';
import { disconnectDrive, driveFolderLink, driveSetup, loadMyDrive, popupWarning, preloadDrive, setupHelp, useMyDrive, type DriveSetup } from '../lib/drive';
import { clearCache } from '../lib/photoCache';
import { squarePhoto } from '../lib/image';
import { isIOS, isStandalone } from '../lib/device';
import { fmtDate, ymd } from '../lib/dates';
import { albumSince, kindInfo, sinceLabel, upcomingDays } from '../lib/album';
import { DatePickerSheet } from '../components/DatePicker';
import { childName, isBorn, kidsLabel, kidsPatch, newChild, spaceAmp, suggestAlbumName, termDays, type Child } from '../lib/kids';
import { KidsForm } from '../components/KidsForm';
import { KindSheet } from '../components/KindPicker';
import { DEFAULT_PREFS, disablePush, enablePush, pushState, pushSupport, savePushPrefs, type PushPrefs } from '../lib/push';

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
  const once = useOnce();
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
      // 사진은 내 구글 드라이브에 올려요 (구글 로그인한 사람만)
      if (v === 'pick' && !useMyDrive.getState().email) { await loginThenPick(() => file.current?.click()); return; }
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
          <Field label={album.kind === 'baby' ? '나는 아이의' : '내 이름'} value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
            placeholder={album.kind === 'group' ? '민지' : '엄마'} name="role" data-who="name" />
        </Group>
        <Button size="lg" block onClick={once(save)} data-save>저장</Button>
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
/** 줄 아이콘과 크기를 맞춘 이모지 (연한 네모 안에) */
const Emoji = ({ e }: { e: string }) => <span className={s.tile} aria-hidden="true">{e}</span>;

export function Settings() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const mine = useSession((st) => st.member(me.id));
  const albums = useSession((st) => st.albums);
  const textSize = useSession((st) => st.textSize);
  const nav = useNavigate();
  const [sheet, setSheet] = useState<'profile' | 'albums' | 'text' | 'kind' | null>(null);
  const close = () => setSheet(null);
  const myDrive = useMyDrive();
  useEffect(() => { loadMyDrive(); }, []);

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
          <Row icon={<span className={`${s.badge} ${s.google}`} style={{ width: 30, height: 30 }}><GoogleIcon size={17} /></span>}
            label={<Two title="내 구글 드라이브" sub={myDrive.email || (myDrive.loaded ? '구글 로그인 전 · 사진을 올리려면 구글 로그인' : undefined)} />}
            onClick={() => nav('/settings/drive')} data-row="my-drive" />
        </Group>

        <Group title="앨범">
          <Row icon={<CoverFace size={30} />} label="앨범 설정" detail={album.name} onClick={() => nav('/settings/album')} data-row="album" />
          <Row icon={<Emoji e={kindInfo(album.kind).icon} />} label="앨범 종류" detail={kindInfo(album.kind).short} onClick={album.myRole === 'owner' ? () => setSheet('kind') : undefined} data-row="kind" />
          <Row icon={<Icon name="swap" size={22} />} label="다른 앨범" detail={`${albums.length}개`} onClick={() => setSheet('albums')} data-row="albums" />
        </Group>

        <Group title="앱">
          <Row icon={<Icon name="bell" size={22} />} label="알림" detail="새 사진 · 댓글 · 기념일" onClick={() => nav('/settings/notify')} data-row="notify" />
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
      <KindSheet open={sheet === 'kind'} onClose={close} />
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
      <p className={s.preview}>{album && album.kind !== 'baby' ? '오늘도 모두 웃고 있어요 🙂' : `${album?.babyName ? `${callName(album.babyName)}가` : '아기가'} 웃고 있어요 🙂`}</p>
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
  const [sheet, setSheet] = useState<'members' | 'since' | 'kind' | null>(null);
  const code = `${album.inviteCode.slice(0, 4)}-${album.inviteCode.slice(4)}`;
  const alone = members.length <= 1;
  const isBaby = album.kind === 'baby';
  const since = albumSince(album);

  const setSince = async (v: string | null) => {
    try {
      await api.updateAlbum(album.id, { since: v });
      useSession.getState().patchAlbum({ since: v });
      toast(`${sinceLabel(album.kind)}을 바꿨어요`);
    } catch (e) { toast((e as Error).message); }
  };
  const upcoming = new Map(upcomingDays(album, 10).map((u) => [u.id, u]));

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
        {/* 앨범 종류(누르면 고르는 창)와 기준 날짜 (아기: 아이·예정일·임신 시작일은 '프로필 편집'에서 · 가족/모임: 시작일은 여기서) */}
        <Group footer={isBaby
          ? '출산 예정일까지 남은 날과 임신 주수, 태어난 뒤엔 아이 나이를 보여 줘요.'
          : `${sinceLabel(album.kind)}부터 함께한 날과 다음 100일 · 1주년을 보여 줘요.${album.kind === 'family' ? ' 예) 결혼한 날, 앨범을 시작한 날' : ' 예) 처음 모인 날'}`}>
          <Row icon={<Emoji e={kindInfo(album.kind).icon} />} label="앨범 종류" detail={kindInfo(album.kind).label} onClick={isOwner ? () => setSheet('kind') : undefined} data-row="kind" />
          {isBaby
            ? <Row icon={<Icon name="calendar" size={22} />} label="아이 · 출산 예정일" detail={kidsLabel(album.children) || '넣기'} onClick={isOwner ? () => nav('/settings/album/info') : undefined} data-row="kids" />
            : <Row icon={<Icon name="calendar" size={22} />} label={sinceLabel(album.kind)} detail={since ? fmtDate(since) : '고르기'} onClick={isOwner ? () => setSheet('since') : undefined} data-row="since" />}
        </Group>

        {/* 기념일: 모든 앨범 (앨범 만든 날 · 결혼기념일 · 가족 생일 …) */}
        <Group title="기념일" footer={`기념일 당일엔 홈 맨 위에 축하가 뜨고, ${album.kind === 'group' ? '모임' : '가족'} 탭에 다가오는 기념일이 보여요.`}>
          {album.days.map((d) => {
            const u = upcoming.get(d.id);
            return (
              <Row key={d.id} icon={<Emoji e={d.yearly ? '🎂' : '🎉'} />} label={<Two title={d.name} sub={`${fmtDate(d.date)}${d.yearly ? ' · 해마다' : ''}`} />}
                detail={u ? (u.daysLeft ? `D-${u.daysLeft.toLocaleString()}` : '오늘') : undefined}
                onClick={isOwner ? () => nav(`/settings/album/day/${d.id}`) : undefined} data-day={d.id} />
            );
          })}
          {isOwner && album.days.length < 10 && <Row icon={<Icon name="plus" size={20} />} label="기념일 추가" onClick={() => nav('/settings/album/day/new')} data-row="day-add" />}
          {!isOwner && !album.days.length && <Row label="아직 기념일이 없어요" />}
        </Group>

        <Group title="멤버" footer={isOwner ? '가족뿐 아니라 초대받은 누구나 멤버가 될 수 있어요. 관리자는 멤버와 초대 코드를 관리해요.' : undefined}>
          <Row icon={<Icon name="users" size={22} />} label="멤버" detail={`${members.length}명`} onClick={() => setSheet('members')} data-row="members" />
          <Row icon={<Icon name="key" size={22} />} label="초대 코드" detail={code} onClick={async () => { if (await copyText(album.inviteCode)) toast('초대 코드를 복사했어요'); }} chevron={false} />
          {isOwner && <Row icon={<Icon name="refresh" size={22} />} label="초대 코드 새로 만들기" onClick={newCode} chevron={false} data-row="new-code" />}
        </Group>

        <Group title="사진" footer="사진·동영상은 올린 사람의 구글 드라이브에 저장돼요. 내려받으면 원본 화질 그대로예요.">
          <Row icon={<Icon name="cloud" size={22} />} label="사진 저장" detail="각자 구글 드라이브" onClick={() => nav('/settings/drive')} data-row="storage" />
        </Group>

        <Group footer={isOwner ? '앨범을 지우면 모든 멤버에게서 사라져요.' : undefined}>
          {!alone && <Row label="앨범에서 나가기" onClick={leave} danger chevron={false} data-row="leave" />}
          {isOwner && <Row label="앨범 지우기" onClick={remove} danger chevron={false} data-row="delete-album" />}
        </Group>
      </div>
      <MembersSheet open={sheet === 'members'} onClose={() => setSheet(null)} />
      {isOwner && <KindSheet open={sheet === 'kind'} onClose={() => setSheet(null)} />}
      {isOwner && !isBaby && (
        <DatePickerSheet open={sheet === 'since'} onClose={() => setSheet(null)} title={sinceLabel(album.kind)} value={since} min="1950-01-01" max={ymd(new Date())}
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
  const isGroup = album.kind !== 'baby';
  const [kids, setKids] = useState<Child[]>(() => (album.children.length ? album.children : [newChild()]));
  // 앨범 이름을 직접 바꾼 적이 없으면 아이 이름을 따라가요 (태어나서 이름을 넣으면 '하준이네 앨범'으로). 모임 앨범은 직접 써요
  const [touched, setTouched] = useState(() => isGroup || spaceAmp(album.name) !== suggestAlbumName(album.children));
  const [name, setName] = useState(album.name);
  const [bio, setBio] = useState(album.bio || '');
  const albumName = touched ? name : suggestAlbumName(kids) || name;
  const once = useOnce();
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
      <TopBar back title="프로필 편집" right={<button className={s.saveBtn} onClick={once(save)} data-save>저장</button>} />
      <div className={s.page}>
        <button className={s.coverPick} onClick={cover.open} data-f="cover-change">
          <CoverFace size={96} />
          <span>사진 바꾸기</span>
        </button>

        <Group title="앨범" footer={`${touched ? '' : '아이 이름이 바뀌면 앨범 이름도 따라 바뀌어요. '}소개는 ${album.kind === 'group' ? '모임' : '가족'} 탭 맨 위에 보여요.`}>
          <Field label="앨범 이름" value={albumName} onChange={(e) => { setTouched(true); setName(e.target.value); }} onBlur={() => setName((v) => spaceAmp(v))} maxLength={40} name="album" />
          <label className={s.bioRow}>
            <span className={s.bioLabel}>소개</span>
            <textarea className={s.bioBox} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={BIO_MAX} rows={4}
              placeholder={album.kind === 'group' ? '예) 2019년부터 함께한 우리 모임 사진첩이에요' : album.kind === 'family' ? '예) 우리 가족의 소중한 순간을 모아요' : '예) 12월에 만나요! 씩씩이 & 튼튼이를 기다리는 우리 가족 앨범이에요'} name="bio" />
            <small className={s.count} data-f="bio-count">{bio.length}/{BIO_MAX}</small>
          </label>
        </Group>

        {isGroup
          ? <p className={s.kindNote}>{kindInfo(album.kind).label}이에요. {sinceLabel(album.kind)}과 기념일은 <b>설정 → 앨범 설정</b>에서 바꿀 수 있어요.</p>
          : <KidsForm kids={kids} onChange={setKids} />}
      </div>
      {cover.ui}
    </Page>
  );
}

// ---------- 알림 (이 휴대폰) ----------
export function NotifySettings() {
  const nav = useNavigate();
  const support = pushSupport();
  const [st, setSt] = useState<{ on: boolean; prefs: PushPrefs; denied: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (support === 'ok') pushState().then(setSt, () => setSt({ on: false, prefs: DEFAULT_PREFS, denied: false })); }, [support]);

  const toggle = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) { await enablePush(st?.prefs || DEFAULT_PREFS); toast('알림을 켰어요'); }
      else { await disablePush(); toast('알림을 껐어요'); }
      setSt(await pushState());
    } catch (e) { toast((e as Error).message); setSt(await pushState().catch(() => st)); } finally { setBusy(false); }
  };
  const setPref = async (k: keyof PushPrefs, v: boolean) => {
    if (!st) return;
    const prefs = { ...st.prefs, [k]: v };
    setSt({ ...st, prefs });
    try { await savePushPrefs(prefs); } catch (e) { toast((e as Error).message); }
  };

  return (
    <Page>
      <TopBar back title="알림" />
      <div className={s.page}>
        {support === 'ios-home' && (
          <div className={s.install} data-f="notify-ios">
            <Icon name="bell" size={34} />
            <p>아이폰은 <b>홈 화면에 추가한 앱</b>에서만 알림을 받을 수 있어요.<br />홈 화면에 추가한 뒤, 그 앱에서 여기를 다시 열어 주세요.</p>
            <Button variant="secondary" onClick={() => nav('/settings/install')}>홈 화면에 추가하는 방법</Button>
          </div>
        )}
        {support === 'no' && <p className={s.ownerOnly}>이 브라우저는 알림을 받을 수 없어요. 크롬·사파리에서 열어 주세요.</p>}
        {support === 'ok' && (
          <>
            <Group footer={st?.denied ? '알림이 막혀 있어요. 휴대폰 설정 → 알림에서 이 앱(또는 브라우저)을 허용해 주세요.' : '이 휴대폰에서만 켜져요. 다른 휴대폰은 거기서 따로 켜 주세요.'}>
              <Row label="이 휴대폰에서 알림 받기" chevron={false} data-row="push-on">
                <Toggle checked={!!st?.on} onChange={toggle} label="알림 받기" disabled={!st || busy} data-f="push-toggle" />
              </Row>
            </Group>
            {st?.on && (
              <Group title="받을 알림" footer="기념일·추억 알림은 매일 아침 9시쯤, 챙길 날이나 N년 전 오늘 사진이 있을 때만 와요.">
                <Row label={<Two title="새 사진·동영상" sub="가족이 올리면" />} chevron={false}><Toggle checked={st.prefs.post} onChange={(v) => setPref('post', v)} label="새 사진 알림" data-pref="post" /></Row>
                <Row label={<Two title="댓글" sub="내 게시물이나 내가 댓글 단 게시물에" />} chevron={false}><Toggle checked={st.prefs.comment} onChange={(v) => setPref('comment', v)} label="댓글 알림" data-pref="comment" /></Row>
                <Row label={<Two title="기념일 · 추억" sub="백일·돌·기념일, N년 전 오늘" />} chevron={false}><Toggle checked={st.prefs.daily} onChange={(v) => setPref('daily', v)} label="기념일 알림" data-pref="daily" /></Row>
              </Group>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

// ---------- 내 구글 드라이브 (누구나): 연결 · 폴더 열기 · 다른 계정 · 끊기 ----------
export function MyDriveSettings() {
  const my = useMyDrive();
  const me = useSession((st) => st.me);
  const [setup, setSetup] = useState<DriveSetup | null>(null);
  useEffect(() => { preloadDrive(); loadMyDrive(); driveSetup().then(setSetup); }, []);
  const recheck = () => { setSetup(null); driveSetup(true).then(setSetup); };
  const warn = popupWarning();

  const connect = async () => { if (await linkDrive()) toast('구글 로그인이 됐어요. 이제 사진을 올릴 수 있어요'); };
  // 다른 계정으로 바꿔도 이미 올린 사진은 그 계정 드라이브에 남아서 가족은 계속 볼 수 있어요
  const reconnect = async () => {
    if (!(await confirm({ title: '다른 구글 계정으로 바꿀까요?', message: '이미 올린 사진은 지금 계정의 드라이브에 그대로 있고, 가족도 계속 볼 수 있어요.\n앞으로 올리는 사진만 새 계정에 저장돼요.', ok: '바꾸기' }))) return;
    // 계정을 고르는 창으로 (지금 계정으로 바로 넘어가지 않게)
    if (await linkDrive({ choose: true })) toast('구글 계정을 바꿨어요');
  };
  const disconnect = async () => {
    if (!(await confirm({ title: '구글 로그아웃할까요?', message: '이미 올린 사진은 드라이브에 그대로 있고 가족도 계속 볼 수 있어요.\n새 사진을 올리려면 다시 구글 로그인을 해야 해요.', ok: '로그아웃', danger: true }))) return;
    try {
      await disconnectDrive();
      toast('구글 로그아웃했어요');
    } catch (e) { toast((e as Error).message); }
  };

  return (
    <Page>
      <TopBar back title="내 구글 드라이브" />
      <div className={s.page}>
        {my.email ? (
          <Group title="구글 로그인된 계정" footer="사진·동영상은 이 계정 드라이브의 ‘Pastel Memories › 앨범 이름’ 폴더에 저장돼요. 내 드라이브 공간(무료 15GB)을 써요.">
            <Row icon={<GoogleIcon size={20} />} label={my.email} chevron={false} data-f="drive-email" />
            {my.root && <Row icon={<Icon name="link" size={20} />} label="드라이브에서 폴더 열기" onClick={() => window.open(driveFolderLink(my.root!), '_blank', 'noopener')} data-row="open-folder" />}
            <Row label="다른 구글 계정으로 바꾸기" onClick={reconnect} />
            <Row label="구글 로그아웃 (연결 끊기)" onClick={disconnect} danger chevron={false} data-row="disconnect" />
          </Group>
        ) : (
          <>
          <div className={s.driveCard} data-drive={setup?.state ?? 'loading'}>
            <Icon name="shield" size={28} />
            <b>구글 로그인하고 사진 올리기</b>
            <p>구글 로그인을 하면 내 구글 드라이브에 <b>Pastel Memories</b> 폴더와 앨범 폴더가 생기고, 내가 올리는 사진·동영상이 거기에 저장되면서 앱에 올라와요. 비용은 들지 않아요.</p>
            <ol className={s.driveSteps}>
              <li>아래 <b>구글 로그인</b>을 누르고 <b>구글 계정</b>을 골라요</li>
              <li><b>‘Google Drive’</b> 항목에 체크하고 <b>계속</b></li>
            </ol>
            {setup && setup.state !== 'ready' ? (
              <>
                <Button variant="secondary" disabled>아직 준비 중이에요</Button>
                <p className={s.driveHelp} data-f="drive-help">{setupHelp(setup)} <button type="button" onClick={recheck}>다시 확인</button></p>
              </>
            ) : (
              <Button onClick={connect} disabled={!setup} className={s.googleBtn} data-f="drive-connect"><GoogleIcon size={18} />{setup ? '구글 로그인' : '확인 중…'}</Button>
            )}
            {warn && <p className={s.driveHelp} data-f="drive-warn">{warn}</p>}
          </div>
          {me?.provider === 'kakao' && (
            <p className={s.kakaoNote} data-f="kakao-note">카카오로 로그인한 분은 지금처럼 사진·동영상을 보고, 좋아요·댓글을 할 수 있어요. 사진을 올리려면 여기서 구글 로그인을 한 번 해 주세요. 카카오 로그인은 그대로예요.</p>
          )}
          </>
        )}
        {/* 어디에 어떻게 저장되는지 */}
        <div className={s.howCard} data-f="drive-how">
          <b>이렇게 저장돼요</b>
          <ol>
            <li>사진·동영상은 올린 사람 드라이브의 <b>Pastel Memories › 앨범 이름</b> 폴더에 들어가요 (원본 그대로)</li>
            <li>앨범 폴더만 ‘링크가 있는 사람 보기’로 공유돼서, 앨범 멤버는 앱에서 보고 내려받아요. 주소를 아는 사람만 볼 수 있고 검색되지 않아요</li>
            <li>앱이 쓰는 작은 사진은 그 안의 <b>앱용 작은 사진</b> 폴더에 있어요</li>
            <li>드라이브에서 앨범 폴더나 사진을 지우면 앱에서도 안 보여요</li>
          </ol>
        </div>
      </div>
    </Page>
  );
}

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
