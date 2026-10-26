import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useStudio } from '../lib/store';
import { ACCEPT, takePending } from '../lib/handoff';
import { Board } from './Board';
import { Pick } from './Pick';
import { Preview } from './Preview';
import { Export, type ExportTab } from './Export';
import { Icon } from './Icon';
import { Mark } from '../landing/Landing';
import './studio.css';

export default function Studio() {
  const s = useStudio();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportTab | null>(null);
  const [zoom, setZoom] = useState(() => {
    try {
      return Number(localStorage.getItem('folio.zoom')) || 168;
    } catch {
      return 168;
    }
  });
  const [side, setSide] = useState(false);

  const { addFiles } = s;
  useEffect(() => {
    document.title = 'Folio 편집기';
    const f = takePending();
    if (f.length) addFiles(f, { addPages: true });
  }, [addFiles]);

  useEffect(() => {
    try {
      localStorage.setItem('folio.zoom', String(zoom));
    } catch {
      /* 저장 못 해도 괜찮아요 */
    }
  }, [zoom]);

  // 편집 중에 탭을 닫으려 하면 한 번 물어봐요(파일은 어디에도 저장되지 않으니까요)
  const hasWork = s.pages.length > 0;
  useEffect(() => {
    if (!hasWork) return;
    const on = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, [hasWork]);

  // 키보드 단축키
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || preview || exporting) return;
      const st = useStudio.getState();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') st[e.shiftKey ? 'redo' : 'undo']();
      else if (mod && k === 'y') st.redo();
      else if (mod && k === 'a') st.setSelected(st.pages.map((p) => p.id));
      else if (mod && k === 's') setExporting('pdf');
      else if (mod && k === 'd' && st.selected.length) st.duplicate(st.selected);
      else if ((k === 'delete' || k === 'backspace') && st.selected.length) st.remove(st.selected);
      else if (k === 'escape') st.setSelected([]);
      else if (k === 'r' && !mod && st.selected.length) st.rotate(st.selected, e.shiftKey ? -90 : 90);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [preview, exporting]);

  const pickFiles = () => input.current?.click();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) s.addFiles(e.dataTransfer.files);
  };
  const closePreview = useCallback(() => setPreview(null), []);
  const closeExport = useCallback(() => setExporting(null), []);

  const sel = s.selected;
  const empty = s.order.length === 0;
  const pagesCount = s.pages.length;

  const selectWhere = (fn: (i: number) => boolean) => s.setSelected(s.pages.filter((_, i) => fn(i)).map((p) => p.id));

  return (
    <div
      className={`studio${drag ? ' is-drag' : ''}`}
      style={{ ['--thumb' as string]: `${zoom}px` }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrag(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) s.addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <header className="top">
        <a href="#/" className="top-logo" title="처음 화면으로">
          <Mark />
          <span>Folio</span>
        </a>
        {!empty && (
          <button className="icon-btn top-side" onClick={() => setSide((v) => !v)} aria-expanded={side} title="파일 목록">
            <Icon name="sidebar" />
          </button>
        )}
        <label className="top-name">
          <span className="sr-only">저장할 파일 이름</span>
          <input value={s.name} onChange={(e) => s.setName(e.target.value)} placeholder="제목 없는 문서" spellCheck={false} />
        </label>

        <div className="top-mid">
          <div className="seg is-top" role="tablist" aria-label="보기">
            <button role="tab" aria-selected={s.view === 'board'} className={s.view === 'board' ? 'is-on' : ''} onClick={() => s.setView('board')}>
              <Icon name="grid" size={15} /> 정리
            </button>
            <button role="tab" aria-selected={s.view === 'pick'} className={s.view === 'pick' ? 'is-on' : ''} onClick={() => s.setView('pick')}>
              <Icon name="columns" size={15} /> 골라 만들기
            </button>
          </div>
        </div>

        <div className="top-end">
          <button className="icon-btn" onClick={s.undo} disabled={!s.past.length} title="되돌리기 (⌘Z)">
            <Icon name="undo" />
          </button>
          <button className="icon-btn" onClick={s.redo} disabled={!s.future.length} title="다시 하기 (⇧⌘Z)">
            <Icon name="redo" />
          </button>
          <button className="btn" onClick={pickFiles}>
            <Icon name="plus" size={16} /> <span className="hide-sm">파일 추가</span>
          </button>
          <button className="btn is-primary" onClick={() => setExporting('pdf')} disabled={!pagesCount}>
            <Icon name="download" size={16} /> 저장
          </button>
        </div>
      </header>

      {empty ? (
        <Empty onPick={pickFiles} loading={s.loading > 0} />
      ) : (
        <div className="body">
          <aside className={`side${side ? ' is-open' : ''}`} aria-label="올린 파일">
            <div className="side-head">
              <h2>파일 {s.order.length}개</h2>
              <button className="btn is-small is-ghost" onClick={pickFiles}>
                <Icon name="plus" size={14} /> 추가
              </button>
            </div>
            <ul className="files">
              {s.order.map((id) => {
                const src = s.sources[id];
                const used = s.pages.filter((p) => p.src === id).length;
                return (
                  <li key={id} style={{ ['--hue' as string]: src.hue }}>
                    <i />
                    <div>
                      <b title={src.name}>{src.name}</b>
                      <small>
                        {src.pageCount}페이지 중 {used}페이지 사용
                      </small>
                    </div>
                    <div className="files-tools">
                      <button className="icon-btn is-small" title="이 파일의 페이지 모두 고르기" onClick={() => s.setSelected(s.pages.filter((p) => p.src === id).map((p) => p.id))}>
                        <Icon name="check" size={15} />
                      </button>
                      <button className="icon-btn is-small" title="이 파일 전부 다시 넣기" onClick={() => s.appendSource(id)}>
                        <Icon name="plus" size={15} />
                      </button>
                      <button
                        className="icon-btn is-small"
                        title="파일 빼기"
                        onClick={() => {
                          if (!used || confirm(`'${src.name}'을(를) 빼면 이 파일의 페이지 ${used}개도 함께 빠져요.`)) s.removeSource(id);
                        }}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
              {s.loading > 0 && (
                <li className="files-loading">
                  <span className="spinner" /> 여는 중…
                </li>
              )}
            </ul>

            <div className="side-sec">
              <h2>내보내기</h2>
              <div className="side-actions">
                <button onClick={() => setExporting('pdf')} disabled={!pagesCount}><Icon name="file" size={16} /> PDF로 저장</button>
                <button onClick={() => setExporting('split')} disabled={!pagesCount}><Icon name="columns" size={16} /> 나눠서 저장</button>
                <button onClick={() => setExporting('pptx')} disabled={!pagesCount}><Icon name="stack" size={16} /> PPTX로 바꾸기</button>
                <button onClick={() => setExporting('image')} disabled={!pagesCount}><Icon name="grid" size={16} /> 이미지로 저장</button>
              </div>
            </div>

            <div className="side-sec side-keys">
              <h2>단축키</h2>
              <dl>
                <dt>클릭 · ⇧클릭</dt><dd>고르기 · 범위로 고르기</dd>
                <dt>두 번 클릭</dt><dd>크게 보기</dd>
                <dt>R · ⇧R</dt><dd>오른쪽 · 왼쪽으로 돌리기</dd>
                <dt>Delete</dt><dd>지우기</dd>
                <dt>⌘D</dt><dd>복제</dd>
                <dt>⌘A · Esc</dt><dd>모두 고르기 · 해제</dd>
                <dt>⌘Z · ⇧⌘Z</dt><dd>되돌리기 · 다시 하기</dd>
              </dl>
              <p>휴대폰에서는 페이지를 길게 눌러서 옮겨요.</p>
            </div>
          </aside>
          {side && <div className="side-scrim" onClick={() => setSide(false)} />}

          <main className="main">
            {s.view === 'board' ? (
              <>
                <div className="tools">
                  <span className="tools-count">
                    <b>{pagesCount}</b>페이지
                  </span>
                  <div className="tools-group">
                    <button className="btn is-small is-ghost" onClick={() => s.setSelected(s.pages.map((p) => p.id))}>모두</button>
                    <button className="btn is-small is-ghost" onClick={() => selectWhere((i) => i % 2 === 0)}>홀수</button>
                    <button className="btn is-small is-ghost" onClick={() => selectWhere((i) => i % 2 === 1)}>짝수</button>
                    <button className="btn is-small is-ghost" onClick={() => s.setSelected(s.pages.filter((p) => !sel.includes(p.id)).map((p) => p.id))}>반대로</button>
                  </div>
                  <div className="tools-group">
                    <button className="btn is-small is-ghost" onClick={s.insertBlank} title={sel.length ? '고른 페이지 뒤에 빈 페이지 넣기' : '맨 뒤에 빈 페이지 넣기'}>
                      <Icon name="blank" size={15} /> 빈 페이지
                    </button>
                    <button className="btn is-small is-ghost" onClick={s.reverse} disabled={pagesCount < 2}>
                      <Icon name="reverse" size={15} /> 순서 뒤집기
                    </button>
                  </div>
                  <label className="zoom" title="썸네일 크기">
                    <span className="sr-only">썸네일 크기</span>
                    <Icon name="grid" size={14} />
                    <input type="range" min={110} max={300} step={2} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
                  </label>
                </div>
                {pagesCount ? (
                  <Board onPreview={setPreview} />
                ) : (
                  <div className="board-empty">
                    <p>페이지가 비었어요.</p>
                    <span>왼쪽 파일 목록의 <b>+</b>로 페이지를 다시 넣거나, ‘골라 만들기’에서 필요한 페이지만 고르세요.</span>
                  </div>
                )}
              </>
            ) : (
              <Pick onPreview={setPreview} onAddFiles={pickFiles} />
            )}
          </main>
        </div>
      )}

      {sel.length > 0 && !exporting && !preview && (
        <div className="selbar" role="toolbar" aria-label="고른 페이지">
          <span className="selbar-n">
            <b>{sel.length}</b>개 고름
          </span>
          <button className="icon-btn" title="왼쪽으로 돌리기 (⇧R)" onClick={() => s.rotate(sel, -90)}><Icon name="rotl" /></button>
          <button className="icon-btn" title="오른쪽으로 돌리기 (R)" onClick={() => s.rotate(sel, 90)}><Icon name="rotr" /></button>
          <button className="icon-btn" title="복제 (⌘D)" onClick={() => s.duplicate(sel)}><Icon name="copy" /></button>
          <button className="icon-btn is-danger" title="지우기 (Delete)" onClick={() => s.remove(sel)}><Icon name="trash" /></button>
          <span className="selbar-sep" />
          <button className="btn is-small is-light" onClick={() => setExporting('pdf')}>
            <Icon name="download" size={15} /> 고른 페이지 저장
          </button>
          <button className="icon-btn" title="고르기 해제 (Esc)" onClick={() => s.setSelected([])}><Icon name="x" /></button>
        </div>
      )}

      {preview && <Preview id={preview} onClose={closePreview} onGo={setPreview} />}
      {exporting && <Export tab={exporting} onClose={closeExport} />}

      <div className="toasts" aria-live="polite">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast${t.tone ? ` is-${t.tone}` : ''}`}>
            {t.text}
          </div>
        ))}
      </div>

      <div className="dropveil" aria-hidden>
        <div>
          <Icon name="plus" size={28} />
          <b>놓으면 {s.view === 'pick' ? '나란히 펼쳐져요' : '뒤에 이어 붙어요'}</b>
        </div>
      </div>
    </div>
  );
}

function Empty({ onPick, loading }: { onPick: () => void; loading: boolean }) {
  return (
    <div className="empty">
      <button className="empty-drop" onClick={onPick} disabled={loading}>
        <div className="empty-art" aria-hidden>
          <span /><span /><span />
        </div>
        {loading ? (
          <b><span className="spinner" /> 여는 중…</b>
        ) : (
          <>
            <b>PDF나 사진을 여기에 끌어다 놓으세요</b>
            <span>또는 눌러서 고르기 · 여러 개를 한 번에 올리면 합쳐져요</span>
          </>
        )}
      </button>
      <p className="empty-note">
        <Icon name="check" size={14} /> 파일은 이 브라우저 안에서만 열려요. 어디에도 올라가거나 저장되지 않아요.
      </p>
    </div>
  );
}
