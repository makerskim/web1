import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ACCEPT, handOff } from '../lib/handoff';
import './landing.css';

const TOOLS: { name: string; text: string; art: string }[] = [
  { name: '정리', text: '페이지를 끌어서 순서를 바꾸고, 돌리고, 지우고, 복제해요. 여러 장을 한꺼번에 골라서 해도 돼요.', art: 'arrange' },
  { name: '합치기', text: '여러 PDF와 사진을 한 번에 올리면 한 문서로 이어져요. 어느 파일에서 온 페이지인지 색으로 보여요.', art: 'merge' },
  { name: '나누기', text: '“1-3, 4-8, 9-” 처럼 범위로, N페이지씩, 또는 한 장씩 나눠서 ZIP으로 받아요.', art: 'split' },
  { name: '골라 만들기', text: '두 개 이상의 PDF를 나란히 펼쳐 놓고, 필요한 페이지만 눌러서 새 PDF를 만들어요.', art: 'pick' },
  { name: 'PPTX로 바꾸기', text: '페이지마다 슬라이드 한 장. 모양이 그대로 옮겨지고, 페이지 글자는 발표자 노트에 넣을 수 있어요.', art: 'pptx' },
  { name: '이미지로 저장', text: '모든 페이지를 PNG나 JPG로 한 번에 받아요. 페이지 번호를 넣은 PDF로도 저장할 수 있어요.', art: 'image' },
];

const FAQ: { q: string; a: string }[] = [
  { q: '정말 파일이 서버로 올라가지 않나요?', a: 'Folio는 화면 파일만 내려받는 정적 사이트예요. PDF를 읽고, 그리고, 새로 만드는 일이 전부 이 브라우저 안에서 일어나요. 탭을 닫으면 메모리에서 사라지고 어디에도 남지 않아요. 인터넷을 끊은 뒤에도 이미 열린 페이지에서는 그대로 편집돼요.' },
  { q: '어떤 파일을 열 수 있나요?', a: 'PDF와 사진(JPG · PNG · WebP · GIF)을 열 수 있어요. 사진은 한 장이 한 페이지가 돼요. 암호가 걸린 PDF는 열 수 없어요.' },
  { q: 'PPTX로 바꾸면 글자를 고칠 수 있나요?', a: '슬라이드에는 페이지가 고화질 이미지로 들어가서 원본과 똑같이 보여요. 대신 글자를 바로 고칠 수는 없어서, 필요하면 “발표자 노트에 글자 넣기”를 켜고 노트의 글을 복사해 쓰세요.' },
  { q: '큰 파일도 되나요?', a: '컴퓨터 메모리가 허락하는 만큼 돼요. 수백 페이지짜리도 썸네일은 화면에 보이는 것부터 그려서 바로 편집할 수 있어요. 휴대폰에서는 100MB 아래를 권해요.' },
  { q: '무료인가요? 가입해야 하나요?', a: '무료이고 가입도 없어요. 광고나 추적 코드도 넣지 않았어요.' },
];

export default function Landing() {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Folio — 브라우저에서 끝내는 PDF 편집';
  }, []);

  const open = () => input.current?.click();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) handOff(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      className={`lp${drag ? ' is-drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => e.target.files?.length && handOff(Array.from(e.target.files))}
      />

      <header className="lp-nav">
        <a href="#/" className="lp-logo" aria-label="Folio 처음으로">
          <Mark /> Folio
        </a>
        <nav>
          <a href="#tools" onClick={scrollTo('tools')}>기능</a>
          <a href="#how" onClick={scrollTo('how')}>사용법</a>
          <a href="#faq" onClick={scrollTo('faq')}>자주 묻는 질문</a>
        </nav>
        <a className="lp-nav-cta" href="#/studio">편집기 열기</a>
      </header>

      <section className="lp-hero">
        <h1 className="lp-title">
          <span>PDF를</span>
          <span>종이처럼.</span>
        </h1>
        <p className="lp-lede">
          끌어서 옮기고, 돌리고, 빼고, 합치고, 나눠요.
          <br />
          파일은 이 브라우저 밖으로 한 번도 나가지 않아요.
        </p>
        <div className="lp-actions">
          <button className="lp-btn" onClick={open}>PDF 열기</button>
          <a className="lp-link" href="#/studio">빈 편집기로 시작</a>
        </div>
        <p className="lp-hint">또는 이 화면 아무 곳에 PDF를 끌어다 놓으세요</p>
        <Shuffle />
      </section>

      <section className="lp-claim" aria-label="개인정보">
        <p>
          올리기 버튼은 있지만,
          <br />
          <em>업로드는 없어요.</em>
        </p>
        <div className="lp-claim-facts">
          <div>
            <strong>0 바이트</strong>
            <span>서버로 보내는 내 파일</span>
          </div>
          <div>
            <strong>가입 없음</strong>
            <span>열자마자 바로 편집</span>
          </div>
          <div>
            <strong>무료</strong>
            <span>광고 · 추적 코드 없음</span>
          </div>
        </div>
      </section>

      <section className="lp-tools" id="tools">
        <h2 className="lp-h2">필요한 건 다 있어요.</h2>
        <ul>
          {TOOLS.map((t) => (
            <li key={t.name} className="lp-tool">
              <ToolArt kind={t.art} />
              <div>
                <h3>{t.name}</h3>
                <p>{t.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="lp-tools-more">되돌리기와 다시 하기, 빈 페이지 넣기, 순서 뒤집기, 홀수 · 짝수 페이지 고르기, 키보드 단축키까지.</p>
      </section>

      <section className="lp-how" id="how">
        <h2 className="lp-h2">세 단계면 끝나요.</h2>
        <ol>
          <li>
            <b>1</b>
            <h3>열기</h3>
            <p>PDF나 사진을 끌어다 놓거나 골라요. 여러 개도 한 번에.</p>
          </li>
          <li>
            <b>2</b>
            <h3>편집</h3>
            <p>페이지를 끌어서 옮기고, 골라서 돌리거나 지워요. 실수해도 ⌘Z.</p>
          </li>
          <li>
            <b>3</b>
            <h3>저장</h3>
            <p>PDF · 나눈 PDF · PPTX · 이미지 중 하나로 내려받아요.</p>
          </li>
        </ol>
      </section>

      <section className="lp-faq" id="faq">
        <h2 className="lp-h2">자주 묻는 질문</h2>
        <div>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <i aria-hidden />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-end">
        <h2>지금 PDF 하나 열어 보세요.</h2>
        <button className="lp-drop" onClick={open}>
          <span className="lp-drop-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
          </span>
          <span>
            <strong>여기를 눌러 파일 고르기</strong>
            <small>또는 끌어다 놓기 · PDF, JPG, PNG</small>
          </span>
        </button>
      </section>

      <footer className="lp-foot">
        <span><Mark /> Folio</span>
        <span>모든 처리는 내 기기 안에서 · pdf.js · pdf-lib · PptxGenJS</span>
      </footer>

      <div className="lp-dropveil" aria-hidden>
        <div>놓으면 바로 열려요</div>
      </div>
    </div>
  );
}

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="8" y="3" width="11" height="15" rx="2" fill="currentColor" opacity=".35" transform="rotate(10 13 10)" />
      <rect x="5" y="5" width="11" height="15" rx="2" fill="currentColor" />
    </svg>
  );
}

/* 히어로의 종이 다발: 페이지가 한 번 섞였다가 제자리를 찾아가요 */
const SHEETS = [
  { hue: 214, n: 1, s: 4 },
  { hue: 340, n: 2, s: 0 },
  { hue: 214, n: 3, s: 6 },
  { hue: 152, n: 4, s: 2 },
  { hue: 340, n: 5, s: 5 },
  { hue: 32, n: 6, s: 1 },
  { hue: 152, n: 7, s: 3 },
];

function Shuffle() {
  return (
    <div className="lp-stage" aria-hidden>
      <div className="lp-sheets">
        {SHEETS.map((s, i) => (
          <div key={i} className="lp-sheet" style={{ ['--i' as string]: i, ['--s' as string]: s.s, ['--h' as string]: s.hue }}>
            <span className="lp-sheet-band" />
            <span className="lp-sheet-l w1" />
            <span className="lp-sheet-l w2" />
            <span className="lp-sheet-l w3" />
            <span className="lp-sheet-box" />
            <span className="lp-sheet-l w2" />
            <span className="lp-sheet-l w1" />
            <span className="lp-sheet-n">{s.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolArt({ kind }: { kind: string }) {
  const sheet = (h: number, extra = '') => <span className={`ta-s ${extra}`} style={{ ['--h' as string]: h }} />;
  return (
    <div className={`ta ta-${kind}`} aria-hidden>
      {kind === 'arrange' && (
        <>
          {sheet(214)}
          {sheet(214, 'ta-rot')}
          {sheet(214, 'ta-lift')}
          {sheet(214, 'ta-gone')}
        </>
      )}
      {kind === 'merge' && (
        <>
          <div className="ta-col">{sheet(214)}{sheet(214)}</div>
          <span className="ta-plus">+</span>
          <div className="ta-col">{sheet(340)}{sheet(340)}</div>
          <span className="ta-eq">=</span>
          <div className="ta-col">{sheet(214)}{sheet(214)}{sheet(340)}{sheet(340)}</div>
        </>
      )}
      {kind === 'split' && (
        <>
          <div className="ta-col">{sheet(152)}{sheet(152)}</div>
          <span className="ta-cut" />
          <div className="ta-col">{sheet(152)}{sheet(152)}{sheet(152)}</div>
        </>
      )}
      {kind === 'pick' && (
        <>
          <div className="ta-col ta-dim">{sheet(214)}{sheet(214, 'ta-on')}{sheet(214)}</div>
          <div className="ta-col ta-dim">{sheet(32, 'ta-on')}{sheet(32)}{sheet(32, 'ta-on')}</div>
        </>
      )}
      {kind === 'pptx' && (
        <>
          {sheet(268)}
          <span className="ta-arrow" />
          <span className="ta-slide"><i /></span>
        </>
      )}
      {kind === 'image' && (
        <>
          {sheet(190)}
          <span className="ta-arrow" />
          <span className="ta-photo" />
          <span className="ta-photo" />
        </>
      )}
    </div>
  );
}
