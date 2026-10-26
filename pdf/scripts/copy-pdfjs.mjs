// pdf.js 가 한글 같은 CJK 글꼴 · 표준 글꼴 · 이미지 해독기를 읽어 오는 파일을 public/pdfjs 로 복사해요.
// 사이트 밖(CDN)에서 받아 오지 않으니 PDF 내용과 관련된 요청이 외부로 나가지 않아요.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pdfjs-dist');
const to = join(root, 'public', 'pdfjs');
mkdirSync(to, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(from, dir), join(to, dir), { recursive: true });
}
console.log('pdf.js assets → public/pdfjs');
