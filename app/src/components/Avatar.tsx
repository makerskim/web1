import { useState } from 'react';
import { useAlbum } from '../state/session';
import { usePhotoURL } from '../hooks/usePhoto';
import s from './Avatar.module.css';

// 얼굴: 카카오·구글 사진 / 내가 올린 사진(sb:경로) / 없으면 이름 첫 글자
export function Avatar({ src, name = '', size = 32, ring = false, seen = false, className = '' }: {
  src?: string; name?: string; size?: number; ring?: boolean; seen?: boolean; className?: string;
}) {
  const album = useAlbum();
  const isStored = !!src && src.startsWith('sb:');
  const { url } = usePhotoURL(album?.id, isStored ? src!.slice(3) : null);
  const [broken, setBroken] = useState<string | null>(null);
  const img0 = isStored ? url : src && src.startsWith('https://') ? src : null;
  const img = img0 && img0 !== broken ? img0 : null;
  const initial = (name.trim()[0] || '·').toUpperCase();
  const face = (
    <span className={s.face} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {img ? <img src={img} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(img)} /> : <span aria-hidden="true">{initial}</span>}
    </span>
  );
  if (!ring) return <span className={`${s.wrap} ${className}`}>{face}</span>;
  return <span className={`${s.ring} ${seen ? s.seen : ''} ${className}`}>{face}</span>;
}
