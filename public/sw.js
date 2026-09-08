// 美業管家 Service Worker
// 負責：離線快取、背景同步、推播通知基礎

const CACHE_NAME = 'beauty-crm-v3';
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

// ── Fetch：程式碼一律先拿最新，圖片字型才走快取優先 ────────────
//
// ⚠️ 這裡原本把 script/style 也放進 Cache First，代價很大：只要部署新版，
// 使用者裝置上的舊程式就會一直被沿用，畫面行為停在舊版本，而且完全看不出
// 原因——2026-09-08 為了這個連續誤判了好幾輪（新版新增的路由在舊程式包裡
// 不存在，直接顯示 Expo 的 "Unmatched Route"），還要一直教使用者清快取。
// 程式碼改成 Network First：有網路就拿最新，沒網路才退回快取。
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 非同源請求（Supabase API 等）不攔截
  if (url.origin !== self.location.origin) return;

  // 程式碼與樣式：Network First（拿到就順手更新快取，供離線時使用）
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 圖片與字型：Cache First（內容不會變，快取能省流量、加快載入）
  if (
    request.destination === 'image' ||
    request.destination === 'font'
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
