import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Group, Row, Field, Toggle } from '../components/Form';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet, afterBack, confirm, copyText, menu, progress, toast, useOnce } from '../components/ui';
import { CoverFace, MembersSheet, useCoverChanger } from '../components/AlbumBits';
import { DriveIcon, GoogleIcon, KakaoIcon, providerName } from '../components/ProviderIcon';
import { useAlbum, useSession, type TextSize } from '../state/session';
import { askDriveLink, linkDrive } from '../state/actions';
import * as api from '../lib/api';
import { STORAGE_MANAGE_URL, disconnectDrive, driveCheckUrl, driveFolderLink, driveSetup, driveUsage, purgeDriveTrash, usageNow, type DriveUsage, loadMyDrive, popupWarning, preloadDrive, setupHelp, useMyDrive, type DriveSetup } from '../lib/drive';
import { clearCache } from '../lib/photoCache';
import { fmtBytes, squarePhoto } from '../lib/image';
import { isIOS, isStandalone } from '../lib/device';
import { fmtDate, ymd } from '../lib/dates';
import { albumSince, kindInfo, sinceLabel, upcomingDays } from '../lib/album';
import { DatePickerSheet } from '../components/DatePicker';
import { childName, isBorn, kidsLabel, kidsPatch, newChild, spaceAmp, suggestAlbumName, termDays, type Child } from '../lib/kids';
import { KidsForm } from '../components/KidsForm';
import { KindSheet } from '../components/KindPicker';
import { DEFAULT_PREFS, disablePush, enablePush, pushState, pushSupport, savePushPrefs, type PushPrefs } from '../lib/push';
import { setHomePref, useHomePrefs } from '../lib/homePrefs';

import { callName } from '../lib/korean';
import { AlbumSwitcher } from './AlbumSwitcher';
import { startCompose } from './Compose';
import s from './Settings.module.css';

// ---------- 내 프로필 (이름·사진) ----------
export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const album = useAlbum();
  const me = useSession((st) => st.me);
  const mine = useSession((st) => (me ? st.member(me.id) : null));
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
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
      // 사진은 내 구글 드라이브에 올려요 (연동한 사람만) → 연동 전이면 설정으로
      if (v === 'pick' && !useMyDrive.getState().email) {
        if (await askDriveLink()) { onClose(); await afterBack(); nav('/settings/upload'); }
        return;
      }
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
  const [usage, setUsage] = useState<DriveUsage | null>(usageNow);
  useEffect(() => { loadMyDrive(); }, []);
  useEffect(() => { if (myDrive.email) driveUsage().then(setUsage, () => {}); }, [myDrive.email]);

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
        {/* 이 앨범에서 쓰는 내 이름·사진 */}
        <Group>
          <Row icon={<Avatar src={mine.avatar} name={mine.displayName} size={44} />} label={<Two title={mine.displayName} sub={`${album.name}에서 쓰는 이름과 사진`} />}
            onClick={() => setSheet('profile')} data-row="profile" />
        </Group>

        <Group title="로그인 정보">
          <Row icon={<LoginBadge provider={me.provider} />} label={<Two title={`${providerName(me.provider)} 로그인`} sub={me.email || me.name || undefined} />}
            onClick={() => nav('/settings/account')} data-row="account" />
        </Group>

        <Group title="사진 올리기 · 공유">
          <Row icon={<span className={s.tile}><DriveIcon size={20} /></span>}
            label={<Two title="구글 드라이브 연동" sub={myDrive.email || (myDrive.loaded ? '연동 전 · 사진을 올리려면 연동해 주세요' : undefined)} />}
            detail={myDrive.email ? '연동됨' : undefined}
            onClick={() => nav('/settings/upload')} data-row="upload" />
          {myDrive.email && (
            <Row icon={<Icon name="layers" size={22} />} label="드라이브 공간" onClick={() => nav('/settings/upload')} data-row="usage"
              detail={usage ? (usage.limit ? `${fmtBytes(usage.usage || 0)} / ${fmtBytes(usage.limit)}` : fmtBytes(usage.usage || 0)) : '확인 중…'} />
          )}
        </Group>

        <Group title="앨범">
          <Row icon={<CoverFace size={30} />} label="앨범 설정" detail={album.name} onClick={() => nav('/settings/album')} data-row="album" />
          <Row icon={<Emoji e={kindInfo(album.kind).icon} />} label="앨범 종류" detail={kindInfo(album.kind).short} onClick={album.myRole === 'owner' ? () => setSheet('kind') : undefined} data-row="kind" />
          <Row icon={<Icon name="swap" size={22} />} label="다른 앨범" detail={`${albums.length}개`} onClick={() => setSheet('albums')} data-row="albums" />
        </Group>

        <Group title="앱">
          <Row icon={<Icon name="star" size={22} />} label="기념일 · 추억" detail="홈 화면 카드" onClick={() => nav('/settings/memories')} data-row="memories" />
          <Row icon={<Icon name="bell" size={22} />} label="알림" detail="새 사진 · 댓글 · 기념일" onClick={() => nav('/settings/notify')} data-row="notify" />
          <Row icon={<Icon name="text" size={22} />} label="글자 크기" detail={TEXT_SIZES.find((t) => t.value === textSize)?.label} onClick={() => setSheet('text')} data-row="text" />
          {isStandalone()
            ? <Row icon={<Icon name="phone" size={22} />} label="홈 화면에 추가" detail="추가됨" />
            : <Row icon={<Icon name="phone" size={22} />} label="홈 화면에 추가" onClick={() => nav('/settings/install')} />}
          <Row icon={<Icon name="refresh" size={22} />} label="저장 공간 정리" detail="이 휴대폰" onClick={async () => {
            if (await confirm({ title: '이 휴대폰에 보관된 사진을 비울까요?', message: '앨범의 사진은 그대로예요. 다시 볼 때 새로 받아요.', ok: '비우기' })) { await clearCache(); toast('비웠어요'); }
          }} />
          <Row icon={<Icon name="shield" size={22} />} label="개인정보처리방침" onClick={() => window.open('privacy.html', '_blank', 'noopener')} data-row="privacy" />
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
          <Row icon={<Icon name="cloud" size={22} />} label="사진 올리기 · 공유" detail="각자 구글 드라이브" onClick={() => nav('/settings/upload')} data-row="storage" />
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

// ---------- 기념일 · 추억: 홈 화면 카드 (이 휴대폰) · 기념일 관리 · 알림 ----------
export function MemorySettings() {
  const album = useAlbum()!;
  const nav = useNavigate();
  const home = useHomePrefs();
  const owner = album.myRole === 'owner';
  return (
    <Page>
      <TopBar back title="기념일 · 추억" />
      <div className={s.page}>
        <Group title="홈 화면에 보이기" footer="이 휴대폰에서만 바뀌어요. 끄면 그날 카드가 홈 맨 위에 나오지 않아요.">
          <Row label={<Two title="오늘의 기념일" sub="‘오늘은 백일이에요 🎉’ 같은 카드" />} chevron={false} data-row="home-anniv">
            <Toggle checked={home.anniv} onChange={(v) => setHomePref('anniv', v)} label="오늘의 기념일 카드" data-home="anniv" />
          </Row>
          <Row label={<Two title="N년 전 오늘" sub="지난해 오늘 찍은 사진 모아 보기 카드" />} chevron={false} data-row="home-memory">
            <Toggle checked={home.memory} onChange={(v) => setHomePref('memory', v)} label="N년 전 오늘 카드" data-home="memory" />
          </Row>
        </Group>
        <Group>
          <Row icon={<Icon name="play" size={22} />} label="N년 전 오늘 보기" onClick={() => nav('/memories')} data-row="memories-open" />
          <Row icon={<Icon name="calendar" size={22} />} label="기념일 관리" detail={owner ? undefined : '관리자만'} onClick={owner ? () => nav('/settings/album') : undefined} data-row="days" />
          <Row icon={<Icon name="bell" size={22} />} label="알림" detail="기념일 · N년 전 오늘" onClick={() => nav('/settings/notify')} data-row="notify-link" />
        </Group>
      </div>
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
              <Group title="받을 알림" footer="기념일·N년 전 오늘 알림은 매일 아침 9시쯤, 챙길 날이나 그날 찍은 지난 사진이 있을 때만 와요.">
                <Row label={<Two title="새 사진·동영상" sub="가족이 올리면" />} chevron={false}><Toggle checked={st.prefs.post} onChange={(v) => setPref('post', v)} label="새 사진 알림" data-pref="post" /></Row>
                <Row label={<Two title="댓글" sub="내 게시물이나 내가 댓글 단 게시물에" />} chevron={false}><Toggle checked={st.prefs.comment} onChange={(v) => setPref('comment', v)} label="댓글 알림" data-pref="comment" /></Row>
                <Row label={<Two title="기념일" sub="백일·돌·생일, 앨범에 넣은 기념일" />} chevron={false}><Toggle checked={st.prefs.anniv} onChange={(v) => setPref('anniv', v)} label="기념일 알림" data-pref="anniv" /></Row>
                <Row label={<Two title="N년 전 오늘" sub="지난해 오늘 찍은 사진이 있으면" />} chevron={false}><Toggle checked={st.prefs.memory} onChange={(v) => setPref('memory', v)} label="N년 전 오늘 알림" data-pref="memory" /></Row>
              </Group>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

// ---------- 사진 올리기 · 공유 (누구나): 구글 드라이브 연동 · 공간 · 공유 폴더 · 계정 ----------
// 주소창으로 직접 확인할 수 있는 문제 (서버 기능이 없거나 · 닿지 않거나 · JWT)
const checkable = (st: DriveSetup['state']) => st === 'unreachable' || st === 'missing' || st === 'jwt';
/** 사진 한 장(원본 + 화면용 + 작은 사진)에 드는 공간: 올린 게 있으면 그 평균, 없으면 4MB로 */
const perPhoto = (u: DriveUsage) => (u.appFiles >= 3 ? (u.appBytes * 3) / u.appFiles : 4 * 1024 ** 2);
const pct = (n: number, of: number) => `${Math.min(100, Math.max(n > 0 ? 0.8 : 0, (n / of) * 100)).toFixed(1)}%`;

export function UploadSettings() {
  const my = useMyDrive();
  const me = useSession((st) => st.me);
  const owner = useSession((st) => st.isOwner());
  const [params, setParams] = useSearchParams();
  const [setup, setSetup] = useState<DriveSetup | null>(null);
  const [usage, setUsage] = useState<DriveUsage | null>(usageNow);
  const [usageErr, setUsageErr] = useState('');
  useEffect(() => { preloadDrive(); loadMyDrive(); driveSetup().then(setSetup); }, []);
  const refreshUsage = (fresh = false) => {
    setUsageErr('');
    driveUsage(fresh).then(setUsage, (e) => setUsageErr((e as Error).message));
  };
  useEffect(() => { if (my.email) refreshUsage(); }, [my.email]); // eslint-disable-line react-hooks/exhaustive-deps
  const recheck = () => { setSetup(null); driveSetup(true).then(setSetup); };
  const warn = popupWarning();

  const connect = async () => {
    if (!(await linkDrive())) return;
    // + 에서 왔으면 바로 사진 고르기 (고르기 창은 누른 순간에만 열려서 한 번 더 물어봐요)
    if (params.get('then') === 'pick') {
      setParams({}, { replace: true });
      if (await confirm({ title: '구글 드라이브와 연동했어요', message: '내 드라이브에 ‘Pastel Memories’ 폴더와 앨범 폴더를 만들었어요.\n이제 사진·동영상을 골라 올려 보세요.', ok: '사진 고르기', cancel: '나중에' })) startCompose();
    } else toast('구글 드라이브와 연동했어요. 이제 사진을 올릴 수 있어요');
  };
  // 다른 계정으로 바꿔도 이미 올린 사진은 그 계정 드라이브에 남아서 가족은 계속 볼 수 있어요
  const reconnect = async () => {
    if (!(await confirm({ title: '다른 구글 계정으로 바꿀까요?', message: '이미 올린 사진은 지금 계정의 드라이브에 그대로 있고, 가족도 계속 볼 수 있어요.\n앞으로 올리는 사진만 새 계정에 저장돼요.', ok: '바꾸기' }))) return;
    // 계정을 고르는 창으로 (지금 계정으로 바로 넘어가지 않게)
    if (await linkDrive({ choose: true })) { toast('구글 계정을 바꿨어요'); refreshUsage(true); }
  };
  const disconnect = async () => {
    if (!(await confirm({ title: '구글 드라이브 연동을 해제할까요?', message: '이미 올린 사진은 드라이브에 그대로 있고 가족도 계속 볼 수 있어요.\n새 사진을 올리려면 다시 연동해야 해요.', ok: '연동 해제', danger: true }))) return;
    try {
      await disconnectDrive();
      setUsage(null);
      toast('연동을 해제했어요');
    } catch (e) { toast((e as Error).message); }
  };
  // 앱에서 지운 게시물의 사진·동영상은 드라이브 휴지통에 있어요 (공간을 계속 차지해요)
  const purge = async () => {
    if (!usage?.trashFiles) return;
    if (!(await confirm({ title: '앱에서 지운 사진을 완전히 지울까요?', message: `드라이브 휴지통에 있는 이 앱의 파일 ${usage.trashFiles}개(${fmtBytes(usage.trashBytes)})를 완전히 지워요. 되돌릴 수 없어요.\n다른 파일은 그대로예요.`, ok: '완전히 지우기', danger: true }))) return;
    const p = progress('휴지통을 비우는 중');
    try {
      const r = await purgeDriveTrash();
      p.close();
      toast(`${r.deleted}개 · ${fmtBytes(r.bytes)}를 비웠어요`);
      refreshUsage(true);
    } catch (e) { p.close(); toast((e as Error).message); }
  };

  return (
    <Page>
      <TopBar back title="사진 올리기 · 공유" />
      <div className={s.page}>
        {my.email ? (
          <>
            <div className={s.linked} data-f="drive-linked">
              <span className={s.linkedIcon}><DriveIcon size={30} /></span>
              <span className={s.two}><b>구글 드라이브와 연동됐어요</b><small data-f="drive-email">{my.email}</small></span>
            </div>

            <Group title="드라이브 공간" footer="구글 계정의 공간은 Gmail · 구글 포토와 함께 써요.">
              <div className={s.usage} data-f="drive-usage">
                {usage ? (
                  <>
                    <div className={s.usageTop}>
                      <b>{fmtBytes(usage.usage || 0)} 사용</b>
                      <span>{usage.limit ? `${fmtBytes(usage.limit)} 중` : '공간 제한 없음'}</span>
                    </div>
                    {usage.limit && (
                      <div className={s.meter} role="img" aria-label={`${fmtBytes(usage.limit)} 중 ${fmtBytes(usage.usage || 0)} 사용`}>
                        <i className={s.mApp} style={{ width: pct(usage.appBytes, usage.limit) }} />
                        <i className={s.mOther} style={{ width: pct(Math.max(0, (usage.usage || 0) - usage.appBytes), usage.limit) }} />
                      </div>
                    )}
                    <ul className={s.legend}>
                      <li><i className={s.mApp} />이 앱으로 올린 사진·동영상<b>{fmtBytes(usage.appBytes)}</b></li>
                      <li><i className={s.mOther} />다른 파일 (Gmail · 구글 포토 포함)<b>{fmtBytes(Math.max(0, (usage.usage || 0) - usage.appBytes))}</b></li>
                      {usage.limit && (
                        <li><i className={s.mFree} />남은 공간<b>{fmtBytes(Math.max(0, usage.limit - (usage.usage || 0)))}</b></li>
                      )}
                    </ul>
                    {usage.limit && (
                      <p className={s.usageHint} data-f="drive-room">
                        {usage.limit - (usage.usage || 0) > 0
                          ? `사진을 약 ${Math.floor((usage.limit - (usage.usage || 0)) / perPhoto(usage)).toLocaleString('ko-KR')}장 더 올릴 수 있어요`
                          : '공간이 가득 찼어요. 아래에서 정리해 주세요'}
                        {usage.partial ? ' (파일이 많아 일부만 셌어요)' : ''}
                      </p>
                    )}
                  </>
                ) : usageErr ? (
                  <p className={s.usageHint}>{usageErr} <button type="button" className={s.inlineBtn} onClick={() => refreshUsage(true)}>다시 시도</button></p>
                ) : <p className={s.usageHint}>공간을 확인하는 중…</p>}
              </div>
              {!!usage?.trashFiles && (
                <Row icon={<Icon name="trash" size={22} />} label="앱에서 지운 사진 완전히 지우기" detail={`${usage.trashFiles}개 · ${fmtBytes(usage.trashBytes)}`} onClick={purge} data-row="purge" />
              )}
              <Row icon={<Icon name="link" size={22} />} label="구글 저장공간 관리" onClick={() => window.open(STORAGE_MANAGE_URL, '_blank', 'noopener')} data-row="manage" />
            </Group>

            <Group title="공유 폴더" footer="Pastel Memories 폴더와 앨범 폴더는 ‘링크가 있는 사람 보기’로 자동 공유돼요. 링크는 앱 안에만 있고 검색되지 않아요.">
              {my.root && <Row icon={<Icon name="link" size={22} />} label="드라이브에서 Pastel Memories 폴더 열기" onClick={() => window.open(driveFolderLink(my.root!), '_blank', 'noopener')} data-row="open-folder" />}
            </Group>

            <Group title="연동된 구글 계정">
              <Row icon={<GoogleIcon size={20} />} label={my.email} chevron={false} />
              <Row label="다른 구글 계정으로 바꾸기" onClick={reconnect} data-row="switch" />
              <Row label="연동 해제" onClick={disconnect} danger chevron={false} data-row="disconnect" />
            </Group>
          </>
        ) : (
          <>
          {setup && setup.state !== 'ready' ? (
            // 아직 준비 전: 무엇이 문제인지 · 누가 할 일인지 · 직접 확인하는 방법
            <div className={s.driveCard} data-drive={setup.state}>
              <DriveIcon size={34} />
              <b>아직 구글 드라이브 연동을 할 수 없어요</b>
              <p>앱을 만든 분이 Supabase 설정을 마치면 여기에 <b>구글 드라이브 연동</b> 버튼이 생겨요. 가족은 기다려 주세요.</p>
              <div className={s.setupBox} data-f="drive-help">
                <b>지금 문제</b>
                <p>{setupHelp(setup)}</p>
                {checkable(setup.state) && (
                  <ol>
                    <li><b>직접 확인하기</b>를 누르면 새 창에 글자가 나와요</li>
                    <li><code>not_signed_in</code>: 정상이에요 → 여기서 <b>다시 확인</b></li>
                    <li><code>NOT_FOUND</code>: 이 프로젝트에 <b>drive</b> 함수가 없어요 → 설명서 6-4</li>
                    <li><code>401</code> · <code>JWT</code>: Verify JWT가 켜져 있어요 → 설명서 6-5</li>
                  </ol>
                )}
              </div>
              <div className={s.setupBtns}>
                {checkable(setup.state) && <Button variant="secondary" onClick={() => window.open(driveCheckUrl(), '_blank', 'noopener')} data-f="drive-check">직접 확인하기</Button>}
                <Button onClick={recheck} data-f="drive-recheck">다시 확인</Button>
              </div>
            </div>
          ) : (
            <div className={s.driveCard} data-drive={setup?.state ?? 'loading'}>
              <DriveIcon size={34} />
              <b>구글 드라이브와 연동하기</b>
              <p>사진·동영상은 올린 사람의 구글 드라이브에 저장되고, 앨범 멤버와 함께 봐요. 연동하면 내 드라이브에 <b>Pastel Memories</b> 폴더와 앨범 폴더가 생겨요. 비용은 들지 않아요.</p>
              <ol className={s.driveSteps}>
                <li>아래 <b>구글 드라이브 연동</b>을 누르고 <b>구글 계정</b>을 골라요</li>
                <li><b>‘Google Drive’</b> 항목에 체크하고 <b>계속</b></li>
              </ol>
              <Button onClick={connect} disabled={!setup} className={s.googleBtn} data-f="drive-connect"><GoogleIcon size={18} />{setup ? '구글 드라이브 연동' : '확인 중…'}</Button>
              {warn && <p className={s.driveHelp} data-f="drive-warn">{warn}</p>}
              {/* 관리자용: 구글 창에 'OAuth client was not found'가 뜨면 구글 클라우드의 ID와 한 글자씩 비교해요 */}
              {owner && setup?.state === 'ready' && <p className={`${s.driveHelp} ${s.clientId}`} data-f="drive-client-id">이 앱이 쓰는 클라이언트 ID<br />{setup.clientId}</p>}
            </div>
          )}
          {me?.provider === 'kakao' && (
            <p className={s.kakaoNote} data-f="kakao-note">카카오로 로그인한 분도 지금처럼 사진·동영상을 보고, 좋아요·댓글을 할 수 있어요. 사진을 올리려면 여기서 구글 드라이브와 한 번 연동해 주세요. 카카오 로그인은 그대로예요.</p>
          )}
          </>
        )}
        {/* 어디에 어떻게 저장·공유되는지 */}
        <div className={s.howCard} data-f="drive-how">
          <b>이렇게 저장·공유돼요</b>
          <ol>
            <li>사진·동영상은 올린 사람 드라이브의 <b>Pastel Memories › 앨범 이름</b> 폴더에 원본 그대로 들어가요</li>
            <li>폴더는 ‘링크가 있는 사람 보기’로 자동 공유돼서, 앨범 멤버가 앱에서 보고 내려받아요. 따로 공유 버튼을 누르지 않아도 돼요</li>
            <li>앱이 쓰는 작은 사진은 그 안의 <b>앱용 작은 사진</b> 폴더에 있어요</li>
            <li>드라이브에서 폴더나 사진을 지우면 앱에서도 안 보여요</li>
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
