// QR 코드 (휴대폰 카메라로 찍으면 초대 링크가 열려요)
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

function matrix(text: string) {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return { n, dark: (r: number, c: number) => q.isDark(r, c) };
}

export function QR({ text, size = 200, className = '' }: { text: string; size?: number; className?: string }) {
  const { n, d } = useMemo(() => {
    const m = matrix(text);
    let path = '';
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { n: m.n, d: path };
  }, [text]);
  const v = n + 8; // 둘레 여백 4칸
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${v} ${v}`} shapeRendering="crispEdges" role="img" aria-label="초대 QR 코드" data-f="qr">
      <rect width={v} height={v} fill="#fff" />
      <path d={d} fill="#1f1a21" />
    </svg>
  );
}

/** QR을 사진(PNG)으로: 위에 앨범 이름, 아래에 초대 코드 */
export async function qrImage(text: string, title: string, code: string): Promise<Blob> {
  const m = matrix(text);
  const cell = 12, pad = 48, top = 120, bottom = 120;
  const w = m.n * cell + pad * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = w + top + bottom - pad * 2 + pad;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#1f1a21';
  x.textAlign = 'center';
  x.font = '700 40px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
  x.fillText(title.slice(0, 18), w / 2, 76);
  for (let r = 0; r < m.n; r++) for (let col = 0; col < m.n; col++) if (m.dark(r, col)) x.fillRect(pad + col * cell, top + r * cell, cell, cell);
  x.font = '600 32px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
  x.fillStyle = '#6b5f66';
  x.fillText(`초대 코드 ${code}`, w / 2, top + m.n * cell + 70);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('QR 사진을 만들지 못했어요.'))), 'image/png'));
}
