import { memo, useEffect, useRef, useState } from 'react';
import { thumbnail, type Page, type Source } from '../lib/pdf';

/** 정사각 칸 안에 페이지를 회전까지 반영해서 꼭 맞게 그려요. 화면에 보일 때만 그려요. */
export const Thumb = memo(function Thumb({ page, source }: { page: Page; source?: Source }) {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !source) return;
    let alive = true;
    thumbnail(source, page.index).then((u) => alive && setUrl(u), () => {});
    return () => {
      alive = false;
    };
  }, [visible, source, page.index]);

  // 원래 회전이 들어간 이미지 크기
  const size = source?.sizes[page.index];
  const base = size ? (size.rot % 180 ? { w: size.h, h: size.w } : { w: size.w, h: size.h }) : { w: page.w ?? 595, h: page.h ?? 842 };
  const swap = page.rot % 180 !== 0;
  const dw = swap ? base.h : base.w;
  const dh = swap ? base.w : base.h;
  const s = 1 / Math.max(dw, dh);
  const style = {
    width: `${base.w * s * 100}%`,
    height: `${base.h * s * 100}%`,
    transform: `translate(-50%, -50%) rotate(${page.rot}deg)`,
  };

  return (
    <div className="thumb" ref={box}>
      <div className={`thumb-page${!page.src ? ' is-blank' : ''}${page.src && !url ? ' is-loading' : ''}`} style={style}>
        {url && <img src={url} alt="" draggable={false} />}
      </div>
    </div>
  );
});
