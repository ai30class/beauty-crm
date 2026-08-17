// 美業管家 Service Worker
// 負責：離線快取、背景同步、推播通知基礎

const CACHE_NAME = 'beauty-crm-v2';
const STATIC_ASSETS = [
  '/offline.html',
  '/assets/icon.png',
  '/assets/favicon.png',
];

// ── Install：快取靜態資源 ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate：清除舊快取 ──────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch：Network First，失敗走快取，靜態資源走 Cache First ─
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 非同源請求（Supabase API 等）不攔截
  if (url.origin !== self.location.origin) return;

  // 靜態資源 Cache First
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'script'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
      )
    );
    return;
  }

  // 頁面導航 Network First，離線時回傳 offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline.html')
      )
    );
    return;
  }
});

// ── Push 通知（預約提醒基礎）────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '美業管家';
  const options = {
    body: data.body || '您有新的訊息',
    icon: '/assets/icon.png',
    badge: '/assets/favicon.png',
    data: data.url ? { url: data.url } : {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
