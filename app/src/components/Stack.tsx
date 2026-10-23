// 화면 넘김 (아이폰처럼)
// - 더 깊은 화면으로 갈 때: 새 화면이 오른쪽에서 밀려 들어오고, 뒤 화면은 살짝 왼쪽으로 물러나며 어두워져요
// - 돌아갈 때: 반대로 / 아래 탭끼리: 새 화면이 살며시 나타나요
// - 깊은 화면에서는 왼쪽 가장자리를 오른쪽으로 밀면 뒤로 가요 (뒤 화면이 함께 보여요)
// - 화면마다 스크롤이 따로라서, 뒤로 오면 보던 자리 그대로예요
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType, type Location } from 'react-router-dom';
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useTransform, type MotionValue, type Variants } from 'motion/react';
import { isIOS, isStandalone } from '../lib/device';
import s from './Stack.module.css';

type Dir = 'push' | 'pop' | 'fade' | 'none';
const ROOTS = new Set(['/', '/home', '/grid', '/activity', '/album']);
export const depthOf = (p: string) => (ROOTS.has(p) ? 0 : p.split('/').filter(Boolean).length);
export const isRoot = (p: string) => depthOf(p) === 0;

const EASE = [0.32, 0.72, 0, 1] as const; // 아이폰 화면 전환 곡선
const SLIDE = 0.42;
const BACK_SHIFT = 0.28; // 뒤 화면이 물러나는 정도

// 사파리(홈 화면 앱이 아닐 때)는 스스로 '밀어서 뒤로'를 움직여 줘요 → 그때는 우리 애니메이션을 겹치지 않아요
const nativeSwipeBack = isIOS() && !isStandalone();

const scrolls = new Map<string, number>();     // 화면 기록마다
const tabScrolls = new Map<string, number>();  // 아래 탭 화면마다 (탭을 다시 눌러 돌아와도 보던 자리)
let backByApp = false;
let instantNext = false;
/** 앱 안의 '뒤로' 버튼으로 돌아갈 때 불러요 (사파리에서도 미끄러지게) */
export const markBack = () => { backByApp = true; };

// ---------- 지금 화면의 스크롤 영역 ----------
const PageCtx = createContext<HTMLElement | null>(null);
export const usePageScroll = () => useContext(PageCtx);
/** 아래 탭 화면이 기억해 둔 자리를 잊어요 (다음에 열면 맨 위부터) */
export const forgetScroll = (path: string) => { tabScrolls.delete(path); };
export function scrollPageTop(smooth = false) {
  document.querySelector<HTMLElement>('[data-stack="current"] [data-scroller]')?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
}

const width = () => Math.min(window.innerWidth, 600);

export function Stack({ render }: { render: (loc: Location) => ReactNode }) {
  const loc = useLocation();
  const navType = useNavigationType();
  // 지나온 화면들 (밀어서 뒤로 갈 때 아래에 보여 줄 화면)
  const [trail, setTrail] = useState<Location[]>([loc]);
  const [view, setView] = useState({ key: loc.key, path: loc.pathname, dir: 'none' as Dir });
  if (view.key !== loc.key) {
    let dir: Dir = 'none';
    if (view.path !== loc.pathname && !instantNext) {
      const a = depthOf(view.path);
      const b = depthOf(loc.pathname);
      dir = b > a ? 'push' : b < a ? 'pop' : a === 0 ? 'fade' : navType === 'POP' ? 'pop' : 'push';
      if (dir === 'pop' && nativeSwipeBack && !backByApp) dir = 'none';
    }
    setView({ key: loc.key, path: loc.pathname, dir });
  }
  useEffect(() => {
    backByApp = false;
    instantNext = false;
    setTrail((t) => {
      if (navType === 'POP') {
        const i = t.findIndex((x) => x.key === loc.key);
        return i >= 0 ? t.slice(0, i + 1) : [loc];
      }
      if (navType === 'REPLACE') return [...t.slice(0, -1), loc];
      return t[t.length - 1]?.key === loc.key ? t : [...t, loc].slice(-20);
    });
  }, [loc, navType]);

  const below = trail.length > 1 && trail[trail.length - 1]?.key === loc.key ? trail[trail.length - 2] : null;
  const [peek, setPeek] = useState(false);
  const peekX = useMotionValue(0);
  const canSwipe = !nativeSwipeBack && depthOf(loc.pathname) > 0 && !!below;

  return (
    <>
      {peek && below && <Peek loc={below} x={peekX}>{render(below)}</Peek>}
      <AnimatePresence initial={false} custom={view.dir}>
        <Page key={loc.pathname} loc={loc} dir={view.dir} restore={navType === 'POP'}
          swipe={canSwipe ? { setPeek, peekX } : null}>
          {render(loc)}
        </Page>
      </AnimatePresence>
    </>
  );
}

const variants: Variants = {
  init: (d: Dir) => (d === 'push' ? { x: width(), opacity: 1 } : d === 'pop' ? { x: -width() * BACK_SHIFT, opacity: 1 } : d === 'fade' ? { x: 0, opacity: 0 } : { x: 0, opacity: 1 }),
  in: (d: Dir) => ({ x: 0, opacity: 1, transition: d === 'fade' ? { duration: 0.18, ease: 'easeOut' as const } : d === 'none' ? { duration: 0 } : { duration: SLIDE, ease: EASE } }),
  out: (d: Dir) => (d === 'push' ? { x: -width() * BACK_SHIFT, zIndex: 1, transition: { duration: SLIDE, ease: EASE } }
    : d === 'pop' ? { x: width(), zIndex: 3, transition: { duration: SLIDE, ease: EASE } }
    // 아래 탭끼리: 나가는 화면은 그대로 아래에 두고 새 화면만 살며시 (둘 다 반투명하게 겹치지 않게)
    : d === 'fade' ? { opacity: 0.999, zIndex: 1, transition: { duration: 0.2 } }
    : { opacity: 0, zIndex: 1, transition: { duration: 0 } }),
};

function Page({ loc, dir, restore, swipe, children }: {
  loc: Location; dir: Dir; restore: boolean; children: ReactNode;
  swipe: { setPeek: (v: boolean) => void; peekX: MotionValue<number> } | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const x = useMotionValue(dir === 'push' ? width() : dir === 'pop' ? -width() * BACK_SHIFT : 0);
  const W = width();
  const dim = useTransform(x, [-W * BACK_SHIFT, 0], [0.14, 0], { clamp: true });
  const shadow = useTransform(x, (v) => (v > 1 ? '-10px 0 30px rgba(20, 10, 16, 0.16)' : 'none'));
  // 사라지는 중인 화면은 눌리지 않게 (두 번 눌러 같은 화면이 두 번 쌓이지 않게)
  const present = useIsPresent();

  // 같은 화면(주소)인데 다른 기록으로 돌아왔으면, 밀어 둔 화면을 제자리로
  const shownKey = useRef(loc.key);
  useLayoutEffect(() => {
    if (shownKey.current === loc.key) return;
    shownKey.current = loc.key;
    x.stop();
    x.jump(0);
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const sc = scroller.current!;
    setEl(sc);
    // 뒤로 왔으면 보던 자리로 (사진이 늦게 그려져도 따라가요)
    const saved = restore ? scrolls.get(loc.key) : isRoot(loc.pathname) ? tabScrolls.get(loc.pathname) : undefined;
    if (saved) {
      let tries = 0;
      const go = () => {
        sc.scrollTop = saved;
        if (Math.abs(sc.scrollTop - saved) > 2 && tries++ < 40) requestAnimationFrame(go);
      };
      go();
    }
    return () => {
      scrolls.set(loc.key, sc.scrollTop);
      if (isRoot(loc.pathname)) tabScrolls.set(loc.pathname, sc.scrollTop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- 왼쪽 가장자리를 밀어서 뒤로 -----
  const drag = useRef<{ x0: number; t0: number; last: number; lt: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!swipe) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, t0: performance.now(), last: e.clientX, lt: performance.now() };
    swipe.peekX.set(-W * BACK_SHIFT);
    swipe.setPeek(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !swipe) return;
    const dx = Math.max(0, e.clientX - d.x0);
    x.set(dx);
    swipe.peekX.set(-W * BACK_SHIFT * (1 - dx / W));
    d.last = e.clientX;
    d.lt = performance.now();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !swipe) return;
    const dx = Math.max(0, e.clientX - d.x0);
    const v = (e.clientX - d.last) / Math.max(1, performance.now() - d.lt); // px/ms
    const go = dx > W * 0.35 || (v > 0.5 && dx > 20);
    const t = { duration: go ? 0.24 : 0.3, ease: EASE };
    if (go) {
      animate(swipe.peekX, 0, t);
      animate(x, W, t).then(() => {
        instantNext = true; // 이미 다 보이니까 바뀔 때 움직임 없이
        markBack();
        const k = loc.key;
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          window.removeEventListener('popstate', settle);
          setTimeout(() => {
            swipe.setPeek(false);
            // 뒤로 갔는데 이 화면의 기록 그대로면(남아 있던 기록) 화면을 제자리로
            if ((history.state as { key?: string } | null)?.key === k) { x.stop(); x.jump(0); }
          }, 60);
        };
        window.addEventListener('popstate', settle);
        setTimeout(settle, 700);
        history.back();
      });
    } else {
      animate(swipe.peekX, -W * BACK_SHIFT, t);
      animate(x, 0, t).then(() => swipe.setPeek(false));
    }
  };

  return (
    <motion.div className={s.frame} custom={dir} variants={variants} initial="init" animate="in" exit="out"
      style={{ x, zIndex: dir === 'pop' ? 1 : 2, boxShadow: shadow, pointerEvents: present ? undefined : 'none' }} data-stack={present ? 'current' : 'leaving'}>
      <div ref={scroller} className={s.scroller} data-scroller>
        <PageCtx.Provider value={el}>{children}</PageCtx.Provider>
      </div>
      <motion.i className={s.dim} style={{ opacity: dim }} aria-hidden="true" />
      {swipe && <div className={s.edge} data-edge onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden="true" />}
    </motion.div>
  );
}

// 밀어서 뒤로 가는 동안 아래에 보이는 이전 화면
function Peek({ loc, x, children }: { loc: Location; x: MotionValue<number>; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const W = width();
  const dim = useTransform(x, [-W * BACK_SHIFT, 0], [0.14, 0], { clamp: true });
  useLayoutEffect(() => {
    const sc = scroller.current!;
    setEl(sc);
    const saved = scrolls.get(loc.key);
    if (saved) sc.scrollTop = saved;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div className={s.frame} style={{ x, zIndex: 1 }} inert data-stack="peek">
      <div ref={scroller} className={s.scroller}>
        <PageCtx.Provider value={el}>{children}</PageCtx.Provider>
      </div>
      <motion.i className={s.dim} style={{ opacity: dim }} aria-hidden="true" />
    </motion.div>
  );
}
