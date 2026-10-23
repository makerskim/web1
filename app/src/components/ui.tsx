// 겹쳐 뜨는 것들: 알림(토스트), 확인 창, 선택 시트, 진행 표시, 바닥 시트
// - 모두 부드러운 스프링 움직임
// - 휴대폰 '뒤로' 버튼으로 닫혀요 (열 때 기록을 하나 쌓아요)
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { create } from 'zustand';
import { Icon, type IconName } from './Icon';
import s from './ui.module.css';

export const spring = { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.9 };
export const softSpring = { type: 'spring' as const, stiffness: 260, damping: 30 };

// ---------- 뒤로 가기로 닫기 ----------
// 창을 열 때 기록을 하나 쌓고, 휴대폰 '뒤로'를 누르면 맨 위 창만 닫아요.
// 코드로 닫을 때는 쌓은 기록을 되돌리는데, 그게 끝날 때까지 다음 창은 기다렸다 열려요.
// 사파리는 back()을 한꺼번에 두 번 하면 하나만 해요 → 되돌리기는 언제나 하나씩 차례로 해요.
let seq = 0;
const stack: Array<{ id: number; close: () => void }> = [];
const undo = new Set<number>(); // 닫혀서 빼야 할 기록
let ignorePops = 0;
let backDone: Promise<void> = Promise.resolve();
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    stack.pop()?.close();
    // 드러난 기록이 이미 닫힌 창의 것이면 그것도 빼요
    if (undo.has(history.state?.pmOverlay)) popLater();
  });
}
// 맨 위 기록이 뺄 것이면 하나 빼고, 끝날 때까지 기다렸다 그다음을 봐요 (닫힌 순서와 상관없이 다 빠져요)
async function popUndone() {
  while (undo.delete(history.state?.pmOverlay)) {
    ignorePops++;
    await new Promise<void>((resolve) => {
      // popstate 처리가 다 끝난 다음 순간에 끝나요 (그 안에서 바로 back 하지 않게)
      const done = () => { window.removeEventListener('popstate', done); clearTimeout(t); setTimeout(resolve, 0); };
      window.addEventListener('popstate', done);
      const t = setTimeout(done, 600);
      history.back();
    });
  }
}
const popLater = () => { backDone = backDone.then(popUndone).catch(() => {}); };
function undoEntry(id: number) {
  undo.add(id);
  popLater();
}
// 되돌리기가 모두 끝날 때까지 기다려요 (기다리는 사이 새로 생긴 것까지)
async function backIdle() {
  for (let p = backDone; ; p = backDone) {
    await p;
    if (p === backDone) return;
  }
}
// 확인 창·메뉴가 닫힌 뒤 직접 history.back() 하기 전에 기다려요.
// 창이 기록을 되돌리는 건 React가 그린 직후라, 한 순간 쉬고 나서 끝나기를 기다려요.
export const afterBack = () => new Promise<void>((r) => setTimeout(r, 0)).then(backIdle);

export function useBackClose(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = ++seq;
    const entry = { id, close: () => { entry.closed = true; cb.current(); } } as { id: number; close: () => void; closed?: boolean };
    let cancelled = false;
    let pushed = false;
    backIdle().then(() => {
      if (cancelled) return;
      pushed = true;
      stack.push(entry);
      history.pushState({ ...(history.state || {}), pmOverlay: id }, '');
    });
    return () => {
      cancelled = true;
      if (entry.closed || !pushed) return;
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      undoEntry(id);
    };
  }, [open]);
}

// ---------- 토스트 ----------
interface ToastItem { id: number; msg: string; action?: string; onAction?: () => void }
const useToasts = create<{ list: ToastItem[] }>(() => ({ list: [] }));
export function toast(msg: string, opts: { ms?: number; action?: string; onAction?: () => void } = {}) {
  const id = ++seq;
  useToasts.setState((st) => ({ list: [...st.list.slice(-1), { id, msg, action: opts.action, onAction: opts.onAction }] }));
  // 짧은 말은 금방, 긴 안내는 읽을 만큼 (2.5~6초)
  const ms = opts.ms || Math.min(6000, Math.max(2500, msg.length * 70));
  setTimeout(() => useToasts.setState((st) => ({ list: st.list.filter((t) => t.id !== id) })), ms);
}

// 키보드가 올라와 있으면 (글을 쓰는 중) 아래 알림이 가려져요 → 그동안만 위쪽 막대 밑에
function useKeyboardTop() {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setTop(window.innerHeight - vv.height > 120 ? vv.offsetTop : null);
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return top;
}

function ToastHost() {
  const list = useToasts((st) => st.list);
  const kbTop = useKeyboardTop();
  return (
    <div className={s.toasts} aria-live="polite" style={kbTop === null ? undefined : { top: `calc(${kbTop}px + var(--safe-t) + var(--bar-h) + 8px)`, bottom: 'auto' }}>
      <AnimatePresence>
        {list.map((t) => (
          <motion.div key={t.id} className={s.toast} role="status"
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={spring}>
            <span>{t.msg}</span>
            {t.action && (
              <button className={s.toastAct} onClick={() => { useToasts.setState((st) => ({ list: st.list.filter((x) => x.id !== t.id) })); t.onAction?.(); }}>
                {t.action}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------- 확인 창 ----------
interface Ask { id: number; title: string; message?: string; ok: string; cancel: string; danger?: boolean; resolve: (v: boolean) => void }
const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));
export function confirm(o: { title: string; message?: string; ok?: string; cancel?: string; danger?: boolean }) {
  return new Promise<boolean>((resolve) => useAsk.setState({ ask: { id: ++seq, ok: '확인', cancel: '취소', ...o, resolve } }));
}

function DialogHost() {
  const ask = useAsk((st) => st.ask);
  const done = (v: boolean) => { ask?.resolve(v); useAsk.setState({ ask: null }); };
  useBackClose(!!ask, () => done(false));
  return createPortal(
    <AnimatePresence>
      {ask && (
        <motion.div key={ask.id} className={s.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onClick={(e) => e.target === e.currentTarget && done(false)}>
          <motion.div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="dlg-t"
            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={spring}>
            <h2 id="dlg-t">{ask.title}</h2>
            {ask.message && <p>{ask.message}</p>}
            <div className={s.dialogBtns}>
              {ask.cancel && <button className={s.dialogBtn} onClick={() => done(false)}>{ask.cancel}</button>}
              <button className={`${s.dialogBtn} ${s.strong} ${ask.danger ? s.danger : ''}`} data-ok onClick={() => done(true)}>{ask.ok}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- 선택 시트 (아이폰의 Action Sheet처럼) ----------
export interface MenuItem<T> { label: string; value: T; icon?: IconName; danger?: boolean }
interface MenuReq { id: number; title?: string; items: MenuItem<unknown>[]; resolve: (v: unknown) => void }
const useMenu = create<{ req: MenuReq | null }>(() => ({ req: null }));
export function menu<T>(items: MenuItem<T>[], title?: string) {
  return new Promise<T | null>((resolve) => useMenu.setState({ req: { id: ++seq, title, items, resolve: resolve as (v: unknown) => void } }));
}

function MenuHost() {
  const req = useMenu((st) => st.req);
  const done = (v: unknown) => { req?.resolve(v); useMenu.setState({ req: null }); };
  useBackClose(!!req, () => done(null));
  return createPortal(
    <AnimatePresence>
      {req && (
        <motion.div key={req.id} className={s.bottom} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && done(null)}>
          <motion.div className={s.action} initial={{ y: '110%' }} animate={{ y: 0 }} exit={{ y: '110%' }} transition={spring}>
            <div className={s.actionGroup}>
              {req.title && <p className={s.actionTitle}>{req.title}</p>}
              {req.items.map((it, i) => (
                <button key={i} className={`${s.actionItem} ${it.danger ? s.danger : ''}`} onClick={() => done(it.value)}>
                  {it.icon && <Icon name={it.icon} size={20} />}<span>{it.label}</span>
                </button>
              ))}
            </div>
            <button className={`${s.actionGroup} ${s.actionCancel}`} onClick={() => done(null)}>취소</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- 진행 표시 ----------
const useProg = create<{ text: string | null; value: number; cancel: (() => void) | null }>(() => ({ text: null, value: 0, cancel: null }));
/** 진행 표시. onCancel을 주면 '취소' 버튼이 보여요 (cancelable(false)로 숨겨요) */
export function progress(text: string, onCancel?: () => void) {
  useProg.setState({ text, value: 0, cancel: onCancel ?? null });
  return {
    set: (value: number, t?: string) => useProg.setState((st) => ({ value, text: t ?? st.text })),
    cancelable: (on: boolean) => useProg.setState({ cancel: on ? onCancel ?? null : null }),
    close: () => useProg.setState({ text: null, value: 0, cancel: null }),
  };
}

function ProgressHost() {
  const { text, value, cancel } = useProg();
  return createPortal(
    <AnimatePresence>
      {text !== null && (
        <motion.div className={s.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className={s.progress} initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={spring} role="progressbar" aria-valuenow={Math.round(value * 100)}>
            <div className={s.spinner} />
            <p>{text}</p>
            <div className={s.bar}><motion.i animate={{ width: `${Math.round(value * 100)}%` }} transition={{ ease: 'easeOut', duration: 0.25 }} /></div>
            {cancel && <button type="button" className={s.progCancel} onClick={cancel} data-f="progress-cancel">취소</button>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- 바닥 시트 (끌어내려 닫기) ----------
export function Sheet({ open, onClose, title, children, tall = false, className = '' }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean; className?: string;
}) {
  useBackClose(open, onClose);
  const drag = useDragControls();
  const onDragEnd = (_: unknown, info: PanInfo) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className={s.bottom} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}>
          <motion.section className={`${s.sheet} ${tall ? s.tall : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring}
            drag="y" dragListener={false} dragControls={drag} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={onDragEnd}>
            <header className={s.sheetHead} onPointerDown={(e) => drag.start(e)}>
              <span className={s.grip} />
              {title && <h2>{title}</h2>}
              <button className={s.sheetX} onClick={onClose} aria-label="닫기"><Icon name="close" size={20} /></button>
            </header>
            <div className={s.sheetBody}>{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- 앱에 한 번만 넣는 것 ----------
export function OverlayHosts() {
  return (
    <>
      {createPortal(<ToastHost />, document.body)}
      <DialogHost />
      <MenuHost />
      <ProgressHost />
    </>
  );
}

// 복사하기 (구형 브라우저 대비)
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래 방법으로 */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* 실패 */ }
  ta.remove();
  return ok;
}

export function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

export function useForceUpdate() {
  const [, set] = useState(0);
  return () => set((n) => n + 1);
}

/** 두 번 눌러도 한 번만 (저장하는 동안 다시 누르면 무시 — 저장 뒤 화면이 두 번 닫히지 않게) */
export function useOnce() {
  const busy = useRef(false);
  return useCallback(<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) => async (...a: A) => {
    if (busy.current) return;
    busy.current = true;
    try { await fn(...a); } finally { busy.current = false; }
  }, []);
}
