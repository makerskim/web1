import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { listenInstall } from './lib/install';

// '홈 화면에 추가' 신호는 앱이 열리자마자 와요 → 미리 받아 둬요
listenInstall();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// 홈 화면 앱: 인터넷이 약해도 빨리 열리게
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
// 알림을 눌렀을 때 이미 열려 있던 앱이면 그 화면으로
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.url === 'string') location.hash = new URL(e.data.url).hash;
  });
}
