// 사진 올리기: 고르기 → 편집 → 글 쓰기 → 올리기
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { Editor } from '../editor/Editor';
import { drawPreview, exportPhoto, isDecorated, loadPhoto, type EditPhoto } from '../editor/render';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { progress, toast, useBackClose } from '../components/ui';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';
import { babyAge, toDate, ymd } from '../lib/dates';
import s from './Compose.module.css';

const MAX_PHOTOS = 10;
const MAX_ORIGINAL = 25 * 1024 * 1024;
const ORIG_PREF = 'pm-upload-original';
const IDEAS = ['오늘의 우리 아이', '까꿍!', '잘 자요', '냠냠 맛있어요', '산책 나왔어요', '보고 싶어요'];
const mb = (n: number) => (n / 1048576 < 10 ? (n / 1048576).toFixed(1) : String(Math.round(n / 1048576)));
const canKeep = (f: File) => f.size <= MAX_ORIGINAL && !!api.originalInfo(f);

type Stage = 'idle' | 'edit' | 'write';
const useCompose = create<{ stage: Stage; photos: EditPhoto[] }>(() => ({ stage: 'idle', photos: [] }));

// 사진 고르기 창은 버튼을 누른 그 순간에 열어야 해서 input을 미리 만들어 둬요
let input: HTMLInputElement | null = null;
export function startCompose() {
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.className = 'sr-only';
    input.setAttribute('aria-hidden', 'true');
    input.dataset.compose = '1';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      let files = [...(input!.files || [])];
      input!.value = '';
      if (!files.length) return;
      if (files.length > MAX_PHOTOS) { toast(`한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요`); files = files.slice(0, MAX_PHOTOS); }
      const p = progress('사진을 준비하는 중');
      const photos: EditPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        try { photos.push(await loadPhoto(files[i])); } catch (e) { toast((e as Error).message); }
        p.set((i + 1) / files.length);
      }
      p.close();
      if (photos.length) useCompose.setState({ stage: 'edit', photos });
    });
  }
  input.click();
}

export function ComposeHost() {
  const { stage, photos } = useCompose();
  const album = useSession((st) => st.album());
  const close = () => useCompose.setState({ stage: 'idle', photos: [] });
  useBackClose(stage !== 'idle', () => {
    if (useCompose.getState().stage === 'write') useCompose.setState({ stage: 'edit' });
    else close();
  });
  if (!album) return null;
  return createPortal(
    <AnimatePresence>
      {stage === 'edit' && (
        <Editor key="edit" photos={photos} babyBirthday={album.babyBirthday} onCancel={() => history.back()} onNext={() => useCompose.setState({ stage: 'write' })} />
      )}
      {stage === 'write' && <Write key="write" photos={photos} onBack={() => useCompose.setState({ stage: 'edit' })} onDone={close} />}
    </AnimatePresence>,
    document.body,
  );
}

function Write({ photos, onBack, onDone }: { photos: EditPhoto[]; onBack: () => void; onDone: () => void }) {
  const album = useSession((st) => st.album())!;
  const nav = useNavigate();
  const first = new Date(Math.min(...photos.map((p) => +p.takenAt || Date.now())));
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState(ymd(first));
  const [withOrig, setWithOrig] = useState(() => { try { return localStorage.getItem(ORIG_PREF) !== 'off'; } catch { return true; } });
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const origBytes = photos.reduce((n, p) => n + (canKeep(p.file) ? p.file.size : 0), 0);
  const decorated = photos.some(isDecorated);
  const age = album.babyBirthday ? babyAge(album.babyBirthday, toDate(date), { short: true }) : '';

  useEffect(() => { if (preview.current) drawPreview(preview.current, photos[0], 240, album.babyBirthday); }, [photos, album.babyBirthday]);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try { localStorage.setItem(ORIG_PREF, withOrig ? 'on' : 'off'); } catch { /* 무시 */ }
    let wake: { release: () => Promise<void> } | null = null;
    try { wake = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* 지원 안 함 */ }
    const p = progress('사진을 만드는 중');
    try {
      const out: api.NewPhoto[] = [];
      let skipped = 0;
      for (let i = 0; i < photos.length; i++) {
        const ex = await exportPhoto(photos[i], album.babyBirthday);
        const f = photos[i].file;
        const item: api.NewPhoto = { ...ex };
        if (withOrig) { if (canKeep(f)) item.orig = f; else skipped++; }
        out.push(item);
        p.set(((i + 1) / photos.length) * 0.15);
      }
      if (skipped) toast(`${skipped}장은 원본으로 올릴 수 없어 일반 화질로 올려요`);
      p.set(0.15, '가족에게 올리는 중');
      const takenAt = date !== ymd(first) ? new Date(`${date}T12:00:00`) : first;
      const { post, skippedOriginals } = await api.createPost(album, { caption: caption.trim(), takenAt: takenAt.toISOString(), photos: out }, (f) => p.set(0.15 + f * 0.85));
      p.close();
      usePosts.getState().prepend(post);
      onDone();
      window.scrollTo(0, 0);
      nav('/home');
      toast(skippedOriginals ? `올렸어요 · 원본 ${skippedOriginals}장은 올리지 못했어요` : '사진을 올렸어요');
    } catch (e) {
      p.close();
      toast((e as Error).message || '올리지 못했어요. 다시 시도해 주세요.');
    } finally {
      wake?.release().catch(() => {});
      setBusy(false);
    }
  };

  return (
    <motion.div className={s.write} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
      <header className={s.top}>
        <button className={s.textBtn} onClick={onBack}><Icon name="back" size={22} />편집</button>
        <h2>새 게시물</h2>
        <button className={`${s.textBtn} ${s.accent}`} onClick={share} disabled={busy} data-w="post">공유</button>
      </header>
      <div className={s.body}>
        <div className={s.compose}>
          <span className={s.thumb}><canvas ref={preview} />{photos.length > 1 && <i>+{photos.length - 1}</i>}</span>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={2000} placeholder="사진에 이야기를 남겨 보세요" aria-label="사진 이야기" data-w="caption" />
        </div>
        <div className={s.ideas}>
          {IDEAS.map((t) => <button key={t} onClick={() => setCaption((c) => (c ? `${c.trimEnd()} ${t}` : t))} data-idea={t}>{t}</button>)}
        </div>
        <div className={s.list}>
          <label className={s.row}>
            <Icon name="calendar" size={22} />
            <span className={s.rowLabel}>찍은 날</span>
            <span className={s.rowVal}>{toDate(date)!.getMonth() + 1}월 {toDate(date)!.getDate()}일{age ? ` · ${age}` : ''}</span>
            <input type="date" className={s.dateOverlay} value={date} max={ymd(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="찍은 날" />
          </label>
          <label className={s.row}>
            <Icon name="image" size={22} />
            <span className={s.rowText}>
              <span>원본 화질도 함께 저장</span>
              <small>{decorated ? '꾸미기 전 ' : ''}원본을 가족이 그대로 내려받을 수 있어요 · {mb(origBytes)}MB</small>
            </span>
            <input type="checkbox" className={s.switch} checked={withOrig} onChange={(e) => setWithOrig(e.target.checked)} data-w="orig" />
          </label>
          {album.storage === 'drive' && <p className={s.note}><Icon name="shield" size={16} /> 관리자의 구글 드라이브에 저장돼요</p>}
        </div>
      </div>
      <div className={s.foot}><Button size="lg" block onClick={share} disabled={busy}>가족에게 공유</Button></div>
    </motion.div>
  );
}
