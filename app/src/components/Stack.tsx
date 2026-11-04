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

// 사파리(홈 화면 앱이 아닐 때)는 스스로 '밀어서 뒤로 · 앞으로'를 움직여 줘요 → 그때는 우리 애니메이션을 겹치지 않아요
const nativeSwipeBack = isIOS() && !isStandalone();
// 왼쪽 가장자리를 밀어서 뒤로는 아이폰 홈 화면 앱에서만 (그 밖에는 휴대폰 · 브라우저의 뒤로 동작이 있어서,
// 함께 움직이면 화면이 두 번 넘어가며 겹쳐요)
const appSwipeBack = isIOS() && isStandalone();
// 브라우저가 이미 화면 넘김을 보여 준 뒤로 · 앞으로 가기면(사파리 · 크롬의 밀어서 뒤로) 우리 움직임은 생략해요
let uaTransition = false;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => { uaTransition = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true; });
}
// 밀어서 뒤로가 끝날 때까지는 다시 밀거나 누르지 않게 (중간에 끊기면 두 화면이 겹친 채로 멈춰요)
let swipeBusy = false;
let swipeGen = 0;

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
      if (navType === 'POP' && !backByApp && (nativeSwipeBack || uaTransition)) dir = 'none';
    }
    setView({ key: loc.key, path: loc.pathname, dir });
  }
  useEffect(() => {
    backByApp = false;
    instantNext = false;
    uaTransition = false;
    setTrail((t) => {
      if (navType === 'POP') {
        // 주소만 바뀐 기록(알림에서 열 때 등)은 무엇이 아래 있는지 몰라요 → 새로 시작 (엉뚱한 화면이 비치지 않게)
        if (loc.key === 'default') return [loc];
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
  const canSwipe = appSwipeBack && depthOf(loc.pathname) > 0 && !!below;

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
  // 나가다가 다시 돌아온 화면: 아이폰은 눌리지 않던 동안의 스크롤 영역을 잊을 때가 있어서 한 번 다시 잡아 줘요
  const wasLeaving = useRef(false);
  useEffect(() => {
    if (!present) { wasLeaving.current = true; return; }
    if (!wasLeaving.current) return;
    wasLeaving.current = false;
    const sc = scroller.current;
    if (!sc) return;
    const top = sc.scrollTop;
    sc.style.overflowY = 'hidden';
    void sc.offsetHeight;
    const r = requestAnimationFrame(() => { sc.style.overflowY = ''; sc.scrollTop = top; });
    return () => { cancelAnimationFrame(r); sc.style.overflowY = ''; };
  }, [present]);

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

  // ----- 왼쪽 가장자리를 밀어서 뒤로 (아이폰 홈 화면 앱) -----
  const drag = useRef<{ x0: number; last: number; lt: number; v: number; gen: number } | null>(null);
  // 뒤로 가기로 정해져 미끄러져 나가는 동안은 이 화면을 누를 수 없어요
  const [leaving, setLeaving] = useState(false);
  const onDown = (e: React.PointerEvent) => {
    if (!swipe || swipeBusy || drag.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // 놓고 되돌아가던 움직임이 남아 있으면 멈추고 손가락을 따라가요
    x.stop();
    swipe.peekX.stop();
    drag.current = { x0: e.clientX - x.get(), last: e.clientX, lt: performance.now(), v: 0, gen: ++swipeGen };
    swipe.peekX.set(-W * BACK_SHIFT * (1 - x.get() / W));
    swipe.setPeek(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !swipe) return;
    const dx = Math.max(0, e.clientX - d.x0);
    x.set(dx);
    swipe.peekX.set(-W * BACK_SHIFT * (1 - dx / W));
    // 빠르기는 움직이는 동안 재요 (손을 뗄 때는 마지막 자리와 같아서 늘 0이에요)
    const now = performance.now();
    if (now > d.lt) d.v = (e.clientX - d.last) / (now - d.lt); // px/ms
    d.last = e.clientX;
    d.lt = now;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !swipe) return;
    const dx = Math.max(0, e.clientX - d.x0);
    // 손을 뗀 게 아니면(휴대폰이 터치를 가져갔으면) 되돌려요
    const lifted = e.type === 'pointerup';
    const v = lifted && performance.now() - d.lt < 120 ? d.v : 0;
    const go = lifted && (dx > W * 0.35 || (v > 0.35 && dx > 20));
    const t = { duration: go ? 0.24 : 0.3, ease: EASE };
    if (!go) {
      animate(swipe.peekX, -W * BACK_SHIFT, t);
      animate(x, 0, t).then(() => { if (swipeGen === d.gen) swipe.setPeek(false); });
      return;
    }
    swipeBusy = true;
    setLeaving(true);
    const k = loc.key;
    let ended = false;
    // 끝: 뒤로 갔으면 아래 화면만 남기고, 못 갔으면(기록이 그대로면) 이 화면을 제자리로
    const end = () => {
      if (ended) return;
      ended = true;
      window.removeEventListener('popstate', moved);
      clearInterval(poll);
      clearTimeout(slow);
      setTimeout(() => {
        swipe.setPeek(false);
        swipeBusy = false;
        if ((history.state as { key?: string } | null)?.key === k) {
          instantNext = false;
          backByApp = false;
          x.stop();
          x.jump(0);
          setLeaving(false);
        }
      }, 60);
    };
    const moved = () => end();
    let poll = 0;
    let slow = 0;
    animate(swipe.peekX, 0, t);
    animate(x, W, t).then(() => {
      if (ended) return;
      instantNext = true; // 이미 다 보이니까 바뀔 때 움직임 없이
      markBack();
      // 기록이 정말 바뀔 때까지 기다려요 (아이폰은 뒤로 가기가 늦을 때가 있어요. 일찍 포기하면 화면이 되돌아왔다가 다시 바뀌어요)
      window.addEventListener('popstate', moved);
      poll = window.setInterval(() => { if ((history.state as { key?: string } | null)?.key !== k) end(); }, 50);
      slow = window.setTimeout(end, 3000);
      history.back();
    });
    // 움직임이 끊겨도 멈춘 채로 남지 않게
    window.setTimeout(() => { if (!poll && !ended) { ended = true; swipeBusy = false; swipe.setPeek(false); x.jump(0); setLeaving(false); } }, 1500);
  };

  return (
    <motion.div className={s.frame} custom={dir} variants={variants} initial="init" animate="in" exit="out"
      style={{ x, zIndex: dir === 'pop' ? 1 : 2, boxShadow: shadow, pointerEvents: present && !leaving ? undefined : 'none' }} data-stack={present ? 'current' : 'leaving'}>
      <div ref={scroller} className={s.scroller} data-scroller>
        <PageCtx.Provider value={el}>{children}</PageCtx.Provider>
      </div>
      <motion.i className={s.dim} style={{ opacity: dim }} aria-hidden="true" />
      {swipe && <div className={s.edge} data-edge onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp} aria-hidden="true" />}
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
