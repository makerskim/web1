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
import { babyAge, babyDay, babyMilestone, babyMonths, fmtDate } from '../lib/dates';
import { childName, ddayText, dueInfo, dueStatus, isBorn, needsName, weeksLabel, type Child, type DueInfo } from '../lib/kids';
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

// '2026년 12월 24일 목요일' → { year: '2026년', date: '12월 24일 목요일' }
const splitDate = (v: string) => {
  const [year, ...rest] = fmtDate(v, true).split(' ');
  return { year, date: rest.join(' ') };
};

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
  const unbornKids = kids.filter((c) => c.birthday && !isBorn(c));
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

  return (
    <Page>
      <TopBar large title={<AmpText className={s.title} text={album.name} />} right={<IconButton icon="settings" label="설정" onClick={() => nav('/settings')} />} />

      <section className={s.profile}>
        <div className={s.head}>
          {isOwner
            ? <button className={s.cover} onClick={cover.open} aria-label="앨범 사진 바꾸기" data-f="cover"><CoverFace size={104} /><span className={s.coverEdit}><Icon name="camera" size={15} stroke={2.2} /></span></button>
            : <div className={s.cover}><CoverFace size={104} /></div>}
          <div className={s.who}>
            <h2 className={s.names} data-f="names"><AmpText text={names} /></h2>
            {status
              ? <p className={s.status} data-f="status">{status}</p>
              : isOwner && !kids.some((c) => c.birthday) && <button className={s.link} onClick={editProfile} data-f="due-add">+ 예정일·생일 넣기</button>}
          </div>
        </div>

        {album.bio
          ? <p className={s.bio} data-f="bio">{album.bio}</p>
          : isOwner && <button className={s.link} onClick={editProfile} data-f="bio-add">+ 소개 쓰기</button>}

        {unnamed && (
          <button className={s.born} onClick={editProfile} data-f="born">
            <span className={s.bornIcon}>🎉</span>
            <span><b>{subj(childName(unnamed))} 태어났어요!</b><small>이름을 넣으면 앨범에 이름으로 보여요</small></span>
            <Icon name="right" size={18} stroke={2.2} />
          </button>
        )}

        {unbornKids.length > 0 && <DueCard kids={unbornKids} label={label} onBorn={isOwner ? editProfile : undefined} />}
        {bornKids.length > 0 && <BirthdayCard kids={bornKids} label={label} />}

        <div className={s.stats}>
          <button onClick={() => gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-stat="photos">
            <b>{photoCount?.toLocaleString() ?? '–'}</b><span>사진</span>
          </button>
          <button onClick={() => setSheet('members')} data-stat="members"><b>{members.length}</b><span>가족</span></button>
          {together !== null && together >= 1 && <div data-stat="days"><b>{together.toLocaleString()}</b><span>함께한 날</span></div>}
        </div>

        <div className={s.btns}>
          {isOwner
            ? <button className={s.btn} onClick={editProfile} data-f="edit-profile">프로필 편집</button>
            : <button className={s.btn} onClick={() => setSheet('profile')} data-f="me">내 프로필</button>}
          <button className={s.btn} onClick={() => setSheet('invite')} data-f="invite">가족 초대</button>
        </div>
      </section>

      <div ref={gridTop} className={s.gridTop} />
      <nav className={s.tabs} role="tablist" aria-label="사진 보기">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? s.tabOn : ''} onClick={() => setTab(t.id)} data-tab-grid={t.id}>
            <Icon name={t.icon} size={22} stroke={tab === t.id ? 2.2 : 1.8} filled={t.id === 'liked' && tab === t.id} />
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

// ---------- 출산 예정일: 날짜는 크게, D-day, 0주 → 40주 막대 ----------
// 쌍둥이처럼 예정일이 같으면 날짜 하나, 아이마다 다르면 한 줄씩
function DueCard({ kids, label, onBorn }: { kids: Child[]; label: (c: Child) => string; onBorn?: () => void }) {
  const rows = kids.map((c) => ({ c, info: dueInfo(c)! })).filter((r) => r.info).sort((a, b) => a.info.daysLeft - b.info.daysLeft);
  if (!rows.length) return null;
  const same = rows.every((r) => r.c.birthday === rows[0].c.birthday);
  const first = rows[0];
  const one = splitDate(first.c.birthday!);
  return (
    <section className={s.due} data-f="due" aria-label="출산 예정일">
      {same ? (
        <div className={s.dueTop}>
          <div className={s.dueWhen}>
            <span className={s.dueLabel}>출산 예정일 <em>{one.year}</em></span>
            <b className={s.dueDate}>{one.date}</b>
          </div>
          <b className={s.dday} data-f="dday">{ddayText(first.info)}</b>
        </div>
      ) : (
        <>
          <span className={s.dueLabel}>출산 예정일</span>
          <ul className={s.dueList}>
            {rows.map(({ c, info }) => {
              const d = splitDate(c.birthday!);
              return (
                <li key={c.id} data-due-kid={c.id}>
                  <b>{label(c)}</b>
                  <span>{d.date}<small>{d.year}</small></span>
                  <em>{ddayText(info)}</em>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Weeks info={first.info} who={same ? '' : label(first.c)} />
      {/* 예정일이 됐거나 지났으면: 관리자가 바로 '태어났어요'로 바꿀 수 있게 */}
      {onBorn && first.info.daysLeft <= 0 && (
        <button type="button" className={s.bornSet} onClick={onBorn} data-f="born-set">
          👶 태어났어요! 생일 넣기 <Icon name="right" size={16} stroke={2.4} />
        </button>
      )}
    </section>
  );
}

function Weeks({ info, who }: { info: DueInfo; who: string }) {
  const pct = `${(info.progress * 100).toFixed(1)}%`;
  const now = weeksLabel(info) || '두근두근 기다리는 중';
  return (
    <div className={s.weeks}>
      <div className={s.track} role="progressbar" aria-label={`${who ? `${who} ` : ''}${now}`} aria-valuemin={0} aria-valuemax={40} aria-valuenow={info.week}>
        <i className={s.fill} style={{ width: pct }} />
        <i className={s.knob} style={{ left: pct }} />
      </div>
      <div className={s.weekText}>
        <b>{who && <span>{who} · </span>}{now}</b>
        <span>40주</span>
      </div>
    </div>
  );
}

// ---------- 태어난 뒤: 생일 카드 (가볍게) ----------
function BirthdayCard({ kids, label }: { kids: Child[]; label: (c: Child) => string }) {
  const same = kids.every((c) => c.birthday === kids[0].birthday);
  const b = kids[0].birthday!;
  const day = babyDay(b) || 1;
  const m = babyMilestone(b);
  const note = day === 1 ? '오늘 태어났어요! 축하해요 🎉' : m ? `오늘은 ${m}이에요! 🎉` : `오늘로 ${day.toLocaleString()}일째예요`;
  return (
    <section className={s.bday} data-f="birthday" aria-label="생일">
      <span className={s.bdayIcon} aria-hidden="true">🎂</span>
      {same ? (
        <span className={s.bdayText}><b>{fmtDate(b)} 태어났어요</b><small>{note}</small></span>
      ) : (
        <ul className={s.bdayList}>
          {kids.map((c) => (
            <li key={c.id}><b>{label(c)}</b> {fmtDate(c.birthday)} · {(babyDay(c.birthday) || 1).toLocaleString()}일째</li>
          ))}
        </ul>
      )}
    </section>
  );
}
