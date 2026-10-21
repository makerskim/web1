// 가족 탭과 앨범 설정이 함께 쓰는 것: 가족 목록 시트, 앨범 사진 바꾸기
import { useEffect, useRef, useState } from 'react';
import { Sheet, confirm, menu, progress, toast } from './ui';
import { PeopleList, PersonRow } from './People';
import { Photo } from './Photo';
import { usePhotoURL } from '../hooks/usePhoto';
import { Icon } from './Icon';
import { useAlbum, useSession } from '../state/session';
import * as api from '../lib/api';
import { squarePhoto } from '../lib/image';
import { obj } from '../lib/korean';
import { spaceAmp } from '../lib/kids';
import s from './AlbumBits.module.css';

// ---------- 가족 N명 ----------
// 이름 · '나' · '관리자'만 보여요. 관리자는 ⋯ 로 관리자 지정/내보내기
export function MembersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const album = useAlbum();
  const me = useSession((st) => st.me);
  const members = useSession((st) => st.members);
  useEffect(() => { if (open) useSession.getState().loadMembers().catch(() => {}); }, [open]);
  if (!album || !me) return null;
  const isOwner = album.myRole === 'owner';

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

  // 나 → 관리자 → 가나다
  const ordered = [...members].sort((a, b) => {
    const rank = (m: typeof a) => (m.userId === me.id ? 0 : m.role === 'owner' ? 1 : 2);
    return rank(a) - rank(b) || a.displayName.localeCompare(b.displayName, 'ko');
  });
  return (
    <Sheet open={open} onClose={onClose} title={`멤버 ${members.length}명`}>
      <PeopleList>
        {ordered.map((m) => (
          <PersonRow key={m.userId} m={m} me={m.userId === me.id} action={isOwner && m.userId !== me.id
            ? <button className={s.more} onClick={() => manage(m.userId)} aria-label={`${m.displayName} 관리`} data-member={m.userId}><Icon name="more" size={20} /></button>
            : undefined} />
        ))}
      </PeopleList>
    </Sheet>
  );
}

// ---------- '씩씩이 & 튼튼이' (가운데 &는 가볍게) ----------
// 줄이 넘치면 '씩씩이' / '& 튼튼이'로 나뉘어요 (& 뒤는 붙는 빈칸)
export function AmpText({ text, className = '' }: { text: string; className?: string }) {
  const parts = spaceAmp(text).split(' & ');
  return (
    <span className={className}>
      {parts.map((p, i) => <span key={i}>{i > 0 && <>{' '}<i className={s.amp}>&amp;</i>{'\u00a0'}</>}{p}</span>)}
    </span>
  );
}

// ---------- 앨범 사진 ----------
export function CoverFace({ size = 88 }: { size?: number }) {
  const album = useAlbum()!;
  // 지워진 사진이면 첫 글자로 (사진이 없다는 글씨가 동그라미 안에 뜨지 않게)
  const { failed } = usePhotoURL(album.id, album.cover || null);
  return (
    <span className={s.face} style={{ width: size, height: size }}>
      {album.cover && !failed
        ? <Photo albumId={album.id} path={album.cover} className={s.faceImg} eager />
        : <span className={s.initial} style={{ fontSize: size * 0.36 }}>{(album.babyName || album.name).trim()[0]}</span>}
    </span>
  );
}

// 관리자가 앨범 사진을 바꿀 때: 메뉴 → 앨범 사진에서 고르기 / 휴대폰에서 고르기 / 지우기
export function useCoverChanger() {
  const album = useAlbum();
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const save = async (path: string) => {
    if (!album) return;
    try {
      await api.setCover(album.id, path, album.cover);
      useSession.getState().patchAlbum({ cover: path });
      setPicking(false);
      toast(path ? '앨범 사진을 바꿨어요' : '앨범 사진을 지웠어요');
    } catch (e) { toast((e as Error).message); }
  };
  const upload = async (f: File) => {
    if (!album) return;
    const p = progress('사진을 올리는 중');
    try {
      const path = await api.uploadCover(album.id, await squarePhoto(f, 480), album.cover);
      useSession.getState().patchAlbum({ cover: path });
      p.close();
      toast('앨범 사진을 바꿨어요');
    } catch (e) { p.close(); toast((e as Error).message); }
  };
  const open = async () => {
    if (!album) return;
    const v = await menu([
      { label: '앨범 사진에서 고르기', value: 'album', icon: 'grid' as const },
      { label: '휴대폰에서 고르기', value: 'phone', icon: 'image' as const },
      ...(album.cover ? [{ label: '앨범 사진 지우기', value: 'none', icon: 'trash' as const, danger: true }] : []),
    ], '앨범 사진 바꾸기');
    if (v === 'album') setPicking(true);
    if (v === 'phone') file.current?.click();
    if (v === 'none') save('');
  };
  const ui = (
    <>
      <input ref={file} type="file" accept="image/*" className="sr-only" data-f="cover-file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
      <CoverPicker open={picking} onClose={() => setPicking(false)} onPick={save} />
    </>
  );
  return { open, ui };
}

// 앨범 사진에서 고르기: 모든 사진을 3열로
function CoverPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (path: string) => void }) {
  const album = useAlbum();
  const [items, setItems] = useState<api.GridItem[] | null>(null);
  useEffect(() => {
    if (!open || !album) return;
    let live = true;
    api.allPhotos(album.id).then((l) => live && setItems(l), (e) => { toast((e as Error).message); onClose(); });
    return () => { live = false; };
  }, [open, album?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!album) return null;
  return (
    <Sheet open={open} onClose={onClose} title="앨범 사진 고르기" tall>
      {!items ? <div className={s.loading} /> : items.length ? (
        <div className={s.pick}>
          {items.map((it) => (
            <button key={it.thumb} className={`${s.pickTile} ${album.cover === it.thumb ? s.current : ''}`} onClick={() => onPick(it.thumb)} aria-label="이 사진으로" data-cover-pick>
              <Photo albumId={album.id} path={it.thumb} ph={it.ph} className={s.pickImg} />
            </button>
          ))}
        </div>
      ) : <p className={s.empty}>아직 사진이 없어요</p>}
    </Sheet>
  );
}
