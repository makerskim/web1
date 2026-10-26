// 첫 화면에 끌어다 놓은 파일을 편집 화면으로 넘겨줘요(메모리에서만)
let pending: File[] = [];
export const handOff = (files: File[]) => {
  pending = files;
  location.hash = '#/studio';
};
export const takePending = () => {
  const f = pending;
  pending = [];
  return f;
};
export const ACCEPT = 'application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif';
