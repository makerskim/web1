// 가족 탭: 인스타그램 프로필처럼 — 앨범 사진 · 아이 이름 · 소개 · 큰 숫자 · 버튼 · 사진 그리드
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
import { babyAge, babyDay, babyMonths } from '../lib/dates';
import { childName, needsName } from '../lib/kids';
import { subj } from '../lib/korean';
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

  const day = album.babyBirthday ? babyDay(album.babyBirthday) : null;
  const born = day !== null && day >= 1;
  const months = album.babyBirthday ? babyMonths(album.babyBirthday) : null;
  const age = !born || months === null ? '' : months >= 24 ? babyAge(album.babyBirthday!) : months >= 1 ? `${months}개월` : `생후 ${day}일`;
  const unnamed = isOwner ? album.children.find(needsName) : undefined;
  const photoCount = tiles?.reduce((n, t) => n + t.count, 0);
  const base = useMemo(() => (tiles || []).filter((t) => tab === 'all' || t.likedBy.includes(me.id)), [tiles, tab, me.id]);
  const shown = useMemo(() => base.filter((t) => matches(filter, t)), [base, filter]);
  const names = album.babyName || album.name;

  return (
    <Page>
      <TopBar large title={<AmpText className={s.title} text={album.name} />} right={<IconButton icon="settings" label="설정" onClick={() => nav('/settings')} />} />

      <section className={s.profile}>
        <div className={s.head}>
          {isOwner
            ? <button className={s.cover} onClick={cover.open} aria-label="앨범 사진 바꾸기" data-f="cover"><CoverFace size={92} /><span className={s.coverEdit}><Icon name="camera" size={14} stroke={2.2} /></span></button>
            : <div className={s.cover}><CoverFace size={92} /></div>}
          <div className={s.who}>
            <h2 className={s.names} data-f="names"><AmpText text={names} /></h2>
            {age && <p className={s.age}>{age}</p>}
          </div>
        </div>

        {album.bio
          ? <p className={s.bio} data-f="bio">{album.bio}</p>
          : isOwner && <button className={s.link} onClick={() => nav('/settings/album/info')} data-f="bio-add">+ 소개 쓰기</button>}

        {unnamed && (
          <button className={s.born} onClick={() => nav('/settings/album/info')} data-f="born">
            <span className={s.bornIcon}>🎉</span>
            <span><b>{subj(childName(unnamed))} 태어났어요!</b><small>이름을 넣으면 앨범에 이름으로 보여요</small></span>
            <Icon name="right" size={18} stroke={2.2} />
          </button>
        )}

        <div className={s.stats}>
          <button onClick={() => gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-stat="photos">
            <b>{photoCount ?? '–'}</b><span>사진</span>
          </button>
          <button onClick={() => setSheet('members')} data-stat="members"><b>{members.length}</b><span>가족</span></button>
          {day !== null && (
            <div data-stat="days"><b>{born ? day.toLocaleString() : `D-${1 - day}`}</b><span>{born ? '함께한 날' : '만나기까지'}</span></div>
          )}
        </div>

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
