// 한국어 조사: 받침이 있으면 '이/을/과', 없으면 '가/를/와'
export function hasBatchim(word: string) {
  const w = String(word).trim();
  const c = w.charCodeAt(w.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[013678LMNRlmnr]$/.test(w);
}
export const subj = (n: string) => `${n}${hasBatchim(n) ? '이' : '가'}`;
export const obj = (n: string) => `${n}${hasBatchim(n) ? '을' : '를'}`;
export const topic = (n: string) => `${n}${hasBatchim(n) ? '은' : '는'}`;
// '하준' → '하준이', '서아' → '서아'
export const callName = (name: string) => (hasBatchim(name) && /[가-힣]$/.test(name) ? `${name}이` : name);
