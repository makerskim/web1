import { useState } from 'react';
import { useNearScreen, usePhotoURL } from '../hooks/usePhoto';
import s from './Photo.module.css';

const safePh = (ph?: string) => (ph && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(ph) ? ph : '');

// 흐릿한 미리보기 위에 사진이 부드럽게 나타나요
export function Photo({ albumId, path, ph, fit = 'cover', className = '', eager = false, alt = '' }: {
  albumId: string; path: string; ph?: string; fit?: 'cover' | 'contain'; className?: string; eager?: boolean; alt?: string;
}) {
  const [ref, near] = useNearScreen<HTMLDivElement>();
  const { url, failed } = usePhotoURL(albumId, path, eager || near);
  const [loaded, setLoaded] = useState(false);
  const bg = safePh(ph);
  return (
    <div ref={ref} className={`${s.box} ${className}`} style={bg ? { backgroundImage: `url(${bg})` } : undefined}>
      {url && <img src={url} alt={alt} draggable={false} onLoad={() => setLoaded(true)} className={loaded ? s.on : ''} style={{ objectFit: fit }} />}
      {failed && <span className={s.fail}>사진을 불러오지 못했어요</span>}
    </div>
  );
}
