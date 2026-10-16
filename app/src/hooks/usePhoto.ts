import { useEffect, useRef, useState } from 'react';
import { photoURL } from '../lib/storage';
import { usePageScroll } from '../components/Stack';

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
  // 화면마다 스크롤 영역이 따로라서, 그 영역을 기준으로 미리 받아요
  const root = usePageScroll();
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (!('IntersectionObserver' in window)) { setNear(true); return; }
    // 시트처럼 화면 밖(body)에 띄운 곳에 있으면 화면 전체를 기준으로
    const r = root && root.contains(el) ? root : null;
    const io = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { root: r, rootMargin: `${margin} 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin, root]);
  return [ref, near] as const;
}
