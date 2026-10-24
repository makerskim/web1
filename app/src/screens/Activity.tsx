import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Page, TopBar } from '../components/Bars';
import { Avatar } from '../components/Avatar';
import { Photo } from '../components/Photo';
import { useAlbum, useSession } from '../state/session';
import { usePosts } from '../state/posts';
import { timeAgo, toDate } from '../lib/dates';
import { subj } from '../lib/korean';
import type { ActivityEvent } from '../lib/types';
import s from './Activity.module.css';

const seenKey = (id: string) => `pm-activity-seen-${id}`;
export const activitySeenAt = (albumId: string) => { try { return localStorage.getItem(seenKey(albumId)) || ''; } catch { return ''; } };

function bucket(at: string) {
  const d = toDate(at)!;
  const days = Math.floor((Date.now() - +new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days < 1) return '오늘';
  if (days < 2) return '어제';
  if (days < 7) return '이번 주';
  if (days < 31) return '이번 달';
  return '이전';
}

interface Row extends ActivityEvent { users: string[]; emojis: string[] }

export function Activity() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const member = useSession((st) => st.member);
  const { activity, loadActivity } = usePosts();
  const nav = useNavigate();
  useEffect(() => {
    loadActivity();
    return () => { try { localStorage.setItem(seenKey(album.id), new Date().toISOString()); } catch { /* 무시 */ } };
  }, [album.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const out: Row[] = [];
    const likeKey = new Map<string, Row>();
    for (const e of activity) {
      if (e.userId === me.id) continue;
      if (e.type === 'like') {
        const k = `${e.postId}|${e.at.slice(0, 10)}`;
        const r = likeKey.get(k);
        const em = e.emoji || '❤️';
        if (r) {
          if (!r.users.includes(e.userId)) r.users.push(e.userId);
          if (!r.emojis.includes(em)) r.emojis.push(em);
          continue;
        }
        const row = { ...e, users: [e.userId], emojis: [em] };
        likeKey.set(k, row);
        out.push(row);
      } else out.push({ ...e, users: [e.userId], emojis: [] });
    }
    const groups = new Map<string, Row[]>();
    out.forEach((r) => { const b = bucket(r.at); groups.set(b, [...(groups.get(b) || []), r]); });
    return [...groups.entries()];
  }, [activity, me.id]);

  const text = (r: Row) => {
    const n = member(r.users[0]).displayName;
    const name = <b>{n}</b>;
    const josa = subj(n).slice(n.length);
    if (r.type === 'like') {
      const who = r.users.length > 1 ? <>{name} 외 {r.users.length - 1}명이</> : <>{name}{josa}</>;
      return r.emojis.every((x) => x === '❤️') ? <>{who} 사진을 좋아해요</> : <>{who} 사진에 {r.emojis.join('')} 반응을 남겼어요</>;
    }
    if (r.type === 'comment') {
      const emojiOnly = /^\p{Extended_Pictographic}+$/u.test((r.body || '').replace(/\s/g, ''));
      return emojiOnly ? <>{name}{josa} {r.body} 반응을 남겼어요</> : <>{name}{josa} 댓글을 남겼어요<span className={s.quote}>{r.body}</span></>;
    }
    if (r.type === 'post') return <>{name}{josa} 사진 {r.count}장을 올렸어요</>;
    return <>{name}{josa} 앨범에 들어왔어요</>;
  };

  return (
    <Page>
      <TopBar large title={<span className={s.title}>소식</span>} />
      {!rows.length && <p className={s.empty}>아직 새 소식이 없어요.<br />멤버가 좋아요나 댓글을 남기면 여기에 보여요.</p>}
      {rows.map(([g, list]) => (
        <section key={g}>
          <h3 className={s.group}>{g}</h3>
          {list.map((r, i) => (
            <motion.button key={`${r.type}${r.at}${i}`} className={s.row} whileTap={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
              onClick={() => r.postId && nav(`/p/${r.postId}${r.type === 'comment' ? '/c' : ''}`)} disabled={!r.postId} data-act-row>
              <Avatar src={member(r.users[0]).avatar} name={member(r.users[0]).displayName} size={44} />
              <span className={s.text}>{text(r)} <time>{timeAgo(r.at)}</time></span>
              {r.post && <Photo albumId={album.id} path={r.post.photos[0].thumb} ph={r.post.photos[0].ph} className={s.thumb} />}
            </motion.button>
          ))}
        </section>
      ))}
    </Page>
  );
}
