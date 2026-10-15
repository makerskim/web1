// 서비스 워커: 앱 화면 파일을 보관해 두어 인터넷이 약해도 빨리 열리게 합니다.
// (사진 자체는 js/photo-cache.js 가 따로 보관해요)

const CACHE = 'ssukssuk-v1';
const SHELL = [
  './', './index.html', './css/app.css', './config.js', './manifest.webmanifest',
  './js/app.js', './js/api.js', './js/api-local.js', './js/api-cloud.js', './js/errors.js', './js/util.js',
  './js/idb.js', './js/ui.js', './js/icons.js', './js/media.js', './js/photo-cache.js', './js/postcard.js',
  './js/comments.js', './js/viewer.js', './js/compose.js', './js/editor.js', './js/filters.js', './js/decor.js',
  './js/screens/feed.js', './js/screens/grid.js', './js/screens/activity.js', './js/screens/family.js',
  './js/screens/post.js', './js/screens/onboarding.js', './js/screens/who.js',
  './vendor/supabase.js', './icons/icon.svg', './icons/icon-192.png', './icons/apple-touch-icon.png',
];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 글씨체·라이브러리: 한 번 받으면 계속 사용
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // 앱 파일: 새 버전을 먼저 받고, 인터넷이 없으면 보관본 사용
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true }))
      || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
  }
});
