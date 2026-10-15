// 겹쳐 뜨는 것들: 알림(토스트), 확인 창, 선택 시트, 진행 표시, 바닥 시트
// - 모두 부드러운 스프링 움직임
// - 휴대폰 '뒤로' 버튼으로 닫혀요 (열 때 기록을 하나 쌓아요)
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
let seq = 0;
const stack: Array<{ id: number; close: () => void }> = [];
let ignorePops = 0;
let backDone: Promise<void> = Promise.resolve();
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    stack.pop()?.close();
  });
}
function undoEntry(id: number) {
  if (history.state?.pmOverlay !== id) return;
  ignorePops++;
  backDone = new Promise((resolve) => {
    const done = () => { window.removeEventListener('popstate', done); resolve(); };
    window.addEventListener('popstate', done);
    setTimeout(done, 600);
    history.back();
  });
}

export function useBackClose(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = ++seq;
    const entry = { id, close: () => { entry.closed = true; cb.current(); } } as { id: number; close: () => void; closed?: boolean };
    let cancelled = false;
    backDone.then(() => {
      if (cancelled) return;
      stack.push(entry);
      history.pushState({ ...(history.state || {}), pmOverlay: id }, '');
    });
    return () => {
      cancelled = true;
      if (entry.closed) return;
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
  setTimeout(() => useToasts.setState((st) => ({ list: st.list.filter((t) => t.id !== id) })), Math.max(3500, opts.ms || 0));
}

function ToastHost() {
  const list = useToasts((st) => st.list);
  return (
    <div className={s.toasts} aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div key={t.id} className={s.toast} role="status"
            initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }}
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
const useProg = create<{ text: string | null; value: number }>(() => ({ text: null, value: 0 }));
export function progress(text: string) {
  useProg.setState({ text, value: 0 });
  return {
    set: (value: number, t?: string) => useProg.setState((st) => ({ value, text: t ?? st.text })),
    close: () => useProg.setState({ text: null, value: 0 }),
  };
}

function ProgressHost() {
  const { text, value } = useProg();
  return createPortal(
    <AnimatePresence>
      {text !== null && (
        <motion.div className={s.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className={s.progress} initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={spring} role="progressbar" aria-valuenow={Math.round(value * 100)}>
            <div className={s.spinner} />
            <p>{text}</p>
            <div className={s.bar}><motion.i animate={{ width: `${Math.round(value * 100)}%` }} transition={{ ease: 'easeOut', duration: 0.25 }} /></div>
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
