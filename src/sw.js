/* 待办清单 Service Worker：离线缓存 + 版本自动更新 */
const VERSION = '__SW_VERSION__';
const CACHE = 'todo-shell-' + VERSION;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 只处理同源 GET 请求；Supabase 的 API / WebSocket / 认证请求一律直连不缓存
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // 网络优先：有网拿最新版本并更新缓存；断网回退缓存，保证应用离线可打开
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request)
          .then((hit) => hit || caches.match('./') || caches.match('./index.html'))
      )
  );
});
