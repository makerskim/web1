// PDF 읽기(pdf.js)와 만들기(pdf-lib). 모든 처리는 이 브라우저 안에서만 일어나요.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const asset = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;

export type Rot = 0 | 90 | 180 | 270;

export interface Source {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  /** 각 페이지의 원래 크기(pt)와 PDF 안에 이미 들어 있던 회전값 */
  sizes: { w: number; h: number; rot: number }[];
  hue: number;
}

export interface Page {
  id: string;
  /** null 이면 새로 넣은 빈 페이지 */
  src: string | null;
  index: number;
  rot: Rot;
  /** 빈 페이지 크기(pt) */
  w?: number;
  h?: number;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function openDoc(src: Source): Promise<PDFDocumentProxy> {
  let p = docs.get(src.id);
  if (!p) {
    // pdf.js 는 받은 버퍼를 워커로 넘기면서 비워 버려서 사본을 넘겨요
    p = pdfjs.getDocument({
      data: src.bytes.slice(),
      cMapUrl: asset('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: asset('standard_fonts'),
      wasmUrl: asset('wasm'),
      iccUrl: asset('iccs'),
    }).promise;
    docs.set(src.id, p);
  }
  return p;
}

export function closeDoc(id: string) {
  const p = docs.get(id);
  docs.delete(id);
  p?.then((d) => d.destroy()).catch(() => {});
}

/* ---------------------------------------------------------------- 불러오기 */

let seq = 0;
export const uid = (p = 'id') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

const HUES = [214, 340, 152, 32, 268, 190, 8, 96];
let hueAt = 0;

export async function readFile(file: File): Promise<Source> {
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) || isPdfBytes(bytes);
  if (!isPdf) {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name}: PDF나 이미지 파일만 열 수 있어요`);
    bytes = await imageToPdf(file, bytes);
  }
  const id = uid('s');
  const src: Source = { id, name: file.name.replace(/\.[^.]+$/, ''), bytes, pageCount: 0, sizes: [], hue: HUES[hueAt++ % HUES.length] };
  let doc: PDFDocumentProxy;
  try {
    doc = await openDoc(src);
  } catch (e) {
    docs.delete(id);
    const msg = (e as Error)?.name === 'PasswordException' ? '암호가 걸린 PDF는 열 수 없어요' : '손상되었거나 읽을 수 없는 파일이에요';
    throw new Error(`${file.name}: ${msg}`);
  }
  src.pageCount = doc.numPages;
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const [x0, y0, x1, y1] = pg.view;
    src.sizes.push({ w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), rot: pg.rotate });
  }
  return src;
}

const isPdfBytes = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

async function imageToPdf(file: File, bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let img;
  if (file.type === 'image/jpeg') img = await doc.embedJpg(bytes);
  else if (file.type === 'image/png') img = await doc.embedPng(bytes);
  else {
    // webp · gif · heic(지원 브라우저) 등은 캔버스로 PNG 로 바꿔서 넣어요
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('이미지를 읽을 수 없어요'))), 'image/png'));
    img = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
  }
  const page = doc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return doc.save();
}

/* ---------------------------------------------------------------- 그리기 */

/** 페이지를 캔버스로 그려요. rot 는 사용자가 더한 회전(원래 회전 위에 더해져요) */
export async function renderPage(src: Source, index: number, maxSide: number, rot: Rot = 0): Promise<HTMLCanvasElement> {
  const doc = await openDoc(src);
  const pg = await doc.getPage(index + 1);
  const rotation = (pg.rotate + rot) % 360;
  const base = pg.getViewport({ scale: 1, rotation });
  const scale = Math.min(maxSide / Math.max(base.width, base.height), 6);
  const vp = pg.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  await pg.render({ canvas, viewport: vp, background: '#ffffff' }).promise;
  return canvas;
}

export function blankCanvas(w: number, h: number, maxSide: number, rot: Rot) {
  const [vw, vh] = rot % 180 ? [h, w] : [w, h];
  const s = maxSide / Math.max(vw, vh);
  const c = document.createElement('canvas');
  c.width = Math.round(vw * s);
  c.height = Math.round(vh * s);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export function pageCanvas(sources: Record<string, Source>, p: Page, maxSide: number) {
  if (!p.src) return Promise.resolve(blankCanvas(p.w ?? 595, p.h ?? 842, maxSide, p.rot));
  return renderPage(sources[p.src], p.index, maxSide, p.rot);
}

/** 썸네일: 원래 회전만 적용한 이미지(사용자 회전은 CSS 로 돌려서 바로 반응하게 해요) */
const thumbs = new Map<string, Promise<string>>();
let running = 0;
const waiting: (() => void)[] = [];
const slot = () => new Promise<void>((r) => (running < 3 ? (running++, r()) : waiting.push(() => (running++, r()))));
const free = () => {
  running--;
  waiting.shift()?.();
};

export function thumbnail(src: Source, index: number): Promise<string> {
  const key = `${src.id}:${index}`;
  let p = thumbs.get(key);
  if (!p) {
    p = (async () => {
      await slot();
      try {
        const c = await renderPage(src, index, 420 * Math.min(2, window.devicePixelRatio || 1) * 0.75);
        return await new Promise<string>((r) => c.toBlob((b) => r(b ? URL.createObjectURL(b) : c.toDataURL()), 'image/jpeg', 0.85));
      } finally {
        free();
      }
    })();
    p.catch(() => thumbs.delete(key));
    thumbs.set(key, p);
  }
  return p;
}

export function forgetThumbs(srcId: string) {
  for (const [k, p] of thumbs) {
    if (k.startsWith(srcId + ':')) {
      thumbs.delete(k);
      p.then((u) => u.startsWith('blob:') && URL.revokeObjectURL(u)).catch(() => {});
    }
  }
}

/** 원래 회전 + 사용자 회전을 반영한, 화면에 보이는 크기 */
export function visualSize(sources: Record<string, Source>, p: Page) {
  const s = p.src ? sources[p.src]?.sizes[p.index] : null;
  const w = s ? s.w : (p.w ?? 595);
  const h = s ? s.h : (p.h ?? 842);
  const total = ((s?.rot ?? 0) + p.rot) % 180;
  return total ? { w: h, h: w } : { w, h };
}

/* ---------------------------------------------------------------- 만들기 */

export interface BuildOptions {
  pageNumbers?: 'none' | 'n' | 'n/total';
  title?: string;
}

export async function buildPdf(sources: Record<string, Source>, pages: Page[], opts: BuildOptions = {}): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const loaded = new Map<string, PDFDocument>();
  for (const p of pages) {
    if (p.src && !loaded.has(p.src)) {
      loaded.set(p.src, await PDFDocument.load(sources[p.src].bytes, { ignoreEncryption: true, updateMetadata: false }));
    }
  }
  // 같은 원본의 페이지는 한 번에 복사해서 글꼴·이미지를 나눠 쓰게 해요
  const copied = new Map<Page, import('pdf-lib').PDFPage>();
  for (const [srcId, doc] of loaded) {
    const mine = pages.filter((p) => p.src === srcId);
    const res = await out.copyPages(doc, mine.map((p) => p.index));
    mine.forEach((p, i) => copied.set(p, res[i]));
  }
  for (const p of pages) {
    const cp = copied.get(p);
    if (cp) {
      out.addPage(cp);
      cp.setRotation(degrees((((cp.getRotation().angle + p.rot) % 360) + 360) % 360));
    } else {
      const pg = out.addPage([p.w ?? 595, p.h ?? 842]);
      pg.setRotation(degrees(p.rot));
    }
  }
  if (opts.pageNumbers && opts.pageNumbers !== 'none') {
    const font = await out.embedFont(StandardFonts.Helvetica);
    const all = out.getPages();
    all.forEach((pg, i) => {
      const text = opts.pageNumbers === 'n/total' ? `${i + 1} / ${all.length}` : `${i + 1}`;
      const box = pg.getCropBox();
      const r = (((pg.getRotation().angle % 360) + 360) % 360) as Rot;
      const [W, H] = r % 180 ? [box.height, box.width] : [box.width, box.height];
      const size = Math.max(8, Math.min(11, Math.min(W, H) / 50));
      const tw = font.widthOfTextAtSize(text, size);
      const vx = W / 2 - tw / 2;
      const vy = Math.max(14, H * 0.025);
      // 화면에 보이는 좌표(vx, vy)를 페이지 원래 좌표로 바꿔요
      const w = box.width, h = box.height;
      const [x, y] = r === 0 ? [vx, vy] : r === 90 ? [w - vy, vx] : r === 180 ? [w - vx, h - vy] : [vy, h - vx];
      pg.drawText(text, { x: box.x + x, y: box.y + y, size, font, color: rgb(0.25, 0.25, 0.28), rotate: degrees(r) });
    });
  }
  out.setProducer('Folio — in-browser PDF studio');
  out.setCreator('Folio');
  if (opts.title) out.setTitle(opts.title);
  return out.save();
}

/** PPTX: 각 페이지를 고화질 이미지로 슬라이드에 그대로 넣어요(모양이 100% 똑같이 보여요) */
export async function buildPptx(
  sources: Record<string, Source>,
  pages: Page[],
  opts: { notes: boolean; onProgress?: (n: number) => void },
): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  const first = visualSize(sources, pages[0]);
  // 첫 페이지 비율로 슬라이드 크기를 정해요(가로 13.333in 기준)
  const SW = first.w >= first.h ? 13.333 : 7.5;
  const SH = (SW * first.h) / first.w;
  pptx.defineLayout({ name: 'FOLIO', width: SW, height: +SH.toFixed(3) });
  pptx.layout = 'FOLIO';
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const c = await pageCanvas(sources, p, 2200);
    const data = c.toDataURL('image/jpeg', 0.9);
    const vs = visualSize(sources, p);
    const s = Math.min(SW / vs.w, SH / vs.h);
    const w = vs.w * s, h = vs.h * s;
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addImage({ data, x: (SW - w) / 2, y: (SH - h) / 2, w, h });
    if (opts.notes && p.src) {
      const txt = await pageText(sources[p.src], p.index);
      if (txt) slide.addNotes(txt);
    }
    c.width = c.height = 0;
    opts.onProgress?.(i + 1);
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

export async function pageText(src: Source, index: number) {
  const doc = await openDoc(src);
  const pg = await doc.getPage(index + 1);
  const tc = await pg.getTextContent();
  let out = '';
  for (const it of tc.items) {
    if ('str' in it) out += it.str + (it.hasEOL ? '\n' : '');
  }
  return out.trim();
}

export async function buildImages(
  sources: Record<string, Source>,
  pages: Page[],
  opts: { format: 'png' | 'jpeg'; maxSide: number; base: string; onProgress?: (n: number) => void },
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const pad = String(pages.length).length;
  for (let i = 0; i < pages.length; i++) {
    const c = await pageCanvas(sources, pages[i], opts.maxSide);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), `image/${opts.format}`, 0.92));
    zip.file(`${opts.base}-${String(i + 1).padStart(pad, '0')}.${opts.format === 'png' ? 'png' : 'jpg'}`, blob);
    c.width = c.height = 0;
    opts.onProgress?.(i + 1);
  }
  return zip.generateAsync({ type: 'blob' });
}

export async function zipFiles(files: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data);
  return zip.generateAsync({ type: 'blob' });
}

/** "1-3, 5, 8-" 같은 글을 [[0,1,2],[4],[7..]] 로 바꿔요 */
export function parseRanges(text: string, total: number): number[][] | string {
  const groups: number[][] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*[-~–]\s*(\d*)$/);
    let a: number, b: number;
    if (m) {
      a = m[1] ? +m[1] : 1;
      b = m[2] ? +m[2] : total;
    } else if (/^\d+$/.test(part)) {
      a = b = +part;
    } else return `'${part}' 을(를) 이해하지 못했어요`;
    if (a < 1 || b > total || a > b) return `'${part}' 는 1 ~ ${total} 사이로 적어 주세요`;
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i));
  }
  return groups.length ? groups : '나눌 범위를 적어 주세요';
}

export function download(data: Blob | Uint8Array, name: string, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const safeName = (s: string) => (s.trim() || 'document').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
