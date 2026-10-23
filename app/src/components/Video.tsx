// 동영상: 첫 장면 위에 ▶, 누르면 그 자리에서 재생 (올린 사람의 구글 드라이브에서 바로 받아요)
import { useEffect, useRef, useState } from 'react';
import { Photo } from './Photo';
import { Icon } from './Icon';
import { usePhotoURL } from '../hooks/usePhoto';
import { driveFileURL, driveViewLink } from '../lib/drive';
import { driveId, isDrive } from '../lib/storage';
import { fmtDur } from '../lib/dates';
import type { PhotoMeta } from '../lib/types';
import s from './Video.module.css';

export const isVideo = (p: Pick<PhotoMeta, 'kind'>) => p.kind === 'video';

function useVideoURL(path: string | undefined, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!enabled || !path) return;
    if (!isDrive(path)) { setErr('이 동영상은 볼 수 없어요.'); return; }
    let live = true;
    driveFileURL(driveId(path)).then((u) => live && setUrl(u), (e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [path, enabled]);
  return { url, err };
}

export function VideoSlide({ albumId, item, className = '', autoPlay = false }: { albumId: string; item: PhotoMeta; className?: string; autoPlay?: boolean }) {
  const [play, setPlay] = useState(autoPlay);
  const { url: poster } = usePhotoURL(albumId, item.path, play);
  const { url, err } = useVideoURL(item.orig, play);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  // 화면에서 벗어나면(옆 사진으로 넘기거나 스크롤) 멈춰요
  useEffect(() => {
    const el = box.current;
    if (!play || !el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => { if (!en[0].isIntersecting) video.current?.pause(); }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [play]);

  if (!play) {
    return (
      <div ref={box} className={`${s.box} ${className}`} data-video="poster">
        <Photo albumId={albumId} path={item.path} ph={item.ph} fit="contain" className={s.poster} />
        <button type="button" className={s.play} onClick={(e) => { e.stopPropagation(); setPlay(true); }} aria-label="동영상 재생" data-act="play">
          <Icon name="play" size={30} />
        </button>
        {!!item.dur && <span className={s.dur}>{fmtDur(item.dur)}</span>}
      </div>
    );
  }
  const drive = item.orig && isDrive(item.orig) ? driveViewLink(driveId(item.orig)) : '';
  return (
    // 동영상을 누르는 건 재생·멈춤이에요 (크게 보기·좋아요로 넘어가지 않게)
    <div ref={box} className={`${s.box} ${s.on} ${className}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} data-video="playing">
      {url && !failed && (
        <video ref={video} src={url} poster={poster || undefined} controls autoPlay playsInline preload="metadata" className={s.video} onError={() => setFailed(true)} />
      )}
      {!url && !err && !failed && <span className={s.spin} aria-label="불러오는 중" />}
      {(failed || err) && (
        <div className={s.fail}>
          <p>{err || '이 휴대폰에서 재생할 수 없는 형식이에요.'}</p>
          {drive && <a href={drive} target="_blank" rel="noopener noreferrer">구글 드라이브에서 보기</a>}
        </div>
      )}
    </div>
  );
}

/** 작은 칸(모아보기·가족 탭)의 동영상 표시 */
export function VideoMark({ item }: { item: Pick<PhotoMeta, 'kind' | 'dur'> }) {
  if (!isVideo(item)) return null;
  return <span className={s.mark} aria-label="동영상"><Icon name="play" size={11} />{fmtDur(item.dur)}</span>;
}
