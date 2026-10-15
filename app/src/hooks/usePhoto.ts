import { useEffect, useRef, useState } from 'react';
import { photoURL } from '../lib/storage';

// 사진 주소 (휴대폰 보관본 먼저). visible이 될 때만 받아요
export function usePhotoURL(albumId: string | null | undefined, path: string | null | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!albumId || !path || !enabled) return;
    let live = true;
    setFailed(false);
    photoURL(albumId, path).then((u) => live && setUrl(u), () => live && setFailed(true));
    return () => { live = false; };
  }, [albumId, path, enabled]);
  return { url, failed };
}

// 화면 가까이 오면 true
export function useNearScreen<T extends Element>(margin = '600px') {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (!('IntersectionObserver' in window)) { setNear(true); return; }
    const io = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: `${margin} 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}
