// 사진을 가운데 정사각형으로 잘라 작게 (프로필 사진용)
export async function squarePhoto(file: File, size = 320): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.'));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('사진을 만들지 못했어요.'))), 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)}GB` : `${Math.max(0.1, n / 1024 ** 2).toFixed(1)}MB`);
