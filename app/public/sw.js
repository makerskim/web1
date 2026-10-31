// 서비스 워커: 앱 파일을 보관해 두어 빨리 열리게 (사진은 앱이 따로 보관해요) + 알림
const CACHE = 'pm-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const font = /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname);
  if (url.origin !== location.origin && !font) return;
  if (font) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
    return;
  }
  // 앱 파일: 새 버전 먼저, 인터넷이 없으면 보관본
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});

// ---------- 알림 ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Pastel Memories', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    // 안드로이드 위쪽 상태 표시줄의 작은 아이콘: 모양만 보여서 흰 실루엣으로 (컬러 아이콘이면 흰 네모가 돼요)
    badge: './icons/badge-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '#/home' },
  }));
});

// 알림을 누르면: 열려 있는 앱이 있으면 그 화면으로, 없으면 새로 열어요
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '#/home', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
    const c = list.find((w) => w.url.startsWith(self.registration.scope));
    if (c) {
      c.postMessage({ type: 'open', url });
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
