import { useMemo } from 'react';
import { useStudio } from '../lib/store';
import type { Page } from '../lib/pdf';
import { Thumb } from './Thumb';
import { Board } from './Board';
import { Icon } from './Icon';

/** 두 개 이상의 PDF를 나란히 펼쳐 놓고, 누르는 페이지를 오른쪽 새 문서에 차례로 넣어요 */
export function Pick({ onPreview, onAddFiles }: { onPreview: (id: string) => void; onAddFiles: () => void }) {
  const order = useStudio((s) => s.order);
  const sources = useStudio((s) => s.sources);
  const pages = useStudio((s) => s.pages);
  const appendPage = useStudio((s) => s.appendPage);
  const appendSource = useStudio((s) => s.appendSource);
  const commit = useStudio((s) => s.commit);

  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pages) if (p.src) m.set(`${p.src}:${p.index}`, (m.get(`${p.src}:${p.index}`) ?? 0) + 1);
    return m;
  }, [pages]);

  return (
    <div className="pick">
      <div className="pick-sources">
        {order.map((id) => {
          const src = sources[id];
          return (
            <section key={id} className="pick-col" style={{ ['--hue' as string]: src.hue }}>
              <header>
                <i />
                <div>
                  <h3 title={src.name}>{src.name}</h3>
                  <span>{src.pageCount}페이지</span>
                </div>
                <button className="btn is-small" onClick={() => appendSource(id)}>
                  전부 넣기
                </button>
              </header>
              <ol>
                {Array.from({ length: src.pageCount }, (_, i) => {
                  const n = used.get(`${id}:${i}`) ?? 0;
                  const ghost: Page = { id: `${id}-${i}`, src: id, index: i, rot: 0 };
                  return (
                    <li key={i}>
                      <button
                        className={`pick-page${n ? ' is-used' : ''}`}
                        onClick={() => appendPage(id, i)}
                        aria-label={`${src.name} ${i + 1}쪽 새 문서에 넣기${n ? ` (${n}번 넣음)` : ''}`}
                      >
                        <Thumb page={ghost} source={src} />
                        <span className="pick-n">{i + 1}</span>
                        {n > 0 && <span className="pick-used">{n > 1 ? `×${n}` : <Icon name="check" size={12} />}</span>}
                        <span className="pick-add" aria-hidden>
                          <Icon name="plus" size={16} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <button className="pick-addcol" onClick={onAddFiles}>
          <Icon name="plus" size={22} />
          <span>PDF 하나 더 펼치기</span>
        </button>
      </div>

      <aside className="pick-out" aria-label="새 문서">
        <header>
          <div>
            <h3>새 문서</h3>
            <span>{pages.length ? `${pages.length}페이지 · 끌어서 순서 바꾸기` : '왼쪽에서 페이지를 눌러 넣으세요'}</span>
          </div>
          {pages.length > 0 && (
            <button className="btn is-small is-ghost" onClick={() => commit([])}>
              비우기
            </button>
          )}
        </header>
        {pages.length ? (
          <Board compact onPreview={onPreview} />
        ) : (
          <div className="pick-empty">
            <Icon name="stack" size={28} />
          </div>
        )}
      </aside>
    </div>
  );
}
