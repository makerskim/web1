// 가족 탭: 인스타그램 프로필처럼 — 앨범 사진 · 아이 이름 · 소개 · 출산 예정일 · 큰 숫자 · 버튼 · 사진 그리드
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, TopBar, IconButton } from '../components/Bars';
import { Photo } from '../components/Photo';
import { Icon, type IconName } from '../components/Icon';
import { FilterChips, NO_FILTER, matches, type Filter } from '../components/Filters';
import { AmpText, CoverFace, MembersSheet, useCoverChanger } from '../components/AlbumBits';
import { useAlbum, useSession } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { babyAge, babyDay, babyMonths, fmtDate, ymd } from '../lib/dates';
import { childName, dueInfo, dueStatus, isBorn, kidsPatch, needsName, newChild, weeksLabel, type Child } from '../lib/kids';
import { DatePickerSheet } from '../components/DatePicker';
import { menu, toast } from '../components/ui';
import { subj } from '../lib/korean';
import { InviteSheet } from './Invite';
import { ProfileSheet } from './Settings';
import s from './AlbumHome.module.css';

type Tab = 'all' | 'liked';
const TABS: Array<{ id: Tab; icon: IconName; label: string }> = [
  { id: 'all', icon: 'grid', label: '게시물' },
  { id: 'liked', icon: 'heart', label: '좋아요' },
];
const ORDER = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];


export function AlbumHome() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const members = useSession((st) => st.members);
  const isOwner = album.myRole === 'owner';
  const postsVersion = usePosts((st) => st.list.length + st.list.join().length);
  const [tiles, setTiles] = useState<api.PostTile[] | null>(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<Tab>('all');
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [sheet, setSheet] = useState<'members' | 'invite' | 'profile' | null>(null);
  const gridTop = useRef<HTMLDivElement>(null);
  const cover = useCoverChanger();
  const nav = useNavigate();

  useEffect(() => { useSession.getState().loadMembers().catch(() => {}); }, [album.id]);
  useEffect(() => {
    let live = true;
    setErr('');
    api.postTiles(album.id).then((l) => live && setTiles(l), (e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [album.id, postsVersion, reload]);

  // 나이·디데이는 첫째 아이 기준
  const kids = album.children || [];
  const first: Pick<Child, 'birthday' | 'born'> = kids[0] || { birthday: album.babyBirthday ?? null };
  const bday = first.birthday ?? null;
  const day = bday ? babyDay(bday) : null;
  // 태어났는지는 '태어났어요'를 눌렀는지로 (예정일이 지나도 아직 뱃속일 수 있어요)
  const born = !!bday && isBorn(first);
  const months = bday ? babyMonths(bday) : null;
  const due = dueInfo(first);
  const status = due ? dueStatus(due)
    : !born || months === null || day === null ? '' : months >= 24 ? babyAge(bday!) : months >= 1 ? `생후 ${months}개월` : `생후 ${day}일`;
  const bornKids = kids.filter((c) => c.birthday && isBorn(c));
  // '함께한 날'은 태어난 아이 중 맏이 기준 (첫째가 아직 뱃속이어도 형·누나가 있으면 보여요)
  const eldest = [...bornKids].sort((a, b) => a.birthday!.localeCompare(b.birthday!))[0];
  const together = eldest ? babyDay(eldest.birthday) : null;
  const unnamed = isOwner ? kids.find(needsName) : undefined;
  const photoCount = tiles?.reduce((n, t) => n + t.count, 0);
  const base = useMemo(() => (tiles || []).filter((t) => tab === 'all' || t.likedBy.includes(me.id)), [tiles, tab, me.id]);
  const shown = useMemo(() => base.filter((t) => matches(filter, t)), [base, filter]);
  const names = album.babyName || album.name;
  const editProfile = () => nav('/settings/album/info');
  const label = (c: Child) => childName(c) || ORDER[kids.indexOf(c)] || '아이';

  // 날짜 한 줄씩: 첫째(쌍둥이면 함께) + 예정일이 다른 아이
  const today = ymd(new Date());
  const dueMax = ymd(new Date(Date.now() + 300 * 86400000));
  const dateLines: Array<{ key: string; kind: 'due' | 'birthday'; text: string }> = [];
  const seen = new Set<string>();
  for (const c of kids) {
    if (!c.birthday) continue;
    const b = isBorn(c);
    const k = `${b}|${c.birthday}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const who = kids.length > 1 && dateLines.length > 0 ? `${label(c)} ` : '';
    if (b) {
      dateLines.push({ key: k, kind: 'birthday', text: `🎂 ${who}${fmtDate(c.birthday)} 태어났어요` });
    } else {
      const i = dueInfo(c);
      const w = i && i.daysLeft > 0 ? weeksLabel(i) : '';
      const when = fmtDate(c.birthday).replace(/^\d{4}년 /, (y) => (c.birthday!.slice(0, 4) === today.slice(0, 4) ? '' : y));
      dateLines.push({ key: k, kind: 'due', text: `🗓️ ${who}${when} 출산 예정${w ? ` · ${w}` : ''}${who && i ? ` · ${dueStatus(i)}` : ''}` });
    }
  }

  // 관리자: '만나기까지'를 누르면 예정일 바꾸기 / 태어났어요 / 생일 바꾸기
  const [dp, setDp] = useState<'due' | 'born' | 'bday' | null>(null);
  const editDates = async () => {
    const items: Array<{ label: string; value: 'due' | 'born' | 'bday' | 'edit'; icon: IconName }> = born
      ? [{ label: '생일 바꾸기', value: 'bday', icon: 'calendar' }]
      : [{ label: '출산 예정일 바꾸기', value: 'due', icon: 'calendar' }, { label: '태어났어요! 생일 넣기', value: 'born', icon: 'sparkles' }];
    items.push({ label: '프로필 편집 (이름·소개)', value: 'edit', icon: 'edit' });
    const v = await menu(items, born ? '생일' : '출산 예정일');
    if (v === 'edit') editProfile();
    else if (v) setDp(v);
  };
  // 첫째(그리고 같은 날인 쌍둥이)의 날짜를 바꿔요. 아이 정보가 없으면 새로 만들어요
  const saveDate = async (mode: 'due' | 'born' | 'bday', v: string) => {
    const t = kids[0];
    const same = (c: Child) => !!t && c.birthday === t.birthday && isBorn(c) === isBorn(t);
    const next = t ? kids.map((c) => (same(c) ? { ...c, birthday: v, born: mode !== 'due' } : c)) : [newChild({ birthday: v, born: mode !== 'due' })];
    try {
      await api.updateAlbum(album.id, { children: next });
      useSession.getState().patchAlbum(kidsPatch(next));
      toast(mode === 'born' ? '축하해요! 🎉 이름도 넣어 주세요' : mode === 'due' ? '출산 예정일을 바꿨어요' : '생일을 바꿨어요');
    } catch (e) { toast((e as Error).message); }
  };

  return (
    <Page>
      <TopBar large title={<AmpText className={s.title} text={album.name} />} right={<IconButton icon="settings" label="설정" onClick={() => nav('/settings')} />} />

      <section className={s.profile}>
        <div className={s.head}>
          {isOwner
            ? <button className={s.cover} onClick={cover.open} aria-label="앨범 사진 바꾸기" data-f="cover"><CoverFace size={88} /><span className={s.coverEdit}><Icon name="camera" size={13} stroke={2.2} /></span></button>
            : <div className={s.cover}><CoverFace size={88} /></div>}
          <div className={s.who}>
            <h2 className={s.names} data-f="names"><AmpText text={names} /></h2>
            {/* 만나기까지 · 생후: 크게. 관리자는 눌러서 예정일·생일을 바로 바꿔요 */}
            {status && (isOwner
              ? <button className={s.status} onClick={editDates} data-f="status" aria-haspopup="dialog">{status}<Icon name="edit" size={15} stroke={2.2} className={s.statusEdit} /></button>
              : <p className={s.status} data-f="status">{status}</p>)}
            {!status && isOwner && <button className={s.link} onClick={() => setDp('due')} data-f="due-add">+ 출산 예정일 넣기</button>}
            {/* 인스타그램처럼 숫자는 작게 한 줄로 */}
            <div className={s.stats}>
              <button onClick={() => gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-stat="photos">사진 <b>{photoCount?.toLocaleString() ?? '–'}</b>장</button>
              <button onClick={() => setSheet('members')} data-stat="members">가족 <b>{members.length}</b>명</button>
              {together !== null && together >= 1 && <span data-stat="days">함께한 지 <b>{together.toLocaleString()}</b>일</span>}
            </div>
          </div>
        </div>

        {/* 날짜 한 줄: '12월 24일 출산 예정 · 임신 30주 5일' / '2026년 6월 1일 태어났어요' */}
        {dateLines.length > 0 && (
          <ul className={s.dates}>
            {dateLines.map((l) => <li key={l.key} data-f={l.kind}>{l.text}</li>)}
          </ul>
        )}

        {album.bio
          ? <p className={s.bio} data-f="bio">{album.bio}</p>
          : isOwner && <button className={s.link} onClick={editProfile} data-f="bio-add">+ 소개 쓰기</button>}

        {/* 예정일이 됐거나 지났으면: 태어났는지 물어봐요 */}
        {isOwner && due && due.daysLeft <= 0 && (
          <button className={s.banner} onClick={() => setDp('born')} data-f="born-set">
            <span aria-hidden="true">👶</span><b>아기가 태어났나요? 생일 넣기</b><Icon name="right" size={16} stroke={2.4} />
          </button>
        )}
        {unnamed && (
          <button className={s.banner} onClick={editProfile} data-f="born">
            <span aria-hidden="true">🎉</span><b>{subj(childName(unnamed))} 태어났어요! 이름 넣기</b><Icon name="right" size={16} stroke={2.4} />
          </button>
        )}

        <div className={s.btns}>
          {isOwner
            ? <button className={s.btn} onClick={editProfile} data-f="edit-profile">프로필 편집</button>
            : <button className={s.btn} onClick={() => setSheet('profile')} data-f="me">내 프로필</button>}
          <button className={s.btn} onClick={() => setSheet('invite')} data-f="invite">가족 초대</button>
        </div>
      </section>

      {/* 예정일 바꾸기 · 태어난 날 넣기 · 생일 바꾸기 */}
      {isOwner && (
        <DatePickerSheet open={!!dp} onClose={() => setDp(null)}
          title={dp === 'born' ? '언제 태어났나요?' : dp === 'bday' ? '생일' : '출산 예정일'}
          value={dp === 'born' ? today : dp === 'due' ? (due ? bday : null) : bday}
          min={dp === 'due' ? today : '2000-01-01'} max={dp === 'due' ? dueMax : today}
          onChange={(v) => { if (v && dp) saveDate(dp, v); }} />
      )}

      <div ref={gridTop} className={s.gridTop} />
      <nav className={s.tabs} role="tablist" aria-label="사진 보기">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? s.tabOn : ''} onClick={() => setTab(t.id)} data-tab-grid={t.id}>
            <Icon name={t.icon} size={20} stroke={tab === t.id ? 2.2 : 1.8} filled={t.id === 'liked' && tab === t.id} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {!!base.length && <FilterChips value={filter} onChange={setFilter} items={base} unit="개" />}

      {err && !tiles ? (
        <div className={s.empty}><p>사진을 불러오지 못했어요</p><button className={s.link} onClick={() => setReload((n) => n + 1)}>다시 불러오기</button></div>
      ) : tiles === null ? <div className={s.loading} /> : shown.length ? (
        <div className={s.grid}>
          {shown.map((t) => (
            <button key={t.id} className={s.tile} onClick={() => nav(`/p/${t.id}`)} aria-label="게시물 보기" data-tile={t.id}>
              <Photo albumId={album.id} path={t.first.thumb} ph={t.first.ph} className={s.tileImg} />
              {t.count > 1 && <Icon name="layers" size={18} className={s.multi} />}
            </button>
          ))}
        </div>
      ) : (
        <div className={s.empty}>
          {base.length
            ? <><p>조건에 맞는 사진이 없어요</p><button className={s.link} onClick={() => setFilter(NO_FILTER)}>거르기 풀기</button></>
            : <p>{tab === 'liked' ? '좋아요를 누른 사진이 여기에 모여요' : '아래 + 버튼으로 첫 사진을 올려 보세요'}</p>}
        </div>
      )}

      {cover.ui}
      <MembersSheet open={sheet === 'members'} onClose={() => setSheet(null)} />
      <InviteSheet open={sheet === 'invite'} onClose={() => setSheet(null)} />
      <ProfileSheet open={sheet === 'profile'} onClose={() => setSheet(null)} />
    </Page>
  );
}
