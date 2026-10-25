// 가족 탭: 인스타그램 프로필처럼 — 앨범 사진 · 아이 이름 · 소개 · 출산 예정일 · 큰 숫자 · 버튼 · 사진 그리드
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Bars';
import { Photo } from '../components/Photo';
import { VideoMark } from '../components/Video';
import { Icon, type IconName } from '../components/Icon';
import { FilterBar, NO_FILTER, matches, type Filter } from '../components/Filters';
import { AmpText, CoverFace, MembersSheet, useCoverChanger } from '../components/AlbumBits';
import { useAlbum, useSession } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { ageLabel, babyDay, fmtDate, nextMilestone, spanLabel, ymd } from '../lib/dates';
import { albumSince } from '../lib/album';
import { bornWeeks, childName, dueInfo, dueStatus, isBorn, kidsPatch, needsName, newChild, weeksLabel, weeksText, type Child } from '../lib/kids';
import { DatePickerSheet } from '../components/DatePicker';
import { toast } from '../components/ui';
import { subj } from '../lib/korean';
import { InviteSheet } from './Invite';
import { ProfileSheet } from './Settings';
import s from './AlbumHome.module.css';

type Tab = 'all' | 'liked';
interface Journey { f: string; left: string; right: string; sub: string; progress: number }
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

  // 가족·모임 앨범: 아이 대신 시작일부터 함께한 날
  const isGroup = album.kind !== 'baby';
  const kids = isGroup ? [] : album.children || [];
  const today = ymd(new Date());
  const label = (c: Child) => childName(c) || ORDER[kids.indexOf(c)] || '아이';
  // 아이 정보가 없는 예전 앨범은 앨범 날짜로 한 아이를 만들어 보여요
  const all: Child[] = kids.length ? kids : !isGroup && album.babyBirthday ? [newChild({ id: 'legacy', birthday: album.babyBirthday, born: undefined })] : [];
  // 크게 보일 아이: 기다리는 아기(예정일이 가장 가까운)가 있으면 그 아이, 모두 태어났으면 막내
  const unborn = all.filter((c) => c.birthday && !isBorn(c)).sort((a, b) => a.birthday!.localeCompare(b.birthday!));
  const youngest = all.filter((c) => c.birthday && isBorn(c)).sort((a, b) => b.birthday!.localeCompare(a.birthday!))[0];
  const focus: Child | null = unborn[0] || youngest || all[0] || null;
  // 같은 날·같은 상태인 아이들(쌍둥이)은 한 묶음으로
  const group = focus ? all.filter((c) => c === focus || (!!focus.birthday && c.birthday === focus.birthday && isBorn(c) === isBorn(focus))) : [];
  const bday = focus?.birthday ?? null;
  const born = !!focus && !!bday && isBorn(focus);
  const due = focus ? dueInfo(focus) : null;
  const day = bday ? babyDay(bday) : null;
  // 묶음이 아이들 전부가 아니면 누구 이야기인지 이름을 붙여요 ('튼튼이 만나기까지 90일')
  const groupName = group.map(label).join(' & ');
  const who = all.length > 1 && group.length < all.length ? `${groupName} ` : '';
  const since = isGroup ? albumSince(album) : null;
  const sday = since ? babyDay(since) : null;
  // 세 번째 숫자: 태어나기 전 'D-64 만나기까지' · 예정일 지나면 'D+3 예정일 지남' · 태어난 뒤(모임은 시작한 뒤) '95일 함께한 날'
  const dStat = isGroup
    ? (sday === null ? null : sday >= 1 ? { value: `${sday.toLocaleString()}일`, label: '함께한 날' } : { value: `D-${(1 - sday).toLocaleString()}`, label: '시작까지' })
    : due
      ? (due.daysLeft > 0 ? { value: `D-${due.daysLeft.toLocaleString()}`, label: '만나기까지' }
        : due.daysLeft === 0 ? { value: 'D-day', label: '오늘 예정일' } : { value: `D+${(-due.daysLeft).toLocaleString()}`, label: '예정일 지남' })
      : born && day !== null ? { value: `${day.toLocaleString()}일`, label: '함께한 날' } : null;
  const shortDate = (v: string) => (v.slice(0, 4) === today.slice(0, 4) ? fmtDate(v, true).replace(/^\d{4}년 /, '') : fmtDate(v, true));
  // 나이는 날까지 정확하게 ('생후 4개월 22일')
  const age = born && bday ? ageLabel(bday) : '';
  // 날짜 카드 (간단하게): 위 한 줄 '임신 27주 6일 · 25% 남았어요', 막대, 아래 한 줄 '12월 24일 목요일 출산 예정'
  const nextText = (n: { label: string; daysLeft: number } | null) => (n ? (n.daysLeft ? `${n.label}까지 ${n.daysLeft.toLocaleString()}일` : `오늘은 ${n.label}이에요 🎉`) : '');
  const journey = ((): Journey | null => {
    if (isGroup) {
      if (!since || sday === null) return null;
      const next = nextMilestone(since, 'together');
      return {
        f: 'since',
        left: sday >= 1 ? `함께한 지 ${spanLabel(since)}` : `시작까지 ${(1 - sday).toLocaleString()}일`,
        right: nextText(next),
        sub: sday >= 1 ? `${fmtDate(since)}부터 함께해요` : `${fmtDate(since)}에 시작해요`,
        progress: next?.progress ?? 0,
      };
    }
    if (due) {
      const dl = due.daysLeft;
      // 하루라도 남았으면 1% 이상으로 (D-1에 '0% 남았어요'가 되지 않게)
      const left = Math.max(1, 100 - Math.round(due.progress * 100));
      return {
        f: 'due',
        // '임신 27주 6일' (병원에서 말하는 주수 그대로)
        left: `임신 ${weeksText(due.week, due.day)}`,
        right: dl > 0 ? `${left}% 남았어요` : dl === 0 ? '오늘 출산 예정일' : `예정일 ${(-dl).toLocaleString()}일 지남`,
        sub: `${who}${shortDate(bday!)} 출산 예정${dl < 0 ? '이었어요' : ''}${due.custom && dl > 0 ? ` · ${weeksText(due.dueWeek, due.dueDay)}` : ''}`,
        progress: due.progress,
      };
    }
    if (born && bday) {
      const next = nextMilestone(bday, 'baby');
      const bw = focus ? bornWeeks(focus) : '';
      return {
        f: 'birthday', left: age, right: nextText(next),
        sub: `🎂 ${who}${fmtDate(bday)} 태어났어요${bw ? ` · ${bw}` : ''}`,
        progress: next?.progress ?? 0,
      };
    }
    return null;
  })();
  // 다가오는 기념일 (설정에서 넣은 것): 가까운 두 개
  const pct = journey ? Math.round(journey.progress * 1000) / 10 : 0;
  // 다른 아이들(형·누나, 예정일이 다른 동생)은 작게 한 줄씩 (많으면 3줄까지)
  const otherGroups = new Map<string, Child[]>();
  for (const c of all) {
    if (!c.birthday || group.includes(c)) continue;
    const k = `${isBorn(c)}|${c.birthday}`;
    otherGroups.set(k, [...(otherGroups.get(k) || []), c]);
  }
  const otherLines = [...otherGroups.entries()].slice(0, 3).map(([k, cs]) => {
    const c = cs[0];
    const n = cs.map(label).join(' & ');
    const i = dueInfo(c);
    return { key: k, text: i ? `👶 ${n} · ${[weeksLabel(i), dueStatus(i)].filter(Boolean).join(' · ')} (${shortDate(c.birthday!)} 예정)` : `🎂 ${n} · ${ageLabel(c.birthday!)}` };
  });
  const unnamed = isOwner ? kids.find(needsName) : undefined;
  // 아기 앨범인데 날짜가 하나도 없으면 (예: 가족 앨범에서 바꾼 직후) 넣어 달라고 해요
  const noBabyInfo = isOwner && !isGroup && !all.some((c) => c.birthday);
  const postCount = tiles?.length;
  const base = useMemo(() => (tiles || []).filter((t) => tab === 'all' || t.likedBy.includes(me.id)), [tiles, tab, me.id]);
  // 생후 N개월로 거르기: 태어난 뒤에만 (그 전엔 출산 예정일이에요)
  const birthday = album.kind === 'baby' && album.babyBirthday && album.babyBirthday <= ymd(new Date()) ? album.babyBirthday : null;
  const shown = useMemo(() => base.filter((t) => matches(filter, t, birthday)), [base, filter, birthday]);
  const names = isGroup ? album.name : album.babyName || album.name;
  const editProfile = () => nav('/settings/album/info');

  // 예정일이 지났을 때 '태어났나요?' → 태어난 날만 고르면 돼요 (그 아이와 쌍둥이만). 다른 건 모두 '프로필 편집'에서
  type DateMode = 'born';
  const [dp, setDp] = useState<{ mode: DateMode; ids: string[] } | null>(null);
  const openDp = (mode: DateMode) => setDp({ mode, ids: group.map((c) => c.id) });
  const saving = useRef(false);
  const saveDate = async (mode: DateMode, v: string, ids: string[]) => {
    if (saving.current) return; // 두 번 눌러도 한 번만
    saving.current = true;
    const albumId = album.id;
    const nowBorn = mode === 'born';
    const next = kids.length
      ? kids.map((c) => (ids.includes(c.id) ? { ...c, birthday: v, born: nowBorn } : c))
      : [newChild({ birthday: v, born: nowBorn })];
    try {
      await api.updateAlbum(albumId, { children: next });
      // 그사이 다른 앨범으로 옮겼으면 화면은 건드리지 않아요 (다음에 불러올 때 반영돼요)
      if (useSession.getState().albumId === albumId) useSession.getState().patchAlbum(kidsPatch(next));
      toast('축하해요! 🎉 이름도 넣어 주세요');
    } catch (e) { toast((e as Error).message); } finally { saving.current = false; }
  };

  return (
    <Page>

      <section className={s.profile}>
        <div className={s.head}>
          {isOwner
            ? <button className={s.cover} onClick={cover.open} aria-label="앨범 사진 바꾸기" data-f="cover"><CoverFace size={88} /><span className={s.coverEdit}><Icon name="camera" size={13} stroke={2.2} /></span></button>
            : <div className={s.cover}><CoverFace size={88} /></div>}
          {/* 인스타그램처럼: 이름 옆에 설정 */}
          <div className={s.nameRow}>
            <h2 className={`${s.names} ${all.length > 2 ? s.namesMany : ''}`} data-f="names"><AmpText text={names} /></h2>
            <button className={s.gear} onClick={() => nav('/settings')} aria-label="설정" data-f="settings"><Icon name="settings" size={24} /></button>
          </div>
          {/* 인스타그램처럼 숫자 위, 이름 아래: 게시물 · 멤버 · D-64 */}
          <div className={s.stats}>
            <button onClick={() => gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-stat="posts">
              <b>{postCount?.toLocaleString() ?? '–'}</b><span>게시물</span>
            </button>
            <button onClick={() => setSheet('members')} data-stat="members"><b>{members.length}</b><span>멤버</span></button>
            {dStat && <div className={s.dStat} data-stat="dday"><b>{dStat.value}</b><span>{dStat.label}</span></div>}
          </div>
        </div>

        {journey && (
          <div className={s.journey} data-f={journey.f}>
            <div className={s.jHead}><b data-f="j-left">{journey.left}</b>{journey.right && <span data-f="j-right">{journey.right}</span>}</div>
            <div className={s.jTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${journey.left}, ${journey.right}`}>
              <i className={s.jFill} style={{ width: `${pct}%` }} />
            </div>
            <p className={s.jSub} data-f="j-sub">{journey.sub}</p>
          </div>
        )}
        {/* 생일 · 기념일은 홈 맨 위 공지로 (7일 전부터 그날까지) */}
        {otherLines.length > 0 && (
          <ul className={s.dates}>
            {otherLines.map((l) => <li key={l.key} data-kid-line>{l.text}</li>)}
          </ul>
        )}

        {album.bio && <p className={s.bio} data-f="bio">{album.bio}</p>}

        {/* 예정일이 됐거나 지났으면: 태어났는지 물어봐요 */}
        {isOwner && due && due.daysLeft <= 0 && (
          <button className={s.banner} onClick={() => openDp('born')} data-f="born-set">
            <span aria-hidden="true">👶</span><b>{who ? subj(groupName) : '아기가'} 태어났나요? 생일 넣기</b><Icon name="right" size={16} stroke={2.4} />
          </button>
        )}
        {noBabyInfo && (
          <button className={s.banner} onClick={editProfile} data-f="baby-info">
            <span aria-hidden="true">👶</span><b>아기 정보를 넣어 주세요 · 태명과 출산 예정일</b><Icon name="right" size={16} stroke={2.4} />
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
          <button className={s.btn} onClick={() => setSheet('invite')} data-f="invite">초대하기</button>
        </div>
      </section>

      {/* 태어난 날 고르기 */}
      {isOwner && (
        <DatePickerSheet open={!!dp} onClose={() => setDp(null)} title={`${who}언제 태어났나요?`}
          value={today} min="2000-01-01" max={today}
          onChange={(v) => { if (v && dp) saveDate(dp.mode, v, dp.ids); }} />
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
      {/* 왼쪽: 몇 개인지(고르면 고른 것) · 오른쪽: 올린 사람 · 날짜 아이콘 */}
      {!!base.length && <FilterBar value={filter} onChange={setFilter} items={base} shown={shown.length} label={tab === 'liked' ? '좋아요한 게시물' : '게시물'} unit="개" birthday={birthday} />}

      {err && !tiles ? (
        <div className={s.empty}><p>사진을 불러오지 못했어요</p><button className={s.link} onClick={() => setReload((n) => n + 1)}>다시 불러오기</button></div>
      ) : tiles === null ? <div className={s.loading} /> : shown.length ? (
        <div className={s.grid}>
          {shown.map((t) => (
            <button key={t.id} className={s.tile} onClick={() => nav(`/p/${t.id}`)} aria-label="게시물 보기" data-tile={t.id}>
              <Photo albumId={album.id} path={t.first.thumb} ph={t.first.ph} className={s.tileImg} />
              {t.count > 1 && <Icon name="layers" size={18} className={s.multi} />}
              <VideoMark item={t.first} />
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
