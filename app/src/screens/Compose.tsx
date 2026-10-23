// 사진·동영상 올리기: 고르기 → 글 쓰기 → 올리기 (꾸미기 없이, 원본은 항상 함께 저장)
// 올리는 사람의 구글 드라이브에 저장돼요 → 드라이브를 연결한 사람만 올릴 수 있어요 (처음 한 번 연결)
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { exportPhoto, isVideoFile, loadPhoto, releasePhoto, type PickedPhoto } from '../lib/photo';
import { loadMyDrive, popupWarning, preloadDrive, useMyDrive } from '../lib/drive';
import { GoogleIcon } from '../components/ProviderIcon';
import { fmtBytes } from '../lib/image';
import { fmtDur } from '../lib/dates';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { afterBack, confirm, progress, toast, useBackClose } from '../components/ui';
import { useSession } from '../state/session';
import { forgetScroll, scrollPageTop } from '../components/Stack';
import { usePosts } from '../state/posts';
import { linkDrive } from '../state/actions';
import * as api from '../lib/api';
import s from './Compose.module.css';

const MAX_PHOTOS = 10;
const MAX_ORIGINAL = 25 * 1024 * 1024;
const MAX_VIDEO = 1024 * 1024 * 1024;
const canKeep = (f: File) => f.size <= MAX_ORIGINAL && !!api.originalInfo(f);
const DISCARD = { title: '작성을 그만둘까요?', message: '고른 사진과 쓴 글이 사라져요.', ok: '그만두기', danger: true };

type Stage = 'idle' | 'write';
interface ComposeState {
  stage: Stage;
  photos: PickedPhoto[];
  caption: string;
  busy: boolean;
  /** 잠깐 '뒤로' 기록을 내려놓은 상태 (물어보는 중) */
  hold: boolean;
}
const EMPTY = { stage: 'idle' as Stage, photos: [], caption: '', busy: false, hold: false };
const useCompose = create<ComposeState>(() => ({ ...EMPTY }));

// 닫을 때 미리보기 주소도 비워요
let confirmed = false; // 닫기(X)에서 이미 물어봤어요
function closeCompose() {
  confirmed = false;
  useCompose.getState().photos.forEach(releasePhoto);
  useCompose.setState({ ...EMPTY });
}

// 사진 고르기 창은 버튼을 누른 그 순간에 열어야 해서 input을 미리 만들어 둬요
let input: HTMLInputElement | null = null;
let appending = false;

function openPicker(append: boolean) {
  appending = append;
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.className = 'sr-only';
    input.setAttribute('aria-hidden', 'true');
    input.dataset.compose = '1';
    document.body.appendChild(input);
    input.addEventListener('change', onPicked);
  }
  input.accept = 'image/*,video/*';
  input.click();
}

async function onPicked() {
  const add = appending && useCompose.getState().stage === 'write';
  let files = [...(input!.files || [])];
  input!.value = '';
  if (!files.length) return;
  const room = MAX_PHOTOS - (add ? useCompose.getState().photos.length : 0);
  // 동영상은 1GB까지
  const videos = files.filter(isVideoFile);
  const big = files.filter((f) => isVideoFile(f) && f.size > MAX_VIDEO);
  if (big.length) { toast(`동영상은 ${fmtBytes(MAX_VIDEO)}까지 올릴 수 있어요`); files = files.filter((f) => !big.includes(f)); }
  if (files.length > room) { toast(`한 번에 ${MAX_PHOTOS}개까지 올릴 수 있어요`); files = files.slice(0, Math.max(0, room)); }
  if (!files.length) return;
  const p = progress(videos.length ? '사진·동영상을 준비하는 중' : '사진을 준비하는 중');
  const picked: PickedPhoto[] = [];
  for (let i = 0; i < files.length; i++) {
    try { picked.push(await loadPhoto(files[i])); } catch (e) { toast((e as Error).message); }
    p.set((i + 1) / files.length);
  }
  p.close();
  if (!picked.length) return;
  const st = useCompose.getState();
  if (add) {
    // 준비하는 사이 글쓰기를 닫았으면 버려요
    if (st.stage !== 'write') { picked.forEach(releasePhoto); return; }
    useCompose.setState({ photos: [...st.photos, ...picked].slice(0, MAX_PHOTOS) });
  } else {
    st.photos.forEach(releasePhoto);
    useCompose.setState({ ...EMPTY, stage: 'write', photos: picked });
  }
}

export const startCompose = () => openPicker(false);
const addPhotos = () => openPicker(true);

// 한 장면만 기다려요 (내려놓은 게 그려진 다음 바로 다시 쌓게). 화면이 숨겨져 멈춰도 넘어가요
const nextFrame = () => new Promise<void>((r) => { requestAnimationFrame(() => r()); setTimeout(r, 100); });

// 휴대폰 '뒤로': 쓴 글이 있으면 물어보고, 없으면 바로 닫아요. 올리는 중에는 닫지 않아요
async function onBack() {
  const st = useCompose.getState();
  if (!st.busy && (confirmed || !st.caption.trim())) { closeCompose(); return; }
  // '뒤로'로 기록이 하나 빠졌어요 → 잠깐 내려놨다가 다시 쌓아요
  useCompose.setState({ hold: true });
  if (st.busy) {
    toast('올리는 중이에요. 잠시만 기다려 주세요.');
    // 바로 다시 쌓아요 (한 번 더 눌러도 앱을 벗어나지 않게)
    await nextFrame();
  } else {
    if (await confirm(DISCARD)) { closeCompose(); return; }
    // 확인 창 기록이 다 빠진 다음 다시 쌓아요
    await afterBack();
  }
  if (useCompose.getState().stage === 'write') useCompose.setState({ hold: false });
}

export function ComposeHost() {
  const stage = useCompose((st) => st.stage);
  const photos = useCompose((st) => st.photos);
  const hold = useCompose((st) => st.hold);
  const album = useSession((st) => st.album());
  useBackClose(stage === 'write' && !hold, onBack);
  if (!album) return null;
  return createPortal(
    <AnimatePresence>
      {stage === 'write' && <Write key="write" photos={photos} onDone={closeCompose} />}
    </AnimatePresence>,
    document.body,
  );
}

function Write({ photos, onDone }: { photos: PickedPhoto[]; onDone: () => void }) {
  const album = useSession((st) => st.album())!;
  const me = useSession((st) => st.me)!;
  const mine = useSession((st) => st.member(me.id));
  const caption = useCompose((st) => st.caption);
  const busy = useCompose((st) => st.busy);
  const nav = useNavigate();
  const onHome = /^\/(home)?$/.test(useLocation().pathname);
  const text = useRef<HTMLTextAreaElement>(null);
  // 내 구글 드라이브가 연결돼 있어야 올릴 수 있어요
  const myDrive = useMyDrive();
  const needDrive = myDrive.loaded && !myDrive.email;
  useEffect(() => { loadMyDrive(); preloadDrive(); }, []);
  const login = async () => { if (await linkDrive()) toast('구글 로그인이 됐어요. 이제 공유를 눌러 주세요'); };

  // 글이 길어지면 칸도 같이 늘어나요
  useEffect(() => {
    const t = text.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }, [caption]);

  // 닫기(X): 고른 사진이 있으니 한 번 물어봐요
  const askClose = async () => {
    if (busy) return;
    if (!(await confirm(DISCARD))) return;
    // 확인 창 기록이 다 빠진 다음 글쓰기 기록을 빼요 (사파리는 back을 겹쳐 하면 하나만 해요)
    await afterBack();
    const st = useCompose.getState();
    if (st.stage !== 'write') return;
    // 기록을 잠깐 내려놓은 사이면 뺄 기록이 없으니 바로 닫아요
    if (st.hold) { closeCompose(); return; }
    confirmed = true; // '뒤로'와 같은 길로 닫혀요
    history.back();
  };

  const remove = (id: string) => {
    const st = useCompose.getState();
    const p = st.photos.find((x) => x.id === id);
    if (!p || st.photos.length < 2) return;
    releasePhoto(p);
    useCompose.setState({ photos: st.photos.filter((x) => x.id !== id) });
  };

  const share = async () => {
    if (useCompose.getState().busy) return;
    if (needDrive) { toast('먼저 구글 로그인을 해 주세요'); return; }
    useCompose.setState({ busy: true });
    // 찍은 날은 기록만 해 두고, 화면의 날짜·아이 나이는 올린 날 기준이에요
    const first = new Date(Math.min(...photos.map((p) => +p.takenAt || Date.now())));
    let wake: { release: () => Promise<void> } | null = null;
    try { wake = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* 지원 안 함 */ }
    const hasVideo = photos.some((x) => x.video);
    const p = progress(hasVideo ? '사진·동영상을 준비하는 중' : '사진을 만드는 중');
    try {
      const out: api.NewPhoto[] = [];
      let skipped = 0;
      // 한 장씩 만들어서 메모리를 아껴요. 원본은 언제나 함께 올려요
      for (let i = 0; i < photos.length; i++) {
        const item: api.NewPhoto = { ...(await exportPhoto(photos[i])) };
        const f = photos[i].file;
        const v = photos[i].video;
        if (v) { item.orig = f; item.video = { dur: v.dur }; }
        else if (canKeep(f)) item.orig = f; else skipped++;
        out.push(item);
        p.set(((i + 1) / photos.length) * 0.15);
      }
      if (skipped) toast(`${skipped}장은 원본으로 올릴 수 없어 일반 화질로 올려요`);
      p.set(0.15, '내 구글 드라이브에 올리는 중');
      const { post, skippedOriginals } = await api.createPost(album, { caption: caption.trim(), takenAt: first.toISOString(), photos: out }, (f) => p.set(0.15 + f * 0.85));
      p.close();
      usePosts.getState().prepend(post);
      // 가족에게 알림 (켜 둔 사람에게만)
      api.notify(album.id, 'post', post.id);
      // 글쓰기 기록을 홈으로 바꿔 끼워요 (뒤로 눌렀을 때 빈 화면이 남지 않게)
      // 다른 탭에서 올렸으면 홈이 예전 자리 말고 맨 위(방금 올린 사진)에서 열려요
      forgetScroll('/home');
      nav('/home', { replace: true });
      onDone();
      if (onHome) scrollPageTop();
      toast(skippedOriginals ? `올렸어요 · 원본 ${skippedOriginals}장은 올리지 못했어요` : photos.every((x) => x.video) ? '동영상을 올렸어요' : hasVideo ? '사진·동영상을 올렸어요' : '사진을 올렸어요');
    } catch (e) {
      p.close();
      toast((e as Error).message || '올리지 못했어요. 다시 시도해 주세요.');
    } finally {
      wake?.release().catch(() => {});
      if (useCompose.getState().busy) useCompose.setState({ busy: false });
    }
  };

  return (
    <motion.div className={s.write} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
      <header className={s.top}>
        <button className={s.iconBtn} onClick={askClose} aria-label="닫기" data-w="close"><Icon name="close" size={26} /></button>
        <h2>새 게시물</h2>
        <span />
      </header>
      <div className={s.body}>
        <Carousel photos={photos} onRemove={remove} />
        <label className={s.captionBox}>
          <Avatar src={mine.avatar} name={mine.displayName} size={36} />
          <textarea ref={text} value={caption} onChange={(e) => useCompose.setState({ caption: e.target.value })} maxLength={2000} rows={3}
            placeholder="사진에 이야기를 남겨 보세요" aria-label="사진 이야기" data-w="caption" />
        </label>
        {!needDrive && myDrive.email && (
          <p className={s.note} data-w="drive-note"><Icon name="shield" size={16} /> 내 구글 드라이브({myDrive.email})의 ‘Pastel Memories › {album.name}’ 폴더에 저장돼요</p>
        )}
        {needDrive && (
          <div className={s.driveGate} data-w="drive-gate">
            <b>사진을 올리기 위해서는 구글 로그인이 필요해요</b>
            <p>구글 로그인을 하면 내 구글 드라이브의 ‘Pastel Memories › {album.name}’ 폴더에 저장되면서 앱에 올라와요. 한 번만 하면 돼요. (카카오로 로그인했어도 구글 로그인을 하면 올릴 수 있어요)</p>
            {popupWarning() && <small>{popupWarning()}</small>}
          </div>
        )}
      </div>
      <div className={s.foot}>
        {needDrive
          // 아직 연결 전이면 아래 버튼이 바로 '연결'이에요 (연결하면 '공유'로 바뀌어요)
          ? <Button size="lg" block onClick={login} className={s.googleBtn} data-w="drive-connect-foot"><GoogleIcon size={20} />구글 로그인</Button>
          : <Button size="lg" block onClick={share} disabled={busy || !myDrive.loaded} data-w="post">공유</Button>}
      </div>
    </motion.div>
  );
}

// 고른 사진들: 옆으로 넘겨 보기 + 빼기 + 더 넣기
function Carousel({ photos, onRemove }: { photos: PickedPhoto[]; onRemove: (id: string) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const prevCount = useRef(photos.length);
  const many = photos.length > 1;
  const at = Math.min(index, photos.length - 1);

  // 화면 가운데에 가장 가까운 사진 번호
  const onScroll = () => {
    const t = track.current;
    if (!t) return;
    const mid = t.scrollLeft + t.clientWidth / 2;
    let best = 0;
    let gap = Infinity;
    [...t.children].forEach((el, i) => {
      const c = (el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth / 2;
      if (Math.abs(c - mid) < gap) { gap = Math.abs(c - mid); best = i; }
    });
    setIndex(Math.min(best, photos.length - 1));
  };

  // 사진을 더 넣으면 새로 넣은 첫 사진으로 넘겨 줘요
  useEffect(() => {
    const t = track.current;
    const before = prevCount.current;
    prevCount.current = photos.length;
    if (!t) return;
    const el = photos.length > before ? t.children[before] as HTMLElement | undefined : undefined;
    if (el) t.scrollTo({ left: el.offsetLeft - (t.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
    // 사진을 빼면 넘기지 않아도 자리가 바뀌어요 → 번호를 다시 맞춰요
    else requestAnimationFrame(onScroll);
  }, [photos.length]);

  return (
    <section className={s.media} aria-label="고른 사진">
      <div className={s.track} ref={track} onScroll={onScroll} data-w="photos">
        {photos.map((p, i) => (
          <figure className={s.slide} key={p.id} data-w="slide">
            {p.video
              ? <><video src={`${p.url}#t=0.1`} muted playsInline preload="metadata" aria-label={`${photos.length}개 중 ${i + 1}번째 동영상`} />
                  <span className={s.vBadge}><Icon name="play" size={14} />{fmtDur(p.video.dur)}</span></>
              : <img src={p.url} alt={`${photos.length}장 중 ${i + 1}번째 사진`} draggable={false} />}
            {many && (
              // 지금 보이는 사진의 ×만 보여요 (옆 사진의 ×가 가장자리에 걸리지 않게). 옆 사진의 ×는 읽어 주지도 않아요
              <button type="button" className={`${s.remove} ${i === at ? '' : s.away}`} onClick={() => onRemove(p.id)}
                aria-label={`${i + 1}번째 사진 빼기`} data-w="remove" disabled={i !== at} aria-hidden={i === at ? undefined : true} tabIndex={i === at ? 0 : -1}>
                <Icon name="close" size={18} stroke={2.4} />
              </button>
            )}
          </figure>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button type="button" className={s.add} onClick={addPhotos} data-w="add">
            <span className={s.addIcon}><Icon name="plus" size={26} stroke={2.2} /></span>
            <span>사진·동영상 추가</span>
            <small>{photos.length}/{MAX_PHOTOS}장</small>
          </button>
        )}
      </div>
      {many && (
        <div className={s.pager}>
          <span className={s.counter} aria-live="polite">{at + 1}/{photos.length}</span>
          <span className={s.dots} aria-hidden="true">
            {photos.map((p, i) => <i key={p.id} className={i === at ? s.on : ''} />)}
          </span>
        </div>
      )}
    </section>
  );
}
