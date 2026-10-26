import { useEffect, useRef, useState } from 'react';
import { useStudio } from '../lib/store';
import { pageCanvas } from '../lib/pdf';
import { Icon } from './Icon';

export function Preview({ id, onClose, onGo }: { id: string; onClose: () => void; onGo: (id: string) => void }) {
  const pages = useStudio((s) => s.pages);
  const sources = useStudio((s) => s.sources);
  const rotate = useStudio((s) => s.rotate);
  const remove = useStudio((s) => s.remove);
  const holder = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);

  const i = pages.findIndex((p) => p.id === id);
  const page = pages[i];

  useEffect(() => {
    if (!page) return onClose();
    let alive = true;
    setBusy(true);
    const side = Math.min(2400, Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1));
    pageCanvas(sources, page, side).then((c) => {
      if (!alive || !holder.current) return;
      holder.current.replaceChildren(c);
      setBusy(false);
    });
    return () => {
      alive = false;
    };
  }, [page, sources, onClose]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && i > 0) onGo(pages[i - 1].id);
      else if (e.key === 'ArrowRight' && i < pages.length - 1) onGo(pages[i + 1].id);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [i, pages, onClose, onGo]);

  if (!page) return null;
  const src = page.src ? sources[page.src] : null;

  return (
    <div className="preview" role="dialog" aria-modal="true" aria-label={`${i + 1}페이지 크게 보기`} onClick={onClose}>
      <div className="preview-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          <b>{i + 1}</b> / {pages.length}
          <small>{src ? `${src.name} · ${page.index + 1}쪽` : '빈 페이지'}</small>
        </span>
        <div>
          <button className="icon-btn" title="왼쪽으로 돌리기" onClick={() => rotate([page.id], -90)}><Icon name="rotl" /></button>
          <button className="icon-btn" title="오른쪽으로 돌리기" onClick={() => rotate([page.id], 90)}><Icon name="rotr" /></button>
          <button
            className="icon-btn"
            title="지우기"
            onClick={() => {
              const next = pages[i + 1] ?? pages[i - 1];
              remove([page.id]);
              next ? onGo(next.id) : onClose();
            }}
          >
            <Icon name="trash" />
          </button>
          <button className="icon-btn" title="닫기 (Esc)" onClick={onClose}><Icon name="x" /></button>
        </div>
      </div>
      <div className="preview-stage">
        <button className="preview-nav" disabled={i === 0} onClick={(e) => (e.stopPropagation(), onGo(pages[i - 1].id))} aria-label="이전 페이지">
          <Icon name="left" size={22} />
        </button>
        <div className="preview-canvas" ref={holder} onClick={(e) => e.stopPropagation()} />
        {busy && <span className="spinner preview-spin" />}
        <button
          className="preview-nav"
          disabled={i === pages.length - 1}
          onClick={(e) => (e.stopPropagation(), onGo(pages[i + 1].id))}
          aria-label="다음 페이지"
        >
          <Icon name="right" size={22} />
        </button>
      </div>
    </div>
  );
}
