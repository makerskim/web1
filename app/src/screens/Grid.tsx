import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Photo } from '../components/Photo';
import { Icon } from '../components/Icon';
import { openViewer } from '../components/PostHub';
import { useAlbum } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { babyMonths, fmtMonth, toDate } from '../lib/dates';
import s from './Grid.module.css';

let cache: { albumId: string; items: api.GridItem[]; at: number } | null = null;
export const invalidateGrid = () => { cache = null; };

export function Grid() {
  const album = useAlbum()!;
  const postsVersion = usePosts((st) => st.list.length);
  const [items, setItems] = useState<api.GridItem[] | null>(cache?.albumId === album.id ? cache.items : null);
  const [error, setError] = useState('');
  const { month } = useParams();

  useEffect(() => {
    let live = true;
    api.allPhotos(album.id).then((list) => {
      cache = { albumId: album.id, items: list, at: Date.now() };
      if (live) setItems(list);
    }, (e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [album.id, postsVersion]);

  const groups = useMemo(() => {
    const m = new Map<string, api.GridItem[]>();
    (items || []).forEach((it) => {
      const k = it.takenAt.slice(0, 7);
      m.set(k, [...(m.get(k) || []), it]);
    });
    return [...m.entries()];
  }, [items]);

  useEffect(() => {
    if (month && items) document.getElementById(`m-${month}`)?.scrollIntoView({ block: 'start' });
  }, [month, items]);

  const open = (it: api.GridItem) => {
    const list = items!;
    openViewer({ items: list.map((x) => ({ ...x, albumId: album.id })), start: list.indexOf(it), postLink: true });
  };

  return (
    <Page>
      <TopBar large title={<span className={s.title}>모아보기</span>} right={items && <span className={s.count}>{items.length}장</span>} />
      {!items && !error && <div className={s.loading} />}
      {error && <p className={s.msg}>{error}</p>}
      {items && !items.length && <p className={s.msg}>아직 사진이 없어요</p>}
      {groups.map(([k, list]) => {
        const m = album.babyBirthday ? babyMonths(album.babyBirthday, toDate(`${k}-15`)) : null;
        return (
          <section key={k} id={`m-${k}`} className={s.month}>
            <h3 className={s.monthBar}>
              {fmtMonth(`${k}-01`)}
              {m !== null && m >= 0 && <small>{m === 0 ? '첫 달' : `${m}개월`}</small>}
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
