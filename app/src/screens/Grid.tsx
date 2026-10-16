// 모아보기: 모든 사진을 올린 달별로. 사진이 많아지면 '날짜'·'올린 사람'으로 걸러 봐요
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Photo } from '../components/Photo';
import { Icon } from '../components/Icon';
import { openViewer } from '../components/PostHub';
import { FilterChips, NO_FILTER, matches, monthOf, type Filter } from '../components/Filters';
import { useAlbum } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { babyMonths, fmtMonth, toDate } from '../lib/dates';
import s from './Grid.module.css';

let cache: { albumId: string; items: api.GridItem[] } | null = null;
export const invalidateGrid = () => { cache = null; };

export function Grid() {
  const album = useAlbum()!;
  const postsVersion = usePosts((st) => st.list.length + st.list.join().length);
  const [items, setItems] = useState<api.GridItem[] | null>(cache?.albumId === album.id ? cache.items : null);
  const [error, setError] = useState('');
  const { month } = useParams();
  const [filter, setFilter] = useState<Filter>(() => (month && /^\d{4}-\d{2}$/.test(month) ? { who: null, period: month } : NO_FILTER));

  useEffect(() => {
    let live = true;
    api.allPhotos(album.id).then((list) => {
      cache = { albumId: album.id, items: list };
      if (live) { setItems(list); setError(''); }
    }, (e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [album.id, postsVersion]);

  const shown = useMemo(() => (items || []).filter((it) => matches(filter, it)), [items, filter]);
  const groups = useMemo(() => {
    const m = new Map<string, api.GridItem[]>();
    shown.forEach((it) => {
      const k = monthOf(it.createdAt);
      m.set(k, [...(m.get(k) || []), it]);
    });
    return [...m.entries()];
  }, [shown]);

  const open = (it: api.GridItem) => {
    openViewer({ items: shown.map((x) => ({ ...x, albumId: album.id })), start: shown.indexOf(it), postLink: true });
  };
  const filtered = filter.who || filter.period;

  return (
    <Page>
      <TopBar large title={<span className={s.title}>모아보기</span>} right={items && <span className={s.count}>{filtered ? `${shown.length} / ` : ''}{items.length}장</span>} />
      {!!items?.length && <div className={s.bar}><FilterChips value={filter} onChange={setFilter} items={items} /></div>}
      {!items && !error && <div className={s.loading} />}
      {error && <p className={s.msg}>{error}</p>}
      {items && !items.length && <p className={s.msg}>아직 사진이 없어요<br /><small>아래 + 버튼으로 첫 사진을 올려 보세요</small></p>}
      {items && !!items.length && !shown.length && (
        <p className={s.msg}>조건에 맞는 사진이 없어요<br /><button className={s.reset} onClick={() => setFilter(NO_FILTER)}>거르기 풀기</button></p>
      )}
      {groups.map(([k, list]) => {
        const m = album.babyBirthday ? babyMonths(album.babyBirthday, toDate(`${k}-15`)) : null;
        return (
          <section key={k} id={`m-${k}`} className={s.month}>
            <h3 className={s.monthBar}>
              {fmtMonth(`${k}-01`)}
              <small>{list.length}장{m !== null && m >= 0 ? ` · ${m === 0 ? '첫 달' : `${m}개월`}` : ''}</small>
            </h3>
            <div className={s.tiles}>
              {list.map((it) => (
                <button key={it.path} className={s.tile} onClick={() => open(it)} aria-label="사진 크게 보기">
                  <Photo albumId={album.id} path={it.thumb} ph={it.ph} className={s.ph} />
                  {it.count > 1 && it.index === 0 && <Icon name="layers" size={16} className={s.multi} />}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </Page>
  );
}
