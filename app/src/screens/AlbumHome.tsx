// 가족 탭: 인스타그램 프로필처럼 — 앨범 사진 · 숫자 · 아이 소개 · 버튼 · 사진 그리드
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, TopBar, IconButton } from '../components/Bars';
import { Photo } from '../components/Photo';
import { Icon, type IconName } from '../components/Icon';
import { FilterChips, NO_FILTER, matches, type Filter } from '../components/Filters';
import { CoverFace, MembersSheet, useCoverChanger } from '../components/AlbumBits';
import { useAlbum, useSession } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { babyAge, babyDay, babyMonths, fmtDate } from '../lib/dates';
import { InviteSheet } from './Invite';
import { ProfileSheet } from './Settings';
import s from './AlbumHome.module.css';

type Tab = 'all' | 'liked';
const TABS: Array<{ id: Tab; icon: IconName; label: string }> = [
  { id: 'all', icon: 'grid', label: '게시물' },
  { id: 'liked', icon: 'heart', label: '좋아요한' },
];

export function AlbumHome() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const members = useSession((st) => st.members);
  const isOwner = album.myRole === 'owner';
  const postsVersion = usePosts((st) => st.list.length + st.list.join().length);
  const [tiles, setTiles] = useState<api.PostTile[] | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [sheet, setSheet] = useState<'members' | 'invite' | 'profile' | null>(null);
  const gridTop = useRef<HTMLDivElement>(null);
  const cover = useCoverChanger();
  const nav = useNavigate();

  useEffect(() => { useSession.getState().loadMembers().catch(() => {}); }, [album.id]);
  useEffect(() => {
    let live = true;
    api.postTiles(album.id).then((l) => live && setTiles(l), () => live && setTiles((t) => t || []));
    return () => { live = false; };
  }, [album.id, postsVersion]);

  const day = album.babyBirthday ? babyDay(album.babyBirthday) : null;
  // 날 수는 위 숫자에 있으니 여기에는 개월·살만
  const months = album.babyBirthday ? babyMonths(album.babyBirthday) : null;
  const bioAge = months === null || day === null || day < 1 ? '' : months >= 24 ? babyAge(album.babyBirthday!) : months >= 1 ? `${months}개월` : '';
  const photoCount = tiles?.reduce((n, t) => n + t.count, 0);
  const base = useMemo(() => (tiles || []).filter((t) => tab === 'all' || t.likedBy.includes(me.id)), [tiles, tab, me.id]);
  const shown = useMemo(() => base.filter((t) => matches(filter, t)), [base, filter]);

  return (
    <Page>
      <TopBar large title={<span className={s.title}>{album.name}</span>} right={<IconButton icon="settings" label="설정" onClick={() => nav('/settings')} />} />

      <section className={s.profile}>
        <div className={s.head}>
          {isOwner
            ? <button className={s.cover} onClick={cover.open} aria-label="앨범 사진 바꾸기" data-f="cover"><CoverFace /><span className={s.coverEdit}><Icon name="camera" size={14} stroke={2.2} /></span></button>
            : <div className={s.cover}><CoverFace /></div>}
          <div className={s.side}>
            <h2 className={s.name}>{album.babyName || album.name}</h2>
            <div className={s.stats}>
              <button onClick={() => gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-stat="photos">
                <b>{photoCount ?? '–'}</b><span>사진</span>
              </button>
              <button onClick={() => setSheet('members')} data-stat="members"><b>{members.length}</b><span>가족</span></button>
              {day !== null && <div><b>{day < 1 ? `D-${1 - day}` : day.toLocaleString()}</b><span>{day < 1 ? '만나기까지' : '함께한 날'}</span></div>}
            </div>
          </div>
        </div>
        {album.babyBirthday
          ? <p className={s.bio}>{fmtDate(album.babyBirthday)} {day !== null && day >= 1 ? '태어남' : '예정'}{bioAge ? ` · ${bioAge}` : ''}</p>
          : isOwner && <button className={s.bioLink} onClick={() => nav('/settings/album/info')}>아이 생일 넣기</button>}
        <div className={s.btns}>
          {isOwner
            ? <button className={s.btn} onClick={() => nav('/settings/album')} data-f="edit-album">앨범 편집</button>
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

      {tiles === null ? <div className={s.loading} /> : shown.length ? (
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
            ? <><p>조건에 맞는 사진이 없어요</p><button className={s.bioLink} onClick={() => setFilter(NO_FILTER)}>거르기 풀기</button></>
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
