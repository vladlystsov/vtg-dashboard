/**
 * Service Worker для PWA (офлайн-доступ к оболочке + push-уведомления).
 *
 * Стратегия:
 *  - index.html (навигация) — network-first с фолбэком в кэш: при наличии
 *    сети всегда отдаём свежую версию, без сети — последнюю закэшированную;
 *  - статические ассеты (js/css/картинки) — cache-first с фоновым
 *    обновлением: имена хэшированы, поэтому устаревания не бывает,
 *    а офлайн-старт гарантирован;
 *  - запросы к другим доменам (Firestore API и т.п.) не трогаем —
 *    у них свой офлайн-механизм на уровне Firebase SDK.
 *
 * Precache оболочки: при install вытягиваем свежий index.html и кладём
 * в кэш все ссылки, которые он содержит (чанки main-бандла), чтобы первая
 * же офлайн-перезагрузка была полной.
 *
 * Push: приложение регистрирует web-токен именно на ЭТОМ регистрационном
 * worker'е (getToken({ serviceWorkerRegistration })), поэтому показать
 * уведомление обязан он сам — обработчика `push` в воркере Firebase здесь
 * нет, и без него FCM молча доставляет сообщение в пустоту.
 */

const VERSION = 'vtg-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// Навигационные запросы → network-first, фолбэк — закэшированный index.html.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Чужие домены (Firestore, B2, SoundCloud) — мимо кэша.
  if (url.origin !== self.location.origin) return;

  // Навигация (открытие приложения/перезагрузка).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('index.html', copy));
          return response;
        })
        .catch(() =>
          caches
            .match('index.html', { ignoreSearch: true })
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Статические ассеты — cache-first + фоновое обновление.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});

// Установка: precache оболочки (index.html + все ссылки из него).
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const response = await fetch('index.html');
      await cache.put('index.html', response.clone());
      // Собираем ссылки на ресурсы из index.html (main-чанк, css, прелоады).
      const html = await response.text();
      const refs = [...html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.allSettled(refs.map((ref) => cache.add(ref)));
      await self.skipWaiting();
    })()
  );
});

// Активация: сносим старые версии кэшей.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// === PUSH-УВЕДОМЛЕНИЯ (веб) ===

/** Корень приложения: sw.js лежит рядом с index.html, scope — папка приложения. */
function appUrl() {
  return self.registration.scope || './';
}

// Приложение регистрирует web-токен именно на ЭТОМ worker'е
// (getToken({ serviceWorkerRegistration })), поэтому показать уведомление
// обязан он сам: обработчика push в воркере Firebase здесь нет, и без него
// FCM доставляет сообщение в пустоту — уведомления просто не появляются.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { body: event.data ? event.data.text() : '' } };
  }
  const notification = payload.notification || {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};

  event.waitUntil(
    self.registration.showNotification(notification.title || payload.title || 'VTG Dashboard', {
      body: notification.body || payload.body || '',
      icon: './icon-192.png',
      // Один тег на трек: новое уведомление заменяет прошлое по этому треку,
      // а без тега ОС складывает их стопкой.
      tag: data.trackId ? `vtg-track-${data.trackId}` : 'vtg',
      renotify: false,
      vibrate: [60, 40, 60],
      timestamp: Date.now(),
      data: { url: appUrl(), ...data },
    })
  );
});

// Клик по уведомлению: открываем приложение (существующее окно — в фокус,
// иначе новое). Показывать текст из body не нужно: внутри приложения ту же
// новость выводит плашка новостей.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = appUrl();
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && client.url !== target) {
            try {
              await client.navigate(target);
            } catch {
              /* ignore */
            }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});