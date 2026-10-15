// 꾸미기 재료: 스티커, 글자 스티커, 글씨체, 색, 테두리

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif';

export const STICKER_SETS = [
  { id: 'baby', name: '👶 아기', items: ['👶', '🍼', '🧸', '🎀', '🐣', '👣', '🛁', '💤', '🌙', '⭐', '🍭', '🎈', '🧦', '👒', '🦆', '🪀'] },
  { id: 'love', name: '💕 하트', items: ['❤️', '💕', '💖', '💗', '💓', '💞', '💘', '🥰', '😍', '😘', '🤍', '💛', '💚', '💙', '💜', '🫶'] },
  { id: 'face', name: '😊 표정', items: ['😊', '😆', '🤣', '😮', '😴', '🤤', '😋', '😎', '🤗', '😇', '🥺', '😭', '😤', '🤭', '🫣', '😜'] },
  { id: 'animal', name: '🐻 동물', items: ['🐻', '🐰', '🐶', '🐱', '🐥', '🐷', '🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐸', '🐳', '🦄', '🐝'] },
  { id: 'nature', name: '🌸 꽃·날씨', items: ['🌸', '🌷', '🌼', '🌻', '🍀', '🌈', '☀️', '☁️', '🌙', '✨', '❄️', '🍂', '🌊', '🍓', '🍒', '🍎'] },
  { id: 'party', name: '🎉 축하', items: ['🎉', '🎊', '🎂', '🎁', '🥳', '👑', '🏆', '💐', '🎈', '🍰', '🧁', '🎵', '👏', '💯', '🙌', '✌️'] },
];

const LABEL_COLORS = [
  ['#FFD1DC', '#8A3B57'], ['#FFE2C6', '#8A4B22'], ['#D4F1DE', '#2E6B47'], ['#D3E8FF', '#2F5A8A'],
  ['#E6DBFF', '#5B3F94'], ['#FFF1B8', '#7A5A12'], ['#CDEFEA', '#24665E'], ['#FFFFFF', '#8A3B57'],
];

// '{age}'는 사진 찍은 날 기준 '생후 N일', '{date}'는 날짜로 바뀌어요
export const LABELS = [
  '{age}', '{date}', '백일 축하해 🎉', '첫 돌 🎂', '까꿍! 👀', '사랑해 ♥', '보고 싶어요', '할머니 안녕 👋',
  '할아버지 안녕 👋', '첫 이유식 🥄', '첫 걸음마 👣', '뒤집기 성공!', '잘 자요 💤', '냠냠 😋',
  '우리 아기 최고 👍', '오늘의 기록 📷', 'Happy Day ✨', 'Thank you 💕',
].map((text, i) => ({ text, bg: LABEL_COLORS[i % LABEL_COLORS.length][0], fg: LABEL_COLORS[i % LABEL_COLORS.length][1] }));

export const TEXT_FONTS = [
  { id: 'basic', name: '기본', family: 'Pretendard Variable, Pretendard, system-ui, sans-serif', weight: 800, k: 1 },
  { id: 'soft', name: '고운돋움', family: '"Gowun Dodum"', weight: 400, k: 1.05 },
  { id: 'serif', name: '명조', family: '"Gowun Batang"', weight: 700, k: 1.05 },
  { id: 'round', name: '동글동글', family: 'Jua', weight: 400, k: 1.05 },
  { id: 'hand', name: '손글씨', family: 'Gaegu', weight: 700, k: 1.15 },
  { id: 'pen', name: '펜글씨', family: '"Nanum Pen Script"', weight: 400, k: 1.35 },
];
export const fontById = (id) => TEXT_FONTS.find((f) => f.id === id) || TEXT_FONTS[0];

export const TEXT_COLORS = ['#FFFFFF', '#222222', '#FF6B6B', '#FF9F43', '#FFD93D', '#6BCB77', '#4D96FF', '#C77DFF', '#FF8FB1'];

// pad: 사진 폭에 대한 비율 [옆, 위, 아래]
export const FRAMES = [
  { id: 'none', name: '없음', pad: [0, 0, 0] },
  { id: 'white', name: '하얀색', pad: [0.04, 0.04, 0.04], bg: '#FFFFFF' },
  { id: 'polaroid', name: '폴라로이드', pad: [0.05, 0.05, 0.22], bg: '#FFFDF7', caption: true },
  { id: 'heart', name: '하트', pad: [0.075, 0.075, 0.075], bg: '#FFD6DE', glyph: '♥', glyphColor: '#FF8FA3' },
  { id: 'sky', name: '구름', pad: [0.075, 0.075, 0.075], bg: '#CFE8FF', glyph: '☁', glyphColor: '#FFFFFF' },
  { id: 'flower', name: '꽃', pad: [0.085, 0.085, 0.085], bg: '#FFF4CF', emoji: '🌼' },
  { id: 'night', name: '밤하늘', pad: [0.075, 0.075, 0.075], bg: '#2B2F5B', glyph: '★', glyphColor: '#FFE27A' },
  { id: 'rainbow', name: '무지개', pad: [0.05, 0.05, 0.05], gradient: ['#FFC9D6', '#FFE3BF', '#FFF6BF', '#CFF2D8', '#CFE4FF', '#E4D6FF'] },
  { id: 'film', name: '필름', pad: [0.035, 0.13, 0.13], bg: '#141414', film: true },
  { id: 'mint', name: '민트', pad: [0.05, 0.05, 0.05], bg: '#D5F5EA' },
];
export const frameById = (id) => FRAMES.find((f) => f.id === id) || FRAMES[0];

// 웹 글씨체는 쓰려는 글자 조각만 받아오므로, 그리기 전에 꼭 불러 둡니다
export async function loadFont(fontCss, text) {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([document.fonts.load(fontCss, text || '가나다'), new Promise((r) => setTimeout(r, 2500))]);
  } catch { /* 기본 글씨체로 그려짐 */ }
}
