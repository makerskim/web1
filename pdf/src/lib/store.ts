import { create } from 'zustand';
import { closeDoc, forgetThumbs, readFile, uid, type Page, type Rot, type Source } from './pdf';

export type View = 'board' | 'pick';

interface Toast {
  id: number;
  text: string;
  tone?: 'error' | 'ok';
}

interface State {
  sources: Record<string, Source>;
  order: string[];
  pages: Page[];
  selected: string[];
  anchor: string | null;
  past: Page[][];
  future: Page[][];
  view: View;
  name: string;
  loading: number;
  toasts: Toast[];

  addFiles: (files: File[] | FileList, opts?: { addPages?: boolean }) => Promise<void>;
  removeSource: (id: string) => void;
  appendSource: (id: string) => void;
  appendPage: (srcId: string, index: number) => void;

  commit: (pages: Page[], keepSelection?: boolean) => void;
  undo: () => void;
  redo: () => void;

  select: (id: string, mode: 'toggle' | 'range' | 'only') => void;
  setSelected: (ids: string[]) => void;

  rotate: (ids: string[], by: 90 | -90) => void;
  remove: (ids: string[]) => void;
  duplicate: (ids: string[]) => void;
  insertBlank: () => void;
  reverse: () => void;
  move: (ids: string[], overId: string) => void;

  setView: (v: View) => void;
  setName: (n: string) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  reset: () => void;
}

const pagesOf = (s: Source): Page[] => Array.from({ length: s.pageCount }, (_, i) => ({ id: uid('p'), src: s.id, index: i, rot: 0 }));
const turn = (r: Rot, by: number) => ((((r + by) % 360) + 360) % 360) as Rot;
let toastSeq = 0;

export const useStudio = create<State>((set, get) => ({
  sources: {},
  order: [],
  pages: [],
  selected: [],
  anchor: null,
  past: [],
  future: [],
  view: 'board',
  name: '',
  loading: 0,
  toasts: [],

  async addFiles(list, opts) {
    const files = Array.from(list);
    if (!files.length) return;
    const addPages = opts?.addPages ?? get().view === 'board';
    set((s) => ({ loading: s.loading + files.length }));
    for (const f of files) {
      try {
        const src = await readFile(f);
        set((s) => ({
          sources: { ...s.sources, [src.id]: src },
          order: [...s.order, src.id],
          name: s.name || src.name,
        }));
        if (addPages) get().commit([...get().pages, ...pagesOf(src)], true);
      } catch (e) {
        get().toast((e as Error).message, 'error');
      } finally {
        set((s) => ({ loading: s.loading - 1 }));
      }
    }
  },

  removeSource(id) {
    const { sources, order, pages } = get();
    const rest = { ...sources };
    delete rest[id];
    set({ sources: rest, order: order.filter((o) => o !== id) });
    const next = pages.filter((p) => p.src !== id);
    // 원본을 지우면 되돌릴 수 없어서 기록도 그 원본이 없는 상태로 정리해요
    const clean = (h: Page[][]) => h.map((ps) => ps.filter((p) => p.src !== id));
    set((s) => ({ past: clean(s.past), future: clean(s.future), pages: next, selected: s.selected.filter((x) => next.some((p) => p.id === x)) }));
    closeDoc(id);
    forgetThumbs(id);
  },

  appendSource(id) {
    const src = get().sources[id];
    if (src) get().commit([...get().pages, ...pagesOf(src)], true);
  },

  appendPage(srcId, index) {
    get().commit([...get().pages, { id: uid('p'), src: srcId, index, rot: 0 }], true);
  },

  commit(pages, keepSelection) {
    set((s) => ({
      past: [...s.past.slice(-99), s.pages],
      future: [],
      pages,
      selected: keepSelection ? s.selected.filter((id) => pages.some((p) => p.id === id)) : [],
    }));
  },

  undo() {
    const { past, pages, future } = get();
    if (!past.length) return;
    set({ pages: past[past.length - 1], past: past.slice(0, -1), future: [pages, ...future], selected: [] });
  },

  redo() {
    const { past, pages, future } = get();
    if (!future.length) return;
    set({ pages: future[0], future: future.slice(1), past: [...past, pages], selected: [] });
  },

  select(id, mode) {
    const { selected, anchor, pages } = get();
    if (mode === 'only') return set({ selected: [id], anchor: id });
    if (mode === 'range' && anchor) {
      const a = pages.findIndex((p) => p.id === anchor);
      const b = pages.findIndex((p) => p.id === id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const ids = pages.slice(lo, hi + 1).map((p) => p.id);
        return set({ selected: Array.from(new Set([...selected, ...ids])) });
      }
    }
    set({ selected: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], anchor: id });
  },

  setSelected(ids) {
    set({ selected: ids });
  },

  rotate(ids, by) {
    const set_ = new Set(ids);
    get().commit(get().pages.map((p) => (set_.has(p.id) ? { ...p, rot: turn(p.rot, by) } : p)), true);
  },

  remove(ids) {
    const set_ = new Set(ids);
    const n = get().pages.filter((p) => set_.has(p.id)).length;
    get().commit(get().pages.filter((p) => !set_.has(p.id)));
    if (n) get().toast(`${n}페이지를 지웠어요 · ⌘Z 로 되돌리기`);
  },

  duplicate(ids) {
    const set_ = new Set(ids);
    const out: Page[] = [];
    const fresh: string[] = [];
    for (const p of get().pages) {
      out.push(p);
      if (set_.has(p.id)) {
        const c = { ...p, id: uid('p') };
        fresh.push(c.id);
        out.push(c);
      }
    }
    get().commit(out);
    set({ selected: fresh });
  },

  insertBlank() {
    const { pages, selected, sources } = get();
    const lastSel = [...pages].reverse().find((p) => selected.includes(p.id));
    const at = lastSel ? pages.indexOf(lastSel) + 1 : pages.length;
    const ref = lastSel ?? pages[at - 1];
    const size = ref?.src ? sources[ref.src].sizes[ref.index] : null;
    const swap = size && size.rot % 180;
    const w = ref ? (ref.src ? (swap ? size!.h : size!.w) : ref.w) : 595.28;
    const h = ref ? (ref.src ? (swap ? size!.w : size!.h) : ref.h) : 841.89;
    const blank: Page = { id: uid('p'), src: null, index: 0, rot: ref?.rot ?? 0, w, h };
    get().commit([...pages.slice(0, at), blank, ...pages.slice(at)]);
    set({ selected: [blank.id], anchor: blank.id });
  },

  reverse() {
    get().commit([...get().pages].reverse(), true);
  },

  move(ids, overId) {
    const { pages } = get();
    if (ids.includes(overId) && ids.length === 1) return;
    const moving = pages.filter((p) => ids.includes(p.id));
    const from = pages.findIndex((p) => p.id === ids[0]);
    const to = pages.findIndex((p) => p.id === overId);
    if (from < 0 || to < 0) return;
    const rest = pages.filter((p) => !ids.includes(p.id));
    let at = rest.findIndex((p) => p.id === overId);
    if (at < 0) at = Math.min(to, rest.length);
    else if (to > from) at += 1;
    get().commit([...rest.slice(0, at), ...moving, ...rest.slice(at)], true);
  },

  setView(view) {
    set({ view });
  },
  setName(name) {
    set({ name });
  },
  toast(text, tone) {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 6000 : 3200);
  },
  reset() {
    for (const id of get().order) {
      closeDoc(id);
      forgetThumbs(id);
    }
    set({ sources: {}, order: [], pages: [], selected: [], past: [], future: [], name: '' });
  },
}));
