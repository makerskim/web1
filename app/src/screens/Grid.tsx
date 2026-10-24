// 모아보기: 모든 사진을 찍은 달별로 (최근에 찍은 사진부터). '날짜'(하루·한 달)·'올린 사람'으로 거르고, 위의 달 막대로 바로 가요
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Photo } from '../components/Photo';
import { VideoMark } from '../components/Video';
import { Icon } from '../components/Icon';
import { openViewer } from '../components/PostHub';
import { FilterChips, NO_FILTER, dayOf, matches, type Filter } from '../components/Filters';
import { useAlbum } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { babyMonths, fmtDay, fmtMonth, toDate } from '../lib/dates';
import s from './Grid.module.css';

let cache: { albumId: string; items: api.GridItem[] } | null = null;
export const invalidateGrid = () => { cache = null; };

export function Grid() {
  const album = useAlbum()!;
  const nav = useNavigate();
  const postsVersion = usePosts((st) => st.list.length + st.list.join().length);
  const [items, setItems] = useState<api.GridItem[] | null>(cache?.albumId === album.id ? cache.items : null);
  const [error, setError] = useState('');
  // /grid/2026-08 (한 달) 또는 /grid/2026-08-20 (하루)로 바로 열 수 있어요
  const { month } = useParams();
  const fromRoute = month && /^\d{4}-\d{2}(-\d{2})?$/.test(month) ? month : null;
  const [filter, setFilter] = useState<Filter>(() => (fromRoute ? { who: null, period: fromRoute } : NO_FILTER));
  useEffect(() => { if (fromRoute) setFilter((f) => (f.period === fromRoute ? f : { ...f, period: fromRoute })); }, [fromRoute]);

  useEffect(() => {
    let live = true;
    api.allPhotos(album.id).then((list) => {
      cache = { albumId: album.id, items: list };
      if (live) { setItems(list); setError(''); }
    }, (e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [album.id, postsVersion]);

  // 찍은 날 순 (같은 게시물 안에서는 올린 순서 그대로)
  const shown = useMemo(() => (items || []).filter((it) => matches(filter, it))
    .sort((a, b) => (b.takenAt || b.createdAt).localeCompare(a.takenAt || a.createdAt) || a.postId.localeCompare(b.postId) || a.index - b.index), [items, filter]);
  const groups = useMemo(() => {
    const m = new Map<string, api.GridItem[]>();
    shown.forEach((it) => {
      const k = dayOf(it).slice(0, 7);
      m.set(k, [...(m.get(k) || []), it]);
    });
    return [...m.entries()];
  }, [shown]);
  // 달 막대: 누르면 그 달로 (사진이 많아도 바로 찾아요)
  const go = (k: string) => document.getElementById(`m-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const open = (it: api.GridItem) => {
    openViewer({ items: shown.map((x) => ({ ...x, albumId: album.id })), start: shown.indexOf(it), postLink: true });
  };
  const filtered = filter.who || filter.period;
  const day = filter.period && filter.period.length === 10 ? filter.period : null; // 하루만 볼 때는 그날로 제목을 달아요

  return (
    <Page>
      <TopBar large title={<span className={s.title}>모아보기</span>} right={items && <span className={s.count}>{filtered ? `${shown.length} / ` : ''}{items.length}장</span>} />
      {!!items?.length && <div className={s.bar}><FilterChips value={filter} onChange={setFilter} items={items} /></div>}
      {groups.length > 2 && !day && (
        <nav className={s.months} aria-label="달로 바로 가기" data-f="month-strip">
          {groups.map(([k], i) => (
            <button key={k} onClick={() => go(k)} data-go={k}>
              {i === 0 || groups[i - 1][0].slice(0, 4) !== k.slice(0, 4) ? <small>{k.slice(0, 4)}</small> : null}
              {Number(k.slice(5))}월
            </button>
          ))}
        </nav>
      )}
      {!items && !error && <div className={s.loading} />}
      {error && <p className={s.msg}>{error}</p>}
      {items && !items.length && <p className={s.msg}>아직 사진이 없어요<br /><small>아래 + 버튼으로 첫 사진을 올려 보세요</small></p>}
      {items && !!items.length && !shown.length && (
        <p className={s.msg}>조건에 맞는 사진이 없어요<br /><button className={s.reset} onClick={() => setFilter(NO_FILTER)}>거르기 풀기</button></p>
      )}
      {groups.map(([k, list]) => {
        const m = album.kind === 'baby' && album.babyBirthday ? babyMonths(album.babyBirthday, toDate(day || `${k}-15`)) : null;
        return (
          <section key={k} id={`m-${k}`} className={s.month}>
            <h3 className={s.monthBar}>
              {day ? fmtDay(day, true) : fmtMonth(`${k}-01`)}
              <small>{list.length}장{m !== null && m >= 0 ? ` · ${m === 0 ? '첫 달' : `${m}개월`}` : ''}</small>
              {/* 이 달 사진을 영상처럼 */}
              {!day && list.length > 1 && (
                <button className={s.playMonth} onClick={() => nav(`/memories?month=${k}`)} aria-label={`${fmtMonth(`${k}-01`)} 사진 재생`} data-play-month={k}>
                  <Icon name="play" size={12} /> 재생
                </button>
              )}
            </h3>
            <div className={s.tiles}>
              {list.map((it) => (
                <button key={it.path} className={s.tile} onClick={() => open(it)} aria-label="사진 크게 보기">
                  <Photo albumId={album.id} path={it.thumb} ph={it.ph} className={s.ph} />
                  {it.count > 1 && it.index === 0 && <Icon name="layers" size={16} className={s.multi} />}
                  <VideoMark item={it} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </Page>
  );
}
