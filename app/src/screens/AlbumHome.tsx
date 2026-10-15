// 가족 탭: 아이 프로필 + 가족 목록 + 최근 사진 (인스타그램 프로필처럼)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, TopBar, IconButton } from '../components/Bars';
import { Avatar } from '../components/Avatar';
import { Photo } from '../components/Photo';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { confirm, menu, toast } from '../components/ui';
import { openViewer } from '../components/PostHub';
import { useAlbum, useSession } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { babyAge, babyDay, fmtDate, timeAgo } from '../lib/dates';
import { obj } from '../lib/korean';
import { InviteSheet } from './Invite';
import { ProfileSheet } from './Settings';
import s from './AlbumHome.module.css';

export function AlbumHome() {
  const album = useAlbum()!;
  const me = useSession((st) => st.me)!;
  const members = useSession((st) => st.members);
  const isOwner = album.myRole === 'owner';
  const postsVersion = usePosts((st) => st.list.length);
  const [photos, setPhotos] = useState<api.GridItem[] | null>(null);
  const [invite, setInvite] = useState(false);
  const [profile, setProfile] = useState(false);
  const nav = useNavigate();

  useEffect(() => { useSession.getState().loadMembers().catch(() => {}); }, [album.id]);
  useEffect(() => {
    let live = true;
    api.allPhotos(album.id).then((l) => live && setPhotos(l.sort((a, b) => b.createdAt.localeCompare(a.createdAt))), () => {});
    return () => { live = false; };
  }, [album.id, postsVersion]);

  const day = album.babyBirthday ? babyDay(album.babyBirthday) : null;
  const latest = photos?.[0];

  const manage = async (uid: string) => {
    const m = members.find((x) => x.userId === uid)!;
    const v = await menu([
      m.role === 'owner' ? { label: '관리자에서 빼기', value: 'member', icon: 'crown' as const } : { label: '관리자로 지정', value: 'owner', icon: 'crown' as const },
      { label: '앨범에서 내보내기', value: 'remove', icon: 'logout' as const, danger: true },
    ], m.displayName);
    try {
      if (v === 'owner' || v === 'member') { await api.setRole(album.id, uid, v); toast(v === 'owner' ? '관리자로 지정했어요' : '관리자에서 뺐어요'); }
      if (v === 'remove') {
        if (!(await confirm({ title: `${obj(m.displayName)} 내보낼까요?`, message: '예전 초대 코드로 다시 못 들어오게 초대 코드가 새로 바뀌어요.', ok: '내보내기', danger: true }))) return;
        const code = await api.removeMember(album.id, uid);
        useSession.getState().patchAlbum({ inviteCode: code });
        toast('내보냈어요. 초대 코드가 바뀌었어요.');
      }
      if (v) await useSession.getState().loadMembers();
    } catch (e) { toast((e as Error).message); }
  };

  return (
    <Page>
      <TopBar large title={<span className={s.title}>{album.name}</span>} right={<IconButton icon="settings" label="설정" onClick={() => nav('/settings')} />} />
      <section className={s.profile}>
        <div className={s.head}>
          <div className={s.babyPic}>{latest ? <Photo albumId={album.id} path={latest.thumb} ph={latest.ph} className={s.babyImg} /> : <span>{(album.babyName || album.name)[0]}</span>}</div>
          <div className={s.stats}>
            <button onClick={() => nav('/grid')} data-stat="photos"><b>{photos ? photos.length : '–'}</b><span>사진</span></button>
            <button onClick={() => document.getElementById('members')?.scrollIntoView({ behavior: 'smooth' })}><b>{members.length}</b><span>가족</span></button>
            {day !== null && <div><b>{day < 1 ? `D-${1 - day}` : `${day}일`}</b><span>{day < 1 ? '만나기까지' : '함께한 날'}</span></div>}
          </div>
        </div>
        <div className={s.bio}>
          <b>{album.babyName || album.name}</b>
          {album.babyBirthday && <p>{fmtDate(album.babyBirthday)} {day !== null && day >= 1 ? '태어남' : '예정'} · {babyAge(album.babyBirthday)}</p>}
          {!album.babyBirthday && isOwner && <button className={s.link} onClick={() => nav('/settings/album')}>아이 생일 넣기</button>}
        </div>
        <div className={s.btns}>
          <Button variant="secondary" size="sm" onClick={() => setProfile(true)} data-f="me">프로필 편집</Button>
          <Button variant="secondary" size="sm" onClick={() => setInvite(true)} data-f="invite">가족 초대</Button>
        </div>
      </section>

      <h3 className={s.section} id="members">가족 {members.length}명</h3>
      <ul className={s.members}>
        {members.map((m) => (
          <li key={m.userId}>
            <Avatar src={m.avatar} name={m.displayName} size={44} />
            <span className={s.mText}>
              <b>{m.displayName}{m.userId === me.id && <em>나</em>}{m.role === 'owner' && <em className={s.owner}><Icon name="crown" size={12} />관리자</em>}</b>
              <small>{timeAgo(m.joinedAt)} 들어옴</small>
            </span>
            {isOwner && m.userId !== me.id && <button className={s.more} onClick={() => manage(m.userId)} aria-label={`${m.displayName} 관리`} data-member={m.userId}><Icon name="more" size={20} /></button>}
          </li>
        ))}
      </ul>

      {!!photos?.length && (
        <>
          <h3 className={s.section}>최근 사진</h3>
          <div className={s.grid}>
            {photos.slice(0, 12).map((it, i) => (
              <button key={it.path} onClick={() => openViewer({ items: photos.map((x) => ({ ...x, albumId: album.id })), start: i, postLink: true })} aria-label="사진 크게 보기">
                <Photo albumId={album.id} path={it.thumb} ph={it.ph} className={s.tile} />
              </button>
            ))}
          </div>
        </>
      )}
      <InviteSheet open={invite} onClose={() => setInvite(false)} />
      <ProfileSheet open={profile} onClose={() => setProfile(false)} />
    </Page>
  );
}
